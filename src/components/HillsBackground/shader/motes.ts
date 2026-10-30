import { camera } from "./camera";
import { common } from "./common";
import { BLUR_CURVE, FOCUS_DISTANCE } from "./focus";
import { terrain } from "./terrain";
import { wind } from "./wind";

// Ambient motes: pollen and seed fluff drifting on the wind above the grass,
// drawn as points over the finished frame. Each point's position comes from
// its index, so there are no buffers: motes fill a box in front of the
// camera, drift downwind and wrap around it. A mote's disc grows to the depth
// of field blur at its distance while its light stays the same, so distant
// motes fade into faint soft spots.
const vertex = /* glsl */ `
uniform float uMaxBlur;
uniform float uMaxPointSize;
uniform float uSize;
uniform float uOpacity;
uniform float uNear;
uniform float uFar;
uniform float uHeight;
uniform float uDrift;
uniform float uGust;
uniform float uWander;
uniform float uTwinkle;
uniform float uGlint;

out float vRadius;
out float vEdge;
out float vAlpha;

const float FOCUS_DISTANCE = ${FOCUS_DISTANCE.toFixed(1)};
const float BLUR_CURVE = ${BLUR_CURVE.toFixed(1)};
// Lowest a mote floats above the ground, clear of the short grass.
const float MOTE_FLOOR = 0.4;
// Steps along the line of sight checking that no hill hides the mote.
const int SIGHT_STEPS = 20;

void hide() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
}

void main() {
  vec4 r = hash4(vec2(float(gl_VertexID), 17.0));
  vec4 s = hash4(vec2(float(gl_VertexID), 31.0));

  // The box spans the view at uFar, a little wider so motes enter from
  // beyond the edges.
  float halfWidth = 0.6 * uFar * uResolution.x / uResolution.y / FOCAL_LENGTH;
  vec2 box = vec2(2.0 * halfWidth, uFar - uNear);
  vec2 rel = mod(r.xy * box + GUST_DIRECTION * uDrift * uTime, box);
  rel += vec2(-halfWidth, uNear);

  // Each mote loops lazily on its own, and gusts push it further downwind.
  float phase = 6.2832 * r.z;
  float rate = mix(0.15, 0.45, r.w);
  vec2 xz = CAMERA_POSITION + rel;
  xz += uWander * vec2(sin(uTime * rate + phase), cos(uTime * rate * 0.7 + 2.0 * phase));
  xz += GUST_DIRECTION * gustAt(xz) * uGust * uWind;

  // Most motes hang low, a few higher up.
  float lift = mix(MOTE_FLOOR, max(uHeight, MOTE_FLOOR), s.x * s.x);
  lift += 0.5 * uWander * sin(uTime * rate * 1.3 + 3.0 * phase);
  vec3 p = vec3(xz.x, terrain(xz) + max(lift, MOTE_FLOOR), xz.y);

  vec3 ro = cameraOrigin();
  vec3 d = p - ro;
  if (d.z < uNear * 0.5) { hide(); return; }
  for (int i = 1; i < SIGHT_STEPS; i++) {
    // Denser toward the mote, where a crest in front would hide it.
    float f = sqrt(float(i) / float(SIGHT_STEPS));
    vec3 q = ro + d * f;
    if (q.y < terrain(q.xz) + MOTE_FLOOR * 0.5) { hide(); return; }
  }

  vec2 uv = vec2(d.x, d.y) * FOCAL_LENGTH / d.z - vec2(0.0, HORIZON_SHIFT);
  gl_Position = vec4(uv.x * 2.0 * uResolution.y / uResolution.x, uv.y * 2.0, 0.0, 1.0);

  // Radii in canvas pixels. A mote smaller than a pixel spreads its light
  // over one; a blurred one over its blur disc.
  float core = 0.5 * uSize * FOCAL_LENGTH * uResolution.y / d.z;
  float blur = pow(clamp(1.0 - FOCUS_DISTANCE / d.z, 0.0, 1.0), BLUR_CURVE) * uMaxBlur * uResolution.y;
  float radius = min(max(max(core, blur), 0.75), 0.5 * uMaxPointSize - 1.0);
  vRadius = radius;
  vEdge = max(0.75, 0.4 * blur);

  // Tumbling fluff catches the light now and then, and glints when the sun
  // is behind it.
  float flash = 0.3 + 1.4 * pow(0.5 + 0.5 * sin(uTime * mix(1.0, 3.5, s.y) + 6.2832 * s.z), 3.0);
  float glint = pow(max(dot(normalize(d), SUN), 0.0), 4.0);
  float fade = smoothstep(uNear, 2.0 * uNear + 2.0, d.z) * (1.0 - smoothstep(0.8 * uFar, uFar, d.z));
  vAlpha = uOpacity * min(1.0, core * core / (radius * radius)) * fade *
    mix(1.0, flash, uTwinkle) * (1.0 + uGlint * glint);

  if (vAlpha < 0.002) { hide(); return; }
  gl_PointSize = 2.0 * radius + 2.0;
}
`;

export const motesVertexShader = `#version 300 es
precision highp sampler2D;
${common}
${terrain}
${camera}
${wind}
${vertex}`;

// Premultiplied, to blend over the canvas, which may be see-through where
// the nestled section shows. Motes stay off the section above the line where
// the hill may hide it, so they never sit over its content; uSection and
// uBury are as in the dof pass.
export const motesFragmentShader = /* glsl */ `#version 300 es
precision highp float;

uniform vec3 uColor;
uniform bool uNestle;
uniform vec4 uSection;
uniform float uBury;

in float vRadius;
in float vEdge;
in float vAlpha;
out vec4 fragColor;

void main() {
  vec2 p = gl_FragCoord.xy;
  if (uNestle && all(greaterThan(p, uSection.xy + vec2(0.0, uBury))) && all(lessThan(p, uSection.zw))) discard;
  float d = length(gl_PointCoord - 0.5) * (2.0 * vRadius + 2.0);
  float a = vAlpha * clamp((vRadius - d) / vEdge + 0.5, 0.0, 1.0);
  fragColor = vec4(uColor * min(a, 1.0), min(a, 1.0));
}
`;
