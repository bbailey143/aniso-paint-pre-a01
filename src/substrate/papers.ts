// Paper substrates as data rows (Card 8). Tooth, sizing, capillary radius r_c.
// Each sheet is a row of numbers, exactly like a pigment or a brush — adding a
// new paper later is a new entry, not new code. Canvas arrived as exactly that:
// r_c = 0, so nothing soaks in, and a woven tooth instead of a felted one.
//
// r_c ranges from Y13: ~2.5e-5 (hot press) to ~2.5e-4 (rough). Tooth amplitude
// and feature frequency are the height-field knobs the paper.wgsl generator reads.

export interface Paper {
  name: string;
  slug: string;
  /** Artist-facing library path. These are data, not a separate surface engine. */
  family: 'Watercolor' | 'Dry Media' | 'Canvas' | 'Reference';
  collection: string;
  /**
   * Shared surface character, used by both the baked tooth and visible relief.
   * Paper is noise; canvas is woven, and a weave is a different kind of surface
   * rather than a rougher grade of the same one.
   */
  grainKind: 'watercolor' | 'pastel' | 'canvas' | 'smooth';
  /** Short texture reading shown in the material picker. */
  grainStyle: string;
  /** The displayed sheet tone, used by the canvas composite and Water View. */
  tone: readonly [number, number, number];
  /** Honest material guidance, surfaced by Inspect rather than a prohibition. */
  wetSuitability: string;
  toothAmp: number;    // 0..1 peak-to-valley amplitude of the tooth
  featureFreq: number; // grain features across the sheet
  sizing: number;      // 0 unsized .. 1 gelatin-sized
  rc: number;          // capillary radius (absorptiveness dial), metres
  /** Extra capillary appetite. 1 preserves the watercolour baseline; a dry
   * sheet can pull a wash down into its fibres much faster without changing
   * how every watercolour sheet behaves. */
  waterUptake: number;
  cMin: number;        // fluid capacity range (C97 c = h*(cMax-cMin)+cMin)
  cMax: number;
}

/**
 * Primed canvas. Two weights of the same idea.
 *
 * The defining number is `rc: 0`. A sized, primed ground has no capillary
 * radius worth speaking of - nothing is drawn into it - which is why oil sits
 * on top and why water beads and refuses to behave on it. Every other sheet in
 * this file drinks; these two do not.
 *
 * The tooth is the tooth of a PRIMED ground, which is much shallower than the
 * raw fabric: gesso fills the weave and leaves the pattern visible rather than
 * open. The first pass had cotton duck at 0.55, deeper than cold-press
 * watercolour paper and most of the way to rough - and the fluid pass pushes
 * film downhill into the tooth, so a wrongly deep weave drags the paint into
 * the hollows and spreads it thin. It reads exactly as though the canvas were
 * drinking, when in fact nothing on a primed ground absorbs anything at all
 * (rc = 0 gives literally zero uptake - see capillary_flow.wgsl).
 *
 * [UNVERIFIED] Thread counts and tooth are chosen to read correctly, not
 * measured. `featureFreq` is threads across the sheet.
 */
/**
 * A flat white surface, and nothing else.
 *
 * Not a paper anyone sells — a reference. Every other sheet in this file has a
 * character of its own, and every one of them has at some point been mistaken
 * for something the PAINT was doing: the weave stamped into a stroke, the
 * tooth breaking a mark up, the grain lit into a lattice. On this one there is
 * nothing to mistake. What you see is the paint.
 *
 * Deliberately identical to cold press in every way except the two that make it
 * a reference — perfectly smooth, and white. It drinks the same, it is sized
 * the same, it holds the same. Change one thing at a time or the comparison is
 * worth nothing.
 *
 * `grainKind: 'smooth'` is a real branch, not `toothAmp: 0`. The generator
 * keeps a baseline grain that amplitude alone never reaches: at toothAmp 0 the
 * height still runs 0.3 to 0.7, which is a shallow tooth, not a flat surface.
 */
export const FLAT_WHITE: Paper = {
  name: 'Flat White', slug: 'flat-white', family: 'Reference', collection: 'Reference',
  grainKind: 'smooth', grainStyle: 'No texture at all', tone: [1, 1, 1],
  wetSuitability: 'A reference surface — cold press without the tooth',
  toothAmp: 0, featureFreq: 1, sizing: 0.6, rc: 1.0e-4, waterUptake: 1,
  cMin: 0.4, cMax: 1.0,
};

