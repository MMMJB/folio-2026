import { createProgram, type Program } from "./gl";
import { contourShader } from "./shader";

export type ContourBake = {
  // Re-bakes if the canvas size has changed.
  update: (width: number, height: number) => void;
  bind: (program: Program, unit: number) => void;
  dispose: () => void;
};

// Bakes the nestle contour (see contour in shader/index.ts) into a one-row
// float texture, a texel per canvas column. Returns null without float render
// targets; the section then goes without ambient occlusion.
export function createContourBake(
  gl: WebGL2RenderingContext,
  depth: number,
  bindTerrain: (program: Program) => void,
): ContourBake | null {
  if (!gl.getExtension("EXT_color_buffer_float")) return null;
  const program = createProgram(gl, contourShader);
  if (!program) return null;

  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  let baked = "";

  const bake = (width: number, height: number) => {
    // Every pass binds unit 0 afresh, so allocating there disturbs nothing.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      width,
      1,
      0,
      gl.RED,
      gl.FLOAT,
      null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    // A target can't be drawn into while bound for reading.
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.useProgram(program.program);
    bindTerrain(program);
    gl.uniform2f(program.uniform("uResolution"), width, height);
    gl.uniform1f(program.uniform("uRenderScale"), 1);
    gl.uniform1f(program.uniform("uNestleDepth"), depth);
    gl.viewport(0, 0, width, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  return {
    update: (width, height) => {
      const key = `${width}x${height}`;
      if (key === baked) return;
      baked = key;
      bake(width, height);
    },
    bind: (target, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(target.uniform("uContour"), unit);
    },
    dispose: () => {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteProgram(program.program);
    },
  };
}
