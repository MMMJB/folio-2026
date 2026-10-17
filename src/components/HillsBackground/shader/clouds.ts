// Cumulus near the horizon, drawn on the sky. Positions are angles: x across
// the view (azimuth) and y up from the horizon, in radians.
//
// The model comes from fitting layered lumps to a reference photo (matching
// it to over 90%) and measuring what set their brightness. A cloud adds warm
// light to the sky and is never darker than it. Within a mass, brightness is
// mostly a function of position: it rises with height and is strongest in a
// band just inside the outline facing the light. On that sit bulges lit from
// above, layered top to bottom so each lower bulge's lit top crosses the
// darker underside of the one above, and small lumps that roughen the
// outline into cauliflower edges.
// The layout repeats every CLOUD_CELLS cells of CLOUD_CELL radians, so it
// can be baked into a strip that loops; the strip spans these elevations,
// from below the horizon, where the hills hide the clouds' bases, to above
// the tallest tower. Shared with the renderer, which sizes the strip.
export const CLOUD_CELL = 0.28;
export const CLOUD_CELLS = 16;
export const CLOUD_PERIOD = CLOUD_CELL * CLOUD_CELLS;
export const STRIP_BOTTOM = -0.03;
export const STRIP_TOP = 0.3;
// The strip is 8-bit, so brightness is stored divided by this, its maximum.
export const STRIP_SCALE = 1.4;

