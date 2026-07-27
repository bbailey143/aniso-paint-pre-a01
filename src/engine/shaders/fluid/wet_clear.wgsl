// Drying handoff, step 3 of 3 — the wet band lets go.
//
// The pigment now lives in dry1, so the wet slots must be emptied or it would be
// counted twice (and the conservation gauge would report a phantom gain). This
// is a MOVE, not a copy; steps 1-3 together conserve pigment exactly.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet5_in: texture_2d<f32>;
@group(0) @binding(2) var wet1_in: texture_2d<f32>;
@group(0) @binding(3) var wet2_in: texture_2d<f32>;
@group(0) @binding(4) var wet3_in: texture_2d<f32>;
@group(0) @binding(5) var wet4_in: texture_2d<f32>;
@group(0) @binding(6) var wet1_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var wet2_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(8) var wet3_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(9) var wet4_out: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  var g0 = textureLoad(wet1_in, c, 0);
  var g1 = textureLoad(wet2_in, c, 0);
  var d0 = textureLoad(wet3_in, c, 0);
  var d1 = textureLoad(wet4_in, c, 0);

  if (textureLoad(wet5_in, c, 0).w > 0.5) {
    g0 = vec4<f32>(0.0); g1 = vec4<f32>(0.0);
    d0 = vec4<f32>(0.0); d1 = vec4<f32>(0.0);
  }

  textureStore(wet1_out, c, g0);
  textureStore(wet2_out, c, g1);
  textureStore(wet3_out, c, d0);
  textureStore(wet4_out, c, d1);
}
