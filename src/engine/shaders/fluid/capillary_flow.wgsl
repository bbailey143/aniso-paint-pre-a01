// SimulateCapillaryFlow (C97). Water leaves the standing film into the paper,
// then creeps through the fibres — the layer that produces backruns and the
// ragged creeping edge. Diffusion is computed from the INPUT field on both
// sides of every edge (the bench lost 12% of its water when it read a
// post-absorption value on one side), so the exchange stays antisymmetric.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var wet5_in: texture_2d<f32>;
@group(0) @binding(3) var paper: texture_2d<f32>;
@group(0) @binding(4) var wet0_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var wet5_out: texture_storage_2d<rgba32float, write>;

const KDIFF: f32 = 0.18;    // capillary spread, must stay under 0.25
const EPS_WET: f32 = 0.004; // saturation at which the mask expands
// Y13's upper watercolour-paper pore radius and C97's reference viscosity.
// These normalise SI paper data into the app's dimensionless grid; neither is
// a tuned visual constant (docs/08-substrate.md and docs/05-fluid.md).
const RC_MAX: f32 = 2.5e-4;
const MU_REF: f32 = 0.1;

// THE FAULT WAS HERE — and it was a READ, not a write. See docs/12, E1-E6.
//
// [MEASURED, reproduced] A `textureLoad` of `wet5_in` in this pass occasionally
// returns garbage of order 1e35. The value is never stored anywhere, so it is
// invisible to every guard on the write side — which is exactly why guarding all
// twelve writing passes cut the rate but could not close it. It appears on the
// read, gets multiplied into `ddiff` in the same expression, and vanishes.
//
// The diffusion is NOT the disease. It conserves correctly: after an event the
// total of `s` is frozen to eight significant figures for twenty frames while the
// peak decays. It is the INJECTOR — it takes one bad read and writes a real,
// enormous amount of saturation into the canvas, which the solver then spreads
// outward. That is the blob that appears from nowhere and the water blooming in
// perfect circles.
//
// Saturation is bounded by the paper's capacity and runs well under 1. Anything
// past this ceiling, or NaN, is not a reading of this field. Falling back to the
// asking cell's own value makes the exchange across that edge exactly zero, which
// is both the physically neutral answer and conservative — no water is invented
// or destroyed by rejecting the read.
//
// [DO NOT] "fix" this by lowering KDIFF. Measured at E4: it still fires at
// k = 0.045, five times below the 0.25 stability limit. The coefficient is not
// the problem and lowering it only makes the fault rarer.
const SAT_LIM: f32 = 1.0e4;
fn sane_sat(v: f32, fallback: f32) -> f32 {
  if (!(v >= 0.0)) { return fallback; }   // true for NaN: every NaN compare is false
  if (v > SAT_LIM) { return fallback; }
  return v;
}

fn sat_at(c: vec2<i32>, n: i32, fallback: f32) -> f32 {
  if (oob(c, n)) { return fallback; }
  return sane_sat(textureLoad(wet5_in, c, 0).x, fallback);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  let w0 = textureLoad(wet0_in, c, 0);
  let w5 = textureLoad(wet5_in, c, 0);
  let paperCell = textureLoad(paper, c, 0);
  let cap = paperCell.y;

  // The cell's own read is guarded too, so this covers ANY read of `wet5_in` in
  // this pass, not only the four neighbours. Fallback 0: a cell whose own stored
  // saturation comes back unreadable is treated as dry for this one frame.
  let s_in = sane_sat(w5.x, 0.0);
  let hf_in = w0.y;

  let k = KDIFF * P.cosAlpha;   // A26: diffusion stops at a vertical board
  let sl = sat_at(vec2<i32>(c.x - 1, c.y), n, s_in);
  let sr = sat_at(vec2<i32>(c.x + 1, c.y), n, s_in);
  let su = sat_at(vec2<i32>(c.x, c.y - 1), n, s_in);
  let sd = sat_at(vec2<i32>(c.x, c.y + 1), n, s_in);
  let ddiff = k * ((sl - s_in) + (sr - s_in) + (su - s_in) + (sd - s_in));

  let room = max(cap - s_in, 0.0);

  // Lucas-Washburn integrated over one step. Since dl/dt is proportional to
  // 1/l, squared penetration depth grows linearly. `s/cap` is the paper's
  // dimensionless penetration depth. Sizing is a barrier, r_c is the paper's
  // documented absorptiveness dial, and the wet-medium row supplies viscosity
  // and coupling. r_c=0 therefore gives exactly zero uptake for a future canvas.
  let depth = select(0.0, clamp(s_in / cap, 0.0, 1.0), cap > WET_EPS);
  let pore = clamp(paperCell.w / RC_MAX, 0.0, 1.0);
  let sizingTransmission = clamp(1.0 - paperCell.z, 0.0, 1.0);
  let viscosityResponse = MU_REF / max(P.viscosity, WET_EPS);
  let depthRate = P.absorptionCoupling * sizingTransmission * pore * viscosityResponse;
  let nextDepth = min(sqrt(depth * depth + max(depthRate * P.dt, 0.0)), 1.0);
  let penetrationTake = max(nextDepth - depth, 0.0) * cap;
  let take = min(min(penetrationTake, hf_in), room);

  let hf = max(hf_in - take, 0.0);
  let s = max(s_in + ddiff + take, 0.0);

  var m = w0.x;
  if (s > EPS_WET) { m = 1.0; }

  // Containment (see `sane` in common.wgsl). Every pass that writes an
  // accumulating field guards it, because the meter and the eye both see the
  // LAST writer of a frame — guarding only the entry point let the seed
  // through anywhere downstream of it.
  textureStore(wet0_out, c, vec4<f32>(m, sane(hf, WATER_LIM), w0.z, w0.w));
  textureStore(wet5_out, c, vec4<f32>(sane(s, WATER_LIM), w5.y, w5.z, w5.w));
}
