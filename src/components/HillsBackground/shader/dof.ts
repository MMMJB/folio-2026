// Depth of field, applied to the finished scene. Each pixel gathers samples on
// a spiral out to the maximum blur radius; a sample contributes when its own
// blur disc would reach this pixel. Samples blurrier than this pixel are
// limited so distant hills don't smear over sharper ones in front of them.
// It's the last pass, so it also cuts the nestled section out of the canvas.
export const dofShader = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform vec2 uResolution;
// Multiplies sample spacing; above 1 trades blur smoothness for speed.
uniform float uBlurSpacing;

out vec4 fragColor;

// Largest blur radius, as a fraction of the frame height.
uniform float uMaxBlur;

// The page section nestled in the scene, which the canvas sits over: its rect
// in canvas pixels (x0, y0, x1, y1, y up) and how far up from its bottom the
// hills may hide it. Within that, the canvas is see-through wherever the
// scene is further away than the section, read from the blur amount in alpha
// (uNestleBlur is the blur at the section's depth). It also darkens the
// section a little above the nestle contour (see contour.ts), where it meets
// the hill.
uniform bool uNestle;
uniform vec4 uSection;
uniform float uBury;
uniform float uNestleBlur;
uniform bool uUseContour;
uniform sampler2D uContour;

// Strength and reach (in frame heights) of the ambient occlusion, and the
// shade it darkens toward: the grass's own deep green.
const float OCCLUSION_STRENGTH = 0.2;
const float OCCLUSION_REACH = 0.03;
const vec3 OCCLUSION_COLOR = vec3(0.06, 0.16, 0.10);

const float GOLDEN_ANGLE = 2.39996323;

// Sample spacing, in pixels at a 900 px tall frame. It scales with the frame
// so the number of samples per pixel stays constant at higher pixel densities;
// the blurred regions are smooth, so wider spacing doesn't lose detail.
const float RADIUS_STEP = 0.5;
const float REFERENCE_HEIGHT = 900.0;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// 1 where the scene is nearer than the nestled section, from its blur amount.
float inFront(float blur) {
  return 1.0 - smoothstep(uNestleBlur - 0.004, uNestleBlur + 0.004, blur);
}

// How much of this pixel the scene in front of the section covers, from the
// blur amounts on a ring a scene pixel across.
float crestCoverage(vec2 uv, float centerBlur) {
  vec2 texel = 1.0 / vec2(textureSize(uScene, 0));
  float coverage = inFront(centerBlur);
  for (int i = 0; i < 8; i++) {
    float angle = float(i) * 0.785398 + 0.392699;
    coverage += inFront(texture(uScene, uv + vec2(cos(angle), sin(angle)) * 0.5 * texel).a);
  }
  return coverage / 9.0;
}

bool hiddenBySection(vec2 p) {
  vec2 inside = min(p - uSection.xy, uSection.zw - p);
  return uNestle && min(inside.x, inside.y) >= 0.5 && p.y - uSection.y >= uBury;
}

void main() {
  // Above its buried strip, the section shows through entirely: see below.
  if (hiddenBySection(gl_FragCoord.xy)) {
    fragColor = vec4(0.0);
    return;
  }
  vec2 uv = gl_FragCoord.xy / uResolution;
  float maxRadius = uMaxBlur * uResolution.y;
  float scale = max(1.0, uResolution.y / REFERENCE_HEIGHT);
  scale *= uBlurSpacing;
  float radiusStep = RADIUS_STEP * scale;

  vec4 center = texture(uScene, uv);
  float centerRadius = center.a * maxRadius;

  vec3 color = center.rgb;
  // Alongside, the colour of the scene in front of the nestled section,
  // gathered the same way (premultiplied, with its weight in a).
  vec4 front = vec4(center.rgb, 1.0) * inFront(center.a);
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
    front += mix(front / total, vec4(s.rgb, 1.0) * inFront(s.a), weight);
    total += 1.0;
    radius += radiusStep * scale / radius;
    angle += GOLDEN_ANGLE;
  }
  color /= total;
  front /= total;

  float dither = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  color += dither;
  fragColor = vec4(color, 1.0);
  if (!uNestle) return;

  vec2 p = gl_FragCoord.xy;
  vec2 inside = clamp(min(p - uSection.xy, uSection.zw - p) + 0.5, 0.0, 1.0);
  float section = inside.x * inside.y;
  if (section == 0.0) return;

  float buried = uBury > 0.0 ? 1.0 - smoothstep(0.8 * uBury, uBury, p.y - uSection.y) : 0.0;
  // The section is page content and stays sharp, so where the hill meets it
  // the two read as in focus together: the hill keeps its blurred colour, but
  // its outline is only antialiased, over about a scene pixel.
  vec3 hill = front.a > 1e-4 ? front.rgb / front.a : color;
  front = vec4(hill + dither, 1.0) * crestCoverage(uv, center.a) * buried;
  float occlusion = 0.0;
  if (uUseContour) {
    float contour = texelFetch(uContour, ivec2(p.x, 0), 0).r;
    occlusion = OCCLUSION_STRENGTH * buried *
      exp(-max(p.y - contour, 0.0) / (OCCLUSION_REACH * uResolution.y));
  }

  // Premultiplied: the hill in front, over the occlusion's shade on the
  // section, blended into the full scene at the section's edges.
  vec4 nestled = front + (1.0 - front.a) * occlusion * vec4(OCCLUSION_COLOR, 1.0);
  fragColor = mix(fragColor, nestled, section);
}
`;
