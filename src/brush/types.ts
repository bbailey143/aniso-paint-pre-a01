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
   * WIRED 2026-08-25. The deposit pass takes paint off the sheet under the
   * hairs at this rate times the material's own `MediumPhysics.upRate`, per
   * cell travelled, and hands it to the reservoir — so a brush now lifts,
   * scrubs, and carries the colour it is dragged through. Both halves matter:
   * a hog scrubs harder than a sable, and wet oil gives itself up far more
   * readily than a thin wash.
   *
   * It stood here reading like a feature and driving nothing from the day the
   * schema was written until that date. The material inspector's "picks up"
   * row was a lie for all of it.
   */
  upRate: number;
}

import type { TuftDef } from './tuft';

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

  /**
   * Shapes hand pressure before it drives the ferrule into the sheet.
   * 1 is linear; above 1 gives a longer light-to-working-pressure range while
   * preserving both zero and full pressure. This belongs to the brush row,
   * because a flat blade and a round point do not compress under the hand in
   * the same way. The stylus mapping remains hardware-neutral.
   */
  pressureExponent?: number;

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

  /** How many hairs are drawn. Each stands for a BUNDLE of real ones, so this
   *  is a cost-and-fineness choice: [MEASURED, docs/14 E4] the share of a mark
   *  with paint in it barely moved between 40 hairs and 180, because the drawn
   *  thickness follows the packing. Geometry only, never simulated. */
  bristles: number;

  /**
   * How much neighbouring represented bristle bundles overlap in the mark.
   * 1.15 is the shared packed-tuft default. A coarse split-prone hog can use a
   * little more: each simulated hair represents a bundle of real bristles,
   * and those bundles press into one another when loaded with paste.
   */
  bundleOverlap?: number;

  /** Where those hairs sit and how they differ from one another. Absent means
   *  the round default in `tuft.ts` — which is a filled bundle, not the ring
   *  every brush used to have. */
  tuft?: TuftDef;
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
