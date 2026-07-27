// Paper substrates as data rows (Card 8). Tooth, sizing, capillary radius r_c.
// Each sheet is a row of numbers, exactly like a pigment or a brush — adding a
// new paper later is a new entry, not new code. Canvas (r_c = 0) is future.
//
// r_c ranges from Y13: ~2.5e-5 (hot press) to ~2.5e-4 (rough). Tooth amplitude
// and feature frequency are the height-field knobs the paper.wgsl generator reads.

export interface Paper {
  name: string;
  slug: string;
  toothAmp: number;    // 0..1 peak-to-valley amplitude of the tooth
  featureFreq: number; // grain features across the sheet
  sizing: number;      // 0 unsized .. 1 gelatin-sized
  rc: number;          // capillary radius (absorptiveness dial), metres
  cMin: number;        // fluid capacity range (C97 c = h*(cMax-cMin)+cMin)
  cMax: number;
}

export const PAPERS: Paper[] = [
  {
    name: 'Hot Press', slug: 'hot-press',
    toothAmp: 0.16, featureFreq: 220, sizing: 0.85, rc: 2.5e-5,
    cMin: 0.3, cMax: 0.8,
  },
  {
    name: 'Cold Press', slug: 'cold-press',
    toothAmp: 0.45, featureFreq: 130, sizing: 0.6, rc: 1.0e-4,
    cMin: 0.4, cMax: 1.0,
  },
  {
    name: 'Rough', slug: 'rough',
    toothAmp: 0.85, featureFreq: 78, sizing: 0.4, rc: 2.5e-4,
    cMin: 0.5, cMax: 1.2,
  },
];

export const PAPER_BY_SLUG = new Map(PAPERS.map((p) => [p.slug, p]));
