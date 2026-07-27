// P3 flat-fill: write a uniform pigment loading across the whole document.
//
// This is a test affordance, NOT a brush. Wet media get their real deposit from
// the brush + fluid engines (P5/P6); nothing here stamps a stroke. It exists so
// the composite pass has something to render over the paper.
//
// PIG_A holds pigment amounts for slots 0..3, PIG_B for slots 4..7.

struct Fill {
  a0: vec4f,   // amounts, slots 0..3
  a1: vec4f,   // amounts, slots 4..7
};
@group(0) @binding(0) var<uniform> F: Fill;
@group(0) @binding(1) var pigA: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var pigB: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(pigA);
  if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  textureStore(pigA, vec2i(gid.xy), F.a0);
  textureStore(pigB, vec2i(gid.xy), F.a1);
}
