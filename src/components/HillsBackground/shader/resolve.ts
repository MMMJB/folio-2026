// Averages the most recent jittered scene frames into one antialiased image
// (colour plus the blur amount in alpha) for the dof pass.
export const resolveShader = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uFrames[4];
uniform int uCount;

out vec4 fragColor;

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec4 sum = texelFetch(uFrames[0], pixel, 0);
  if (uCount > 1) sum += texelFetch(uFrames[1], pixel, 0);
  if (uCount > 2) sum += texelFetch(uFrames[2], pixel, 0);
  if (uCount > 3) sum += texelFetch(uFrames[3], pixel, 0);
  fragColor = sum / float(uCount);
}
`;
