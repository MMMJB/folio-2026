// Finds the ground under the cursor: a one-pixel pass that marches the
// cursor's camera ray to the terrain and writes the hit point.
export const pick = /* glsl */ `
uniform vec2 uPointer;
out vec4 fragColor;

void main() {
  vec3 ro = cameraOrigin();
  vec3 rd = cameraRay(uPointer);
  float t = 0.5;
  for (int i = 0; i < 400; i++) {
    vec3 p = ro + rd * t;
    float gap = p.y - terrain(p.xz);
    if (gap < 0.002 * t) {
      // xy: ground position, w: 1 for a hit.
      fragColor = vec4(p.xz, t, 1.0);
      return;
    }
    t += max(0.5 * gap, 0.002 * t);
    if (t > FAR) break;
  }
  fragColor = vec4(0.0);
}
`;
