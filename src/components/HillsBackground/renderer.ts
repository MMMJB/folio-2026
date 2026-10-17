import {
  bindFullscreenTriangle,
  createProgram,
  createTarget,
  deleteTarget,
  type Program,
  resizeTarget,
} from "./gl";
import { createCloudStrip } from "./cloudStrip";
import { createEntryBake } from "./entry";
import { createTrample } from "./pointer";
import {
  dofShader,
  fragmentShader,
  heightmapShader,
  resolveShader,
} from "./shader";

// 1024 matches 2048 to within rounding (the terrain varies over metres) at
// a quarter of the memory.
const HEIGHTMAP_SIZE = 1024;
const HEIGHTMAP_UNIT = 4;

// Each frame renders one sample per pixel at the next of these sub-pixel
// offsets, and the last four frames are averaged: once all four have rendered,
// the image matches 2x2 supersampling at a quarter of the per-frame cost. The
// first two are a diagonal pair, so blending just those two (see
// PRESSING_BLEND) still smooths edges in both directions.
const JITTER = [
  [-0.25, -0.25],
  [0.25, 0.25],
  [0.25, -0.25],
  [-0.25, 0.25],
];
// While the cursor presses new grass, blending four frames makes the trample
// lag and smear behind it, and blending none visibly roughens the whole
// image; two is the compromise.
const PRESSING_BLEND = 2;

// Knobs that trade image quality for speed. FULL_QUALITY is the reference
// look; everything else is measured against it.
export type HillsQuality = {
  // Fraction of the canvas resolution the scene renders at before the depth
  // of field pass scales it back up.
  renderScale: number;
  // Raymarch step through the grass, in blade widths. Larger steps can miss
  // thin blades.
  fiberStep: number;
  // Beyond this distance (metres) hills render as a smooth textured surface
  // with no individual blades.
  fiberDistance: number;
  maxSteps: number;
  // Scales how far gusts and flutter bend the grass; 0 turns wind off.
  windStrength: number;
  // Multiplies the depth of field sample spacing.
  blurSpacing: number;
  // Largest depth of field blur radius, as a fraction of the frame height.
  // A look setting rather than a quality one, but its cost grows with it.
  blurStrength: number;
};

export const FULL_QUALITY: HillsQuality = {
  renderScale: 1,
  fiberStep: 0.5,
  fiberDistance: 1500,
  maxSteps: 2000,
  windStrength: 1,
  blurSpacing: 1,
  blurStrength: 0.006,
};

// What the component ships with, chosen in the performance playground.
export const DEFAULT_QUALITY: HillsQuality = {
  renderScale: 0.45,
  fiberStep: 1.5,
  fiberDistance: 450,
  maxSteps: 600,
  windStrength: 1.55,
  blurSpacing: 1,
  blurStrength: 0,
};

export type HillsRenderer = {
  resize: (width: number, height: number) => void;
  setQuality: (quality: Partial<HillsQuality>) => void;
  // While running, a new frame renders every display refresh. Stopped, it
  // renders until the jitter samples have converged and then idles.
  setRunning: (running: boolean) => void;
  // The cursor, relative to the frame centre in units of the frame height
  // (y up), or null when it's off the page. The grass under it is trampled.
  setPointer: (uv: [number, number] | null) => void;
  // Trample radius in metres on the ground.
  setTrampleRadius: (radius: number) => void;
  dispose: () => void;
};

// Bakes the static terrain into a float texture so the raymarch can look it up
// instead of evaluating noise at every step. Returns null when float render
// targets aren't supported; the shader then evaluates the noise directly.
function bakeHeightmap(gl: WebGL2RenderingContext, seed: number) {
  if (!gl.getExtension("EXT_color_buffer_float")) return null;
  const bake = createProgram(gl, heightmapShader);
  if (!bake) return null;

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R32F,
    HEIGHTMAP_SIZE,
    HEIGHTMAP_SIZE,
    0,
    gl.RED,
    gl.FLOAT,
    null,
  );
  // Hardware filtering of float textures needs an extension; without it the
  // shader filters manually from nearest samples.
  const filter = gl.getExtension("OES_texture_float_linear")
    ? gl.LINEAR
    : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  gl.viewport(0, 0, HEIGHTMAP_SIZE, HEIGHTMAP_SIZE);
  gl.useProgram(bake.program);
  gl.uniform2f(bake.uniform("uResolution"), HEIGHTMAP_SIZE, HEIGHTMAP_SIZE);
  gl.uniform1f(bake.uniform("uSeed"), seed);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(framebuffer);
  gl.deleteProgram(bake.program);
  return texture;
}

