// ReWet — dried pigment comes back into suspension when water reaches it.
//
// `[REQUIREMENT]` This is the one the evidence base flags as structural and
// unaddressed: B04's architecture makes drying a one-way door, and watercolour
// is not a one-way door. Dried pigment must be able to return to the wet layer,
// which is what makes a wash reactivatable, and what makes lifting possible.
//
// Rate scales with how much water has arrived — a damp touch loosens a little, a
// flood loosens a lot. It is a fraction per unit time (invariant 2), never a
// per-frame delta.
//
// Conservative: whatever leaves dry1 arrives in g, computed once and applied to
// both sides.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;   // M, h_f
@group(0) @binding(2) var wet1_in: texture_2d<f32>;   // g[0..3]
@group(0) @binding(3) var wet2_in: texture_2d<f32>;   // g[4..7]
@group(0) @binding(4) var dry1a_in: texture_2d<f32>;
@group(0) @binding(5) var dry1b_in: texture_2d<f32>;
@group(0) @binding(6) var wet1_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var wet2_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(8) var dry1a_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(9) var dry1b_out: texture_storage_2d<rgba32float, write>;

/** Reference film depth at which re-wetting runs at full rate. */
const REF_DEPTH: f32 = 0.08;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  var g0 = textureLoad(wet1_in, c, 0);
  var g1 = textureLoad(wet2_in, c, 0);
  var a0 = textureLoad(dry1a_in, c, 0);
  var a1 = textureLoad(dry1b_in, c, 0);

  let w0 = textureLoad(wet0_in, c, 0);
  if (w0.x >= 0.5 && P.rewetRate > 0.0) {
    // Standing water loosens far more than damp paper does.
    let wetness = clamp(w0.y / REF_DEPTH, 0.0, 1.0);
    let rate = clamp(P.rewetRate * wetness * P.dt, 0.0, 1.0);
    let m0 = a0 * rate;
    let m1 = a1 * rate;
    a0 = a0 - m0;  g0 = g0 + m0;
    a1 = a1 - m1;  g1 = g1 + m1;
  }

  // Containment (see `sane` in common.wgsl). Every pass that writes an
  // accumulating field guards it, because the meter and the eye both see the
  // LAST writer of a frame — guarding only the entry point let the seed
  // through anywhere downstream of it.
  textureStore(wet1_out, c, sane4(g0, PIG_LIM));
  textureStore(wet2_out, c, sane4(g1, PIG_LIM));
  textureStore(dry1a_out, c, sane4(a0, PIG_LIM));
  textureStore(dry1b_out, c, sane4(a1, PIG_LIM));
}
