import { createProgram, type Program } from "./gl";
import { motesFragmentShader, motesVertexShader } from "./shader";

// The ambient motes' look; see shader/motes.ts. Distances are in metres.
export type MoteSettings = {
  // How many motes fill the box in front of the camera; 0 turns them off.
  count: number;
  // Diameter of a mote.
  size: number;
  opacity: number;
  // Motes fade in beyond near and out toward far.
  near: number;
  far: number;
  // Highest a mote floats above the ground.
  height: number;
  // Downwind drift, in metres per second.
  drift: number;
  // How far a strong gust pushes a mote downwind.
  gust: number;
  // Size of each mote's own lazy loops.
  wander: number;
  // 0 shines steadily; 1 flickers as if tumbling.
  twinkle: number;
  // Extra brightness looking toward the sun.
  glint: number;
  color: string;
};

// What the component ships with, chosen in the motes playground artifact.
export const DEFAULT_MOTES: MoteSettings = {
  count: 1200,
  size: 0.035,
  opacity: 0.8,
  near: 10.5,
  far: 120,
  height: 9,
  drift: 1,
  gust: 0.3,
  wander: 0.2,
  twinkle: 0.15,
  glint: 0,
  color: "#fff6dc",
};

export type MoteFrame = {
  width: number;
  height: number;
  time: number;
  windStrength: number;
  // Largest depth of field blur radius, as a fraction of the frame height.
  maxBlur: number;
  // The nestled section's rect in canvas pixels (x0, y0, x1, y1, y up) and
  // its buried height, or null without one.
  section: { rect: [number, number, number, number]; bury: number } | null;
};

export type Motes = {
  // Blends the motes over whatever the bound framebuffer holds.
  draw: (settings: MoteSettings, frame: MoteFrame) => void;
  dispose: () => void;
};

const hexToRgb = (hex: string) => {
  const value = parseInt(hex.replace("#", ""), 16) || 0;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(
    (channel) => channel / 255,
  ) as [number, number, number];
};

export function createMotes(
  gl: WebGL2RenderingContext,
  bindTerrain: (program: Program) => void,
): Motes | null {
  const program = createProgram(gl, motesFragmentShader, motesVertexShader);
  if (!program) return null;
  const { uniform } = program;
  // The points take no attributes; an empty vertex array keeps the
  // fullscreen triangle's attribute out of the draw.
  const vertexArray = gl.createVertexArray();
  const maxPointSize = (
    gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array
  )[1];

  return {
    draw: (settings, frame) => {
      if (settings.count <= 0) return;
      gl.useProgram(program.program);
      bindTerrain(program);
      gl.uniform2f(uniform("uResolution"), frame.width, frame.height);
      gl.uniform1f(uniform("uRenderScale"), 1);
      gl.uniform1f(uniform("uTime"), frame.time);
      gl.uniform1f(uniform("uWind"), frame.windStrength);
      gl.uniform1f(uniform("uMaxBlur"), frame.maxBlur);
      gl.uniform1f(uniform("uMaxPointSize"), maxPointSize);
      gl.uniform1f(uniform("uSize"), settings.size);
      gl.uniform1f(uniform("uOpacity"), settings.opacity);
      gl.uniform1f(uniform("uNear"), settings.near);
      gl.uniform1f(uniform("uFar"), Math.max(settings.far, settings.near + 1));
      gl.uniform1f(uniform("uHeight"), settings.height);
      gl.uniform1f(uniform("uDrift"), settings.drift);
      gl.uniform1f(uniform("uGust"), settings.gust);
      gl.uniform1f(uniform("uWander"), settings.wander);
      gl.uniform1f(uniform("uTwinkle"), settings.twinkle);
      gl.uniform1f(uniform("uGlint"), settings.glint);
      gl.uniform3f(uniform("uColor"), ...hexToRgb(settings.color));
      gl.uniform1i(uniform("uNestle"), frame.section ? 1 : 0);
      if (frame.section) {
        gl.uniform4f(uniform("uSection"), ...frame.section.rect);
        gl.uniform1f(uniform("uBury"), frame.section.bury);
      }

      gl.bindVertexArray(vertexArray);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, Math.round(settings.count));
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    },
    dispose: () => {
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program.program);
    },
  };
}
