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
  /** Fraction of the reservoir's holding that transfers to canvas per contact step. */
  downRate: number;
  /** Fraction of canvas holding that transfers back up (lifting/scrubbing). */
  upRate: number;
}

export interface BrushDef {
  name: string;
  slug: string;
  /** 'round' = one kinematic spine. 'flat' = two spines, which is what lets a
   * flat brush spread and scratch. VL found >2 spines buys nothing. */
  kind: 'round' | 'flat';

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
