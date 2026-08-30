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
    /* One spine. A round tuft is symmetric about its own axis, so a fan across
       one chosen direction would be an arbitrary choice of direction — what a
       round brush wants is a small cluster (centre plus a ring), which is not
       built. So a round brush still cannot do anything asymmetric: it cannot
       bow, and it cannot lead with one side. Known gap, not a decision. */
    spines: 1,
    segments: 5,
    length: 26,
    widthRatio: 0.34,
    taper: 0.55,          // shorter segments toward the tip
    stiffness: 0.62,      // sable is springy
    stiffnessTaper: 0.62, // ...but the tip is soft, so it can draw a hairline
    friction: { mu: 0.55, cEta: 0.85, k: 2.0 },
    /* 96 hairs through a filled disc, where there used to be 28 on a ring.
       [MEASURED, docs/14 E4] The share of the mark with paint in it went from
       26% to 88% at working pressure. The count is not what did that -- where
       the roots sit is; the count buys how fine the striations are. */
    bristles: 96,
    tuft: {
      section: 2,            // a circle
      thickRatio: 1,         // round: the two axes are the same
      convW: 0.10, convT: 0.10,   // it points, which is what a round is for
      bulge: 1.18, bellyAt: 0.33, // a sable's belly sits well below the ferrule
      rootJitter: 0.55,
      lenVar: 0.10,          // dressed hair: nearly all the same length
      bendVar: 0.18,
      convVar: 0.20,
      strayFrac: 0.05, strayAmt: 0.55,
      seed: 0x5AB1E,
    },
    splayFromPressure: 0.55,
    reservoir: {
      /* SIZED FROM THE ARTIST'S COATINGS MODEL, 2026-08-30. See docs/19 E15.
       *
       *     wet film = target dry film / volume solids
       *     deposited = stroke area * wet film
       *     load = deposited / transfer efficiency          (0.35 to 0.50)
       *
       * At 1 cell = 1 mm and 1 paint unit = 1 mm^3, a 250 mm designed stroke
       * wants a 44 um wet film for a 40 um dry one at 90 % solids. These three
       * brushes disagreed with each other by FOUR TIMES: the hog laid 22 um and
       * this round sable laid 139 um, which is not a brush, it is a syringe.
       * Each capacity is scaled so its own designed stroke lays the film the
       * model asks for. `downRate` is untouched, so how FAR a dip goes is
       * unchanged - capacity moves the amount, not the legs (measured, see
       * `setFlow` in reservoir.ts). */
      capacityBelly: 0.635, // the belly holds far more than the tip
      capacityTip: 0.145,   // was 2.6 / 0.6 - laid a 139 um film, 3x too thick
      // [UNVERIFIED] Exterior water carried by a flooded sable, in nominal
      // reservoir capacities. Maximum water is intentionally a dripping brush.
      waterOvercharge: 3.0,
      /* TRANSFER EFFICIENCY, the model's other half. It wants 0.35 to 0.50 of
         the load to leave in one designed stroke; measured, these three sat at
         0.372, 0.302 and 0.309, so two of them were below the band and all
         three disagreed. Capacity cannot reach this - what leaves is a fraction
         of what is held, so scaling the tuft scales both alike and the RATIO
         does not move. Only the rate per millimetre does. Each is set to land
         near 0.40. This is also what the artist meant by the brushes "holding
         on too long": a shorter leg is the same number seen from the side. */
      downRate: 0.0158,  // was 0.012; per CELL TRAVELLED, not per step - see reservoir.ts
      upRate: 0.10,
    },
    plasticity: 0.05,
  },
  {
    name: 'Flat Sable',
    slug: 'flat-sable',
    kind: 'flat',
    /* Five spines across the blade.
       [MEASURED, node tools/brush-bench.mjs fan 0.25] Worst gap between where a
       fan of N chords puts the blade and where it actually solves, at the end of
       a 90-degree arc: 2 spines 5.98 cells, 3 -> 3.22, 5 -> 1.28, 9 -> 1.19.
       Five is the knee; past it the return collapses. Two spines cannot bow at
       all — the blade is a ruled sheet between the edges by construction — so
       the ~6 cells the pair misses is the middle of the blade doing something
       neither edge is doing.
       Cost is five chain relaxations instead of two, all CPU, ~90 numbers. */
    spines: 5,
    /* [UNVERIFIED artist trial, 2026-08-28.] Both flat brushes jump from five
       to ten contacting spine joints near linear pressure 0.65. A 1.6 response
       maps a common firm 0.75 input to 0.631, immediately below that measured
       step, but still reaches full depth at full pressure. */
    pressureExponent: 1.6,
    segments: 5,
    length: 24,
    widthRatio: 0.95,     // a chisel, much wider than it is thick
    taper: 0.35,
    stiffness: 0.72,
    stiffnessTaper: 0.68,
    friction: { mu: 0.6, cEta: 0.8, k: 2.4 },
    /* 120 hairs through a chisel section, where there used to be 34 strung
       along one line two rows deep. [MEASURED, docs/14 E2] those 34 laid tracks
       with 0% variation in their spacing -- a comb, exactly even, every stroke
       forever, which is a good way to print a repeating pattern into paint. */
    bristles: 120,
    tuft: {
      section: 3,            // rounded rectangle: full thickness across, corners eased
      thickRatio: 0.18,      // a chisel is thin, but it is not a ribbon
      convW: 0.92,           // a flat keeps its width to the very edge
      convT: 0.12,           // ...and comes to a chisel edge through its thickness
      bulge: 1.06, bellyAt: 0.30,
      rootJitter: 0.55,
      lenVar: 0.10,
      bendVar: 0.18,
      convVar: 0.20,
      strayFrac: 0.05, strayAmt: 0.50,
      seed: 0xF1A7,
    },
    splayFromPressure: 0.75,
    reservoir: {
      /* Model-sized, x0.73. See the note on the round sable's capacity. */
      capacityBelly: 1.284,
      capacityTip: 0.308,   // was 2.3 / 0.55 - laid 61 um against a 44 um target
      // [UNVERIFIED] Same flooded-water range as the round until reference
      // brush tests justify a different exterior holding for the flat.
      waterOvercharge: 3.0,
      /* Model-sized for transfer; see the round sable's note. */
      downRate: 0.0169,  // was 0.013; per CELL TRAVELLED, not per step
      upRate: 0.12,
    },
    plasticity: 0.06,
  },
  {
    name: 'Flat Hog',
    slug: 'flat-hog',
    kind: 'flat',
    /* Five, as the flat sable, and measured the same way: 2 spines 4.40 cells,
       3 -> 3.49, 5 -> 3.03, 9 -> 2.73. A hog is stiffer and bows less, so it
       gains less than the sable does — but it is the same tool shape and there
       is no reason to give it a coarser blade. */
    spines: 5,
    /* Same measured mid-pressure contact step as the Flat Sable. Keep this a
       shared flat-brush response; Oil and paper still determine what that
       contact deposits, moves, and reveals. [UNVERIFIED artist trial.] */
    pressureExponent: 1.6,
    // A hog bristle brush, which is what oil is moved with. Everything below is
    // the same handful of rows the sables use, turned the other way: where a
    // sable is soft, springy, absorbent and fine, a hog is stiff, blunt, coarse
    // and holds almost nothing. That contrast is the entire definition - there
    // is no hog-brush code path.
    segments: 5,
    length: 22,           // cut stubbier than a sable of the same width
    widthRatio: 1.05,     // wider at the ferrule than it is long
    taper: 0.22,          // barely tapers; the bristles run near parallel
    /* Stiff at the ferrule, and that is where a hog's stiffness lives — it is
       what lets the brush push paint around instead of folding. But the taper
       is how fast that stiffness falls off toward the tip, and setting it near
       1 said "rigid all the way down", which is a wire brush, not a hog.

       [MEASURED, tools/brush-bench.mjs shape] A rigid tuft cannot lie down: its
       joints stack vertically, project to the same point on the paper, and
       every hair emits a degenerate segment — a dot instead of a track. At
       0.98/0.96 the mean footprint segment was 0.57 cells at working pressure,
       against 3.21 for the flat sable. That is the whole of why the mark came
       out as separated ticks across the stroke instead of striations along it.

       The sweep is unambiguous: the taper decides this and the stiffness barely
       touches it. Anything at 0.84 or below lies down; 0.96 never does.

       ~~against 3.21 for the flat sable~~ **THAT COMPARISON IS RETRACTED,
       2026-08-24.** The flat sable's 3.21 was measured while DRIVE was 1.0,
       which drove the ferrule 85% of a tuft length past the paper and left the
       chain folded back on itself at 135 degrees. A mean track of 3.21 cells
       per step, when the hand moved 1 cell, is not a hair being dragged: it is
       a hair being flung as the fold flips. At DRIVE 0.35 the same measurement
       reads 0.30. The 0.57-vs-lies-down conclusion about the TAPER still holds
       and was reproduced; only the sable number it was compared against was
       taken from a broken regime. See docs/14 E9. */
    stiffness: 0.92,
    stiffnessTaper: 0.74,
    // Coarse hair grabs the surface, and grabs it in every direction rather
    // than slicing cleanly along one. Lower cEta and a wider cone is what makes
    // it drag paint sideways instead of gliding over it.
    friction: { mu: 0.92, cEta: 0.62, k: 1.7 },
    // Fewer and thicker than a sable, and far less evenly dressed.
    bristles: 72,
    /* Each drawn hair stands for a bundle of coarse hog bristles. At the shared
       packed-tuft overlap the working footprint was only 61% painted, and the
       broad face arrived as disconnected pulses which body paint preserved as
       the longstanding snakeskin. Let loaded bundles press into one another
       without regularising their roots or adding more simulated hairs.
       [UNVERIFIED artist mapping — 2026-08-28.] */
    bundleOverlap: 1.45,
    tuft: {
      section: 3,
      thickRatio: 0.30,      // bristle is fatter; a hog is a chunky tool
      convW: 0.98,
      convT: 0.55,           // cut blunt, not dressed to an edge
      bulge: 1.02, bellyAt: 0.30,
      rootJitter: 0.70,      // coarse hair is not laid in neatly
      lenVar: 0.26,          // and it is not all the same length either
      bendVar: 0.30,
      convVar: 0.30,
      strayFrac: 0.12, strayAmt: 0.60,   // hogs have stray bristles
      seed: 0xB0A2,
    },
    // Lean on it and it opens into a rake. This is the mark a hog is chosen for.
    splayFromPressure: 1.15,
    reservoir: {
      // Bristle is not absorbent the way sable hair is. It carries paint on and
      // between the hairs rather than in them, so it holds well under half what
      // a sable does, and runs out sooner.
      /* Model-sized, x2.01 - the hog was the one holding too LITTLE, and by
         half. See the note on the round sable's capacity. */
      capacityBelly: 2.058,
      capacityTip: 0.652,   // was 1.1 / 0.35 - laid 22 um against a 44 um target
      // A hog will not hold a flood. This is a stiff tool for stiff paint.
      waterOvercharge: 1.2,
      /* Model-sized for transfer; see the round sable's note. Barely moved -
         the hog was the one brush already inside the band, at 0.372. */
      downRate: 0.0324,   // was 0.030; paste leaves a bristle faster than a wash
      upRate: 0.34,       // and it lifts what it is dragged through
    },
    // The rake stays raked. A sable springs straight back; a splayed hog keeps
    // its shape for a while, which is why a second stroke repeats the first.
    plasticity: 0.18,
  },
];

export const BRUSH_BY_SLUG = new Map(BRUSHES.map((b) => [b.slug, b]));
