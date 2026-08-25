/* What the fill actually buys. Rasterises the contact footprint of the current
 * tuft and the proposed one at the same frame of the same recorded action, and
 * reports how much of the mark's own outline is actually inked. A shell inks a
 * rim; a bundle inks the inside. */
import fs from 'fs';
import { drawTuft, hairPath, nowHair } from './tuft-fill.js';
import { SPECS, bundleRadius } from './tuft-specs.js';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));

const film = JSON.parse(fs.readFileSync(path.join(HERE, 'tuft-carrier.json'), 'utf8'));
const SLAB = 0.55;

function hull(pts) {
  if (pts.length < 3) return pts;
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}
const polyArea = (h) => {
  let a = 0;
  for (let i = 0; i < h.length; i++) { const j = (i + 1) % h.length; a += h[i][0] * h[j][1] - h[j][0] * h[i][1]; }
  return Math.abs(a) / 2;
};

/** Ink the in-slab points onto a fine grid and report covered area. */
function ink(points, r) {
  if (!points.length) return { inked: 0, hull: 0, frac: 0, n: 0 };
  const CELL = 0.15;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  x0 -= r + CELL; x1 += r + CELL; y0 -= r + CELL; y1 += r + CELL;
  const W = Math.ceil((x1 - x0) / CELL), H = Math.ceil((y1 - y0) / CELL);
  const grid = new Uint8Array(W * H);
  const rc = Math.ceil(r / CELL);
  for (const p of points) {
    const cx = Math.round((p[0] - x0) / CELL), cy = Math.round((p[1] - y0) / CELL);
    for (let dy = -rc; dy <= rc; dy++) for (let dx = -rc; dx <= rc; dx++) {
      if (dx * dx + dy * dy > rc * rc) continue;
      const gx = cx + dx, gy = cy + dy;
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
      grid[gy * W + gx] = 1;
    }
  }
  /* Only count ink INSIDE the mark's own outline. Disks drawn around the
     boundary points spill outward by a radius, and with a fatter bundle hair
     that band alone can read as more than 100% coverage — which measures the
     brush's edge, not whether its middle is hollow. */
  const H2 = hull(points.map((p) => [p[0], p[1]]));
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = H2.length - 1; i < H2.length; j = i++) {
      if ((H2[i][1] > y) !== (H2[j][1] > y) &&
          x < (H2[j][0] - H2[i][0]) * (y - H2[i][1]) / (H2[j][1] - H2[i][1]) + H2[i][0]) c = !c;
    }
    return c;
  };
  let on = 0;
  for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
    if (!grid[gy * W + gx]) continue;
    if (inside(x0 + gx * CELL, y0 + gy * CELL)) on++;
  }
  const A = polyArea(H2);
  const inked = on * CELL * CELL;
  return { inked, hull: A, frac: A > 0 ? inked / A : 0, n: points.length };
}

const FRAMES = { press: 20, pull: 25, light: 8 };

for (const slug of Object.keys(film)) {
  const b = film[slug];
  const spec = { ...SPECS[slug], halfWidth: 0.5 * b.def.widthRatio * b.tuftLength };
  const hairs = drawTuft(spec);
  const radNew = bundleRadius(spec, spec.halfWidth);
  const radNow = b.hairRadiusNow;

  console.log(`\n${b.def.name}  tuft ${b.tuftLength} cells, blade half-width ${spec.halfWidth.toFixed(2)}`);
  console.log(`  hairs   now ${b.hairCountNow} at r=${radNow}   proposed ${spec.count} at r=${radNew.toFixed(3)}`);

  for (const [label, fi] of Object.entries(FRAMES)) {
    const f = b.frames[fi];
    const J = b.def.segments + 1;
    const splay = 1 + b.def.splayFromPressure * (f.contact / (b.spineCount * J));

    // Current: joints only, exactly as emitFootprint walks them.
    const nowPts = [];
    for (let i = 0; i < b.def.bristles; i++) {
      const h = nowHair(f, b.def, b.tuftLength, i, splay);
      for (let s = 0; s < J; s++) if (h[s * 3 + 2] <= SLAB) nowPts.push([h[s * 3], h[s * 3 + 1]]);
    }
    // Proposed: same idea, walked at the same J stations so it is like for like.
    const newPts = [];
    for (const hr of hairs) {
      const p = hairPath(f, spec, hr, J - 1);
      for (let s = 0; s < J; s++) if (p[s * 3 + 2] <= SLAB) newPts.push([p[s * 3], p[s * 3 + 1]]);
    }
    const A = ink(nowPts, radNow), B = ink(newPts, radNew);
    console.log(`  ${label.padEnd(6)} f${String(fi).padStart(2)} p=${f.pressure}  ` +
      `now ${String(A.n).padStart(4)} pts, ${(A.frac * 100).toFixed(0).padStart(3)}% of its outline inked (${A.inked.toFixed(1)} of ${A.hull.toFixed(1)} cells)  |  ` +
      `proposed ${String(B.n).padStart(4)} pts, ${(B.frac * 100).toFixed(0).padStart(3)}% (${B.inked.toFixed(1)} of ${B.hull.toFixed(1)})`);
  }
}
