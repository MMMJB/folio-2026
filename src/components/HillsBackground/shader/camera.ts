// Vertical lens shift that puts the horizon ~75% of the way down the frame.
// Shared with book.ts, which projects the book onto the screen.
export const HORIZON_SHIFT = 0.27;

// The camera ray for a point on screen, shared by the scene and the pointer
// pick so both see the same ground.
export const camera = /* glsl */ `
const float HORIZON_SHIFT = ${HORIZON_SHIFT.toFixed(2)};

vec3 cameraOrigin() {
  return vec3(CAMERA_POSITION.x, terrain(CAMERA_POSITION) + EYE_HEIGHT, CAMERA_POSITION.y);
}

// uv is relative to the centre of the frame, in units of its height.
vec3 cameraRay(vec2 uv) {
  return normalize(vec3(uv.x, uv.y + HORIZON_SHIFT, FOCAL_LENGTH));
}
`;
