// Starting points.
//
// You cannot build acrylic from a blank stare. These are skeletons to open,
// paint with, and pull apart — not calibrated materials.
//
// THE FENCE, PLAINLY. Watercolour in `media/library.ts` is the measured row.
// These three are NOT. Each value below is one of:
//
//   [CARDED]      taken from watercolour, which is carded and artist-approved.
//   [CODED]       stated in the engine's own source for this medium. Several
//                 settings already document what oil or acrylic should be —
//                 those notes are the nearest thing to evidence we have and
//                 they are cited to the file that carries them.
//   [UNVERIFIED]  reasoning about how the material behaves, nothing more.
//                 Bench it, or paint with it and judge, before trusting it.
//
// They live here rather than in `media/library.ts` on purpose. That file is the
// evidence-bearing one, and dropping three rows of reasoning into it would put
// guesses where measurements are supposed to be.
//
// THE THICKNESS CEILING. The solver diffuses velocity explicitly with dt = 1,
// which is stable only to viscosity 0.25 — see the comment in
// `shaders/fluid/update_velocities.wgsl`. None of these exceeds it. Body above
// that comes from `drag` and `wetLayerDrag`, which resist flow without going
// unstable, so a heavy paint is built by resisting flow rather than by cranking
// thickness past what the maths can integrate.

import type { WetMedium } from '../media/types';
import { WATERCOLOR } from '../media/library';

/** Slugs the studio should present as "a starting point, not a finished paint". */
export const STARTING_POINTS = ['gouache', 'acrylic', 'oil'];

/**
 * Opaque water paint, heavy with binder. The nearest neighbour to watercolour,
 * which is why it is the gentlest first thing to build.
 */
export const GOUACHE: WetMedium = {
  ...WATERCOLOR,
  name: 'Gouache (starting point)',
  slug: 'gouache',
  solvent: 'water',
  viscosity: 0.18,          // [UNVERIFIED] bodied, well under the 0.25 ceiling
  drag: 0.14,               // [UNVERIFIED] binder resists spreading
  gravityResponse: 0.015,   // [UNVERIFIED] too bodied to run like a wash
  wetLayerDrag: 0.62,       // [UNVERIFIED]
  edgeDarkening: 0.02,      // [UNVERIFIED] softer rim than watercolour's 0.045
  rimMigration: 0,          // [CODED] media/types.ts: "a binder-loaded gouache
                            //         holds pigment where it lands"
  edgeEvaporation: 0,       // [CODED] types.ts: "lower for a bodied paint whose
                            //         surface skins over"
  evapRate: 0.0013,         // [UNVERIFIED] a shade slower than watercolour
  absorptionCoupling: 0.00006, // [UNVERIFIED] binder keeps it nearer the surface
  valueShift: 0.24,         // [UNVERIFIED] gouache is famous for drying lighter
  kInstrument: 1,           // [CARDED] fully matte, as watercolour
  reactivatable: true,      // [UNVERIFIED] gouache does re-wet
  yieldStress: 0.004,       // [UNVERIFIED] just enough to sit rather than creep
};

/**
 * Water while it is wet, plastic once it is not. The one-way door is the whole
 * character of the material.
 */
export const ACRYLIC: WetMedium = {
  ...WATERCOLOR,
  name: 'Acrylic (starting point)',
  slug: 'acrylic',
  solvent: 'water',
  viscosity: 0.22,          // [UNVERIFIED] heavier than gouache, under the ceiling
  drag: 0.2,                // [UNVERIFIED]
  gravityResponse: 0.01,    // [UNVERIFIED]
  wetLayerDrag: 0.7,        // [UNVERIFIED]
  edgeDarkening: 0.015,     // [UNVERIFIED]
  rimMigration: 0,          // [UNVERIFIED] binder holds pigment, as gouache
  edgeEvaporation: 0,       // [UNVERIFIED] skins over rather than ringing
  evapRate: 0.0022,         // [UNVERIFIED] noticeably faster than watercolour
  absorptionCoupling: 0.00004, // [UNVERIFIED]
  valueShift: -0.12,        // [CODED] shaders/composite.wgsl: "negative acrylic
                            //         is milky while wet and cures darker"
  kInstrument: 0.55,        // [UNVERIFIED] satin, between matte and gloss
  reactivatable: false,     // [UNVERIFIED] dried acrylic does not come back
  oneWayDoor: true,         // [UNVERIFIED] the defining property
  yieldStress: 0.010,       // [UNVERIFIED] holds a mark; heavy body holds more
};

/**
 * Oil. The biggest jump of the four, and the one with a genuine gap behind it:
 * impasto is not implemented, so a loaded brushmark will not stand up off the
 * surface yet. Everything else about it can be felt today.
 */
export const OIL: WetMedium = {
  ...WATERCOLOR,
  name: 'Oil (starting point)',
  slug: 'oil',
  solvent: 'oil',           // [CODED] media/types.ts declares this value
  viscosity: 0.25,          // [UNVERIFIED] at the solver's stable ceiling
  drag: 0.34,               // [UNVERIFIED] body comes from here, not thickness
  gravityResponse: 0.005,   // [UNVERIFIED] a loaded stroke barely sags
  wetLayerDrag: 0.8,        // [UNVERIFIED] dragging through wet paint is the point
  edgeDarkening: 0,         // [UNVERIFIED] no drying flow to carry pigment out
  rimMigration: 0,          // [CODED] types.ts: "oil does not dry by evaporation
                            //         at all and should be 0"
  edgeEvaporation: 0,       // [CODED] types.ts: "0 for oil, which does not dry by
                            //         evaporation at all — it cures, and it
                            //         famously leaves no ring"
  evapRate: 0,              // [CODED] same note: it cures rather than evaporates
  absorptionCoupling: 0.000005, // [UNVERIFIED] primed canvas barely drinks
  valueShift: 0,            // [CODED] shaders/composite.wgsl: "oil uses zero"
  kInstrument: 0.3,         // [UNVERIFIED] the wet-looking sheen oil is known for
  reactivatable: true,      // [UNVERIFIED] stays workable for days
  // The brake. Oil never dries, so without this it creeps outward forever under
  // its own surface gradient — the bleeding Bartford found on 2026-08-13.
  yieldStress: 0.030,       // [UNVERIFIED] bench it; this is a first guess
};

export const PRESETS: WetMedium[] = [GOUACHE, ACRYLIC, OIL];
