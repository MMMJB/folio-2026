import { createProgram, type Program } from "./gl";
import { entryShader } from "./shader";

const ENTRY_UNIT = 6;

export type EntryInputs = {
  sceneWidth: number;
  sceneHeight: number;
  renderScale: number;
  fiberDistance: number;
  maxSteps: number;
};

export type EntryBake = {
  // Re-bakes if anything the march depends on has changed.
  update: (inputs: EntryInputs) => void;
  setUniforms: (scene: Program) => void;
  dispose: () => void;
};

// The camera and terrain never move, so each ray's march up to the grass is
// the same every frame. This bakes, per pixel, where its rays reach the grass
// and how many steps that took (see marchToGrass), so the scene can resume
// from there: one half-float pair per pixel, shared by all jitter offsets.
// Returns null without float render targets; the scene then marches from the
// camera every frame.
export function createEntryBake(
  gl: WebGL2RenderingContext,
  jitter: number[][],
  bindTerrain: (program: Program) => void,
): EntryBake | null {
  if (!gl.getExtension("EXT_color_buffer_float")) return null;
  const program = createProgram(gl, entryShader);
  if (!program) return null;

  gl.activeTexture(gl.TEXTURE0 + ENTRY_UNIT);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const framebuffer = gl.createFramebuffer();
  let baked = "";

  const bake = (inputs: EntryInputs) => {
    const { sceneWidth, sceneHeight } = inputs;
    // Allocate first: binding a texture lands on the active unit, which must
    // not disturb the heightmap that bindTerrain sets up for the draw.
    gl.activeTexture(gl.TEXTURE0 + ENTRY_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RG16F,
      sceneWidth,
      sceneHeight,
      0,
      gl.RG,
      gl.HALF_FLOAT,
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
    gl.uniform2f(program.uniform("uResolution"), sceneWidth, sceneHeight);
    gl.uniform1f(program.uniform("uRenderScale"), inputs.renderScale);
    gl.uniform1f(program.uniform("uFiberDistance"), inputs.fiberDistance);
    gl.uniform1i(program.uniform("uMaxSteps"), inputs.maxSteps);
    gl.uniform2fv(program.uniform("uJitters"), jitter.flat());
    gl.viewport(0, 0, sceneWidth, sceneHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  return {
    update: (inputs) => {
      const key = JSON.stringify(inputs);
      if (key === baked) return;
      baked = key;
      bake(inputs);
    },
    setUniforms: (scene) => {
      gl.activeTexture(gl.TEXTURE0 + ENTRY_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(scene.uniform("uEntry"), ENTRY_UNIT);
      gl.uniform1i(scene.uniform("uUseEntry"), 1);
    },
    dispose: () => {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteProgram(program.program);
    },
  };
}
