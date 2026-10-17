import { createProgram, type Program } from "./gl";
import { pickShader } from "./shader";
import {
  TRAIL_MAP_SIZE,
  TRAIL_MAP_SPREAD,
  TRAMPLE_ROUGHNESS,
  trailMapUv,
  trailShader,
} from "./shader/trample";

const TRAIL_UNIT = 7;

// Seconds for the grass to press down when the cursor arrives over it, and
// to spring back once the cursor has moved on or left.
const PRESS_TIME = 0.03;
const SPRING_TIME = 1.8;
// Extra seconds the trail map keeps updating after the grass has sprung back,
// so both of its textures have caught up.
const SETTLE_TIME = 0.1;

export type TrampleState = "pressing" | "recovering" | "still";

export type Trample = {
  // uv is relative to the frame centre in units of its height, as in the
  // shader's cameraRay; null when the cursor isn't over the page.
  setPointer: (uv: [number, number] | null) => void;
  // Radius in metres on the ground.
  setRadius: (radius: number) => void;
  // Picks the ground under the cursor, eases its patch in and updates the
  // trail map. "pressing" while the patch is moving or pressing down, which
  // should show at once; "recovering" while the grass only springs back;
  // "still" otherwise.
  update: () => TrampleState;
  setUniforms: (scene: Program) => void;
  dispose: () => void;
};

const smoothstep = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

// Texels as [x0, y0, x1, y1], x1 and y1 exclusive.
type Rect = [number, number, number, number];

const union = (a: Rect | null, b: Rect | null): Rect | null =>
  a && b
    ? [
        Math.min(a[0], b[0]),
        Math.min(a[1], b[1]),
        Math.max(a[2], b[2]),
        Math.max(a[3], b[3]),
      ]
    : (a ?? b);

// The trail map texels a patch of this radius at x, z (relative to the
// camera) covers, with a texel to spare for filtering; null if none.
function patchRect(x: number, z: number, radius: number): Rect | null {
  // Room for the edge's bumps.
  radius *= 1 + TRAMPLE_ROUGHNESS;
  const [width, height] = TRAIL_MAP_SIZE;
  const dist = Math.hypot(x, z);
  const [u] = trailMapUv(x, z);
  const halfAngle = dist > radius ? Math.asin(radius / dist) : Math.PI;
  const du = halfAngle / (2 * TRAIL_MAP_SPREAD);
  // Straight ahead, so only the distance counts.
  const [, vNear] = trailMapUv(0, Math.max(dist - radius, 1e-3));
  const [, vFar] = trailMapUv(0, dist + radius);
  const rect: Rect = [
    Math.max(Math.floor((u - du) * width) - 1, 0),
    Math.max(Math.floor(vNear * height) - 1, 0),
    Math.min(Math.ceil((u + du) * width) + 1, width),
    Math.min(Math.ceil(vFar * height) + 1, height),
  ];
  return rect[0] < rect[2] && rect[1] < rect[3] ? rect : null;
}

// The texels a patch covers as it sweeps from one point to another. A
// sideways sweep passes nearer the camera midway than at either end, so the
// rect comes from points along the way.
function sweepRect(
  from: { x: number; z: number },
  to: { x: number; z: number },
  radius: number,
): Rect | null {
  const samples = 8;
  let rect: Rect | null = null;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    rect = union(
      rect,
      patchRect(
        from.x + (to.x - from.x) * t,
        from.z + (to.z - from.z) * t,
        radius,
      ),
    );
  }
  return rect;
}

