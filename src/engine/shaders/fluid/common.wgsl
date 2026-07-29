// Shared declarations, prepended to every fluid pass at pipeline-build time.
// No bindings here — each pass declares its own from binding 0 upward.
// Ported from the main-branch bench (validated: flux algebra exact, conservation
// holds at half-float). Half-float (rgba16float) throughout — D6.

struct Params {
  grid: u32,
  frame: u32,
  relaxIters: u32,
  /** The active sheet's peak-to-valley tooth amplitude, 0..1. Dry media need
   * it to tell "smooth" from "rough" — see dry_deposit.wgsl. */
  toothAmp: f32,

  dt: f32,
  viscosity: f32,   // C97 mu
  drag: f32,        // C97 kappa
  dryRate: f32,     // wetness continuum decay, per unit time

  evapRate: f32,    // the only water removal in the system (DryTick)
  gravityX: f32,    // D11 board tilt, zero when flat
  gravityY: f32,
  cosAlpha: f32,    // A26 tilt-diffusion factor

  edgeEta: f32,     // C97 edge-darkening strength
  paperInfluence: f32,
  time: f32,
  rewetRate: f32,   // fraction of dry1 returning to suspension per unit time

  // Wet-medium row. Keep shared physics here: a new medium changes values,
  // never the capillary or movement methods (D3 / Card 7).
  absorptionCoupling: f32,
  gravityResponse: f32,
  wetLayerDrag: f32,
  _mediumPad2: f32,

  // Pigment library for the 8 active slots: (rho density, omega staining,
  // gamma granulation, pad) — Card 3. Cells store amounts; library stores
  // behaviour. Filled per-frame to match the active slot->pigment map.
  pig: array<vec4<f32>, 8>,
};

const WET_EPS: f32 = 1.0e-5;

fn oob(c: vec2<i32>, n: i32) -> bool {
  return c.x < 0 || c.y < 0 || c.x >= n || c.y >= n;
}

/**
 * Reject a value that cannot be paint.
 *
 * [CONTAINMENT, not a cure — docs/11 round 9] A single cell intermittently
 * acquires a value around 4e37, or exactly +Infinity, in one frame. Measured
 * with every fluid pass disabled, so the brush deposit is where it enters in
 * the reproduction; the mechanism behind it is NOT yet proven and no story is
 * offered here. What IS established: it is always exactly one cell, the value
 * arrives in a single frame rather than growing, and the fluid solver then
 * spreads it outward — which is the blob that appears from nowhere and the
 * water spots that bloom as perfect circles.
 *
 * Every quantity in the wet band is a physical amount per cell. TransferPigment
 * already clamps settled and suspended pigment to 1.0 per slot, and a cell can
 * hold single-digit water at the very most. So anything past `lim` is not a
 * large amount of paint, it is not paint at all, and dropping it loses nothing
 * real. NaN and negatives go the same way: `!(v >= 0.0)` is true for NaN,
 * because every comparison against NaN is false.
 *
 * This stops one bad cell from destroying a painting. It does not explain the
 * bad cell. Do not close the fault on the strength of it.
 */
fn sane(v: f32, lim: f32) -> f32 {
  if (!(v >= 0.0)) { return 0.0; }
  if (v > lim) { return 0.0; }
  return v;
}

fn sane4(v: vec4<f32>, lim: f32) -> vec4<f32> {
  return vec4<f32>(sane(v.x, lim), sane(v.y, lim), sane(v.z, lim), sane(v.w, lim));
}

/** Ceiling for pigment per slot per cell. TransferPigment clamps to 1.0; this
 * leaves four orders of magnitude of headroom before it calls anything wrong. */
const PIG_LIM: f32 = 1.0e4;
/** Ceiling for water per cell. A deep puddle is order 1. */
const WATER_LIM: f32 = 1.0e4;
