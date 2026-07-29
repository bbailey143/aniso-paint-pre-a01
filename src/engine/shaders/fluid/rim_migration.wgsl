// RimMigration — the PIGMENT side of edge darkening (log 13, E9).
//
// Card 5 / C97 / Deegan: an evaporating film with a pinned contact line loses
// liquid fastest at its boundary, the interior replenishes it, and that flow
// carries pigment outward to strand at the edge. C97 models this by lowering
// water pressure near the edge (`flow_outward.wgsl`, unchanged and still
// running) and lets pigment ride along as a passenger of the water.
//
// The problem with riding along, and the reason this pass exists: rim strength
// and water-motion strength become one dial. E8 turned that dial up until the
// ring was visible and got dense stippling, needles and false contours, because
// a 512 grid driven hard at cell scale looks exactly like that. So this pass
// moves pigment DIRECTLY, leaving the water calm.
//
// Two properties make it structurally incapable of repeating E8:
//
//   1. Its direction comes from `press.y`, the Gaussian-blurred film height
//      written by flow_outward. A blur is smooth at kernel scale BY
//      CONSTRUCTION, so its gradient cannot carry cell-scale structure. This is
//      not a small number chosen carefully; it is unavailable to the equation.
//
//   2. It is a TRANSFER, never a source. Every amount a cell loses is some
//      other cell's gain, computed by both from the same expression, so the
//      ledger balances exactly — the trick flux_apply_pigment.wgsl relies on.
//      A cell cannot grow. Amplification is arithmetically impossible here.
//
// `rimMigration = 0` makes this pass an identity; fluid.ts skips the dispatch
// entirely in that case, so the pre-E9 baseline reproduces to all digits.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var press_in: texture_2d<f32>;
@group(0) @binding(3) var wet1_in: texture_2d<f32>;
@group(0) @binding(4) var wet2_in: texture_2d<f32>;
@group(0) @binding(5) var wet1_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var wet2_out: texture_storage_2d<rgba32float, write>;

/**
 * Ceiling on the fraction of a cell's suspended pigment that may leave in one
 * step. A numerical stability bound in the same family as the relaxation
 * iteration count — NOT a physical constant and not from any card. Its only job
 * is to guarantee the cell cannot go negative however steep the gradient gets.
 */
const RIM_FRAC_MAX: f32 = 0.25;

fn hb_at(c: vec2<i32>, n: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  return textureLoad(press_in, c, 0).y;
}
fn hf_at(c: vec2<i32>, n: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  return textureLoad(wet0_in, c, 0).y;
}
/** Pigment must stay in water: a cell with no film cannot suspend it. */
fn holds(c: vec2<i32>, n: i32) -> f32 {
  return select(0.0, 1.0, hf_at(c, n) > WET_EPS);
}

/**
 * A coffee ring is an EVAPORATING film replenishing its pinned edge. With no
 * evaporation there is no replenishing flow and there must be no ring, however
 * high the medium's row is set. Same normalisation flow_outward.wgsl uses, so
 * the two halves of edge darkening answer the artist's drying control together.
 */
fn drying_drive() -> f32 {
  return clamp(P.evapRate / max(P.dryRate, WET_EPS), 0.0, 1.0);
}

/**
 * The fraction of cell `a`'s suspended pigment that wants to leave this step,
 * summed over all four edges, before limiting.
 *
 * Units: outward pigment flux is (concentration) x (water flux), and the water
 * flux driven by the drying gradient is (mobility x dh). Dividing by the film
 * height is what makes this concentration-driven rather than amount-driven — a
 * deep puddle sheds a smaller fraction for the same gradient, because it has
 * more water holding the pigment.
 */
