// The media library — rows, not code (Card 7, D3).
//
// [UNVERIFIED] Every numeric constant in this file is reasoned from the card's
// property surface, not measured. Card 7 is explicit that the SHAPE of each row
// is settled but the numbers are tuned on the bench against 09-acceptance.md.
// They stay marked until that happens. Do not cite them as sourced.
//
// The pigment choices are not invented: they name rows in the measured BE16
// library (D5). Graphite is laid as bone black, a ballpoint as phthalo blue.

import type { WetMedium, GranularDry, InkMedium, Tool } from './types';

type DryRow = GranularDry | InkMedium;

export const WATERCOLOR: WetMedium = {
  name: 'Watercolour', slug: 'watercolour', family: 'wet',
  pigments: [],                     // the palette supplies these
  k1: 0.03, k2: 0.65, kInstrument: 1.0,
  hasBody: false, bodyShrink: 0,
  downRate: 0.35, upRate: 0.08, teflonMin: 0.02,
  openTime: 90, valueShift: 0.18,   // dries lighter, Card 7 says 10-30 %
  reactivatable: true, oneWayDoor: false,
  solvent: 'water', viscosity: 0.1, evapRate: 0.0015,
  absorptionCoupling: 1.0, pigmentBoost: 1.0,
};

/**
 * Graphite, one row per grade.
 *
 * `hardness` runs -1 (6B) to +1 (4H) and is the ONLY thing that differs between
 * these five. That is the card's claim made literal: a new grade is a number,
 * not a code path. Everything downstream reads `hardness` — how deep the lead
 * reaches into the tooth, and how much it leaves.
 */
function graphite(name: string, slug: string, hardness: number): GranularDry {
  return {
    name, slug, family: 'dry', kind: 'granular',
    pigments: [['bone-black', 1]],
    // Graphite is not matte — it has that grey sheen, which is a LOW
    // K_instrument. This is the one place a pencil differs optically from paint
    // and it is why a heavy 6B passage glares when you tilt the page.
    k1: 0.03, k2: 0.65, kInstrument: 0.45,
    hasBody: false, bodyShrink: 0,
    downRate: 1.0, upRate: 0.0, teflonMin: 1.0,
    openTime: 0, valueShift: 0,
    reactivatable: false, oneWayDoor: true,

    toothThreshold: 0.5,
    // A soft lead crumbles onto the paper whatever the speed; a hard one skips.
    velocityCoupling: 0.55 + 0.25 * hardness,
    hardness,
    particleSize: 0.5 - 0.3 * hardness,
    // A pencil point covers about two document pixels, which on the coarser
    // simulation grid is a bit over one cell. Below ~1 cell the mark cannot
    // land on a cell centre and the line thins out to nothing.
    tipRadius: 1.1,
    tiltWiden: 2.6,               // laid over, a pencil draws with the flank
    pressureExp: 1.1,
    // Gamma on coverage. Graphite genuinely feathers — loose particles sit
    // around a mark — so spread the rim slightly.
    edgeSharpness: 0.85,
    // Soft leads lay far more per pass. 6B ~4x an HB, 4H well under it.
    // [UNVERIFIED] Calibrated on the bench to 09-acceptance, not measured from
    // a source: a slow firm HB line reads ~0.25 laid, which renders as a real
    // pencil grey rather than the faint smear the first pass produced.
    deposition: 0.10 * Math.pow(2.2, -hardness),
  };
}

export const GRAPHITE_GRADES: GranularDry[] = [
  graphite('6B', 'graphite-6b', -1.0),
  graphite('2B', 'graphite-2b', -0.5),
  graphite('HB', 'graphite-hb', 0.0),
  graphite('2H', 'graphite-2h', 0.5),
  graphite('4H', 'graphite-4h', 1.0),
];

/**
 * Ballpoint.
 *
 * `[CORRECTED on reference]` The first row here made a biro ignore the paper
 * entirely — high `reach`, near-zero `velocityCoupling` — on the reasoning that
 * a ballpoint's line is famously consistent. Bartford's reference lines say
 * otherwise, and they are right: a ballpoint **skips the low points and marks
 * solidly on the high ones**, and nearly every one has a slight stutter that
 * gives the line its organic thick-and-thin. That variation is the character of
 * the tool, not a defect in it.
 *
 * Two independent mechanisms, because that is what is actually happening:
 *
 *   `toothThreshold` — the ball is hard and rides the peaks, so it cannot reach
 *   into the valleys at all. Position-dependent: go over the same spot twice
 *   and the same specks stay blank.
 *
 *   `skipStrength` / `skipScale` / `chatter` — the paste starves and recovers
 *   as the ball rolls. Distance-dependent, so a second pass fills what the
 *   first missed, exactly as it does on paper.
 *
 * `[UNVERIFIED]` No card supplies a ball-transfer model, so the numbers below
 * are fitted to the reference lines by eye and marked accordingly.
 */
function ballpoint(name: string, slug: string, pigment: string,
                   deposition: number): InkMedium {
  return {
    name, slug, family: 'dry', kind: 'ink',
    pigments: [[pigment, 1]],
    // Ballpoint paste dries to a slight sheen, unlike graphite's flat grey.
    k1: 0.03, k2: 0.65, kInstrument: 0.8,
    hasBody: false, bodyShrink: 0,
    downRate: 1.0, upRate: 0.0, teflonMin: 1.0,
    openTime: 0, valueShift: 0,
    reactivatable: false, oneWayDoor: true,

    // The ball rides the peaks. This is what makes it skip.
    toothThreshold: 0.42,
    velocityCoupling: 0.16,
    hardness: 0.0,
    particleSize: 0.1,
    // A ballpoint ball is 0.5-1.0 mm. At size 1 that is about half a
    // simulation cell, and the smallest setting has to be finer still.
    tipRadius: 0.46,
    tiltWiden: 0.25,             // a biro does not care how you hold it
    pressureExp: 0.25,           // near-flat pressure response — that part was right
    deposition,
    // Crisp. Above 1 tightens the rim: ink is a paste and stops where the ball
    // stopped. The soft rim is what made it read as WET rather than as paste.
    edgeSharpness: 1.45,

    // Deep but rare — see the shaping in dry-tool.ts.
    skipStrength: 0.88,
    skipScale: 5.5,
    chatter: 0.4,
  };
}

// Blue reads lighter than black at the same load — classic biro blue is a
// green-shade phthalo, which is why it looks slightly cyan next to ink black.
export const BALLPOINT_BLUE = ballpoint('Biro', 'ballpoint-blue', 'phthalo-blue-gs', 0.30);
export const BALLPOINT_BLACK = ballpoint('Biro K', 'ballpoint-black', 'bone-black', 0.42);

export const DRY_MEDIA: DryRow[] = [...GRAPHITE_GRADES, BALLPOINT_BLUE, BALLPOINT_BLACK];

/** The tool rack. Wet tools drive the brush engine; dry tools deposit direct. */
export const DRY_TOOLS: Tool<DryRow>[] = DRY_MEDIA.map((m) => ({
  name: m.name, slug: m.slug, medium: m,
}));
