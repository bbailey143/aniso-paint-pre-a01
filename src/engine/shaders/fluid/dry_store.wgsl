// Drying handoff, step 2 of 3 — the newly dried application becomes dry1.
//
// Everything the cell was carrying, both suspended (g) and settled (d), lands in
// the newest dry layer. Watercolour has no body, so there is no height to carry
// down — the brush marks collapse flat, which is exactly the acceptance target.
//
// dry1 stays re-wettable: this is the layer that comes back when water touches it.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet5_in: texture_2d<f32>;
@group(0) @binding(2) var wet1_in: texture_2d<f32>;   // g[0..3]
@group(0) @binding(3) var wet2_in: texture_2d<f32>;   // g[4..7]
@group(0) @binding(4) var wet3_in: texture_2d<f32>;   // d[0..3]
@group(0) @binding(5) var wet4_in: texture_2d<f32>;   // d[4..7]
@group(0) @binding(6) var dry1a_in: texture_2d<f32>;
@group(0) @binding(7) var dry1b_in: texture_2d<f32>;
@group(0) @binding(8) var dry1a_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(9) var dry1b_out: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  var a1 = textureLoad(dry1a_in, c, 0);
  var b1 = textureLoad(dry1b_in, c, 0);

  if (textureLoad(wet5_in, c, 0).w > 0.5) {
    // dry1's previous contents already went down to dry2 in step 1, so this
    // replaces rather than accumulates.
    a1 = textureLoad(wet1_in, c, 0) + textureLoad(wet3_in, c, 0);
    b1 = textureLoad(wet2_in, c, 0) + textureLoad(wet4_in, c, 0);
  }

  // Containment (see `sane` in common.wgsl). Every pass that writes an
  // accumulating field guards it, because the meter and the eye both see the
  // LAST writer of a frame — guarding only the entry point let the seed
  // through anywhere downstream of it.
  textureStore(dry1a_out, c, sane4(a1, PIG_LIM));
  textureStore(dry1b_out, c, sane4(b1, PIG_LIM));
}
