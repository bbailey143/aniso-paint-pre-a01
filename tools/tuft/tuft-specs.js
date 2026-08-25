/* The proposed tuft rows.
 *
 * These are chosen, not measured — the same standing the brush library's own
 * numbers have. What IS measured is what they produce, which is the point of
 * putting them next to the current ones rather than just asserting them.
 *
 * Read them as a description of the tool: a sable is well-dressed hair that
 * points, a hog is coarse bristle cut blunt, and every row below is one or the
 * other of those two sentences.
 */
export const SPECS = {
  'round-sable': {
    count: 96,          // was 28, and those 28 were a ring
    section: 2,         // a circle
    thickRatio: 1.0,    // round: the two axes are the same
    convW: 0.10, convT: 0.10,   // it points, and that is what a round is for
    bulge: 1.18, bellyAt: 0.33, // a sable's belly is well below the ferrule
    rootJitter: 0.55,
    lenVar: 0.10,       // dressed hair: nearly all the same length
    bendVar: 0.18,
    convVar: 0.20,
    strayFrac: 0.05, strayAmt: 0.55,
    seed: 0x5AB1E,
  },
  'flat-sable': {
    count: 120,         // was 34, in a two-deep sheet
    section: 3,         // a rounded rectangle: full thickness across, corners eased
    thickRatio: 0.18,   // a chisel is thin, but it is not a ribbon
    convW: 0.92,        // a flat keeps its width to the very edge
    convT: 0.12,        // ...and comes to a chisel edge through its thickness
    bulge: 1.06, bellyAt: 0.30,
    rootJitter: 0.55,
    lenVar: 0.10,
    bendVar: 0.18,
    convVar: 0.20,
    strayFrac: 0.05, strayAmt: 0.50,
    seed: 0xF1A7,
  },
  'flat-hog': {
    count: 72,          // was 22
    section: 3,
    thickRatio: 0.30,   // bristle is fatter; a hog is a chunky tool
    convW: 0.98,
    convT: 0.55,        // cut blunt, not dressed to an edge
    bulge: 1.02, bellyAt: 0.30,
    rootJitter: 0.70,   // coarse hair is not laid in neatly
    lenVar: 0.26,       // and it is not all the same length either
    bendVar: 0.30,
    convVar: 0.30,
    strayFrac: 0.12, strayAmt: 0.60,   // hogs have stray bristles. Everyone knows this.
    seed: 0xB0A2,
  },
};

/** How thick one drawn hair is, in cells. A drawn hair stands for a bundle of
 *  real ones, so its thickness follows the SPACING of the bundle rather than a
 *  hair count — pack more in and each one gets finer, and the tuft covers the
 *  same ground either way. */
export function bundleRadius(spec, halfWidth, overlap = 1.15) {
  // Area of the unit section, integrated rather than assumed (n = 3 is not an ellipse).
  let a = 0;
  const N = 2048;
  for (let i = 0; i < N; i++) {
    const th = (i + 0.5) / N * Math.PI * 2;
    const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
    const r = spec.section === 2 ? 1 : Math.pow(Math.pow(c, spec.section) + Math.pow(s, spec.section), -1 / spec.section);
    a += 0.5 * r * r * (Math.PI * 2 / N);
  }
  const area = a * halfWidth * halfWidth * spec.thickRatio;
  // Mean spacing is sqrt(area per hair); disks that just touch have half that.
  return 0.5 * Math.sqrt(area / spec.count) * overlap;
}
