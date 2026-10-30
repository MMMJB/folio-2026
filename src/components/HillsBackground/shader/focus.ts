// The lens is focused at this distance; everything nearer is sharp and blur
// grows gradually beyond it. The blur itself is applied in the dof pass.
export const FOCUS_DISTANCE = 60;
// Above 1, blur ramps in more slowly so it concentrates toward the back.
export const BLUR_CURVE = 1.5;

// The blur amount the scene stores for a hit at this distance (see main).
export const blurAt = (distance: number) =>
  Math.max(0, 1 - FOCUS_DISTANCE / distance) ** BLUR_CURVE;
