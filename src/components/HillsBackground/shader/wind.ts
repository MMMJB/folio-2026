// Wind: a steady breeze plus gusts, a smooth noise field drifting downwind.
// Where a gust is strong, blades lean further along the wind, so waves of
// motion roll across the grass. Gusts are sized to the scene: speed in metres
// per second, size in metres across a typical gust.
export const windField = (gustSpeed: number, gustSize: number) => /* glsl */ `
// Resting tip offset as a fraction of fiber length, applied as a shear of the
// lookup space.
const vec2 WIND = vec2(0.5, -0.15);

const vec2 GUST_DIRECTION = normalize(WIND);
const float GUST_SPEED = ${gustSpeed.toFixed(2)};
const float GUST_SIZE = ${gustSize.toFixed(2)};
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

// The hills' wind, shared by the grass and the flowers.
export const wind = windField(25, 50);
