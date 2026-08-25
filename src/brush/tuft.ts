// The tuft — where the hairs sit, and how they differ from each other.
//
// A tuft is a BUNDLE, not a shell. Before this file, a round brush put every
// hair on one circle and left the middle empty, and a flat brush strung every
// hair along one straight line two rows deep. Both were perfectly regular, and
// both were identical on every stroke ever painted.
//
// [MEASURED, docs/14 E2/E4] Of the area a round sable's own mark covered, only
// 26% had paint in it — the rest was the empty middle of the ring. And the two
// flats laid hair tracks with 0% variation in their spacing: not approximately
// even, exactly even, to the last decimal, forever. A perfectly regular comb
// dragged over a textured surface is how you manufacture a repeating pattern.
//
// Nothing here is simulated. The hairs are geometry riding the solved spines,
// as they always were; what changed is WHERE they ride and how much they differ.

import type { BrushDef } from './types';
import type { Spine } from './spine';

/** The manufactured shape of a tuft: how its hairs are packed and dressed. */
export interface TuftDef {
  /**
   * Cross-section shape. 2 is a circle, for a round tuft. 3 is a rounded
   * rectangle, which is the section a chisel-cut flat actually has: near full
   * thickness right across the blade, easing off only at the two corners. A
   * plain ellipse would thin the whole blade toward its ends and lose the
   * corners, and the corners are the part of a flat you draw a line with.
   */
  section: number;
  /** Blade thickness as a share of its width. 1 for a round tuft. */
  thickRatio: number;
  /** How far the section closes toward the tip, across the blade. */
  convW: number;
  /** ...and through its thickness. A chisel keeps its width and loses its
   *  thickness; a round loses both; a hog is cut blunt and loses little. */
  convT: number;
  /** How much fuller the belly is than the ferrule, and where it sits. */
  bulge: number;
  bellyAt: number;
  /** How far roots are knocked off the packing lattice, in mean spacings.
   *  Zero is the grating this file exists to break. */
  rootJitter: number;
  /** Spread of hair lengths. This is the row that decides what a light touch
   *  does: with it, only the longest hairs are down, so the mark is a scatter
   *  of separate lines rather than the whole tuft arriving at once. */
  lenVar: number;
  /** Spread of hair stiffness. A hair is placed by blending its rest line
   *  toward the solved spine; blending PAST the spine gives one that lies over
   *  further, short of it one that stands up. */
  bendVar: number;
  /** Spread in how well each hair points. */
  convVar: number;
  /** The hairs the dresser missed, and how far out they sit. A few per brush,
   *  and they are what leaves a line outside the mark. */
  strayFrac: number;
  strayAmt: number;
  /** Fixed, so a brush is the same brush every time it is picked up. A real
   *  brush does not rearrange its own hairs between strokes. */
  seed: number;
}

/** One hair, drawn once when the brush is built. */
export interface Hair {
  /** Root position in section space: a across the blade, b through it, -1..1. */
  a: number;
  b: number;
  /** Where this hair ends, as a fraction of the tuft. */
  short: number;
  /** How far it follows the spine's bend. Past 1 lies over further. */
  bend: number;
  /** How well it points, as a multiplier on the section's convergence. */
  conv: number;
  /** True for the few that missed the dresser. */
  stray: boolean;
  strayA: number;
  strayB: number;
}

/* A small fixed-seed generator. Not for cryptography — for a brush that is the
   same brush tomorrow. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

/** Section radius at an angle, for a rounded-rectangle cross-section. */
function sectionR(ang: number, n: number): number {
  if (n === 2) return 1;
  const c = Math.abs(Math.cos(ang)), s = Math.abs(Math.sin(ang));
  return Math.pow(Math.pow(c, n) + Math.pow(s, n), -1 / n);
}

/** Belly-to-tip profile: 1 at the ferrule, fuller at the belly, closing at the tip. */
export function bellyAt(t: number, conv: number, bulge: number, at: number): number {
  return t < at
    ? 1 + (bulge - 1) * smooth(t / at)
    : bulge + (conv - bulge) * smooth((t - at) / (1 - at));
}

/**
 * Draw the hairs of one tuft, once, when the brush is built.
 *
 * Roots are placed on a sunflower spiral, which fills a section evenly with no
 * rings and no seams — a concentric-ring layout puts hairs in circles, and
 * circles are exactly the periodic structure that keeps turning up in the
 * marks. Then every one is knocked off that lattice, because a spiral is still
 * a pattern.
 */
