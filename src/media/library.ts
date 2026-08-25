// The media library: behaviour lives in rows; cells store only amounts.
//
// [UNVERIFIED] The dry-media values below are normalised working values from
// the unified physical-medium schema. They are intentionally visible here so
// artist testing can tune a material without creating a special code path.

import type { WetMedium, GranularDry, InkMedium, Tool, MediumPhysics } from './types';

type DryRow = GranularDry | InkMedium;

export const WATERCOLOR: WetMedium = {
  name: 'Watercolour', slug: 'watercolour', collection: 'Watercolour', family: 'wet', pigments: [],
  physics: {
    pigmentParticleSize: 0.12, binderViscosity: 0.10, mediumHardness: 0,
    shearRate: 0.35, adhesionStrength: 0.45, compressiveYield: 1,
    specularPotential: 0.18, microReflectance: 0.35, refractiveIndex: 0.62,
  },
  k1: 0.03, k2: 0.65, kInstrument: 1,
  // A standing wash IS a puddle, and it is gone in ninety seconds. Unchanged.
  filmGloss: 1,
  // A stain. However many washes go down, the sheet is still what you are
  // looking at - which is why watercolour is painted on white paper.
  relief: 0, bodyShrink: 0, hidesGround: 0,
  downRate: 0.35, upRate: 0.08, teflonMin: 0.02,
  openTime: 90, valueShift: 0.18, reactivatable: true, oneWayDoor: false,
  solvent: 'water', viscosity: 0.1,
  drag: 0.06, gravityResponse: 0.03, wetLayerDrag: 0.55,
  edgeDarkening: 0.045,
  // Claude's current watercolor baseline keeps these shared rim controls
  // intentionally inert until artist calibration turns them on.
  rimMigration: 0, rimReach: 2.0, edgeEvaporation: 0,
  evapRate: 0.0015,
  absorptionCoupling: 0.0001, pigmentBoost: 1,
  // Water has no yield stress. Push it however gently and it flows, which is
  // why a wash levels itself out. The solver takes an early exit on 0, so this
  // row is not merely a small number - it is the untouched path.
  yieldStress: 0,
};

/**
 * Oil paint.
 *
 * Sourced from the archived oil engine spec and the oil material row carried
 * over in the harvest, not invented here. What the spec says oil IS, in the
 * order it matters:
 *
 *   It holds its shape until pushed.       -> yieldStress
 *   Its pigment never spreads on its own.  -> rimMigration 0, edgeDarkening 0
 *   It never wets the sheet.               -> absorptionCoupling 0
 *   It cures by oxidation over days.       -> openTime 48 h, evapRate near nil
 *   It is opaque and glossy.               -> kInstrument low, specular high
 *   It picks up what it is dragged through.-> upRate high [NOT WIRED - see
 *                                              BrushDef.upRate. Nothing reads
 *                                              it; oil does not pick up.]
 *
 * It stands up off the sheet as of 2026-08-24: `relief` is read by the
 * composite, which takes the slope of the film the same way it takes the
 * slope of the paper's tooth, so a bristle ridge throws a shadow and a wet
 * binder catches a highlight along its crest.
 *
 * [UNVERIFIED] Every value below is reasoned from the spec, not measured.
 */
