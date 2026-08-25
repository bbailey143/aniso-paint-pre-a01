// Brush definitions — a brush is a DATA ROW, not a code path (Card 1).
// Sponge, rigger, fan and mop are future entries in the library, not new code.

export interface FrictionLobe {
  /** Base friction coefficient at the contact. */
  mu: number;
  /** 0..1 — how much friction is cancelled along the preferred drag direction. */
  cEta: number;
  /** Sharpens the anisotropic cone. Higher = narrower low-friction lobe. */
  k: number;
}

export interface ReservoirDef {
  /** Capacity at the belly of the tuft (the mop holds more here than at its tip). */
  capacityBelly: number;
  /** Capacity at the tip. */
  capacityTip: number;
  /**
   * Extra nominal capacities carried as exterior water at maximum water charge.
   * Above 1 lets the control reach a deliberately flooded/dripping brush.
   */
  waterOvercharge: number;
  /** Fraction of the reservoir's holding that transfers to canvas per contact step. */
  downRate: number;
  /**
   * Fraction of canvas holding that transfers back up (lifting/scrubbing).
   *
   * [NOT WIRED] Nothing reads this. The deposit pass moves paint one way only,
   * so no brush lifts, scrubs or picks up the colour it is dragged through,
   * whatever this says. The row is kept because the bidirectional exchange it
   * belongs to is designed and specified — but until a pass reads it, treat
   * any claim built on it as false. The material inspector currently shows it
   * as "picks up", which is the exact failure the controls rules warn about:
   * a number that reads like a feature and drives nothing.
   */
  upRate: number;
}

export interface BrushDef {
  name: string;
  slug: string;
  /** 'round' = an axisymmetric tuft. 'flat' = a chisel. How many spines carry
   * it is `spines` below, not this. */
  kind: 'round' | 'flat';

  /**
   * How many spines are solved across the blade.
   *
   * ~~VL found >2 spines buys nothing.~~ **RETRACTED 2026-08-24.** Bartford
   * withdrew VL as the standard, and the claim was never tested here anyway.
   * What WAS tested: with two spines the tuft is a ruled sheet between two
   * curves, so the middle of a blade can never do anything the two edges are
   * not already doing between them. It cannot bow, cannot buckle, cannot let
   * its centre lag. A third spine is what makes those possible; the bow is
   * measured by `node tools/brush-bench.mjs spines`.
   *
   * Defaults to 1 for a round tuft and 2 for a flat, which is the old
   * behaviour, so a brush row that says nothing keeps the shape it had.
   */
  spines?: number;

  /**
   * How far the ferrule is driven past first touch at full pressure, as a
   * fraction of the tuft's own length. Falls back to the module default in
   * `brush.ts` when a row does not say.
   *
   * A row because it is a property of the tool: how far you can lean on a brush
   * before it stops bending and starts folding up is a fact about the hair, not
   * about the engine.
   */
  drive?: number;

  /** Chain segments per spine. VL: at least 4. */
  segments: number;
  /** Tuft length in grid cells at size 1. */
  length: number;
  /** Tuft width as a fraction of length. */
  widthRatio: number;

  /** 0..1 — how strongly segment lengths shorten toward the tip. */
  taper: number;
  /** Angular spring constant at the ferrule (stiff where bristles are packed). */
  stiffness: number;
  /** Per-segment multiplier toward the tip (<1 = flexible tip, which is what
   * lets a large round brush draw a hairline). */
  stiffnessTaper: number;
  /** Per-segment rest bend in radians. Absent = straight (180 deg). A worn or
   * splayed brush is just a row with non-zero entries here. */
  restAngles?: number[];

  friction: FrictionLobe;

  /** Bristle count — geometry only, never simulated (VL). */
  bristles: number;
  /** How much the tuft spreads as it is pressed. The FFD lattice stretching;
   * splay is geometric, not emergent (the documented ceiling). */
  splayFromPressure: number;

  reservoir: ReservoirDef;

  /** 0 = none. A wet tuft holding its splayed shape through internal friction,
   * recovering slowly. VL skipped this; Chu & Tai's addition. */
  plasticity: number;
}

/** Stylus state, already mapped into canvas grid space. */
export interface BrushInput {
  /** Contact point, grid cells. */
  x: number;
  y: number;
  /** 0..1 */
  pressure: number;
  /** Degrees from vertical. */
  tiltAngle: number;
  /** Degrees, direction of lean. */
  tiltAzimuth: number;
  /** Degrees, barrel roll. */
  twist: number;
  /** Drag vector since the previous solve, grid cells. */
  dx: number;
  dy: number;
}
