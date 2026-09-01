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
  /** Pigment-side rim strength (E9). 0 = pure C97, water-side only. */
  rimMigration: f32,

  /** Gaussian sigma in cells for the film blur that aims rimMigration. */
  rimReach: f32,
  /** How much faster the film evaporates at its pinned edge than in its
   * interior. This is the Deegan mechanism itself, not a model of its result. */
  edgeEvaporation: f32,
  /** Stress a face must clear before this material moves at all. 0 = water. */
  yieldStress: f32,
  /** Film that adheres and cannot be shoved off, however hard the brush
   * scrubs. `Medium.teflonMin` — "minimum left behind by advection/pickup". */
  teflonMin: f32,

  /** STEP 0 OF THE OIL REBUILD (docs/20 §4). One bit per behaviour in §3, so
   * oil can be built back up one at a time and each addition judged on its own.
   * A set bit means the behaviour is ON. Every bit is set in normal use, so the
   * default is exactly the paint that shipped; clearing them is `bare oil`. */
  oilFlags: u32,
  /** How big a cell is, in millimetres. THE FIRST PHYSICAL SCALE THIS ENGINE
   * HAS EVER HAD — docs/20 §13, ratified 2026-08-31 with the canvas fixed at
   * 16x20 and the cell held at a constant size whatever the canvas. Before this
   * every length in here was in cells, and a cell had no size. */
  cellMM: f32,
  /** Canvas thread pitch in millimetres. MEASURED: 0.864 mm warp / 0.772 weft,
   * confirmed three times across two sessions (docs/20 §10b, §11a). This is the
   * length D14's coverage is a fraction OF. */
  threadMM: f32,
  /** D14 coverage rate, as a fraction per millimetre TRAVELLED — never per
   * frame, never per cell stepped (invariant 2). Step 1 fills this; it is 0
   * until then. */
  coverRate: f32,

  // Pigment library for the 8 active slots: (rho density, omega staining,
  // gamma granulation, pad) — Card 3. Cells store amounts; library stores
  // behaviour. Filled per-frame to match the active slot->pigment map.
  pig: array<vec4<f32>, 8>,
};

/* The six §3 behaviours, as bits in `P.oilFlags`. Each is oil-only, each was
 * added to cure something the artist reported, and none of them was ever
 * switchable until now — which is what "we keep adding fixes" meant.
 *
 * These are NOT suspects. OIL_EXCHANGE in particular is ratified plan work
 * (`18-oil-body.md` §5 step 2). The flags exist so bare oil can be LOOKED at,
 * not because any one of them is presumed wrong. */
const OIL_BRIDGE:   u32 = 1u;   // 1: the tooth gate fills as paint builds
const OIL_GATE:     u32 = 2u;   // 2: contact ramp narrowed by viscosity
const OIL_LEVEL:    u32 = 4u;   // 3: level_fresh — settling the hair comb
const OIL_EXCHANGE: u32 = 8u;   // 4: rExchange + the TVD "unlike" metric
const OIL_SMEAR:    u32 = 16u;  // 5: smearStrength — the brush pushing paint
const OIL_RELEASE:  u32 = 32u;  // 6: workable body releasing the teflon floor
const OIL_ALL:      u32 = 63u;  // every behaviour on = the paint that shipped

const WET_EPS: f32 = 1.0e-5;

/**
 * E21 — how NEAT the paint in a cell is: its pigment as a share of its film.
 * 1 is paint out of the tube, 0 is pure solvent.
 *
 * Until this existed, `P.yieldStress` and `P.viscosity` were global uniforms and
 * nothing modulated them per cell, so a puddle that was nine-tenths turpentine
 * was exactly as stiff as neat paint. Thinning made the sheet wetter and never
 * softer — a whole axis of oil the engine could not express (docs/20 §18c).
 *
 * `[MEASURED, docs/20 §19]` No reference constant had to be invented, because
 * the engine's own units already put neat paint at one: a stroke laid with the
 * Solvent dial at 0 reads **1.0001** whether the brush is loaded at 1.0 or 0.6,
 * half solvent reads **0.625**, and a fully solvent-charged brush **0.143**.
 *
 * `[UNVERIFIED]` That the yield should fall LINEARLY with neatness is reasoning,
 * not a card. A real suspension yields as `(phi - phi_c)^n` about a critical
 * packing. Linear is the simplest form that is right at both ends — neat paint
 * unchanged, pure solvent offering no resistance — and it is what the bench
 * should be pointed at first.
 */
fn neatness(pigSum: f32, film: f32) -> f32 {
  /* An EMPTY cell reads as neat, not as infinitely thin. There is no paint in
     it to yield, so the row's own yield is the conservative answer and it keeps
     bare canvas behaving exactly as it did. Read as a ratio, 0/0 came out 0,
     which quietly opened the shove gate on every untouched cell — measured as a
     0.04 drift in laid film before this guard went in. */
  if (film <= WET_EPS) { return 1.0; }
  return clamp(pigSum / film, 0.0, 1.0);
}

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
