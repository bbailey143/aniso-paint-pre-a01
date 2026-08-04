// Paper substrates as data rows (Card 8). Tooth, sizing, capillary radius r_c.
// Each sheet is a row of numbers, exactly like a pigment or a brush — adding a
// new paper later is a new entry, not new code. Canvas (r_c = 0) is future.
//
// r_c ranges from Y13: ~2.5e-5 (hot press) to ~2.5e-4 (rough). Tooth amplitude
// and feature frequency are the height-field knobs the paper.wgsl generator reads.

export interface Paper {
  name: string;
  slug: string;
  /** Artist-facing library path. These are data, not a separate surface engine. */
  family: 'Watercolor' | 'Dry Media';
  collection: string;
  /** Shared surface character, used by both the baked tooth and visible relief. */
  grainKind: 'watercolor' | 'pastel';
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
];

export const PAPER_BY_SLUG = new Map(PAPERS.map((p) => [p.slug, p]));
