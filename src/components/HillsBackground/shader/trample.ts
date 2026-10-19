import { common } from "./common";

// Fraction of the radius pressed at full strength; past it the push drops
// off quickly to nothing at the edge.
export const TRAMPLE_FULL = 0.6;
// The edge wanders in and out by up to this fraction of the radius, so a
// patch isn't a perfect circle. Its bumps are fixed to the ground, so a
// trail's edges are ragged too.
export const TRAMPLE_ROUGHNESS = 0.3;

// The trail map: how pressed the grass is over the ground the camera sees,
// laid out around the camera by direction (x, half this many radians either
// side of straight ahead) and log distance (y, between these in metres). A
// texel then spans a patch that grows in step with distance, as on screen.
// The camera sits at CAMERA_POSITION, the origin.
export const TRAIL_MAP_SIZE = [512, 1024] as const;
export const TRAIL_MAP_SPREAD = 1.05;
export const TRAIL_MAP_DISTANCE = [5, 600] as const;

// Where xz (relative to the camera) lands on the trail map, 0 to 1 on each
// axis when it's covered.
export function trailMapUv(x: number, z: number): [number, number] {
  const [near, far] = TRAIL_MAP_DISTANCE;
  return [
    Math.atan2(x, z) / (2 * TRAIL_MAP_SPREAD) + 0.5,
    Math.log(Math.max(Math.hypot(x, z), 1e-4) / near) / Math.log(far / near),
  ];
}

// The hills' trail map layout, shared by the scene and the pass that updates
// the map. Every layout defines TRAIL_MAP_SIZE, trailMapUv and trailMapGround.
const trailMap = /* glsl */ `
const vec2 TRAIL_MAP_SIZE = vec2(${TRAIL_MAP_SIZE.map((n) => n.toFixed(1)).join(", ")});
const float TRAIL_MAP_SPREAD = ${TRAIL_MAP_SPREAD.toFixed(3)};
const vec2 TRAIL_MAP_DISTANCE = vec2(${TRAIL_MAP_DISTANCE.map((n) => n.toFixed(1)).join(", ")});

vec2 trailMapUv(vec2 xz) {
  vec2 d = xz - CAMERA_POSITION;
  return vec2(
    atan(d.x, d.y) / (2.0 * TRAIL_MAP_SPREAD) + 0.5,
    log(max(length(d), 1e-4) / TRAIL_MAP_DISTANCE.x) / log(TRAIL_MAP_DISTANCE.y / TRAIL_MAP_DISTANCE.x)
  );
}

vec2 trailMapGround(vec2 uv) {
  float angle = (uv.x - 0.5) * 2.0 * TRAIL_MAP_SPREAD;
  float dist = TRAIL_MAP_DISTANCE.x * pow(TRAIL_MAP_DISTANCE.y / TRAIL_MAP_DISTANCE.x, uv.y);
  return CAMERA_POSITION + dist * vec2(sin(angle), cos(angle));
}
`;

// How the cursor disturbs the grass, shared by every scene with a trail map.
export const trampleSettings = /* glsl */ `
// 1: the cursor is a wind source blowing blades outward, hardest nearest the
// cursor. 0: it presses blades flat the way it's moving.
#define TRAMPLE_WIND 1

const float TRAMPLE_FULL = ${TRAMPLE_FULL.toFixed(3)};
const float TRAMPLE_ROUGHNESS = ${TRAMPLE_ROUGHNESS.toFixed(3)};

#if TRAMPLE_WIND
// Blades bend outward as if blown by a wind this strong at the centre and dip
// to this fraction of their height as they bend. Like grass in a gust, bent
// blades show their paler sides, so the patch lightens and smooths.
const float TRAMPLE_HEIGHT = 0.6;
const float TRAMPLE_LEAN = 4.0;
const float TRAMPLE_LIGHTEN = 0.22;
const float TRAMPLE_SHEEN = 0.1;
const float TRAMPLE_SMOOTH = 0.2;
// Within this fraction of the radius the outward direction would flip from
// one blade to the next, so it fades out right under the cursor and blades
// there fall a random way (see trampleAt).
const float TRAMPLE_EYE = 0.12;
#else
// Trampled blades keep this fraction of their height, and lie down the way
// the cursor was moving as if blown by a wind this strong.
const float TRAMPLE_HEIGHT = 0.35;
const float TRAMPLE_LEAN = 3.0;
// Like mowing stripes, pressed grass lightens where it lies away from the
// viewer and darkens where it lies toward them, and smooths out a little.
// Blades combed one way across the whole patch keep it reading as flat; an
// outward-from-the-centre lean reads as a mound.
const float TRAMPLE_LIGHTEN = 0.06;
const float TRAMPLE_SHEEN = 0.2;
const float TRAMPLE_SMOOTH = 0.25;
#endif
`;