// onFrame runs after every presented frame; converged is true once all jitter
// samples are in.
export function createHillsRenderer(
  canvas: HTMLCanvasElement,
  seed: number,
  onFrame: (converged: boolean) => void,
): HillsRenderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    depth: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;

  const scene = createProgram(gl, fragmentShader);
  const resolve = createProgram(gl, resolveShader);
  const dof = createProgram(gl, dofShader);
  if (!scene || !resolve || !dof) return null;

  const triangle = bindFullscreenTriangle(gl);
  const heightmap = bakeHeightmap(gl, seed);
  const heightmapLinear =
    heightmap !== null && gl.getExtension("OES_texture_float_linear") !== null;
  const bindTerrain = ({ uniform }: Program) => {
    gl.uniform1f(uniform("uSeed"), seed);
    gl.activeTexture(gl.TEXTURE0 + HEIGHTMAP_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, heightmap);
    gl.uniform1i(uniform("uHeightmap"), HEIGHTMAP_UNIT);
    gl.uniform1i(uniform("uUseHeightmap"), heightmap ? 1 : 0);
    gl.uniform1i(uniform("uHeightmapLinear"), heightmapLinear ? 1 : 0);
  };
  const trample = createTrample(gl, bindTerrain);
  const entry = createEntryBake(gl, JITTER, bindTerrain);
  const clouds = createCloudStrip(gl, seed);
  const frames = JITTER.map(() => createTarget(gl));
  const resolved = createTarget(gl);

  let width = 0;
  let height = 0;
  let sceneWidth = 0;
  let sceneHeight = 0;
  let quality = { ...DEFAULT_QUALITY };
  let frame = 0;
  // How many of the latest frames are averaged.
  let blend = JITTER.length;
  let animationFrame = 0;
  let running = false;
  const startTime = performance.now();

  const drawScene = (index: number) => {
    entry?.update({
      sceneWidth,
      sceneHeight,
      renderScale: sceneHeight / height,
      fiberDistance: quality.fiberDistance,
      maxSteps: quality.maxSteps,
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, frames[index].framebuffer);
    gl.viewport(0, 0, sceneWidth, sceneHeight);
    gl.useProgram(scene.program);
    gl.uniform2f(scene.uniform("uResolution"), sceneWidth, sceneHeight);
    gl.uniform1f(scene.uniform("uRenderScale"), sceneHeight / height);
    gl.uniform1f(scene.uniform("uFiberStep"), quality.fiberStep);
    gl.uniform1f(scene.uniform("uFiberDistance"), quality.fiberDistance);
    gl.uniform1i(scene.uniform("uMaxSteps"), quality.maxSteps);
    gl.uniform1f(scene.uniform("uWind"), quality.windStrength);
    gl.uniform2f(scene.uniform("uJitter"), JITTER[index][0], JITTER[index][1]);
    gl.uniform1f(
      scene.uniform("uTime"),
      (performance.now() - startTime) / 1000,
    );
    bindTerrain(scene);
    trample?.setUniforms(scene);
    entry?.setUniforms(scene);
    clouds?.setUniforms(scene);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const drawResolve = (count: number) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, resolved.framebuffer);
    gl.useProgram(resolve.program);
    frames.forEach((target, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
    });
    gl.uniform1iv(resolve.uniform("uFrames"), [0, 1, 2, 3]);
    gl.uniform1i(resolve.uniform("uCount"), count);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const drawDepthOfField = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(dof.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, resolved.texture);
    gl.uniform1i(dof.uniform("uScene"), 0);
    gl.uniform2f(dof.uniform("uResolution"), width, height);
    gl.uniform1f(dof.uniform("uBlurSpacing"), quality.blurSpacing);
    gl.uniform1f(dof.uniform("uMaxBlur"), quality.blurStrength);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const tick = () => {
    const trampling = trample?.update() ?? "still";
    // Springing back is slow enough to keep the full blend.
    const nextBlend = trampling === "pressing" ? PRESSING_BLEND : JITTER.length;
    if (nextBlend !== blend) {
      // Frames rendered before the switch may be stale: the two-frame blend
      // reuses only the two most recent slots, and the full blend starts
      // again from those two, refilling the rest before averaging them in.
      frame = Math.min(frame, PRESSING_BLEND);
      blend = nextBlend;
    }
    // Frames drawn before the clouds' strip was ready used the slightly
    // different per-pixel clouds, so blending starts over once it is.
    if (clouds?.bake(sceneHeight, height)) frame = 0;
    drawScene(frame % blend);
    drawResolve(Math.min(frame + 1, blend));
    drawDepthOfField();
    frame += 1;

    const converged =
      trampling === "still" &&
      frame >= JITTER.length &&
      (clouds?.ready() ?? true);
    if (running || !converged) animationFrame = requestAnimationFrame(tick);
    onFrame(converged);
  };

  const schedule = () => {
    cancelAnimationFrame(animationFrame);
    if (width > 0 && height > 0) animationFrame = requestAnimationFrame(tick);
  };

  const allocate = () => {
    sceneWidth = Math.max(1, Math.round(width * quality.renderScale));
    sceneHeight = Math.max(1, Math.round(height * quality.renderScale));
    frames.forEach((target) =>
      resizeTarget(gl, target, sceneWidth, sceneHeight),
    );
    resizeTarget(gl, resolved, sceneWidth, sceneHeight);
    frame = 0;
  };

  return {
    resize: (nextWidth, nextHeight) => {
      cancelAnimationFrame(animationFrame);
      width = nextWidth;
      height = nextHeight;
      canvas.width = width;
      canvas.height = height;
      allocate();
      schedule();
    },
    setQuality: (next) => {
      const scaleChanged =
        next.renderScale !== undefined &&
        next.renderScale !== quality.renderScale;
      quality = { ...quality, ...next };
      if (scaleChanged) allocate();
      frame = 0;
      schedule();
    },
    setRunning: (next) => {
      if (next === running) return;
      running = next;
      if (running) schedule();
    },
    setPointer: (uv) => {
      if (!trample) return;
      trample.setPointer(uv);
      // A still scene has stopped drawing; wake it to follow the cursor.
      if (!running) schedule();
    },
    setTrampleRadius: (radius) => trample?.setRadius(radius),
    dispose: () => {
      cancelAnimationFrame(animationFrame);
      trample?.dispose();
      entry?.dispose();
      clouds?.dispose();
      [scene, resolve, dof].forEach(({ program }) => gl.deleteProgram(program));
      frames.forEach((target) => deleteTarget(gl, target));
      deleteTarget(gl, resolved);
      gl.deleteTexture(heightmap);
      gl.deleteBuffer(triangle);
    },
  };
}
