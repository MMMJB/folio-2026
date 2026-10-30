import { camera } from "./camera";
import { clouds } from "./clouds";
import { common } from "./common";
import { flowers } from "./flowers";
import { BLUR_CURVE, FOCUS_DISTANCE } from "./focus";
import { fur } from "./fur";
import { pick } from "./pick";
import { terrain } from "./terrain";
import { trample } from "./trample";
import { wind } from "./wind";

export { dofShader } from "./dof";
export { blurAt } from "./focus";
export { motesFragmentShader, motesVertexShader } from "./motes";
export { resolveShader } from "./resolve";

export const vertexShader = /* glsl */ `#version 300 es
in vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const main = /* glsl */ `
out vec4 fragColor;

// This frame's sub-pixel sample offset; the renderer averages several frames
// with different offsets to antialias.
uniform vec2 uJitter;
// Pixels hidden behind the nestled section (x0, y0, x1, y1), which are
// never seen and so left out.
uniform vec4 uSkip;

const float FOCUS_DISTANCE = ${FOCUS_DISTANCE.toFixed(1)};
const float BLUR_CURVE = ${BLUR_CURVE.toFixed(1)};

// Where this pixel's rays reach the grass, baked once; see entry below.
// Without it rays march from the camera.
uniform sampler2D uEntry;
uniform bool uUseEntry;

// Returns the colour, and the hit distance in w.
vec4 render(vec3 ro, vec3 rd) {
  vec2 start = uUseEntry ? texelFetch(uEntry, ivec2(gl_FragCoord.xy), 0).xy : marchToGrass(ro, rd);
  float t = marchFur(ro, rd, start);
  if (t >= FAR) return vec4(skyWithClouds(rd), FAR);
  return vec4(shadeFur(ro + rd * t, rd, t), t);
}

void main() {
  if (all(greaterThan(gl_FragCoord.xy, uSkip.xy)) && all(lessThan(gl_FragCoord.xy, uSkip.zw))) {
    fragColor = vec4(0.0);
    return;
  }
  vec3 ro = cameraOrigin();
  vec3 rd = cameraRay((gl_FragCoord.xy + uJitter - 0.5 * uResolution) / uResolution.y);

  vec4 hit = render(ro, rd);
  // The sky blurs like the furthest hills.
  float blur = pow(clamp(1.0 - FOCUS_DISTANCE / min(hit.w, FAR), 0.0, 1.0), BLUR_CURVE);

  vec3 c = hit.rgb;
  float y = max(0.0, min(c.r, c.g) - c.b);

  c = clamp(
    mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.2)
    + y * vec3(0.12, 0.08, -0.04),
    0.0, 1.0
  );

  // Alpha carries the blur amount (0 sharp, 1 maximum) to the dof pass.
  fragColor = vec4(c, blur);
}
`;

const bake = /* glsl */ `
out vec4 fragColor;

void main() {
  vec2 coord = gl_FragCoord.xy / uResolution;
  fragColor = vec4(terrainProcedural(heightmapPoint(coord)), 0.0, 0.0, 1.0);
}
`;

// Bakes the terrain into the heightmap texture; see terrain() in terrain.ts.
export const heightmapShader = `#version 300 es
${common}
${terrain}
${bake}`;

export const fragmentShader = `#version 300 es
${common}
${terrain}
${camera}
${wind}
${trample}
${flowers}
${fur}
${clouds}
${main}`;

export const pickShader = `#version 300 es
${common}
${terrain}
${camera}
${pick}`;

// The entry bake: where this pixel's rays first reach the grass. One value
// serves all jitter offsets: the earliest entry and fewest steps of the four
// rays, so each resumes at or before its own entry. It's stored as a half
// float, rounded down so a ray never starts past where it reaches the grass.
const entry = /* glsl */ `
uniform vec2 uJitters[4];
out vec4 fragColor;

void main() {
  vec3 ro = cameraOrigin();
  vec2 start = vec2(FAR, 2000.0);
  for (int i = 0; i < 4; i++) {
    vec3 rd = cameraRay((gl_FragCoord.xy + uJitters[i] - 0.5 * uResolution) / uResolution.y);
    vec2 ray = marchToGrass(ro, rd);
    start = vec2(min(start.x, ray.x), min(start.y, ray.y));
  }
  // Half floats keep 11 significant bits; FAR (sky) is exact as it is.
  if (start.x < FAR) start.x *= 1.0 - 1.0 / 1024.0;
  fragColor = vec4(start, 0.0, 1.0);
}
`;

export const entryShader = `#version 300 es
${common}
${terrain}
${camera}
${wind}
${trample}
${flowers}
${fur}
${entry}`;

// Bakes the clouds into a strip: x spans one period of their repeating
// layout and y the elevations they reach. Edges are sized to a canvas pixel,
// as when the clouds are computed per pixel.
const cloudStrip = /* glsl */ `
uniform vec2 uStripSize;
uniform float uCanvasPixel;
layout(location = 0) out vec4 back;
layout(location = 1) out vec4 front;

void main() {
  vec2 uv = gl_FragCoord.xy / uStripSize;
  vec2 p = vec2(uv.x * CLOUD_PERIOD, mix(STRIP_BOTTOM, STRIP_TOP, uv.y));
  vec3 layers = cloudLayers(p, p, uCanvasPixel);
  back = vec4(layers.x / STRIP_SCALE, 0.0, 0.0, 1.0);
  front = vec4(layers.y / STRIP_SCALE, layers.z, 0.0, 1.0);
}
`;

export const cloudStripShader = `#version 300 es
${common}
${clouds}
${cloudStrip}`;

// The nestle contour: for each canvas column, the highest point on screen of
// the ground (plus a little grass) nearer than uNestleDepth, roughly where a
// section nestled at that depth meets the hill. It places the section's
// ambient occlusion. Stored in canvas pixels from the bottom.
const contour = /* glsl */ `
uniform float uNestleDepth;
out vec4 fragColor;

const int CONTOUR_STEPS = 256;
const float CONTOUR_NEAR = 2.0;

void main() {
  float x = (gl_FragCoord.x - 0.5 * uResolution.x) / uResolution.y;
  float eye = cameraOrigin().y;
  float top = -1.0;
  for (int i = 0; i < CONTOUR_STEPS; i++) {
    float z = mix(CONTOUR_NEAR, uNestleDepth, (float(i) + 0.5) / float(CONTOUR_STEPS));
    vec2 p = CAMERA_POSITION + vec2(x * z / FOCAL_LENGTH, z);
    float h = terrain(p) + furLength(z) * 0.35;
    top = max(top, FOCAL_LENGTH * (h - eye) / z - HORIZON_SHIFT);
  }
  fragColor = vec4((top + 0.5) * uResolution.y, 0.0, 0.0, 1.0);
}
`;

export const contourShader = `#version 300 es
${common}
${terrain}
${camera}
${wind}
${trample}
${flowers}
${fur}
${contour}`;
