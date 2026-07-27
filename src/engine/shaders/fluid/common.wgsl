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

  // Pigment library for the 8 active slots: (rho density, omega staining,
  // gamma granulation, pad) — Card 3. Cells store amounts; library stores
  // behaviour. Filled per-frame to match the active slot->pigment map.
  pig: array<vec4<f32>, 8>,
};

const WET_EPS: f32 = 1.0e-5;

fn oob(c: vec2<i32>, n: i32) -> bool {
  return c.x < 0 || c.y < 0 || c.x >= n || c.y >= n;
}