export function drawTuft(def: TuftDef, count: number): Hair[] {
  const r = rng(def.seed);
  const hairs: Hair[] = [];
  const jitR = def.rootJitter / Math.sqrt(count);

  for (let i = 0; i < count; i++) {
    const rr = Math.sqrt((i + 0.5) / count);
    const th = i * GOLDEN;
    const sr = sectionR(th, def.section);
    let a = rr * Math.cos(th) * sr;
    let b = rr * Math.sin(th) * sr * def.thickRatio;

    const ja = r() * Math.PI * 2, jd = Math.sqrt(r()) * jitR;
    a += Math.cos(ja) * jd;
    b += Math.sin(ja) * jd * def.thickRatio;

    const stray = r() < def.strayFrac;
    const sang = r() * Math.PI * 2;
    const smag = stray ? def.strayAmt * (0.4 + 0.6 * r()) : 0;

    hairs.push({
      a, b,
      short: 1 - def.lenVar * Math.pow(r(), 1.6),
      bend: 1 + def.bendVar * (r() * 2 - 1),
      conv: 1 + def.convVar * (r() * 2 - 1),
      stray,
      strayA: Math.cos(sang) * smag,
      strayB: Math.sin(sang) * smag,
    });
  }
  return hairs;
}

/**
 * How thick one drawn hair is, in cells.
 *
 * A drawn hair stands for a BUNDLE of real ones, so its thickness follows the
 * spacing of the packing rather than the count: pack more in and each gets
 * finer, and the tuft covers the same ground either way.
 *
 * [MEASURED, docs/14 E4] Swept 40 through 180 hairs and the share of the mark
 * with paint in it stayed between 65% and 90% at every count. So the count is a
 * cost-and-fineness decision; it is not what fixes a hollow brush. Where the
 * roots sit is.
 */
export function bundleRadius(def: TuftDef, count: number, halfWidth: number, overlap = 1.15): number {
  // Area of the unit section, integrated rather than assumed — a rounded
  // rectangle is not an ellipse and does not have an ellipse's area.
  let a = 0;
  const N = 512;
  for (let i = 0; i < N; i++) {
    const th = ((i + 0.5) / N) * Math.PI * 2;
    const rr = sectionR(th, def.section);
    a += 0.5 * rr * rr * ((Math.PI * 2) / N);
  }
  const area = a * halfWidth * halfWidth * def.thickRatio;
  // Mean spacing is the square root of the area each hair gets; discs that just
  // touch have half that.
  return 0.5 * Math.sqrt(area / Math.max(1, count)) * overlap;
}

/* ------------------------------------------------------------------------- */
/* Placing a hair on the solved spines.                                       */

const lerp = (p: number, q: number, u: number) => p + (q - p) * u;

export interface HairPoint { x: number; y: number; z: number }

/**
 * Where hair `h` is, at station `s` of `stations`, on this tuft right now.
 *
 * `spines` are solved; each carries the straight rest line it was solved from.
 * A hair is placed by blending the rest line toward the solved spine by its own
 * stiffness, then stepping off into the section. Blending past 1 gives a hair
 * that lies over further than the spine does, short of 1 one that never gets
 * all the way there — which is why some hairs leave contact partway through a
 * stroke and others do not.
 */
