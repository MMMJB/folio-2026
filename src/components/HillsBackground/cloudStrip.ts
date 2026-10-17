import { createProgram, type Program } from "./gl";
import { cloudStripShader } from "./shader";
import { CLOUD_PERIOD, STRIP_BOTTOM, STRIP_TOP } from "./shader/clouds";
import { FOCAL_LENGTH } from "./shader/common";

// Units 0-3 hold the scene frames, 4 the heightmap, 6 the entry bake and 7
// the trample trail.
const CLOUD_UNIT = 5;
// Strip texels per scene pixel. At two, the baked clouds match ones computed
// per pixel to within a few levels even at their crispest edges.
const OVERSAMPLE = 2;
// Rebake only when the needed resolution changes by more than this.
const REBAKE_CHANGE = 0.15;
// Columns baked per frame, so a large strip never stalls a single frame.
const COLUMNS_PER_FRAME = 1024;

export type CloudStrip = {
  // Bakes the next part of the strip, (re)starting if the scene's resolution
  // has changed enough. Returns true on the frame the strip becomes ready.
  bake: (sceneHeight: number, canvasHeight: number) => boolean;
  // False while a bake is in progress; the scene computes clouds itself.
  ready: () => boolean;
  setUniforms: (scene: Program) => void;
  dispose: () => void;
};

// The clouds only drift, so they're baked once into a strip covering one
// period of their repeating layout, which the sky then samples. It's 8-bit,
// so any WebGL2 device can render it: 5 to 10 MB at the sizes used.
export function createCloudStrip(
  gl: WebGL2RenderingContext,
  seed: number,
): CloudStrip | null {
  const program = createProgram(gl, cloudStripShader);
  if (!program) return null;

  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  const maxWidth = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 8192);
  let width = 0;
  let height = 0;
  let canvasPixel = 0;
  let baked = 0;

  const allocate = (nextWidth: number, canvasHeight: number) => {
    width = nextWidth;
    height = Math.round(((STRIP_TOP - STRIP_BOTTOM) / CLOUD_PERIOD) * width);
    canvasPixel = 1 / (canvasHeight * FOCAL_LENGTH);
    baked = 0;
    gl.activeTexture(gl.TEXTURE0 + CLOUD_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      width,
      height,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
  };

  return {
    bake: (sceneHeight, canvasHeight) => {
      const needed = Math.min(
        maxWidth,
        Math.round(CLOUD_PERIOD * sceneHeight * FOCAL_LENGTH * OVERSAMPLE),
      );
      if (Math.abs(needed - width) > width * REBAKE_CHANGE) {
        allocate(needed, canvasHeight);
      }
      if (baked >= width) return false;

      // A texture can't be drawn into while bound for sampling.
      gl.activeTexture(gl.TEXTURE0 + CLOUD_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, width, height);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(baked, 0, COLUMNS_PER_FRAME, height);
      gl.useProgram(program.program);
      gl.uniform2f(program.uniform("uStripSize"), width, height);
      gl.uniform1f(program.uniform("uCanvasPixel"), canvasPixel);
      // The layout's randomness comes from the same seed as the scene's.
      gl.uniform1f(program.uniform("uSeed"), seed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);
      baked += COLUMNS_PER_FRAME;
      return baked >= width;
    },
    ready: () => width > 0 && baked >= width,
    setUniforms: (scene) => {
      gl.activeTexture(gl.TEXTURE0 + CLOUD_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(scene.uniform("uCloudStrip"), CLOUD_UNIT);
      gl.uniform1i(
        scene.uniform("uUseCloudStrip"),
        width > 0 && baked >= width ? 1 : 0,
      );
    },
    dispose: () => {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteProgram(program.program);
    },
  };
}
