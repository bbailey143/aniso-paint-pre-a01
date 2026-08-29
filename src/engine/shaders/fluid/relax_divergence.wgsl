// MoveWater 2 — C97 RelaxDivergence, staggered, gather form.
//
// C97 solves NO pressure-Poisson equation (that form is an unconditional
// amplifier, eigenvalues 1 +/- i*xi*sqrt(lambda)). It pushes each cell's four
// faces to cancel its own divergence. The GPU gather form is identical: a face
// shared by two cells is pushed by both — u_face += delta(this) - delta(east).
// Operator (1 - xi*L), eigenvalues [0,8], stable for xi < 0.25; high-frequency
// divergence (what a stroke injects) dies fastest. The bench proved the two
// alternatives unstable; start here.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var wet0_out: texture_storage_2d<rgba32float, write>;

const XI: f32 = 0.1;   // C97 redistribution factor; must stay under 0.25

fn u_at(c: vec2<i32>, n: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  return textureLoad(wet0_in, c, 0).z;
}

fn v_at(c: vec2<i32>, n: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  return textureLoad(wet0_in, c, 0).w;
}

fn dv(c: vec2<i32>, n: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  let t = textureLoad(wet0_in, c, 0);
  if (t.x < 0.5 || t.y <= WET_EPS) { return 0.0; }
  let l = vec2<i32>(c.x - 1, c.y);
  let e = vec2<i32>(c.x + 1, c.y);
  let u_ = vec2<i32>(c.x, c.y - 1);
  let s = vec2<i32>(c.x, c.y + 1);
  // Boundary flow into dry paper is a physical source/sink for the current wet
  // region, not compression inside it. Including it in the projection made the
  // solver "correct" a real outward velocity by drawing compensating flow
  // through the wash, then amplified the scalloped binary edge every iteration.
  let ue = select(0.0, t.z, wet_at(e, n));
  let uw = select(0.0, u_at(l, n), wet_at(l, n));
  let vs = select(0.0, t.w, wet_at(s, n));
  let vn = select(0.0, v_at(u_, n), wet_at(u_, n));
  return (ue - uw) + (vs - vn);
}

// SAME TEST AS update_velocities.wgsl. u and v are SURFACE-FILM velocities, and
// flux_compute moves film. A cell can carry the wet mask with no film at all:
// flux_apply_water sets the mask and never clears it, capillary_flow sets it on
// absorbed water alone, and only dry_tick clears it once film, absorbed water
// and the blurred mask are all gone. That damp halo rings every stroke. Testing
// the mask alone here made the halo interior to the relaxation while
// UpdateVelocities called it dry and wrote zero to its faces - the same
// one-sided gather this pass was changed to remove, surviving in the seam
// between the two files.
fn wet_at(c: vec2<i32>, n: i32) -> bool {
  if (oob(c, n)) { return false; }
  let w0 = textureLoad(wet0_in, c, 0);
  return w0.x >= 0.5 && w0.y > WET_EPS;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  let w0 = textureLoad(wet0_in, c, 0);
  let e = vec2<i32>(c.x + 1, c.y);
  let s = vec2<i32>(c.x, c.y + 1);
  // Relax the same staggered faces that UpdateVelocities owns. A dry owner may
  // still hold the west or north boundary face of a wet neighbour; skipping
  // that invocation makes the gather one-sided even after velocity activation
  // is repaired.
  let activeU = wet_at(c, n) || wet_at(e, n);
  let activeV = wet_at(c, n) || wet_at(s, n);
  if (!activeU && !activeV) {
    textureStore(wet0_out, c, vec4<f32>(w0.x, sane(w0.y, WATER_LIM), 0.0, 0.0));
    return;
  }

  let delta_c = -XI * dv(c, n);
  let delta_e = -XI * dv(e, n);
  let delta_s = -XI * dv(s, n);

  // The gather owns only faces with wet cells on both sides. Open boundary
  // faces retain UpdateVelocities' symmetric value; dry/dry faces stay zero.
  let nu = select(0.0, select(w0.z, w0.z + (delta_c - delta_e), wet_at(c, n) && wet_at(e, n)), activeU);
  let nv = select(0.0, select(w0.w, w0.w + (delta_c - delta_s), wet_at(c, n) && wet_at(s, n)), activeV);
  // Containment (see `sane` in common.wgsl). The film rides through this pass
  // untouched; a copied field still has to come out sane.
  textureStore(wet0_out, c, vec4<f32>(w0.x, sane(w0.y, WATER_LIM), clamp(nu, -1.0, 1.0), clamp(nv, -1.0, 1.0)));
}