export const OIL: WetMedium = {
  name: 'Oil Paint', slug: 'oil', collection: 'Oil', family: 'wet', pigments: [],
  physics: {
    // Ground coarser than watercolour and suspended in a thick binder, which is
    // most of why it holds a mark instead of levelling.
    pigmentParticleSize: 0.30, binderViscosity: 0.82, mediumHardness: 0,
    shearRate: 0.55, adhesionStrength: 0.88, compressiveYield: 1,
    specularPotential: 0.86, microReflectance: 0.42, refractiveIndex: 0.72,
  },
  k1: 0.03, k2: 0.65,
  // Wet oil is glossy. Watercolour sits at 1, fully matte; this is the other end.
  kInstrument: 0.25,
  /* An oil film never leaves within a session, and it IS the paint rather than
     a layer of solvent lying on it, so it should not be read as a wet puddle.
     Low but not zero: fresh oil is genuinely wetter-looking than cured oil.

     [MEASURED 2026-08-24] Worth recording what this did NOT do. It was built on
     the guess that the wet-film override was pinning oil at full gloss. It was
     not: a real oil stroke carries about 0.018 of film per wet cell, so the
     override was only ever pulling about a tenth of the way, and turning this
     row from 1 to 0.15 moved the painted result by one unit of blue in 255.
     The jelly was the sheen. Right in principle, idle in practice.
     [UNVERIFIED] */
  filmGloss: 0.15,
  // Truthfully declared and currently unread — see the note above. bodyShrink is
  // the spec's shrinkage on cure: a ridge sinks a little as the oil oxidises.
  relief: 26, bodyShrink: 0.85,
  // Oil covers. Two loaded strokes and the canvas is gone - which is what an
  // opaque paint is FOR, and what the artist reported missing on 2026-08-24:
  // "it should only take one, maybe two thick strokes to cover the canvas."
  // Starts deliberately strong. The artist's report on 2026-08-24 was that the
  // canvas "shows through at all levels, never disappears under the paint", and
  // the Cover dial is right there to bring it back down once it is visibly too
  // much. Erring quiet is what wasted the last two rounds.
  hidesGround: 3,
  downRate: 0.55, upRate: 0.42, teflonMin: 0.18,
  // 48 hours, straight off the harvested material row. Watercolour is 90
  // seconds. That ratio is the whole difference in how the two are worked.
  openTime: 172800,
  // Zero, and deliberately: watercolour deepens while wet and lifts as it
  // dries, acrylic is milky wet and cures darker, oil does neither.
  valueShift: 0,
  reactivatable: false, oneWayDoor: true,
  solvent: 'oil',
  // Thick and draggy. This is the ordinary resistance; yieldStress below is the
  // separate question of whether it moves at all.
  viscosity: 0.85, drag: 0.55,
  // It feels gravity, but rarely enough to clear its own yield stress. Piling
  // it up is what makes it slump, not tilting the board a little.
  gravityResponse: 0.22, wetLayerDrag: 0.15,
  // No ring, ever. Watercolour rings because water leaves the film at its
  // pinned edge and carries pigment out there; oil does not lose solvent to the
  // air at all, and famously leaves no ring. All three rim rows are off, which
  // also means the rim passes are skipped rather than run with small numbers.
  edgeDarkening: 0, rimMigration: 0, rimReach: 2.0, edgeEvaporation: 0,
  // It cures rather than evaporating, so this is not "how fast the water goes"
  // but how fast it stops being workable. 48 hours against watercolour's 90
  // seconds is the same 1920x, applied to watercolour's rate.
  evapRate: 0.0015 / 1920,
  // Never wets the sheet: OL-05 on the lab board, and the reason oil belongs on
  // a primed ground rather than on paper.
  absorptionCoupling: 0,
  pigmentBoost: 1,
  // The number that makes oil oil. Below this a face does not move at all.
  //
  // 0.34 is the value the sarasara lab arrived at for `RHEO-002` on its own oil
  // row, after artist sessions — the build the artist described as having "the
  // feel of actual oil". Not transplanted blindly: that solver gates a height
  // DIFFERENCE between neighbouring cells and this one gates a face drive, so
  // the two numbers are not the same quantity. But both are normalised 0..1
  // gates on whether the paint moves at all, the tuned one is six times the
  // guess, and the guess was visibly too fluid. Start where the artist landed.
  yieldStress: 0.34,
};

/** Every wet material, in the order the picker offers them. */
export const WET_MEDIA: WetMedium[] = [WATERCOLOR, OIL];


function physics(
  pigmentParticleSize: number, binderViscosity: number, mediumHardness: number,
  shearRate: number, adhesionStrength: number, compressiveYield: number,
  specularPotential: number, microReflectance: number, refractiveIndex: number,
): MediumPhysics {
  return {
    pigmentParticleSize, binderViscosity, mediumHardness, shearRate,
    adhesionStrength, compressiveYield, specularPotential, microReflectance, refractiveIndex,
  };
}

