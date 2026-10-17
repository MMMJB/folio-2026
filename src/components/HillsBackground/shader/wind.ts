// Wind shared by the grass and the flowers.
export const wind = /* glsl */ `
// Resting tip offset as a fraction of fiber length, applied as a shear of the
// lookup space.
const vec2 WIND = vec2(0.5, -0.15);

// Gusts: a smooth noise field drifting downwind. Where it's strong, blades lean
// further along the wind, so waves of motion roll across the hills.
const vec2 GUST_DIRECTION = normalize(WIND);
const float GUST_SPEED = 25.0; // metres per second
const float GUST_SIZE = 50.0; // metres across a typical gust
const float GUST_STRENGTH = 0.7; // extra lean at full strength
const float FLUTTER = 0.07;

float gustAt(vec2 xz) {
  vec2 p = (xz - GUST_DIRECTION * uTime * GUST_SPEED) / GUST_SIZE;
  return smoothstep(0.3, 0.9, noise(p) * 0.7 + noise(p * 2.7 + 13.0) * 0.3);
}

vec2 windAt(vec2 xz, float gust) {
  float flutter = sin(uTime * 2.1 + dot(xz, vec2(0.9, 0.4))) * FLUTTER;
  return WIND + GUST_DIRECTION * (gust * GUST_STRENGTH + flutter) * uWind;
}
`;
