// MoveWater 1 — C97 UpdateVelocities, staggered, with A26 gravity (D11).
// Writes u,v into WET0. h_f is not touched here: water moves only via the
// clamped fluxes (flux_apply_water). Staggered grid: u is the face between c
// and c+x, v between c and c+y, so every gradient is a plain one-face
// difference — never a central difference (which grew a checkerboard mode).

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var wet5_in: texture_2d<f32>;
@group(0) @binding(3) var paper: texture_2d<f32>;
@group(0) @binding(4) var wet0_out: texture_storage_2d<rgba32float, write>;

fn hf_at(c: vec2<i32>, n: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  return textureLoad(wet0_in, c, 0).y;
}
fn paper_h(c: vec2<i32>, n: i32) -> f32 {
  let q = clamp(c, vec2<i32>(0, 0), vec2<i32>(n - 1, n - 1));
  return textureLoad(paper, q, 0).x;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  var w0 = textureLoad(wet0_in, c, 0);
  let m = w0.x;
  let h = w0.y;
  if (m < 0.5 || h <= WET_EPS) {
    textureStore(wet0_out, c, vec4<f32>(w0.x, sane(w0.y, WATER_LIM), 0.0, 0.0));
    return;
  }

  let l = vec2<i32>(c.x - 1, c.y);
  let r = vec2<i32>(c.x + 1, c.y);
  let u_ = vec2<i32>(c.x, c.y - 1);
  let d_ = vec2<i32>(c.x, c.y + 1);

  var du = -(hf_at(r, n) - h);
  var dv = -(hf_at(d_, n) - h);

  let ph = paper_h(c, n);
  du = du - P.paperInfluence * (paper_h(r, n) - ph);
  dv = dv - P.paperInfluence * (paper_h(d_, n) - ph);

  // The tilt puck describes one shared board-gravity field. Each wet medium
  // answers that field through its row rather than receiving a hard-coded full
  // acceleration. This is what lets water, ink, acrylic, and oil later share
  // gravity without pretending they fall at the same speed.
  du = du + P.gravityX * P.gravityResponse;
  dv = dv + P.gravityY * P.gravityResponse;

  let uL = select(0.0, textureLoad(wet0_in, l, 0).z, !oob(l, n));
  let uR = select(0.0, textureLoad(wet0_in, r, 0).z, !oob(r, n));
  let uU = select(0.0, textureLoad(wet0_in, u_, 0).z, !oob(u_, n));
  let uD = select(0.0, textureLoad(wet0_in, d_, 0).z, !oob(d_, n));
  let vL = select(0.0, textureLoad(wet0_in, l, 0).w, !oob(l, n));
  let vR = select(0.0, textureLoad(wet0_in, r, 0).w, !oob(r, n));
  let vU = select(0.0, textureLoad(wet0_in, u_, 0).w, !oob(u_, n));
  let vD = select(0.0, textureLoad(wet0_in, d_, 0).w, !oob(d_, n));

  du = du + P.viscosity * (uL + uR + uU + uD - 4.0 * w0.z);
  dv = dv + P.viscosity * (vL + vR + vU + vD - 4.0 * w0.w);

  // A fresh film does not skate over an existing damp wash as though the lower
  // layer were absent. The local wet load includes liquid already absorbed by
  // the sheet and standing at its surface. It adds continuous viscous
  // resistance, while a deep flooded brush can still win through the cubic
  // mobility in flux_compute.
  let paperCell = textureLoad(paper, c, 0);
  let sat = sane(textureLoad(wet5_in, c, 0).x, WATER_LIM);
  let wetLoad = select(0.0, clamp((sat + h) / paperCell.y, 0.0, 1.0),
                       paperCell.y > WET_EPS);
  let localDrag = clamp(P.drag + P.wetLayerDrag * wetLoad, 0.0, 0.95);
  var nu = (w0.z + P.dt * du) * (1.0 - localDrag);
  var nv = (w0.w + P.dt * dv) * (1.0 - localDrag);
  nu = clamp(nu, -1.0, 1.0);   // never move more than one cell per step
  nv = clamp(nv, -1.0, 1.0);

  // Containment (see `sane` in common.wgsl). The film rides through this pass
  // untouched; a copied field still has to come out sane.
  textureStore(wet0_out, c, vec4<f32>(w0.x, sane(w0.y, WATER_LIM), nu, nv));
}