export const clouds = /* glsl */ `
// Where the clouds' bases sit; below the horizon, so the hills hide them.
const float CLOUD_BASE = -0.01;
// Each cell across the view holds a cloud group, a low bank behind it that
// bridges to the next, and sometimes a small floating puff. Cells are narrow
// enough that the horizon is nearly filled.
const float CLOUD_CELL = ${CLOUD_CELL.toFixed(3)};
const float CLOUD_CELLS = ${CLOUD_CELLS.toFixed(1)};
const float CLOUD_PERIOD = CLOUD_CELL * CLOUD_CELLS;
const float STRIP_BOTTOM = ${STRIP_BOTTOM.toFixed(3)};
const float STRIP_TOP = ${STRIP_TOP.toFixed(3)};
const float STRIP_SCALE = ${STRIP_SCALE.toFixed(2)};
// Masses in front of each group's tower.
const int CLOUD_FRONT_MASSES = 4;
// Radians per second; the clouds drift slowly downwind.
const float CLOUD_DRIFT = 0.0012;
// The outline facing this direction is lit: from the right, 35 degrees up.
const vec2 CLOUD_LIGHT = vec2(0.819, 0.574);

// Bulges are this fraction of their mass's height across, varying by
// BULGE_SPREAD either way, lit from BULGE_LIGHT with brightness varying by
// BULGE_SHADING either way, gathered toward the lit rim by BULGE_GATHER.
const float BULGE_SIZE = 0.085;
const float BULGE_SPREAD = 0.35;
const float BULGE_SHADING = 0.35;
const float BULGE_GATHER = 1.55;
const vec2 BULGE_LIGHT = vec2(0.5, 0.866);
// Width of a bulge's edge, as a fraction of its radius: crisp where it faces
// the light, soft where it faces away and blends into what's behind.
const float BULGE_CRISP = 0.06;
const float BULGE_SOFT = 0.6;
// How far billows push a bulge's outline in and out, as a fraction of its
// radius, so it reads as cauliflower rather than a circle.
const float BULGE_ROUGHNESS = 0.45;
// Small lumps along the outline, as fractions of the mass's height, with
// a little brightness jitter.
const float LUMP_SIZE = 0.025;
const float LUMP_JITTER = 0.03;
const float LUMP_SOFTNESS = 0.4;
// The base thins into the sky over this fraction of a mass's height.
const float BASE_FADE = 0.5;
// Light added to the sky at full brightness.
const vec3 CLOUD_TINT = vec3(0.34, 0.13, 0.03);

float smax(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return max(a, b) + h * h * k * 0.25;
}

// Roughly the distance inside an ellipse, negative outside. Outside it's the
// implicit function over its gradient, which stays accurate far from small
// ellipses; inside that breaks down at the centre, so it's simply scaled.
float ellipse(vec2 p, vec2 center, vec2 size) {
  vec2 q = p - center;
  float k = length(q / size);
  if (k < 1.0) return (1.0 - k) * min(size.x, size.y);
  return (1.0 - k) * k / length(q / (size * size));
}

struct Mass {
  vec2 center;
  // Half its width, and its height.
  vec2 size;
  float seed;
  bool tower;
};

// A mass's outline: lobes stacked up from its base, each narrower and
// shifted a little from the one below. Towers spread wide at the bottom.
float massShape(vec2 p, Mass m) {
  // Stacked lobes reach about 1.2x the base lobe's height.
  vec2 size = vec2(m.size.x, m.size.y / 1.2);
  float d = -1.0;
  float lean = 0.0;
  for (int k = 0; k < 5; k++) {
    vec4 g = hash4(vec2(m.seed * 5.0 + float(k), 23.0));
    float shrink = 1.0 - 0.2 * float(k);
    vec2 stretch = k == 0 && m.tower ? vec2(1.5, 0.45) : vec2(1.0);
    float sprawl = m.tower ? 0.25 : 0.5;
    if (k > 0) lean = clamp(lean + (g.x - 0.5) * size.x * 0.8, -sprawl * size.x, sprawl * size.x);
    vec2 offset = vec2(lean, float(k) * size.y * 0.24);
    d = smax(d, ellipse(p, m.center + offset, size * stretch * shrink * mix(0.8, 1.1, g.y)), size.y * 0.15);
  }
  return d;
}

// Billowing noise: rounded bulges with sharp creases between, at several sizes.
float billow(vec2 p, float size) {
  vec2 q = p / size;
  q += vec2(noise(q * 0.4 + 1.7), noise(q * 0.4 + 8.3)) * 1.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amplitude * abs(noise(q) * 2.0 - 1.0);
    q = rot * q * 2.1 + 3.7;
    amplitude *= 0.5;
  }
  return sum;
}

// Brightness by height through a mass, from its base (0) to its top (1),
// as measured on the reference.
float heightRamp(float x) {
  const float xs[8] = float[8](0.0, 0.07, 0.21, 0.35, 0.57, 0.71, 0.81, 1.0);
  const float ys[8] = float[8](0.24, 0.3, 0.4, 0.57, 0.68, 0.92, 1.0, 0.9);
  x = clamp(x, 0.0, 1.0);
  for (int i = 0; i < 7; i++) {
    if (x <= xs[i + 1]) return mix(ys[i], ys[i + 1], (x - xs[i]) / (xs[i + 1] - xs[i]));
  }
  return ys[7];
}

// Brightness by depth in from the outline facing the light, as a fraction of
// the mass's height, as measured on the reference.
float litBand(float d) {
  if (d < 0.018) return mix(0.75, 0.95, d / 0.018);
  if (d < 0.044) return mix(0.95, 1.0, (d - 0.018) / 0.026);
  if (d < 0.18) return 1.0;
  if (d < 0.35) return mix(1.0, 0.6, (d - 0.18) / 0.17);
  return mix(0.6, 0.45, clamp((d - 0.35) / 0.35, 0.0, 1.0));
}

// Layers one mass's brightness over what's behind it.
float layerMass(float behind, vec2 p, Mass m, float pixel) {
  float height = m.size.y;
  vec2 reach = m.size * vec2(2.2, 1.4) + height * BULGE_SIZE;
  if (abs(p.x - m.center.x) > reach.x || p.y - m.center.y > reach.y) return behind;

  // A solid body inside the outline, which the bulges and lumps build on.
  float coverage = smoothstep(0.0, 0.03 * height, massShape(p, m));
  float shade = 1.0 - BULGE_SHADING;

  // Bulges, top row first so lower ones overlap the ones above. They're laid
  // out relative to the mass, so its look repeats wherever it's placed.
  vec2 local = p - m.center;
  float radius = BULGE_SIZE * height;
  float cell = radius * 1.2;
  vec2 base = floor(local / cell);
  for (int j = 2; j >= -2; j--) {
    for (int i = -2; i <= 2; i++) {
      vec2 c = base + vec2(i, j);
      vec4 h = hash4(c + m.seed * 5.1 + 91.0);
      vec2 center = m.center + (c + h.xy) * cell;
      float r = radius * mix(1.0 - BULGE_SPREAD, 1.0 + BULGE_SPREAD, h.z);
      if (massShape(center, m) < -0.2 * r) continue;
      vec2 q = p - center;
      float toward = clamp(dot(q, BULGE_LIGHT) / r, -1.0, 1.0);
      float d = r - length(q) + (billow(local + h.w * 50.0, r * 0.4) - 0.35) * r * BULGE_ROUGHNESS;
      float edge = max(mix(BULGE_SOFT, BULGE_CRISP, smoothstep(-0.3, 0.6, toward)) * r, pixel);
      float a = smoothstep(-edge, edge, d);
      if (a <= 0.0) continue;
      float lit = pow((toward + 1.0) * 0.5, BULGE_GATHER);
      shade = mix(shade, 1.0 + BULGE_SHADING * (2.0 * lit - 1.0), a);
      coverage = max(coverage, a);
    }
  }

  // Small lumps along the outline.
  float lumpRadius = LUMP_SIZE * height;
  float jitter = 1.0;
  if (lumpRadius > 2.0 * pixel) {
    float lumpCell = lumpRadius * 1.6;
    base = floor(local / lumpCell);
    for (int j = 2; j >= -2; j--) {
      for (int i = -2; i <= 2; i++) {
        vec2 c = base + vec2(i, j);
        vec4 h = hash4(c + m.seed * 3.7 + 13.0);
        vec2 center = m.center + (c + h.xy) * lumpCell;
        float r = lumpRadius * mix(0.4, 1.6, h.z * h.z);
        float inside = massShape(center, m);
        if (inside < -0.3 * radius || inside > 0.5 * radius) continue;
        float edge = max(LUMP_SOFTNESS * r, pixel);
        float a = smoothstep(-edge, edge, r - length(p - center));
        if (a <= 0.0) continue;
        jitter = mix(jitter, 1.0 + LUMP_JITTER * (h.w * 2.0 - 1.0), a);
        coverage = max(coverage, a);
      }
    }
  }
  if (coverage <= 0.0) return behind;

  // Depth in from the outline facing the light. Samples count as inside
  // gradually, so rays that graze a lobe don't draw streaks.
  float depth = 0.0;
  for (int s = 1; s <= 16; s++) {
    float d = massShape(p + CLOUD_LIGHT * (0.7 * height * float(s) / 16.0), m);
    depth += smoothstep(-0.04 * height, 0.08 * height, d) * (0.7 / 16.0);
  }
  float field = heightRamp((p.y - m.center.y) / height) * litBand(depth);
  float fade = smoothstep(m.center.y, m.center.y + height * BASE_FADE, p.y);
  return mix(behind, field * shade * jitter, coverage * fade);
}

// One cell's clouds, back to front: a small cloud behind, then the group's
// tower, then lower masses in front of it to either side.
float layerCell(float lit, vec2 p, float cell, float pixel) {
  // Everything random comes from the cell's place in the repeating layout.
  float id = mod(cell, CLOUD_CELLS);
  vec4 h = hash4(vec2(id, 11.0));
  float x = (cell + 0.15 + 0.7 * h.x) * CLOUD_CELL;
  float height = mix(0.08, 0.2, h.y);
  float width = height * mix(0.45, 0.8, h.z);

  vec4 s = hash4(vec2(id, 12.0));
  if (s.w < 0.4) {
    // A small puff floating clear of the horizon.
    vec2 center = vec2((cell + s.x) * CLOUD_CELL, CLOUD_BASE + mix(0.06, 0.14, s.z));
    vec2 size = vec2(mix(0.015, 0.03, s.y), mix(0.015, 0.03, s.z));
    lit = layerMass(lit, p, Mass(center, size, id * 7.0 + 0.25, false), pixel);
  }
  // A low, wide bank, reaching toward the neighbouring groups.
  vec2 bankSize = vec2(mix(0.12, 0.2, s.y), mix(0.04, 0.07, s.z));
  lit = layerMass(lit, p, Mass(vec2((cell + 0.5 + 0.3 * (s.x - 0.5)) * CLOUD_CELL, CLOUD_BASE), bankSize, id * 7.0 + 0.5, false), pixel);

  Mass tower = Mass(vec2(x, CLOUD_BASE), vec2(width, height), id * 7.0, true);
  lit = layerMass(lit, p, tower, pixel);

  for (int i = 1; i <= CLOUD_FRONT_MASSES; i++) {
    vec4 g = hash4(vec2(id * 7.0 + float(i), 31.0));
    if (g.w > 0.9) continue;
    // Each is lower than the last and further out to one side.
    float side = g.x < 0.5 ? -1.0 : 1.0;
    float rise = height * mix(0.3, 0.75, g.y) * (1.0 - 0.15 * float(i));
    vec2 size = vec2(rise * mix(0.8, 1.4, g.z), rise);
    // Some sit partway up the tower's side rather than on the horizon.
    float lift = rise * 0.5 * max(fract(g.y * 13.0) - 0.4, 0.0);
    vec2 center = vec2(x + side * width * mix(0.2, 0.9, fract(g.x * 7.0)), CLOUD_BASE + lift);
    lit = layerMass(lit, p, Mass(center, size, id * 7.0 + float(i), false), pixel);
  }
  return lit;
}

// How much light the clouds add at p, before tinting. pixel is the size of
// a pixel in radians, which sets the width of crisp edges.
float cloudBrightness(vec2 p, float pixel) {
  if (p.y > STRIP_TOP) return 0.0;
  float lit = 0.0;
  float base = floor(p.x / CLOUD_CELL);
  // Groups reach past their neighbouring cells.
  for (int j = -2; j <= 2; j++) {
    lit = layerCell(lit, p, base + float(j), pixel);
  }
  return lit;
}

// The clouds baked once into a strip covering one period of the layout,
// which wraps horizontally. Without it they're computed for every pixel.
uniform sampler2D uCloudStrip;
uniform bool uUseCloudStrip;

vec3 skyWithClouds(vec3 rd) {
  vec3 skyColor = sky(rd);
  vec2 p = vec2(atan(rd.x, rd.z) - uTime * CLOUD_DRIFT * uWind, rd.y);
  if (p.y > STRIP_TOP) return skyColor;
  float lit;
  if (uUseCloudStrip) {
    vec2 uv = vec2(p.x / CLOUD_PERIOD, (p.y - STRIP_BOTTOM) / (STRIP_TOP - STRIP_BOTTOM));
    lit = texture(uCloudStrip, uv).r * STRIP_SCALE;
  } else {
    lit = cloudBrightness(p, uRenderScale / (uResolution.y * FOCAL_LENGTH));
  }
  return skyColor + CLOUD_TINT * lit;
}
`;
