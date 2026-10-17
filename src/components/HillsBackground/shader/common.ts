// Shared with the renderer, which sizes the baked cloud strip from it.
export const FOCAL_LENGTH = 1.6;

export const common = /* glsl */ `
precision highp float;

uniform vec2 uResolution;
uniform float uSeed;
// Seconds since the renderer started; drives the wind.
uniform float uTime;

// Quality settings, set by the renderer (see HillsQuality in renderer.ts).
// The scene may render below canvas resolution; uRenderScale converts so blade
// sizes stay fixed in canvas pixels.
uniform float uRenderScale;
uniform float uFiberStep;
uniform float uFiberDistance;
uniform int uMaxSteps;
// Wind strength: 1 is the designed breeze, 0 turns it off.
uniform float uWind;

const vec2 CAMERA_POSITION = vec2(0.0, 0.0);
const float EYE_HEIGHT = 6.0;
const float FOCAL_LENGTH = ${FOCAL_LENGTH.toFixed(2)};

const vec3 SUN = normalize(vec3(0.9, 0.3, 0.3));
const vec3 SUN_COLOR = vec3(1.0, 0.97, 0.88);

const vec3 SKY_TOP = vec3(0.42, 0.64, 0.90);
const vec3 SKY_HORIZON = vec3(0.80, 0.89, 0.97);
const vec3 HAZE = vec3(0.74, 0.85, 0.93);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uSeed);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Integer hash for the dense fiber grid, where the float hash above loses
// precision and starts producing visible patterns.
vec4 hash4(vec2 cell) {
  uvec4 v = uvec4(uvec2(ivec2(cell)), uint(uSeed * 1000.0), 0u);
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  v ^= v >> 16u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  return vec4(v) / 4294967295.0;
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float pixelSize(float t) {
  return t / (uResolution.y / uRenderScale * FOCAL_LENGTH);
}

vec3 sky(vec3 rd) {
  float h = clamp(rd.y, 0.0, 1.0);
  return mix(SKY_HORIZON, SKY_TOP, pow(h, 0.5));
}
`;