export function hairPoint(
  spines: Spine[],
  h: Hair,
  def: TuftDef,
  halfWidth: number,
  s: number,
  stations: number,
  splay: number,
  out: HairPoint,
): void {
  const J = spines[0].joints.length;
  const t = (s / stations) * h.short;      // shorter hairs simply stop earlier
  const f = t * (J - 1);
  const k0 = Math.min(J - 2, Math.floor(f));
  const fr = f - k0;

  const wF = bellyAt(t, def.convW * h.conv, def.bulge, def.bellyAt) * splay;
  const tF = bellyAt(t, def.convT * h.conv, def.bulge, def.bellyAt) * splay;

  let cx: number, cy: number, cz: number;
  let rx: number, ry: number, rz: number;
  let ex: number, ey: number, ez: number;      // across the blade
  let fx: number, fy: number, fz: number;      // through its thickness
  let across: number;

  if (spines.length >= 2) {
    /* Across the blade, converged about the middle so the blade narrows toward
       the tip rather than the hairs sliding around inside a blade that never
       changes width. The hair lands between whichever neighbouring pair of
       spines it falls between, so a bowed blade is drawn bowed. */
    const u = Math.max(0, Math.min(1, 0.5 + h.a * 0.5 * wF));
    const ff = u * (spines.length - 1);
    const g = Math.min(spines.length - 2, Math.floor(ff));
    const uu = ff - g;

    const A = spines[g].joints, C = spines[g + 1].joints;
    const RA = spines[g].rest, RC = spines[g + 1].rest;
    const p0x = lerp(A[k0].x, A[k0 + 1].x, fr), q0x = lerp(C[k0].x, C[k0 + 1].x, fr);
    const p0y = lerp(A[k0].y, A[k0 + 1].y, fr), q0y = lerp(C[k0].y, C[k0 + 1].y, fr);
    const p0z = lerp(A[k0].z, A[k0 + 1].z, fr), q0z = lerp(C[k0].z, C[k0 + 1].z, fr);
    cx = lerp(p0x, q0x, uu); cy = lerp(p0y, q0y, uu); cz = lerp(p0z, q0z, uu);

    const r0x = lerp(RA[k0].x, RA[k0 + 1].x, fr), s0x = lerp(RC[k0].x, RC[k0 + 1].x, fr);
    const r0y = lerp(RA[k0].y, RA[k0 + 1].y, fr), s0y = lerp(RC[k0].y, RC[k0 + 1].y, fr);
    const r0z = lerp(RA[k0].z, RA[k0 + 1].z, fr), s0z = lerp(RC[k0].z, RC[k0 + 1].z, fr);
    rx = lerp(r0x, s0x, uu); ry = lerp(r0y, s0y, uu); rz = lerp(r0z, s0z, uu);

    // Blade axis, and the thickness axis square to it and to the tuft.
    let bx = q0x - p0x, by = q0y - p0y, bz = q0z - p0z;
    const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
    let tx = A[k0 + 1].x - A[k0].x, ty = A[k0 + 1].y - A[k0].y, tz = A[k0 + 1].z - A[k0].z;
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    ex = bx; ey = by; ez = bz;
    fx = by * tz - bz * ty; fy = bz * tx - bx * tz; fz = bx * ty - by * tx;
    const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    // The across-blade offset is already carried by `u`; only thickness is left.
    across = 0;
  } else {
    const A = spines[0].joints, R = spines[0].rest;
    cx = lerp(A[k0].x, A[k0 + 1].x, fr);
    cy = lerp(A[k0].y, A[k0 + 1].y, fr);
    cz = lerp(A[k0].z, A[k0 + 1].z, fr);
    rx = lerp(R[k0].x, R[k0 + 1].x, fr);
    ry = lerp(R[k0].y, R[k0 + 1].y, fr);
    rz = lerp(R[k0].z, R[k0 + 1].z, fr);
    let tx = A[k0 + 1].x - A[k0].x, ty = A[k0 + 1].y - A[k0].y, tz = A[k0 + 1].z - A[k0].z;
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    // Any direction square to the tuft, then the third from those two.
    ex = -ty; ey = tx; ez = 0;
    const el = Math.hypot(ex, ey, ez);
    if (el < 1e-4) { ex = 1; ey = 0; ez = 0; } else { ex /= el; ey /= el; }
    fx = ty * ez - tz * ey; fy = tz * ex - tx * ez; fz = tx * ey - ty * ex;
    across = h.a * halfWidth * wF;
  }

  // Per-hair stiffness: rest line blended toward the solved spine.
  let x = rx + (cx - rx) * h.bend;
  let y = ry + (cy - ry) * h.bend;
  let z = rz + (cz - rz) * h.bend;

  const through = h.b * halfWidth * tF;
  const sw = smooth(t) * t;                     // strays open out toward the tip
  const sa = h.strayA * halfWidth * sw;
  const sb = h.strayB * halfWidth * sw;

  x += ex * (across + sa) + fx * (through + sb);
  y += ey * (across + sa) + fy * (through + sb);
  z += ez * (across + sa) + fz * (through + sb);

  /* A hair driven below the sheet lies ON it. Crude next to a real contact
     solve, and it is the reason a soft hair stays down through a stroke while a
     stiff one skips — bought with an approximation, not with physics. */
  out.x = x; out.y = y; out.z = z < 0 ? 0 : z;
}

/** The tuft rows a brush falls back to when its own row says nothing. */
export const DEFAULT_TUFT: TuftDef = {
  section: 2, thickRatio: 1, convW: 0.12, convT: 0.12,
  bulge: 1.15, bellyAt: 0.33, rootJitter: 0.55,
  lenVar: 0.10, bendVar: 0.18, convVar: 0.20,
  strayFrac: 0.05, strayAmt: 0.55, seed: 1,
};

/** Convenience: the section half-width of a tuft, in cells. */
export const tuftHalfWidth = (def: BrushDef, tuftLength: number) =>
  0.5 * def.widthRatio * tuftLength;
