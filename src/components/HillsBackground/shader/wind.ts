// How many points of the cursor's trail the shader blends; see pointer.ts.
export const CURSOR_POINTS = 32;

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

// Gusts the cursor leaves where it passes, newest first: xy is a point on
// the ground and zw the way the cursor was heading there. uCursorSpring[i].x
// is how far the grass there leans as it springs back, against the heading
// while it swings past upright, and .y the most it can still lean.
// uCursorRadius is in metres.
const int CURSOR_POINTS = ${CURSOR_POINTS};
uniform vec4 uCursorTrail[CURSOR_POINTS];
uniform vec2 uCursorSpring[CURSOR_POINTS];
uniform float uCursorRadius;
// Around every point in use, padded by the radius: min xz, then max xz.
uniform vec4 uCursorBounds;
uniform int uCursorCount; // how many points are in use
// Scales the wind's own gusts, leaving the cursor's: 0 shows the cursor's
// alone.
uniform float uAmbientGusts;

// The gust at xz, as the way it blows scaled by its strength (0 to 1): the
// wind's own gust, or the cursor's where that's stronger.
vec2 gustAt(vec2 xz) {
  vec2 p = (xz - GUST_DIRECTION * uTime * GUST_SPEED) / GUST_SIZE;
  float ambient = uAmbientGusts * smoothstep(0.3, 0.9, noise(p) * 0.7 + noise(p * 2.7 + 13.0) * 0.3);
  // The cursor's gust here is the nearest and freshest point's: the one that
  // can still lean the grass the most.
  float cursor = 0.0;
  float reach = 0.0;
  vec2 direction = GUST_DIRECTION;
  // Most of the ground is nowhere near the trail.
  bool nearTrail = all(greaterThanEqual(xz, uCursorBounds.xy)) && all(lessThanEqual(xz, uCursorBounds.zw));
  for (int i = 0; i < CURSOR_POINTS; i++) {
    if (!nearTrail || i >= uCursorCount) break;
    vec4 point = uCursorTrail[i];
    vec2 spring = uCursorSpring[i];
    float d = distance(xz, point.xy);
    float falloff = 1.0 - smoothstep(0.5 * uCursorRadius, uCursorRadius, d);
    if (falloff * spring.y > reach) {
      reach = falloff * spring.y;
      cursor = falloff * spring.x;
      direction = point.zw;
    }
  }
  // Blended across where the two are about even, so the lean doesn't flip.
  return mix(GUST_DIRECTION * ambient, direction * cursor, smoothstep(-0.1, 0.1, reach - ambient));
}

// gust is gustAt's.
vec2 windAt(vec2 xz, vec2 gust) {
  float flutter = sin(uTime * 2.1 + dot(xz, vec2(0.9, 0.4))) * FLUTTER;
  return WIND + (gust * GUST_STRENGTH + GUST_DIRECTION * flutter) * uWind;
}
`;

// The hills' wind, shared by the grass and the flowers.
export const wind = windField(25, 50);
