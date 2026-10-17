// World units are meters.
export const terrain = /* glsl */ `
const float FAR = 1500.0;

const float HILL_HEIGHT = 25.0;
const int HILL_OCTAVES = 5;
// How much each finer octave contributes relative to the one before.
const float HILL_DETAIL = 0.2;
const float HILL_CREASE = 0.02;
// Scales peaks and valleys toward the average height; 1.0 leaves them as is.
const float HILL_RELIEF = 0.75;

float hills(vec2 p) {
  p *= 0.011;
  vec2 warp = vec2(noise(p * 0.5 + 3.1), noise(p * 0.5 + 9.7));
  vec2 q = p + 0.8 * warp;

  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  float h = 0.0;
  float total = 0.0;
  float amplitude = 1.0;
  for (int i = 0; i < 5; i++) {
    if (i >= HILL_OCTAVES) break;
    h += amplitude * noise(q);
    total += amplitude;
    amplitude *= HILL_DETAIL;
    q = rot * q * 2.1;
  }

  // Shallow creases that wind across the slopes.
  float crease = 1.0 - abs(2.0 * noise(q * 0.12 + 4.0) - 1.0);
  h += crease * HILL_CREASE;

  float mean = total * 0.5;
  return (mean + (h - mean) * HILL_RELIEF) * HILL_HEIGHT;
}

// Upper bound on hills(): every octave of noise at its maximum of 1.
float maxHillHeight() {
  float total = 0.0;
  float amplitude = 1.0;
  for (int i = 0; i < 5; i++) {
    if (i >= HILL_OCTAVES) break;
    total += amplitude;
    amplitude *= HILL_DETAIL;
  }
  float mean = total * 0.5;
  return (mean + (total + HILL_CREASE - mean) * HILL_RELIEF) * HILL_HEIGHT;
}

// Softens the ground near the camera so the hills roll away from the viewer.
float terrainProcedural(vec2 p) {
  float meadow = smoothstep(10.0, 200.0, distance(p, CAMERA_POSITION));
  return hills(p) * mix(0.6, 1.0, meadow);
}

// The terrain never changes, so it is baked once into a float texture laid out
// in the camera's view: x is the horizontal angle (x / z) and y is log
// distance, which puts texels where the screen needs them. Points outside the
// view, such as shadow rays heading toward the sun, fall back to the noise.
uniform sampler2D uHeightmap;
uniform bool uUseHeightmap;
// True when the GPU can filter the float heightmap itself.
uniform bool uHeightmapLinear;

const float HEIGHTMAP_NEAR = 4.0;
const float HEIGHTMAP_FAR = 1600.0;
const float HEIGHTMAP_ANGLE = 1.2;

vec2 heightmapCoord(vec2 p) {
  vec2 rel = p - CAMERA_POSITION;
  return vec2(
    (rel.x / rel.y + HEIGHTMAP_ANGLE) / (2.0 * HEIGHTMAP_ANGLE),
    log(rel.y / HEIGHTMAP_NEAR) / log(HEIGHTMAP_FAR / HEIGHTMAP_NEAR)
  );
}

vec2 heightmapPoint(vec2 coord) {
  float z = HEIGHTMAP_NEAR * exp(coord.y * log(HEIGHTMAP_FAR / HEIGHTMAP_NEAR));
  float x = (coord.x * 2.0 * HEIGHTMAP_ANGLE - HEIGHTMAP_ANGLE) * z;
  return CAMERA_POSITION + vec2(x, z);
}

bool inHeightmap(vec2 p, out vec2 coord) {
  coord = heightmapCoord(p);
  return uUseHeightmap && p.y - CAMERA_POSITION.y > HEIGHTMAP_NEAR &&
    all(greaterThan(coord, vec2(0.0))) && all(lessThan(coord, vec2(1.0)));
}

// Bilinear filtering in hardware where supported, otherwise by hand, since
// linear filtering of float textures needs an extension.
float sampleHeightmap(vec2 coord) {
  if (uHeightmapLinear) return texture(uHeightmap, coord).r;
  vec2 size = vec2(textureSize(uHeightmap, 0));
  vec2 texel = coord * size - 0.5;
  ivec2 i = ivec2(floor(texel));
  vec2 f = fract(texel);
  ivec2 last = ivec2(size) - 1;
  float a = texelFetch(uHeightmap, clamp(i, ivec2(0), last), 0).r;
  float b = texelFetch(uHeightmap, clamp(i + ivec2(1, 0), ivec2(0), last), 0).r;
  float c = texelFetch(uHeightmap, clamp(i + ivec2(0, 1), ivec2(0), last), 0).r;
  float d = texelFetch(uHeightmap, clamp(i + ivec2(1, 1), ivec2(0), last), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float terrain(vec2 p) {
  vec2 coord;
  if (inHeightmap(p, coord)) return sampleHeightmap(coord);
  return terrainProcedural(p);
}

vec3 terrainNormal(vec3 p, float t) {
  vec2 e = vec2(0.01 * t + 0.3, 0.0);
  return normalize(vec3(
    terrain(p.xz - e.xy) - terrain(p.xz + e.xy),
    2.0 * e.x,
    terrain(p.xz - e.yx) - terrain(p.xz + e.yx)
  ));
}

float softShadow(vec3 ro) {
  float ceiling = maxHillHeight();
  float result = 1.0;
  float t = 0.5;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + SUN * t;
    // Once the ray clears the tallest possible hill by t / 18, every later
    // sample would exceed 1 and can't lower the result.
    if (18.0 * (p.y - ceiling) > t) break;
    float gap = p.y - terrain(p.xz);
    result = min(result, 18.0 * gap / t);
    if (result < 0.001 || p.y > 40.0) break;
    t += clamp(gap, 0.5, 6.0);
  }
  return clamp(result, 0.0, 1.0);
}
`;
