import {
  bindFullscreenTriangle,
  createProgram,
  createTarget,
  deleteTarget,
  type Program,
  resizeTarget,
} from "./gl";
import {
  bookOpenSeconds,
  bookOutline,
  type BookSettings,
  DEFAULT_BOOK,
  setBookUniforms,
} from "./book";
import { createCloudStrip } from "./cloudStrip";
import { createContourBake } from "./contour";
import { createEntryBake } from "./entry";
import { createMotes, DEFAULT_MOTES, type MoteSettings } from "./motes";
import { createTrample } from "./pointer";
import {
  blurAt,
  bookGroundShader,
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

// Distance in metres at which the page section nestles into the scene, just
// behind the midground hill.
const NESTLE_DEPTH = 180;
const CONTOUR_UNIT = 1;

// The page section nestled in the scene, in fractions of the canvas (y down),
// and how far up from its bottom the hills may hide it, as a fraction of the
// canvas height.
type Rect = [number, number, number, number];
const NO_SKIP: Rect = [0, 0, 0, 0];

export type NestledSection = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bury: number;
};

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
  // Drift speed of the far cloud layer as a fraction of the near one's; at
  // 1 they move together.
  backCloudSpeed: number;
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
  backCloudSpeed: 0.45,
  blurSpacing: 1,
  blurStrength: 0.006,
};

