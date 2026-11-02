import { createProgram, type Program } from "./gl";
import { pickShader } from "./shader";
import { CURSOR_POINTS } from "./shader/wind";

// The cursor's gust: the same gust the wind blows, centred where the cursor
// meets the ground and blowing the way it moved. Where it passes, the grass
// springs back: it swings past upright and rings down, frequency times a
// second, losing more of each swing the higher damping is (1 settles without
// swinging past). Radius in metres; strength 0 to 1, as gustAt's.
export type CursorGust = {
  radius: number;
  strength: number;
  frequency: number;
  damping: number;
};

export const DEFAULT_CURSOR_GUST: CursorGust = {
  radius: 4,
  strength: 0.8,
  frequency: 0.8,
  damping: 0.25,
};

type TrailPoint = {
  x: number;
  z: number;
  dx: number;
  dz: number;
  time: number;
};

// Jumps between picks longer than this many radii aren't filled in; see
// pollPick.
const MAX_FILL = 15;

export type TrampleState = "pressing" | "still";

export type Trample = {
  // uv is relative to the frame centre in units of its height, as in the
  // shader's cameraRay; null when the cursor isn't over the page.
  setPointer: (uv: [number, number] | null) => void;
  setGust: (gust: Partial<CursorGust>) => void;
  // Picks the ground under the cursor. "pressing" while the gust is moving,
  // which should show at once; "still" otherwise.
  // Also "pressing" while grass the cursor left behind is springing back.
  update: () => TrampleState;
  setUniforms: (scene: Program) => void;
  dispose: () => void;
};

