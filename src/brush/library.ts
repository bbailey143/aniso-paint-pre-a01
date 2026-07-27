// The brush library. Each entry is a data row (Card 1) — adding a rigger, fan,
// mop or sponge later means adding a row here, not a code path.
//
// `[UNVERIFIED]` The numeric values are reasoned from the physical description of
// the tools (sable is springy, holds a lot of water, and points well) and tuned
// against VL's behavioural targets. They are not measured. VL's pass/fail tests
// are the bench: the tuft must snap back the instant it lifts, and a large round
// brush must be able to draw a hairline with its tip.

import type { BrushDef } from './types';

export const BRUSHES: BrushDef[] = [
  {
    name: 'Round Sable',
    slug: 'round-sable',
    kind: 'round',
    // A single spine gives round brushes. It cannot spread bristles — that is
    // the documented consequence of one spine, and why the flat below has two.
    segments: 5,
    length: 26,
    widthRatio: 0.34,
    taper: 0.55,          // shorter segments toward the tip
    stiffness: 0.62,      // sable is springy
    stiffnessTaper: 0.62, // ...but the tip is soft, so it can draw a hairline
    friction: { mu: 0.55, cEta: 0.85, k: 2.0 },
    bristles: 28,
    splayFromPressure: 0.55,
    reservoir: {
      capacityBelly: 2.6,   // the belly holds far more than the tip
      capacityTip: 0.6,
      downRate: 0.012,   // per CELL TRAVELLED now, not per step — see reservoir.ts
      upRate: 0.10,
    },
    plasticity: 0.05,
  },
  {
    name: 'Flat Sable',
    slug: 'flat-sable',
    kind: 'flat',
    // Two spines, each driving one side of the lattice. This is what produces
    // flat-brush spreading and scratching. VL found a third spine buys nothing.
    segments: 5,
    length: 24,
    widthRatio: 0.95,     // a chisel, much wider than it is thick
    taper: 0.35,
    stiffness: 0.72,
    stiffnessTaper: 0.68,
    friction: { mu: 0.6, cEta: 0.8, k: 2.4 },
    bristles: 34,
    splayFromPressure: 0.75,
    reservoir: {
      capacityBelly: 2.3,
      capacityTip: 0.55,
      downRate: 0.013,   // per CELL TRAVELLED now, not per step — see reservoir.ts
      upRate: 0.12,
    },
    plasticity: 0.06,
  },
];

export const BRUSH_BY_SLUG = new Map(BRUSHES.map((b) => [b.slug, b]));