function graphite(name: string, slug: string, row: MediumPhysics,
                  deposition: number, velocityCoupling: number): GranularDry {
  return {
    name, slug, collection: 'Graphite', family: 'dry', kind: 'granular', form: 'encased',
    pigments: [['bone-black', 1]], physics: row,
    k1: 0.03, k2: 0.65, kInstrument: 0.45,
    relief: 0, bodyShrink: 0, hidesGround: 0, downRate: 1, upRate: 0, teflonMin: 1,
    openTime: 0, valueShift: 0, reactivatable: false, oneWayDoor: true,
    toothThreshold: 0.5, velocityCoupling, hardness: row.mediumHardness,
    tipRadius: 1.1, contactProfile: 'round', contactAspect: 1,
    tiltStart: 24, tiltAspect: 6, pressureExp: 1.1, deposition, edgeSharpness: 0.85,
    surfaceMobility: 0, compactionAmount: 1,
  };
}

/** The deliberately small pencil set requested for this dry-media pass. */
export const GRAPHITE_GRADES: GranularDry[] = [
  graphite('9B', 'graphite-9b', physics(0.10, 1, 0.08, 0.95, 0.80, 0.94, 0.45, 0.30, 0.62), 0.32, 0.35),
  graphite('2B', 'graphite-2b', physics(0.08, 1, 0.32, 0.68, 0.88, 0.88, 0.52, 0.34, 0.64), 0.22, 0.50),
  graphite('HB', 'graphite-hb', physics(0.06, 1, 0.55, 0.54, 0.92, 0.78, 0.42, 0.30, 0.66), 0.18, 0.62),
  graphite('2H', 'graphite-2h', physics(0.04, 1, 0.80, 0.32, 0.95, 0.64, 0.34, 0.24, 0.68), 0.15, 0.78),
];

function ballpoint(name: string, slug: string, pigment: string, deposition: number): InkMedium {
  return {
    name, slug, collection: 'Ink', family: 'dry', kind: 'ink', flowMode: 'ball', form: 'pen',
    pigments: [[pigment, 1]],
    physics: physics(0.02, 0.88, 0.72, 0.58, 0.98, 0.88, 0.25, 0.22, 0.70),
    k1: 0.03, k2: 0.65, kInstrument: 0.8,
    relief: 0, bodyShrink: 0, hidesGround: 0, downRate: 1, upRate: 0, teflonMin: 1,
    openTime: 0, valueShift: 0, reactivatable: false, oneWayDoor: true,
    toothThreshold: 0.42, velocityCoupling: 0.16, hardness: 0.72,
    tipRadius: 0.46, contactProfile: 'round', contactAspect: 1,
    tiltStart: 55, tiltAspect: 0.15, pressureExp: 0.25, deposition, edgeSharpness: 1.45,
    skipStrength: 0.72, skipScale: 5.5, chatter: 0.26,
  };
}

export const BALLPOINT_BLUE = ballpoint('Biro', 'ballpoint-blue', 'phthalo-blue-gs', 0.30);
export const BALLPOINT_BLACK = ballpoint('Biro K', 'ballpoint-black', 'bone-black', 0.42);

export const VINE_CHARCOAL: GranularDry = {
  name: 'Vine Charcoal', slug: 'vine-charcoal', collection: 'Charcoal', family: 'dry', form: 'stick', kind: 'granular', pigments: [['bone-black', 1]],
  physics: physics(0.72, 1, 0.05, 0.95, 0.62, 0.98, 0, 0.06, 0.52),
  k1: 0.03, k2: 0.65, kInstrument: 1, relief: 0, bodyShrink: 0, hidesGround: 0,
  downRate: 1, upRate: 0, teflonMin: 1, openTime: 0, valueShift: 0, reactivatable: false, oneWayDoor: true,
  toothThreshold: 0.38, velocityCoupling: 0.26, hardness: 0.05,
  tipRadius: 1.7, contactProfile: 'round', contactAspect: 1,
  tiltStart: 16, tiltAspect: 3.4, pressureExp: 1.25, deposition: 0.32, edgeSharpness: 0.62,
  surfaceMobility: 0, compactionAmount: 1,
};