// Tracks where the cursor meets the ground, where it makes a gust.
// bindTerrain sets the pick program's terrain inputs (seed and heightmap) and
// the book's.
// Returns null without float render targets, which the pick needs.
export function createTrample(
  gl: WebGL2RenderingContext,
  bindTerrain: (program: Program) => void,
): Trample | null {
  if (!gl.getExtension("EXT_color_buffer_float")) return null;
  const pick = createProgram(gl, pickShader);
  if (!pick) return null;

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

  const result = new Float32Array(4);
  let pointer: [number, number] | null = null;
  let pointerMoved = false;
  let fence: WebGLSync | null = null;
  let gust = { ...DEFAULT_CURSOR_GUST };
  // Where the cursor last met the ground; null while it's off the ground.
  let ground: { x: number; z: number } | null = null;
  // Where the cursor has passed over the ground, newest first. The newest
  // point follows the cursor, and every half a radius the cursor leaves a
  // copy of it behind to spring back; time is when the cursor left it, in
  // seconds, or Infinity for the one under the cursor.
  let trail: TrailPoint[] = [];
  // Where the cursor last left a point behind.
  let dropped: { x: number; z: number } | null = null;
  // When the previous pick landed, in seconds.
  let lastPick = 0;
  const trailData = new Float32Array(CURSOR_POINTS * 4);
  const springData = new Float32Array(CURSOR_POINTS * 2);
  let groundMoved = false;
  // Which way the cursor last moved over the ground, as a unit vector; starts
  // downwind, as wind.ts's GUST_DIRECTION.
  let direction = normalize(0.5, -0.15);

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
    const next =
      pointer !== null && result[3] > 0 ? { x: result[0], z: result[1] } : null;
    // Moves under a centimetre are pick noise, not a heading.
    if (
      ground &&
      next &&
      Math.hypot(next.x - ground.x, next.z - ground.z) > 0.01
    ) {
      direction = normalize(next.x - ground.x, next.z - ground.z);
    }
    ground = next;
    groundMoved = true;
    if (!ground) {
      release();
      return;
    }
    const point = {
      ...ground,
      dx: direction.x,
      dz: direction.z,
      time: Infinity,
    };
    if (trail[0]?.time === Infinity) trail[0] = point;
    else trail.unshift(point);
    const now = performance.now() / 1000;
    const since = lastPick;
    lastPick = now;
    const spacing = gust.radius / 2;
    const distance = dropped
      ? Math.hypot(ground.x - dropped.x, ground.z - dropped.z)
      : Infinity;
    if (distance >= spacing) {
      // Picks land a frame or two apart, and a quick move covers metres of
      // ground in that time, so the points between are filled in, each left
      // as long ago as the cursor would have passed it since the previous
      // pick. A jump far longer
      // than the cursor could sweep is to other ground, such as a farther
      // hill, and the ground between was never under the cursor.
      const steps =
        dropped && distance <= MAX_FILL * gust.radius
          ? Math.ceil(distance / spacing)
          : 1;
      const [from, to] = [dropped, ground];
      const filled = Array.from({ length: steps }, (_, i) => {
        const f = (steps - i) / steps;
        return from && steps > 1
          ? {
              ...point,
              x: from.x + (to.x - from.x) * f,
              z: from.z + (to.z - from.z) * f,
              time: since + (now - since) * f,
            }
          : { ...point, time: now };
      });
      trail.splice(1, 0, ...filled);
      dropped = { ...ground };
    }
    trail.length = Math.min(trail.length, CURSOR_POINTS);
  };

  // Leaves the point under the cursor behind to spring back.
  const release = () => {
    if (trail[0]?.time === Infinity) trail[0].time = performance.now() / 1000;
    dropped = null;
  };

  // How far the grass at a trail point still leans, as a fraction of the
  // gust's (negative while it swings back past upright), and the most it can
  // lean from here on; the point has settled once that's tiny. A damped
  // spring released from full lean.
  const springOf = (point: TrailPoint, now: number) => {
    const age = Math.max(0, now - point.time);
    const omega = 2 * Math.PI * gust.frequency;
    const zeta = Math.min(Math.max(gust.damping, 0.01), 0.99);
    const decay = Math.exp(-zeta * omega * age);
    const omegaD = omega * Math.sqrt(1 - zeta * zeta);
    const lean =
      decay *
      (Math.cos(omegaD * age) +
        ((zeta * omega) / omegaD) * Math.sin(omegaD * age));
    return {
      lean: gust.strength * lean,
      reach: gust.strength * decay,
    };
  };

  return {
    setPointer: (uv) => {
      pointer = uv;
      pointerMoved = uv !== null;
      if (!uv) {
        ground = null;
        groundMoved = true;
        release();
      }
    },
    setGust: (next) => {
      gust = { ...gust, ...next };
      groundMoved = true;
    },
    update: () => {
      const moved = groundMoved;
      groundMoved = false;
      pollPick();
      if (pointer && pointerMoved && !fence) {
        runPick(pointer);
        pointerMoved = false;
      }
      // Drop points that have died away; while any are dying away the grass
      // is still moving.
      const now = performance.now() / 1000;
      trail = trail.filter((point) => springOf(point, now).reach > 0.005);
      const fading = trail.some((point) => point.time !== Infinity);
      return moved || groundMoved || fence !== null || pointerMoved || fading
        ? "pressing"
        : "still";
    },
    setUniforms: (scene) => {
      const now = performance.now() / 1000;
      trail.forEach((point, i) => {
        trailData.set([point.x, point.z, point.dx, point.dz], i * 4);
        const { lean, reach } = springOf(point, now);
        springData.set([lean, reach], i * 2);
      });
      gl.uniform4fv(scene.uniform("uCursorTrail"), trailData);
      gl.uniform2fv(scene.uniform("uCursorSpring"), springData);
      gl.uniform1i(scene.uniform("uCursorCount"), trail.length);
      gl.uniform1f(scene.uniform("uCursorRadius"), gust.radius);
      const xs = trail.map((point) => point.x);
      const zs = trail.map((point) => point.z);
      gl.uniform4f(
        scene.uniform("uCursorBounds"),
        Math.min(...xs) - gust.radius,
        Math.min(...zs) - gust.radius,
        Math.max(...xs) + gust.radius,
        Math.max(...zs) + gust.radius,
      );
    },
    dispose: () => {
      if (fence) gl.deleteSync(fence);
      gl.deleteBuffer(readback);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(pick.program);
    },
  };
}

function normalize(x: number, z: number) {
  const length = Math.hypot(x, z);
  return { x: x / length, z: z / length };
}