// Grass disturbed by the cursor, read from the trail map.
export const trampleSampler = /* glsl */ `
uniform sampler2D uTrailMap;
// The part of the map (min and max uv) that may be pressed; elsewhere is calm.
uniform vec4 uTrailRect;

// Spatial frequency (per metre) of the random way blades fall where the
// cursor's pushes cancel out.
const float TRAMPLE_SCATTER_SCALE = 4.0;

// How strongly the grass at xz is pushed over, 0 to 1, and in push the
// direction.
float trampleAt(vec2 xz, out vec2 push) {
  push = vec2(0.0);
  vec2 uv = trailMapUv(xz);
  if (any(lessThan(uv, uTrailRect.xy)) || any(greaterThan(uv, uTrailRect.zw))) return 0.0;
  vec4 trail = texture(uTrailMap, uv);
  if (trail.w <= 0.0) return 0.0;
  // The average push while the cursor passed. Outward pushes from either
  // side cancel down the middle of a trail and under the cursor, so where
  // the push is weak the blades fall a random way instead, varying over a
  // few blades' width.
  vec2 wind = trail.xy / trail.w;
  // Two turns, since the noise seldom strays far from 0.5.
  float angle = noise(xz * TRAMPLE_SCATTER_SCALE) * 12.566;
  push = normalize(wind + vec2(cos(angle), sin(angle)) * max(1.0 - length(wind), 0.0) + 1e-5);
  return smoothstep(0.0, 1.0, trail.z);
}
`;

// Updates the trail map, a texel per fragment: the grass springs back by
// uSpring, and the cursor's patch presses it down again. Each texel holds
// xy: the sum of the pushes the cursor gave it, each weighted by strength and
// time, w: the sum of those weights, z: how pressed it is, shown as
// smoothstep(z) like the cursor's level.
export const trailUpdate = /* glsl */ `
uniform sampler2D uPrevious;
// xy: the cursor's ground position, z: its strength, w: its radius.
uniform vec4 uTrample;
// Where the cursor was at the last update. The patch sweeps from there, so a
// fast cursor leaves an unbroken trail.
uniform vec2 uTrampleFrom;
uniform vec2 uTrampleDirection;
// Seconds since the last update, and the fraction of a full press the grass
// springs back over them.
uniform float uElapsed;
uniform float uSpring;
out vec4 fragColor;

// Seconds of pushes a texel remembers, so a cursor that rests a long time and
// then moves on still turns the grass.
const float TRAIL_MEMORY = 0.25;

void main() {
  vec4 trail = texelFetch(uPrevious, ivec2(gl_FragCoord.xy), 0);
  float level = max(trail.z - uSpring, 0.0);
  vec2 xz = trailMapGround(gl_FragCoord.xy / TRAIL_MAP_SIZE);
  vec2 sweep = uTrample.xy - uTrampleFrom;
  float along = clamp(dot(xz - uTrampleFrom, sweep) / max(dot(sweep, sweep), 1e-8), 0.0, 1.0);
  vec2 d = xz - (uTrampleFrom + sweep * along);
  float dist = length(d) / uTrample.w;
  // Bumps a few tenths of the radius across, coarse and fine.
  vec2 q = xz / uTrample.w;
  float rough = noise(q * 2.5) * 0.65 + noise(q * 6.0 + 17.0) * 0.35;
  float edge = 1.0 + TRAMPLE_ROUGHNESS * (2.0 * rough - 1.0);
  float strength = uTrample.z * (1.0 - smoothstep(TRAMPLE_FULL * edge, edge, dist));
  if (strength > 0.0) {
    // The level whose smoothstep is strength.
    level = max(level, 0.5 - sin(asin(1.0 - 2.0 * strength) / 3.0));
#if TRAMPLE_WIND
    vec2 push = d / max(length(d), 1e-4) * smoothstep(0.0, TRAMPLE_EYE, dist);
#else
    // A cursor that hasn't moved yet presses the grass away from the viewer.
    vec2 push = dot(uTrampleDirection, uTrampleDirection) > 0.0 ? uTrampleDirection : normalize(uTrample.xy - CAMERA_POSITION);
#endif
    float weight = strength * uElapsed;
    trail.xy += push * weight;
    trail.w += weight;
    if (trail.w > TRAIL_MEMORY) trail.xyw *= TRAIL_MEMORY / trail.w;
  }
  // Grass that has sprung back forgets how it was pushed.
  fragColor = level > 0.0 ? vec4(trail.xy, level, trail.w) : vec4(0.0);
}
`;

export const trample = `
${trailMap}
${trampleSettings}
${trampleSampler}`;

export const trailShader = `#version 300 es
${common}
${trailMap}
${trampleSettings}
${trailUpdate}`;
