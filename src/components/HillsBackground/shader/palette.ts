// Grass colours shared by the hills and the top-down patch.
export const palette = /* glsl */ `
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

vec3 grassRamp(float tone) {
  float x = clamp((tone - 0.15) / 0.155, 0.0, 4.0);
  vec3 color = mix(GRASS_RAMP_0, GRASS_RAMP_1, clamp(x, 0.0, 1.0));
  color = mix(color, GRASS_RAMP_2, clamp(x - 1.0, 0.0, 1.0));
  color = mix(color, GRASS_RAMP_3, clamp(x - 2.0, 0.0, 1.0));
  color = mix(color, GRASS_RAMP_4, clamp(x - 3.0, 0.0, 1.0));
  // Below the darkest stop, darken along the same hue.
  return color * min(tone / 0.15, 1.0);
}

// The final colour grade: a little more saturation, and yellows pushed warmer.
vec3 grade(vec3 c) {
  float y = max(0.0, min(c.r, c.g) - c.b);
  return clamp(
    mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.2)
    + y * vec3(0.12, 0.08, -0.04),
    0.0, 1.0
  );
}
`;