fn want_out(a: vec2<i32>, n: i32) -> f32 {
  if (hf_at(a, n) <= WET_EPS) { return 0.0; }
  let hba = hb_at(a, n);
  // [E9 CORRECTION] This denominator was the RAW film height in the first
  // implementation, and that was the whole reason the first measured sweep
  // stippled: a smooth numerator divided by a per-cell quantity is a per-cell
  // quantity. The gradient being smooth was never sufficient — the transfer
  // FRACTION has to be smooth too. Use the blurred film here.
  let ha = max(hba, WET_EPS);
  var s = 0.0;
  s = s + max(hba - hb_at(vec2<i32>(a.x - 1, a.y), n), 0.0) * holds(vec2<i32>(a.x - 1, a.y), n);
  s = s + max(hba - hb_at(vec2<i32>(a.x + 1, a.y), n), 0.0) * holds(vec2<i32>(a.x + 1, a.y), n);
  s = s + max(hba - hb_at(vec2<i32>(a.x, a.y - 1), n), 0.0) * holds(vec2<i32>(a.x, a.y - 1), n);
  s = s + max(hba - hb_at(vec2<i32>(a.x, a.y + 1), n), 0.0) * holds(vec2<i32>(a.x, a.y + 1), n);
  return P.rimMigration * drying_drive() * s / ha;
}

/**
 * Cell `a`'s limiting factor. It depends ONLY on `a`'s own neighbourhood, which
 * is what lets the receiving cell recompute it identically — so the clamp does
 * not break conservation. Get this wrong and pigment appears or vanishes at
 * steep gradients, which is precisely where a rim lives.
 */
fn rim_limit(a: vec2<i32>, n: i32) -> f32 {
  let f = want_out(a, n);
  if (f <= RIM_FRAC_MAX) { return 1.0; }
  return RIM_FRAC_MAX / f;
}

/** Fraction of `a`'s pigment crossing the single edge a -> b. */
fn edge_frac(a: vec2<i32>, b: vec2<i32>, n: i32) -> f32 {
  if (hf_at(a, n) <= WET_EPS) { return 0.0; }
  let hba = hb_at(a, n);
  let dh = max(hba - hb_at(b, n), 0.0);
  if (dh <= 0.0) { return 0.0; }
  // Blurred film in the denominator — see want_out. Must match it exactly or the
  // limiter stops agreeing with what it is limiting.
  let ha = max(hba, WET_EPS);
  return P.rimMigration * drying_drive() * dh * holds(b, n) / ha * rim_limit(a, n);
}

fn g_at(c: vec2<i32>, n: i32, k: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  let a = textureLoad(wet1_in, c, 0);
  let b = textureLoad(wet2_in, c, 0);
  var arr = array<f32, 8>(a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w);
  return arr[k];
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  let glo = textureLoad(wet1_in, c, 0);
  let ghi = textureLoad(wet2_in, c, 0);
  var g = array<f32, 8>(glo.x, glo.y, glo.z, glo.w, ghi.x, ghi.y, ghi.z, ghi.w);

  if (P.rimMigration > 0.0) {
    let l = vec2<i32>(c.x - 1, c.y);
    let r = vec2<i32>(c.x + 1, c.y);
    let up = vec2<i32>(c.x, c.y - 1);
    let dn = vec2<i32>(c.x, c.y + 1);

    // Out: this cell's four edges. In: each neighbour's edge back to this cell,
    // evaluated with the SAME function, so both sides of every edge agree.
    let outL = edge_frac(c, l, n);
    let outR = edge_frac(c, r, n);
    let outU = edge_frac(c, up, n);
    let outD = edge_frac(c, dn, n);
    let leaving = outL + outR + outU + outD;

    let inL = edge_frac(l, c, n);
    let inR = edge_frac(r, c, n);
    let inU = edge_frac(up, c, n);
    let inD = edge_frac(dn, c, n);

    for (var k = 0; k < 8; k = k + 1) {
      var gk = g[k] * (1.0 - leaving);
      gk = gk + g_at(l, n, k)  * inL;
      gk = gk + g_at(r, n, k)  * inR;
      gk = gk + g_at(up, n, k) * inU;
      gk = gk + g_at(dn, n, k) * inD;
      g[k] = max(gk, 0.0);
    }
  }

  // Same containment as every other writing pass (see `sane` in common.wgsl).
  // With rimMigration = 0 this is an identity on any real paint value, which is
  // what makes the pre-E9 baseline reproducible.
  textureStore(wet1_out, c, sane4(vec4<f32>(g[0], g[1], g[2], g[3]), PIG_LIM));
  textureStore(wet2_out, c, sane4(vec4<f32>(g[4], g[5], g[6], g[7]), PIG_LIM));
}