// Tracks where the cursor meets the ground; the grass there is disturbed.
// bindTerrain sets the pick program's terrain inputs (seed and heightmap).
// Returns null without float render targets, which the pick needs.
export function createTrample(
  gl: WebGL2RenderingContext,
  bindTerrain: (program: Program) => void,
): Trample | null {
  if (!gl.getExtension("EXT_color_buffer_float")) return null;
  const pick = createProgram(gl, pickShader);
  const trailProgram = createProgram(gl, trailShader);
  if (!pick || !trailProgram) return null;

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, null);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  // The pick result is read back through a pixel buffer and a fence, so the
  // CPU never waits on the GPU; it arrives a frame or two later.
  const readback = gl.createBuffer();
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, readback);
  gl.bufferData(gl.PIXEL_PACK_BUFFER, 16, gl.STREAM_READ);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

  // The trail map, drawn back and forth between two textures: each update
  // reads the current one and writes the other.
  const maps = [0, 1].map(() => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      ...TRAIL_MAP_SIZE,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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
    return { texture, framebuffer };
  });
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  let current = 0;
  // Texels that may be pressed. Outside it both textures are calm, so an
  // update only needs to draw inside it.
  let dirty: Rect | null = null;
  // When the cursor's patch last moved or changed strength; the map settles
  // SPRING_TIME after.
  let lastChange = -Infinity;
  // Where the patch was last pressed into the map, while it's pressing.
  let stamped: { x: number; z: number } | null = null;

  const result = new Float32Array(4);
  let pointer: [number, number] | null = null;
  let pointerMoved = false;
  let fence: WebGLSync | null = null;
  let radius = 2.5;
  // Where the cursor last met the ground.
  let patch: { x: number; z: number } | null = null;
  let direction: [number, number] = [0, 0];
  let onGround = false;
  let patchMoved = false;
  // 0 to 1, eased in over PRESS_TIME; the patch presses with smoothstep(level).
  // The trail map holds it once the cursor leaves the ground.
  let level = 0;
  let lastUpdate = performance.now() / 1000;

  const runPick = (uv: [number, number]) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, 1, 1);
    gl.useProgram(pick.program);
    bindTerrain(pick);
    gl.uniform2f(pick.uniform("uPointer"), uv[0], uv[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, readback);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
  };

  const drawTrail = (rect: Rect, elapsed: number, strength: number) => {
    const [read, write] = [maps[current], maps[1 - current]];
    gl.bindFramebuffer(gl.FRAMEBUFFER, write.framebuffer);
    gl.viewport(0, 0, ...TRAIL_MAP_SIZE);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]);
    gl.useProgram(trailProgram.program);
    gl.activeTexture(gl.TEXTURE0 + TRAIL_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, read.texture);
    gl.uniform1i(trailProgram.uniform("uPrevious"), TRAIL_UNIT);
    const { x, z } = patch ?? { x: 0, z: 0 };
    gl.uniform4f(trailProgram.uniform("uTrample"), x, z, strength, radius);
    const from = stamped ?? { x, z };
    gl.uniform2f(trailProgram.uniform("uTrampleFrom"), from.x, from.z);
    gl.uniform2f(trailProgram.uniform("uTrampleDirection"), ...direction);
    gl.uniform1f(trailProgram.uniform("uElapsed"), elapsed);
    gl.uniform1f(trailProgram.uniform("uSpring"), elapsed / SPRING_TIME);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    current = 1 - current;
  };

  const pollPick = () => {
    if (!fence) return;
    if (gl.clientWaitSync(fence, 0, 0) === gl.TIMEOUT_EXPIRED) return;
    gl.deleteSync(fence);
    fence = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, readback);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, result);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    // A pick that lands after the cursor has left the page is stale, and one
    // that misses the ground means the cursor is over the sky.
    onGround = pointer !== null && result[3] > 0;
    if (!onGround) return;
    const [x, z] = [result[0], result[1]];
    // Grass presses the way the cursor is moving; a pause keeps the last way.
    if (patch) {
      const length = Math.hypot(x - patch.x, z - patch.z);
      if (length > 1e-4) {
        direction = [(x - patch.x) / length, (z - patch.z) / length];
      }
    }
    patch = { x, z };
    patchMoved = true;
  };

  return {
    setPointer: (uv) => {
      pointer = uv;
      pointerMoved = uv !== null;
      if (!uv) onGround = false;
    },
    setRadius: (next) => {
      radius = next;
    },
    update: () => {
      const now = performance.now() / 1000;
      // Clamped so a long idle gap doesn't count as easing time.
      const elapsed = Math.min(now - lastUpdate, 0.1);
      lastUpdate = now;
      patchMoved = false;
      pollPick();
      if (pointer && pointerMoved && !fence) {
        runPick(pointer);
        pointerMoved = false;
      }

      const pressing = onGround && level < 1;
      // Leaving the ground lifts the cursor at once; the map springs back.
      const left = !onGround && level > 0;
      level = onGround ? Math.min(level + elapsed / PRESS_TIME, 1) : 0;
      if (pressing || patchMoved || left) lastChange = now;

      const strength = onGround && patch ? smoothstep(level) : 0;
      const stamp =
        strength > 0 && patch
          ? sweepRect(stamped ?? patch, patch, radius)
          : null;
      const settling = now - lastChange < SPRING_TIME + SETTLE_TIME;
      if (settling) {
        dirty = union(dirty, stamp);
        if (dirty) drawTrail(dirty, elapsed, strength);
        stamped = strength > 0 ? patch : null;
      } else {
        // Everything has sprung back but what the cursor still holds down.
        dirty = stamp;
      }

      if (pressing || patchMoved || fence !== null || pointerMoved) {
        return "pressing";
      }
      return settling ? "recovering" : "still";
    },
    setUniforms: (scene) => {
      gl.activeTexture(gl.TEXTURE0 + TRAIL_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, maps[current].texture);
      gl.uniform1i(scene.uniform("uTrailMap"), TRAIL_UNIT);
      const [width, height] = TRAIL_MAP_SIZE;
      const [x0, y0, x1, y1] = dirty ?? [width, height, 0, 0];
      gl.uniform4f(
        scene.uniform("uTrailRect"),
        x0 / width,
        y0 / height,
        x1 / width,
        y1 / height,
      );
    },
    dispose: () => {
      if (fence) gl.deleteSync(fence);
      gl.deleteBuffer(readback);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(pick.program);
      gl.deleteProgram(trailProgram.program);
      maps.forEach((map) => {
        gl.deleteTexture(map.texture);
        gl.deleteFramebuffer(map.framebuffer);
      });
    },
  };
}
