// Wildflowers, only hinted at: small heads floating just above the pile in
// loose patches. Like the blades, their size and spacing scale with
// distance, so they stay a few pixels across everywhere and read as speckles.
export const flowers = /* glsl */ `
// 1 shows the flowers; 0 turns them off, and marchFur skips them entirely.
#define FLOWERS 1

// Share of flower cells that hold a flower at the heart of a patch, and
// outside one.
const float FLOWER_DENSITY = 0.86;
const float STRAY_DENSITY = 0.045;
const float PATCH_SIZE = 15.0; // metres across a typical patch
const vec2 PATCH_THRESHOLD = vec2(0.41, 1.0);
// Within a patch, flowers gather in clumps about this many metres across, and
// clumping this strong thins the gaps between them.
const float CLUMP_SIZE = 0.2;
const float CLUMP_STRENGTH = 0.8;

// Flower cell size at the finest level, in metres: one and a half fiber cells.
const float FLOWER_SPACING = 0.036;
// In fur lengths.
const float FLOWER_HEIGHT = 0.6;
const float FLOWER_RADIUS = 0.29;
const float FLOWER_SWAY = 1.2;

const vec3 FLOWER_LIT = vec3(0.9, 0.88, 0.64);
const vec3 FLOWER_SHADE = vec3(0.54, 0.58, 0.5);
// Stems run from the root to the head; width is in fur lengths.
const float STEM_WIDTH = 0.025;
const vec3 STEM_COLOR = vec3(0.1, 0.22, 0.05);
// How far fully trampled flowers tip from upright, in radians.
const float FLOWER_TRAMPLE_ANGLE = 1.2;
// Beyond FLOWER_FAR metres there are no flowers, and marchFur stops testing
// for them; they thin out over the FLOWER_FADE metres before it, each at its
// own random point. Past the fiber distance (see HillsQuality) there are none
// anyway.
const float FLOWER_FAR = 300.0;
const float FLOWER_FADE = 100.0;

// Set by marchFur when the ray stops on a flower rather than a blade, and by
// flowerHit when that flower part is the stem.
bool hitFlower = false;
bool hitStem = false;

float flowerPatches(vec2 xz) {
  vec2 p = xz / PATCH_SIZE;
  float n = noise(p + 31.0) * 0.65 + noise(p * 3.1 + 7.0) * 0.35;
  return mix(STRAY_DENSITY, 1.0, smoothstep(PATCH_THRESHOLD.x, PATCH_THRESHOLD.y, n));
}

float flowerClumps(vec2 xz) {
  return mix(1.0, smoothstep(0.25, 0.75, noise(xz / CLUMP_SIZE + 53.0)) * 2.0, CLUMP_STRENGTH);
}

// Distance along the ray to its closest approach to segment ab, or -1 if it
// passes further than radius from it.
float segmentHit(vec3 ro, vec3 rd, vec3 a, vec3 b, float radius) {
  vec3 ba = b - a;
  vec3 oa = ro - a;
  float k = dot(rd, ba);
  float denominator = k * k - dot(ba, ba);
  if (abs(denominator) < 1e-9) return -1.0;
  float s = clamp((dot(rd, oa) * k - dot(ba, oa)) / denominator, 0.0, 1.0);
  vec3 q = a + ba * s;
  float t = dot(q - ro, rd);
  return length(ro + rd * t - q) < radius ? t : -1.0;
}

// Intersects the ray with the flower in p's cell, if it has one. Heads and
// stems are tested exactly rather than sampled at march steps, which are
// longer than a head is wide. Returns the hit distance if it's before tMax,
// otherwise -1. fade is how far the next level has replaced this one; each
// flower drops out at its own random point, so heads never break up the way a
// per-pixel blend between levels would. farFade likewise thins them out
// toward FLOWER_FAR.
//
// A single square grid shows through as rows wherever a slope faces the
// camera, so flowers come from two grids at different angles and offsets,
// turned again at every level.
//
// sway is how far gusts push heads here, and bend is how much of that applies
// at p's height. The cell is looked up where p would be before bending, so a
// head blown out of its cell is still found.
float flowerAtLevel(vec3 ro, vec3 rd, vec3 p, float h, float len, float level, float grid, float fade, float farFade, float density, vec2 sway, float bend, float heightScale, float tMax) {
  float cellSize = FLOWER_SPACING * exp2(level);
  float angle = level * 2.4 + grid * 1.1;
  mat2 rotation = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
  vec2 offset = vec2(0.37, 0.61) * (level + grid * 3.0);
  vec2 cell = floor(rotation * (p.xz - sway * bend) / cellSize + offset);
  vec4 r = hash4(cell + 4513.0 + level * 97.0 + grid * 251.0);
  // Clumps can at most double the density, so some cells fail before the
  // clump noise is needed.
  if (r.x >= density * (1.0 + CLUMP_STRENGTH) || r.y < fade || fract(r.x * 53.1) < farFade) return -1.0;
  // Margins keep the head inside its cell, so only p's cell can hold it.
  vec2 root = (cell + 0.2 + 0.6 * r.zw - offset) * cellSize * rotation;

  float ground = p.y - h;
  float height = len * FLOWER_HEIGHT * heightScale * mix(0.8, 1.2, fract(r.y * 13.7));
  vec3 center = vec3(root.x + sway.x, ground + height, root.y + sway.y);
  float radius = len * FLOWER_RADIUS;

  float t = -1.0;
  vec3 oc = ro - center;
  float b = dot(oc, rd);
  float disc = b * b - dot(oc, oc) + radius * radius;
  if (disc >= 0.0) t = -b - sqrt(disc);
  hitStem = t <= 0.0;
  if (hitStem) t = segmentHit(ro, rd, vec3(root.x, ground, root.y), center, len * STEM_WIDTH);
  if (t <= 0.0 || t >= tMax) return -1.0;
  // Most rays miss the flower in their cell, so the clump noise is left until
  // one hits. Sampled at the flower, not at p, so small clumps never cut a
  // head in two.
  return r.x < density * flowerClumps(root) ? t : -1.0;
}

// Each of the two grids carries half the flowers.
float flowerDensityAt(vec2 xz) {
  return 0.5 * FLOWER_DENSITY * flowerPatches(xz);
}

// density (flowerDensityAt) and gust span metres, so marchFur looks them up
// once per ray; trampled and push are trampleAt's at p, shared with the
// blades.
float flowerHit(vec3 ro, vec3 rd, vec3 p, float h, float len, float level, float tMax, float density, float gust, float trampled, vec2 push) {
  // Skip steps that stay above the tallest head.
  float drop = max(-rd.y, 0.0) * (tMax - distance(ro, p));
  if (h - drop > len * (FLOWER_HEIGHT * 1.2 + FLOWER_RADIUS)) return -1.0;
  vec2 sway = GUST_DIRECTION * gust * GUST_STRENGTH * uWind * len * FLOWER_SWAY;
  // Trampled flowers tip over on their stems with the grass, the head
  // swinging outward and down.
  float tip = trampled * FLOWER_TRAMPLE_ANGLE;
  sway += push * sin(tip) * len * FLOWER_HEIGHT;
  float heightScale = cos(tip);
  // Stems lean straight from the root, so the shift grows with height and is
  // complete by the bottom of the shortest head.
  float bend = clamp(h / max(len * (FLOWER_HEIGHT * heightScale * 0.8 - FLOWER_RADIUS), 1e-4), 0.0, 1.0);
  float base = floor(level);
  float fade = fract(level);
  float farFade = smoothstep(FLOWER_FAR - FLOWER_FADE, FLOWER_FAR, distance(ro, p));
  for (int i = 0; i < 4; i++) {
    float grid = float(i / 2);
    float next = float(i % 2);
    float t = flowerAtLevel(ro, rd, p, h, len, base + next, grid, abs(next - fade), farFade, density, sway, bend, heightScale, tMax);
    if (t > 0.0) return t;
  }
  return -1.0;
}

vec3 flowerColor(float light) {
  return hitStem ? STEM_COLOR * mix(0.5, 1.2, light) : mix(FLOWER_SHADE, FLOWER_LIT, light);
}
`;