export const CANVASES: Paper[] = [
  {
    name: 'Cotton Duck', slug: 'canvas-duck', family: 'Canvas', collection: 'Canvas', grainKind: 'canvas',
    grainStyle: 'Coarse open weave', tone: [0.94, 0.92, 0.87],
    wetSuitability: 'Primed — takes oil, refuses water',
    toothAmp: 0.30, featureFreq: 64, sizing: 1, rc: 0, waterUptake: 1,
    cMin: 0.2, cMax: 0.6,
  },
  {
    name: 'Fine Linen', slug: 'canvas-linen', family: 'Canvas', collection: 'Canvas', grainKind: 'canvas',
    grainStyle: 'Fine even weave', tone: [0.92, 0.90, 0.84],
    wetSuitability: 'Primed — takes oil, refuses water',
    toothAmp: 0.16, featureFreq: 118, sizing: 1, rc: 0, waterUptake: 1,
    cMin: 0.2, cMax: 0.6,
  },
];

export const PAPERS: Paper[] = [
  {
    name: 'Smooth Texture', slug: 'hot-press', family: 'Watercolor', collection: 'Hot Press', grainKind: 'watercolor',
    grainStyle: 'Smooth texture', tone: [0.94, 0.93, 0.89], wetSuitability: 'Excellent for watercolour',
    toothAmp: 0.16, featureFreq: 220, sizing: 0.85, rc: 2.5e-5, waterUptake: 1,
    cMin: 0.3, cMax: 0.8,
  },
  {
    name: 'Medium Texture', slug: 'cold-press', family: 'Watercolor', collection: 'Cold Press', grainKind: 'watercolor',
    grainStyle: 'Medium texture', tone: [0.93, 0.92, 0.88], wetSuitability: 'Excellent for watercolour',
    toothAmp: 0.45, featureFreq: 130, sizing: 0.6, rc: 1.0e-4, waterUptake: 1,
    cMin: 0.4, cMax: 1.0,
  },
  {
    name: 'Rough Texture', slug: 'rough', family: 'Watercolor', collection: 'Rough', grainKind: 'watercolor',
    grainStyle: 'Rough texture', tone: [0.91, 0.89, 0.84], wetSuitability: 'Expressive watercolour texture',
    toothAmp: 0.85, featureFreq: 78, sizing: 0.4, rc: 2.5e-4, waterUptake: 1,
    cMin: 0.5, cMax: 1.2,
  },
  // The selected pastel samples share a felted, fibrous tooth. The physical
  // numbers are deliberately one reusable dry-media row, not colour-specific
  // behaviour. Their low sizing/high uptake is [UNVERIFIED] until artist hand
  // tests; it makes watercolour difficult without forbidding it.
  ...([
    ['Charcoal', 'pastel-charcoal', [0.216, 0.204, 0.212]],
    ['Night Blue', 'pastel-night-blue', [0.369, 0.384, 0.471]],
    ['Warm Slate', 'pastel-warm-slate', [0.557, 0.529, 0.510]],
    ['Dusty Rose', 'pastel-dusty-rose', [0.604, 0.545, 0.545]],
    ['Natural', 'pastel-natural', [0.639, 0.616, 0.592]],
    ['Light Grey', 'pastel-light-grey', [0.851, 0.847, 0.851]],
    ['Ivory', 'pastel-ivory', [0.933, 0.922, 0.875]],
    ['White', 'pastel-white', [0.933, 0.933, 0.929]],
  ] as const)
    .map(([name, slug, tone]): Paper => ({
      name, slug, tone, family: 'Dry Media', collection: 'Pastel', grainKind: 'pastel',
      grainStyle: 'Soft fibrous pastel tooth',
      wetSuitability: 'Poor for water — low sizing, high uptake',
      // Dry, unsized fibre drinks a wet wash quickly. This is deliberately
      // shared by every pastel tone: colour changes the sheet, not its water.
      toothAmp: 0.65, featureFreq: 112, sizing: 0.25, rc: 2.5e-4, waterUptake: 6,
      cMin: 0.5, cMax: 1.2,
    })),
  ...CANVASES,
  FLAT_WHITE,
];

export const PAPER_BY_SLUG = new Map(PAPERS.map((p) => [p.slug, p]));

/** 0 = watercolour noise, 1 = felted pastel fibre, 2 = woven canvas,
 *  3 = nothing at all. The paper generator and the composite both read this,
 *  and must agree. */
export const GRAIN_KIND: Record<Paper['grainKind'], number> = {
  watercolor: 0, pastel: 1, canvas: 2, smooth: 3,
};
