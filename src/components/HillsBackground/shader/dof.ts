// Depth of field, applied to the finished scene. Each pixel gathers samples on
// a spiral out to the maximum blur radius; a sample contributes when its own
// blur disc would reach this pixel. Samples blurrier than this pixel are
// limited so distant hills don't smear over sharper ones in front of them.
export const dofShader = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform vec2 uResolution;
// Multiplies sample spacing; above 1 trades blur smoothness for speed.
uniform float uBlurSpacing;

out vec4 fragColor;

// Largest blur radius, as a fraction of the frame height.
uniform float uMaxBlur;

const float GOLDEN_ANGLE = 2.39996323;

// Sample spacing, in pixels at a 900 px tall frame. It scales with the frame
// so the number of samples per pixel stays constant at higher pixel densities;
// the blurred regions are smooth, so wider spacing doesn't lose detail.
const float RADIUS_STEP = 0.5;
const float REFERENCE_HEIGHT = 900.0;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float maxRadius = uMaxBlur * uResolution.y;
  float scale = max(1.0, uResolution.y / REFERENCE_HEIGHT);
  scale *= uBlurSpacing;
  float radiusStep = RADIUS_STEP * scale;

  vec4 center = texture(uScene, uv);
  float centerRadius = center.a * maxRadius;

  vec3 color = center.rgb;
  float total = 1.0;
  float radius = radiusStep;
  float angle = 0.0;
  for (int i = 0; i < 1024; i++) {
    if (radius >= maxRadius) break;
    vec4 s = texture(uScene, uv + vec2(cos(angle), sin(angle)) * radius / uResolution);
    float sampleRadius = s.a * maxRadius;
    if (s.a > center.a) sampleRadius = min(sampleRadius, centerRadius * 2.0);
    float weight = smoothstep(radius - 0.5 * scale, radius + 0.5 * scale, sampleRadius);
    color += mix(color / total, s.rgb, weight);
    total += 1.0;
    radius += radiusStep * scale / radius;
    angle += GOLDEN_ANGLE;
  }
  color /= total;

  color += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(color, 1.0);
}
`;
