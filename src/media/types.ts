// The media hierarchy (Card 7, D3).
//
// A medium is a DATA ROW of physical properties that plugs into SHARED
// equations — the GPU passes. A subclass overrides values, never methods. That
// is the whole extensibility argument: adding tempera or casein later is a new
// row on `WetMedium`, and adding a coloured pencil is a new row on `GranularDry`.
// Neither is a new code path.
//
// The line that must never blur (D3): the library stores BEHAVIOUR, cells store
// AMOUNTS. Nothing here is ever cached per-cell.

/** Everything every medium has. The shared ancestry. */
export interface Medium {
  name: string;
  slug: string;
  /** Which branch of the tree — decides whether the fluid passes run at all. */
  family: 'wet' | 'dry';

  /** Library pigment slugs this medium lays down, with relative parts.
   * Goes through the same sticky slot allocator and the same KM render as
   * paint: a pencil is not a special case in the optics. */
  pigments: Array<[string, number]>;

  // ---- optical -------------------------------------------------------------
  /** Saunderson surface-reflection constants. */
  k1: number;
  k2: number;
  /** Gloss dial, 0 glossy .. 1 matte. Per medium, never per pigment. */
  kInstrument: number;

  // ---- body ----------------------------------------------------------------
  /** Stands as h_p, or collapses flat. Watercolour and graphite are flat. */
  hasBody: boolean;
  /** Fraction of wet height retained on drying. */
  bodyShrink: number;

  // ---- transfer ------------------------------------------------------------
  downRate: number;
  upRate: number;
  /** Minimum left behind by advection/pickup — adhesion. */
  teflonMin: number;

  // ---- drying --------------------------------------------------------------
  /** How long it stays workable, seconds. */
  openTime: number;
  /** Wet -> dry lightness change. Positive = lightens. */
  valueShift: number;
  /** Re-wets with water. */
  reactivatable: boolean;
  /** Drying is permanent. */
  oneWayDoor: boolean;
}

/** Media that move as a fluid and are applied with a brush. */
export interface WetMedium extends Medium {
  family: 'wet';
  solvent: 'water' | 'oil';
  /** C97 mu. */
  viscosity: number;
  /** Dimensionless, per unit time. */
  evapRate: number;
  /** How strongly it soaks in via Lucas-Washburn. */
  absorptionCoupling: number;
  /** A26 zeta — weight incoming pigment over resident. */
  pigmentBoost: number;
}

/**
 * Media that deposit directly, gated by the paper's tooth. No fluid pass runs.
 *
 * This is where "rapid strokes on rough paper break up, slow deliberate strokes
 * lay smooth" actually lives: `velocityCoupling` pulls `reach` down as the hand
 * speeds up, and `reach` is what decides whether the tip touches only the peaks
 * of the tooth or gets down into the valleys.
 */
export interface DryMedium extends Medium {
  family: 'dry';
  /** Paper height above which it deposits at all, before hardness shifts it. */
  toothThreshold: number;
  /** 0..1 — how fast strokes break the line up. Graphite high, ballpoint low. */
  velocityCoupling: number;
  /** -1 (soft, 6B) .. +1 (hard, 4H). Scales deposition AND tooth catch: a hard
   * lead lays little and only on peaks, a soft one fills the valleys. */
  hardness: number;
  /** Granulation — how much settles into valleys rather than sitting on top. */
  particleSize: number;

  // ---- tip geometry --------------------------------------------------------
  /** Contact radius in grid cells at size 1. */
  tipRadius: number;
  /** How much lean widens the mark — the side of the lead, not the point. */
  tiltWiden: number;
  /** Pressure response exponent. ~1 for graphite, near 0 for a ballpoint,
   * which is what makes a biro's line so flat. */
  pressureExp: number;
  /** Pigment laid at the centreline at full pressure, per step. */
  deposition: number;
  /**
   * How fast the mark falls off at its rim, in inverse cells. 1 spreads the
   * edge over a whole cell — soft, and it reads as WET. Higher tightens it: a
   * ballpoint leaves a crisp edge because the paste does not spread once it is
   * off the ball.
   */
  edgeSharpness: number;
}

/** Pencils, charcoals, pastels — particles scraped off onto the tooth. */
export interface GranularDry extends DryMedium {
  kind: 'granular';
}

/**
 * Pens. A ballpoint is a viscous paste; a fountain pen is a fluid and will turn
 * the wet path back on when its row is added.
 *
 * A ball only transfers ink while it rolls, and it does not do so evenly — the
 * paste starves and recovers along the line. That intermittency is the whole
 * look of a biro, so it is a property of the medium, not an effect bolted on.
 */
export interface InkMedium extends DryMedium {
  kind: 'ink';
  /** 0..1 — how deep the flow dips when the ball starves. */
  skipStrength: number;
  /** Distance in cells over which the flow starves and recovers. */
  skipScale: number;
  /** 0..1 — fine, fast width and density chatter on top of the slow starve. */
  chatter: number;
}

export type AnyMedium = WetMedium | GranularDry | InkMedium;

/** Tools the user can pick. A wet tool drives the brush engine; a dry tool
 * drives the direct-deposit path. Same stroke resampler feeds both. */
export interface Tool<M extends AnyMedium = AnyMedium> {
  name: string;
  slug: string;
  medium: M;
}
