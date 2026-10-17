// The hills are covered in a short, velvety pile: a thin shell of fibers
// raymarched on top of the terrain. Fiber size scales with distance so the pile
// reads the same on every hill and gives silhouettes a soft, fuzzy edge.
export const fur = /* glsl */ `
const float FUR_LENGTH = 0.03;
const float FUR_MIN_PIXELS = 9.0;
const float FIBER_WIDTH = 0.8;
const float BLADE_SPACING = 1.44;

// Most blades stand between SHORT_BLADE_HEIGHT and 1 times the fur length; a
// few are taller and poke above the rest.
const float SHORT_BLADE_HEIGHT = 0.3;
const float TALL_BLADE_CHANCE = 0.25;
const float TALL_BLADE_HEIGHT = 3.0;

// Spread of resting blade directions, in radians.
const float BLADE_ANGLE_RANGE = 2.0;

// Grass colour by brightness, sampled from a reference photo: shadows are a
// deep pure green and highlights lean yellow, at a steady high saturation.
const vec3 GRASS_RAMP_0 = vec3(0.06, 0.15, 0.04);
const vec3 GRASS_RAMP_1 = vec3(0.18, 0.34, 0.08);
const vec3 GRASS_RAMP_2 = vec3(0.30, 0.48, 0.10);
const vec3 GRASS_RAMP_3 = vec3(0.46, 0.62, 0.14);
const vec3 GRASS_RAMP_4 = vec3(0.69, 0.77, 0.24);
// Added to the tone in the deepest shadow, easing off toward the light. An
// offset rather than a compression, so shadowed grass keeps its spread of colour.
const float SHADOW_LIFT = 0.1;

#define LIGHTING_VIVID

#ifdef LIGHTING_VIVID
// High contrast: deep shadows and glossy highlights on the crests.
const vec2 TERMINATOR = vec2(0.05, 0.6);
const float SHADOW_FLOOR = 0.2;
const vec2 TONE_RANGE = vec2(0.16, 0.8);
const float SHEEN_STRENGTH = 0.18;
const float BLADE_CONTRAST = 0.45;
const vec3 SHADOW_TINT = vec3(0.0);
const float SHADOW_TINT_AMOUNT = 0.0;
#else
// Soft: shadows stay light and drift toward the sky's blue.
const vec2 TERMINATOR = vec2(-0.25, 0.45);
const float SHADOW_FLOOR = 0.6;
const vec2 TONE_RANGE = vec2(0.3, 0.7);
const float SHEEN_STRENGTH = 0.1;
const float BLADE_CONTRAST = 0.35;
const vec3 SHADOW_TINT = vec3(0.30, 0.46, 0.56);
const float SHADOW_TINT_AMOUNT = 0.45;
#endif

float furLength(float t) {
  return max(FUR_LENGTH, pixelSize(t) * FUR_MIN_PIXELS);
}

// Fiber and grain sizes snap to power-of-two levels, like texture mipmaps.
// Scaling them continuously with distance would make the pattern depend only
// on ray direction and smear it into vertical streaks.
float furLevel(float t) {
  return log2(furLength(t) / FUR_LENGTH);
}

float fiberCellSize(float t) {
  float level = floor(furLevel(t) + hash(gl_FragCoord.xy));
  return FUR_LENGTH * FIBER_WIDTH * exp2(level);
}

// Each blade's resting direction comes from a smooth noise field, so
// neighbouring blades point roughly the same way; the wind then bends it.
vec2 bladeDirection(vec2 xz, vec2 wind) {
  float field = noise(xz * 0.35 + 61.0) * 0.7 + noise(xz * 1.4 + 19.0) * 0.3;
  float angle = (field - 0.5) * BLADE_ANGLE_RANGE;
  return normalize(vec2(cos(angle), sin(angle)) + wind);
}

// Blade tips seen from above: bright where a blade points at the viewer, dark
// in the gaps between blades. Each cell is stretched along its blade's
// direction so the blades read as lying down.
float bladesAtScale(vec2 xz, float scale, vec2 wind) {
  vec2 q = xz / scale;
  vec2 cell = floor(q);

  float nearest = 1.0;
  float brightness = 0.5;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(i, j);
      vec4 r = hash4(c + 7919.0);
      vec2 center = c + r.xy;
      vec2 dir = bladeDirection(center * scale, wind);
      vec2 d = q - center;
      float dist = length(vec2(dot(d, dir) * 0.55, dot(d, vec2(-dir.y, dir.x))));
      if (dist < nearest) {
        nearest = dist;
        brightness = r.z;
      }
    }
  }
  return (1.0 - smoothstep(0.0, 0.75, nearest)) * mix(0.5, 1.0, brightness);
}

float bladesAt(vec2 xz, float t, vec2 wind) {
  float level = furLevel(t);
  float scale = FUR_LENGTH * BLADE_SPACING * exp2(floor(level));
  float fine = bladesAtScale(xz, scale, wind);
  float coarse = bladesAtScale(xz, scale * 2.0, wind);
  return mix(fine, coarse, fract(level));
}

// gust is the gust strength along this ray; see marchFur.
bool fiberAt(vec2 xz, float h, float len, float cellSize, float gust) {
  vec2 wind = uWind > 0.0 ? windAt(xz, gust) : WIND;
  vec2 push;
  float trampled = trampleAt(xz, push);
  wind += push * trampled * TRAMPLE_LEAN;
  float heightScale = mix(1.0, TRAMPLE_HEIGHT, trampled);
  vec2 q = (xz - wind * h * h / len) / cellSize;
  vec2 cell = floor(q);
  // The direction field varies over metres and cells are centimetres apart,
  // so one lookup serves the whole neighbourhood.
  vec2 lean = bladeDirection(xz, wind) * 0.4;

  // Roots sit at least 0.15 cells inside their cell, and lean plus radius
  // never exceeds 0.6 cells, so a blade reaches at most 0.45 cells into a
  // neighbour. Only the neighbour on the nearer side of each axis can touch q,
  // which makes this 2x2 search exact.
  vec2 side = step(0.5, q - cell) * 2.0 - 1.0;
  for (int j = 0; j <= 1; j++) {
    for (int i = 0; i <= 1; i++) {
      vec2 c = cell + vec2(i, j) * side;
      vec4 r = hash4(c);
      float height = r.w < TALL_BLADE_CHANCE
        ? mix(1.0, TALL_BLADE_HEIGHT, r.z)
        : mix(SHORT_BLADE_HEIGHT, 1.0, r.z);
      float s = h / (len * height * heightScale);
      if (s > 1.0) continue;

      vec2 root = c + 0.15 + 0.7 * r.xy;
      root += lean * s * s;
      if (distance(q, root) < 0.6 * (1.0 - s)) return true;
    }
  }
  return false;
}

// Valley mist: fog whose density falls off with height above MIST_FLOOR,
// integrated analytically along the view ray (Quilez's height fog). Low ground
// between hills fills with a soft mist that separates the ridges.
const vec3 MIST_COLOR = vec3(0.82, 0.90, 0.88);
const float MIST_DENSITY = 0.0018;
const float MIST_FALLOFF = 0.15;
const float MIST_FLOOR = 4.0;

float valleyMist(vec3 ro, vec3 rd, float t) {
  float base = MIST_DENSITY * exp(-(ro.y - MIST_FLOOR) * MIST_FALLOFF);
  float k = rd.y * MIST_FALLOFF;
  float amount = abs(k) < 1e-5 ? base * t : base * (1.0 - exp(-t * k)) / k;
  return clamp(amount, 0.0, 1.0);
}

// Air steps shared by marchToGrass and marchFur: how far to advance from a
// point h above the ground, outside the grass.
float airStep(float h, float shell, float len) {
  return max(0.45 * (h - shell), len * 0.5);
}

float grassShell(float t, float len) {
  // Past uFiberDistance there are no blades, only the ground surface.
  return t < uFiberDistance ? len * TALL_BLADE_HEIGHT : 0.0;
}

// The camera and terrain never move, so the stretch of each ray before it
// first reaches the grass is the same every frame. This runs once per pixel
// when the canvas is sized (see entry.ts) and returns where marchFur should
// start: the distance in x and the steps already taken in y. Sky rays return
// FAR. It must step exactly as marchFur does, so resuming changes nothing.
vec2 marchToGrass(vec3 ro, vec3 rd) {
  float ceiling = maxHillHeight();
  float t = 0.05;
  for (int i = 0; i < 2000; i++) {
    if (i >= uMaxSteps) return vec2(t, i);
    vec3 p = ro + rd * t;
    float len = furLength(t);
    if (rd.y >= 0.0 && p.y > ceiling + len * TALL_BLADE_HEIGHT) return vec2(FAR, i);
    float h = p.y - terrain(p.xz);
    if (h < grassShell(t, len)) return vec2(t, i);
    t += airStep(h, grassShell(t, len), len);
    if (t > FAR) return vec2(FAR, i);
  }
  return vec2(t, 2000);
}

// start is marchToGrass's result for this ray.
float marchFur(vec3 ro, vec3 rd, vec2 start) {
  if (start.x >= FAR) return FAR;
  float ceiling = maxHillHeight();
  float t = start.x;
  // Gusts span tens of metres and a ray crosses the grass over far less, so
  // the gust is looked up once, where the ray first reaches the grass.
  float gust = -1.0;
  for (int i = int(start.y); i < 2000; i++) {
    if (i >= uMaxSteps) break;
    vec3 p = ro + rd * t;
    float len = furLength(t);
    // A rising ray above the tallest possible grass can't hit anything.
    if (rd.y >= 0.0 && p.y > ceiling + len * TALL_BLADE_HEIGHT) return FAR;
    float h = p.y - terrain(p.xz);
    float shell = grassShell(t, len);
    if (h < 0.0) return t;
    if (h < shell) {
      if (gust < 0.0) gust = uWind > 0.0 ? gustAt(p.xz) : 0.0;
      if (fiberAt(p.xz, h, len, fiberCellSize(t), gust)) return t;
      // Step by fiber width, not length, so tall blades are sampled along
      // their whole height instead of breaking into dots.
      float step = len * FIBER_WIDTH * uFiberStep;
#if FLOWERS
      float flower = flowerHit(ro, rd, p, h, len, furLevel(t), t + step);
      if (flower > 0.0) {
        hitFlower = true;
        return flower;
      }
#endif
      t += step;
    } else {
      t += airStep(h, shell, len);
    }
    if (t > FAR) return FAR;
  }
  return t;
}

vec3 grassRamp(float tone) {
  float x = clamp((tone - 0.15) / 0.155, 0.0, 4.0);
  vec3 color = mix(GRASS_RAMP_0, GRASS_RAMP_1, clamp(x, 0.0, 1.0));
  color = mix(color, GRASS_RAMP_2, clamp(x - 1.0, 0.0, 1.0));
  color = mix(color, GRASS_RAMP_3, clamp(x - 2.0, 0.0, 1.0));
  color = mix(color, GRASS_RAMP_4, clamp(x - 3.0, 0.0, 1.0));
  // Below the darkest stop, darken along the same hue.
  return color * min(tone / 0.15, 1.0);
}

vec3 shadeFur(vec3 p, vec3 rd, float t) {
  vec3 n = terrainNormal(p, t);

  float shadow = smoothstep(0.2, 0.8, softShadow(p + n * 0.2));
  float light = smoothstep(TERMINATOR.x, TERMINATOR.y, dot(n, SUN)) * mix(SHADOW_FLOOR, 1.0, shadow);

  // Patches of grass combed in slightly different directions catch the sheen
  // differently, like brushed velvet.
  float patches = noise(p.xz * 0.12 + 11.0) * 0.6 + noise(p.xz * 0.5 + 23.0) * 0.4;
  float sheen = pow(1.0 - max(dot(n, -rd), 0.0), 4.0) * mix(0.6, 1.3, patches);

  // Grass pressed over by a gust catches a little more light.
  float gust = uWind > 0.0 ? gustAt(p.xz) : 0.0;
  sheen *= 1.0 + 0.9 * gust * uWind;

  vec2 push;
  float trampled = trampleAt(p.xz, push);
  float blades = bladesAt(p.xz, t, windAt(p.xz, gust) + push * trampled * TRAMPLE_LEAN);
  float bladeContrast = mix(0.35, 1.0, light);
  float detail = mix(1.0 - BLADE_CONTRAST * bladeContrast, 1.0 + BLADE_CONTRAST * 0.6 * bladeContrast, blades);
  detail = mix(detail, 1.0, trampled * TRAMPLE_SMOOTH);

  float tone = mix(TONE_RANGE.x, TONE_RANGE.y, light) * mix(0.92, 1.06, patches) * (1.0 + 0.04 * gust * uWind) * detail;
  tone += sheen * SHEEN_STRENGTH * light * mix(0.6, 1.2, blades);
  tone *= 1.0 + trampled * (TRAMPLE_LIGHTEN + TRAMPLE_SHEEN * dot(push, normalize(rd.xz)));
  tone += SHADOW_LIFT * (1.0 - light) * (1.0 - light);
  vec3 color = hitFlower ? flowerColor(light) : grassRamp(tone);

  float hue = noise(p.xz * 0.02 + 41.0) * 0.5 + noise(p.xz * 0.09 + 5.0) * 0.25 + noise(p.xz * 1.1 + 77.0) * 0.25;
  color *= mix(vec3(0.95, 1.0, 1.06), vec3(1.05, 1.0, 0.94), smoothstep(0.25, 0.75, hue));

  color = mix(color, SHADOW_TINT, SHADOW_TINT_AMOUNT * (1.0 - light));

  // Distant grass lightens toward a pale green rather than the sky's blue.
  vec3 haze = mix(HAZE, GRASS_RAMP_3, 0.45);
  color = mix(color, haze, 1.0 - exp(-0.0012 * t));

  return mix(color, MIST_COLOR, valleyMist(p - rd * t, rd, t));
}
`;