// What the component ships with, chosen in the performance playground.
export const DEFAULT_QUALITY: HillsQuality = {
  renderScale: 0.45,
  fiberStep: 1.5,
  fiberDistance: 475,
  maxSteps: 600,
  windStrength: 1.55,
  backCloudSpeed: 0.45,
  blurSpacing: 3,
  blurStrength: 0.01,
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
  setMotes: (motes: Partial<MoteSettings>) => void;
  setBook: (book: Partial<BookSettings>) => void;
  // Opens the book while held, as when the cursor is over it.
  setBookHeld: (held: boolean) => void;
  // Where the book lands on screen, open or closed, as a polygon in fractions
  // of the canvas (x right, y down); null when it's hidden or out of view.
  // It changes only when the canvas is resized or the book moves.
  bookOutline: () => [number, number][] | null;
  // The section the canvas sits over, or null to cover the page entirely.
  setSection: (section: NestledSection | null) => void;
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
  let bookSettings = { ...DEFAULT_BOOK };
  // 0 closed to 1 open; eases toward open while held.
  let bookOpen = 0;
  let bookHeld = false;
  const trample = createTrample(gl, bindTerrain);
  const entry = createEntryBake(gl, JITTER, bindTerrain);
  const clouds = createCloudStrip(gl, seed);
  const contour = createContourBake(gl, NESTLE_DEPTH, bindTerrain);
  const motes = createMotes(gl, bindTerrain);
  const frames = JITTER.map(() => createTarget(gl));
  const resolved = createTarget(gl);

  let width = 0;
  let height = 0;
  let sceneWidth = 0;
  let sceneHeight = 0;
  let quality = { ...DEFAULT_QUALITY };
  let moteSettings = { ...DEFAULT_MOTES };
  let frame = 0;
  // How many of the latest frames are averaged.
  let blend = JITTER.length;
  let animationFrame = 0;
  let running = false;
  let section: NestledSection | null = null;
  // The part of the scene hidden behind the section, in scene pixels (x0, y0,
  // x1, y1, y up); the scene skips it. See updateSkip.
  let skip: Rect = NO_SKIP;
  // True while no frame is scheduled and the canvas shows a finished scene.
  let idle = false;
  let compositeFrame = 0;
  const startTime = performance.now();
  let lastTick = startTime;

  const time = () => (performance.now() - startTime) / 1000;

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
    gl.uniform1f(scene.uniform("uBackCloudSpeed"), quality.backCloudSpeed);
    gl.uniform2f(scene.uniform("uJitter"), JITTER[index][0], JITTER[index][1]);
    gl.uniform4f(scene.uniform("uSkip"), ...skip);
    gl.uniform1f(scene.uniform("uTime"), time());
    bindTerrain(scene);
    setBookUniforms(gl, scene, bookSettings, bookOpen);
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

  // In canvas pixels, y up.
  const sectionRect = ({ left, top, right, bottom }: NestledSection): Rect => [
    left * width,
    (1 - bottom) * height,
    right * width,
    (1 - top) * height,
  ];

  // Above its buried strip the section shows through the canvas entirely, so
  // the scene behind it is never seen, except that the depth of field gathers
  // from up to the largest blur radius around each visible pixel (plus a
  // pixel for filtering). Returns true if the new region uncovers scene the
  // frames being averaged skipped; they must then start over.
  const updateSkip = () => {
    let next = NO_SKIP;
    if (section) {
      const [x0, y0, x1, y1] = sectionRect(section);
      const margin = quality.blurStrength * height + height / sceneHeight;
      const sx = sceneWidth / width;
      const sy = sceneHeight / height;
      const rect: Rect = [
        Math.ceil((x0 + margin) * sx),
        Math.ceil((y0 + section.bury * height + margin) * sy),
        Math.floor((x1 - margin) * sx),
        Math.floor((y1 - margin) * sy),
      ];
      if (rect[0] < rect[2] && rect[1] < rect[3]) next = rect;
    }
    const uncovered =
      skip !== NO_SKIP &&
      (next === NO_SKIP ||
        next[0] > skip[0] ||
        next[1] > skip[1] ||
        next[2] < skip[2] ||
        next[3] < skip[3]);
    skip = next;
    return uncovered;
  };

  const drawDepthOfField = () => {
    contour?.update(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(dof.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, resolved.texture);
    gl.uniform1i(dof.uniform("uScene"), 0);
    gl.uniform2f(dof.uniform("uResolution"), width, height);
    gl.uniform1f(dof.uniform("uBlurSpacing"), quality.blurSpacing);
    gl.uniform1f(dof.uniform("uMaxBlur"), quality.blurStrength);
    gl.uniform1i(dof.uniform("uNestle"), section ? 1 : 0);
    if (section) {
      gl.uniform4f(dof.uniform("uSection"), ...sectionRect(section));
      gl.uniform1f(dof.uniform("uBury"), section.bury * height);
      gl.uniform1f(dof.uniform("uNestleBlur"), blurAt(NESTLE_DEPTH));
      gl.uniform1i(dof.uniform("uUseContour"), contour ? 1 : 0);
      contour?.bind(dof, CONTOUR_UNIT);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // The motes go over the finished frame: they move on every frame, so
  // averaging jittered frames would only smear them.
  const drawComposite = () => {
    drawDepthOfField();
    motes?.draw(moteSettings, {
      width,
      height,
      time: time(),
      windStrength: quality.windStrength,
      maxBlur: quality.blurStrength,
      section: section && {
        rect: sectionRect(section),
        bury: section.bury * height,
      },
    });
  };

  // Moves the book's opening along; returns whether it's moving.
  const updateBook = () => {
    const now = performance.now();
    // Clamped so a long idle gap doesn't count as opening time.
    const elapsed = Math.min((now - lastTick) / 1000, 0.1);
    lastTick = now;
    const target = bookHeld ? 1 : 0;
    if (bookOpen === target) return false;
    const step = elapsed / bookOpenSeconds(bookSettings);
    bookOpen =
      target > bookOpen
        ? Math.min(bookOpen + step, 1)
        : Math.max(bookOpen - step, 0);
    return true;
  };

  // The terrain height under the book and the camera's height, read back
  // once per book position; null until then, or without float render
  // targets.
  let bookGround: [number, number] | null = null;
  const measureBookGround = (): [number, number] | null => {
    if (!gl.getExtension("EXT_color_buffer_float")) return null;
    const program = createProgram(gl, bookGroundShader);
    if (!program) return null;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      1,
      1,
      0,
      gl.RGBA,
      gl.FLOAT,
      null,
    );
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    gl.viewport(0, 0, 1, 1);
    gl.useProgram(program.program);
    bindTerrain(program);
    gl.uniform2f(
      program.uniform("uBookPosition"),
      bookSettings.x,
      bookSettings.z,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const result = new Float32Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, result);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    gl.deleteProgram(program.program);
    return [result[0], result[1]];
  };

  const tick = () => {
    const trampling = trample?.update() ?? "still";
    const opening = updateBook();
    // Springing back is slow enough to keep the full blend; the book moves
    // too fast.
    const nextBlend =
      trampling === "pressing" || opening ? PRESSING_BLEND : JITTER.length;
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
    drawComposite();
    frame += 1;

    const converged =
      trampling === "still" &&
      !opening &&
      frame >= JITTER.length &&
      (clouds?.ready() ?? true);
    if (running || !converged) animationFrame = requestAnimationFrame(tick);
    else idle = true;
    onFrame(converged);
  };

  const schedule = () => {
    idle = false;
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
    updateSkip();
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
      updateSkip();
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
    setMotes: (next) => {
      moteSettings = { ...moteSettings, ...next };
      // A still scene redraws once to show them.
      if (!running) schedule();
    },
    setBook: (next) => {
      if (next.x !== undefined || next.z !== undefined) bookGround = null;
      bookSettings = { ...bookSettings, ...next };
      frame = 0;
      schedule();
    },
    bookOutline: () => {
      if (width === 0 || height === 0) return null;
      bookGround ??= measureBookGround();
      if (!bookGround) return null;
      return bookOutline(bookSettings, ...bookGround, width / height);
    },
    setBookHeld: (held) => {
      bookHeld = held;
      schedule();
    },
    setSection: (next) => {
      section = next;
      if (updateSkip()) {
        frame = 0;
        schedule();
        return;
      }
      // Otherwise a finished scene only needs compositing again over the moved
      // section, and a running one picks it up on the next frame.
      if (!idle) return;
      cancelAnimationFrame(compositeFrame);
      compositeFrame = requestAnimationFrame(() => {
        if (idle) drawComposite();
      });
    },
    dispose: () => {
      cancelAnimationFrame(animationFrame);
      cancelAnimationFrame(compositeFrame);
      trample?.dispose();
      entry?.dispose();
      clouds?.dispose();
      contour?.dispose();
      motes?.dispose();
      [scene, resolve, dof].forEach(({ program }) => gl.deleteProgram(program));
      frames.forEach((target) => deleteTarget(gl, target));
      deleteTarget(gl, resolved);
      gl.deleteTexture(heightmap);
      gl.deleteBuffer(triangle);
    },
  };
}