export const CONTE_CRAYON: GranularDry = {
  name: 'Conte Crayon', slug: 'conte-crayon', collection: 'Conté', family: 'dry', form: 'stick', kind: 'granular', pigments: [['sanguine-sepia', 1]],
  physics: physics(0.48, 0.96, 0.46, 0.70, 0.86, 0.76, 0.16, 0.18, 0.60),
  k1: 0.03, k2: 0.65, kInstrument: 0.84, relief: 0, bodyShrink: 0, hidesGround: 0,
  downRate: 1, upRate: 0, teflonMin: 1, openTime: 0, valueShift: 0, reactivatable: false, oneWayDoor: true,
  toothThreshold: 0.44, velocityCoupling: 0.42, hardness: 0.46,
  // Square end upright; the long rectangular side arrives with tilt or Lay Flat.
  tipRadius: 1.15, contactProfile: 'chisel', contactAspect: 1,
  tiltStart: 16, tiltAspect: 7, pressureExp: 1.05, deposition: 0.26, edgeSharpness: 0.86,
  // [UNVERIFIED] Tuned first against the artist's supplied reference range.
  // A low first pass stays gritty; later contact exchanges loose particles,
  // while a dense passage progressively locks itself down.
  surfaceMobility: 0.18, compactionAmount: 0.32,
};

export const WAX_CRAYON: GranularDry = {
  name: 'Wax Crayon', slug: 'wax-crayon', collection: 'Wax crayon', family: 'dry', form: 'stick', kind: 'granular', pigments: [['bone-black', 1]],
  physics: physics(0.38, 0.56, 0.30, 0.42, 0.94, 0.82, 0.65, 0.44, 0.72),
  k1: 0.03, k2: 0.65, kInstrument: 0.46, relief: 0, bodyShrink: 0, hidesGround: 0,
  downRate: 1, upRate: 0, teflonMin: 1, openTime: 0, valueShift: 0, reactivatable: false, oneWayDoor: true,
  toothThreshold: 0.32, velocityCoupling: 0.22, hardness: 0.30,
  tipRadius: 1.8, contactProfile: 'round', contactAspect: 1.3,
  tiltStart: 14, tiltAspect: 2.8, pressureExp: 0.86, deposition: 0.28, edgeSharpness: 1.12,
  surfaceMobility: 0, compactionAmount: 1,
};

export const FOUNTAIN_CHISEL: InkMedium = {
  name: 'Chisel Fountain', slug: 'fountain-chisel', collection: 'Ink', family: 'dry', form: 'pen', kind: 'ink', flowMode: 'fountain',
  pigments: [['bone-black', 1]], physics: physics(0.01, 0.14, 0, 1, 0.97, 1, 0.38, 0.30, 0.70),
  k1: 0.03, k2: 0.65, kInstrument: 0.62, relief: 0, bodyShrink: 0, hidesGround: 0,
  downRate: 1, upRate: 0, teflonMin: 1, openTime: 0, valueShift: 0, reactivatable: false, oneWayDoor: true,
  toothThreshold: 0.08, velocityCoupling: 0.04, hardness: 0,
  tipRadius: 0.52, contactProfile: 'chisel', contactAspect: 3.6,
  tiltStart: 89, tiltAspect: 0, pressureExp: 0.45, deposition: 0.34, edgeSharpness: 1.8,
  skipStrength: 0, skipScale: 1, chatter: 0,
};

export const DRY_MEDIA: DryRow[] = [
  ...GRAPHITE_GRADES, BALLPOINT_BLUE, BALLPOINT_BLACK,
  VINE_CHARCOAL, CONTE_CRAYON, WAX_CRAYON, FOUNTAIN_CHISEL,
];

export const DRY_TOOLS: Tool<DryRow>[] = DRY_MEDIA.map((m) => ({ name: m.name, slug: m.slug, medium: m }));
