/* A tuft that is a BUNDLE, not a shell.
 *
 * Rides the recorded spines. The spine is engine output; everything in here is
 * the proposal. Plain ES module, no dependencies, so the same source runs in
 * node for measurement and in the inspector page for looking at.
 */

/* ---- deterministic noise ------------------------------------------------ */
/* A brush does not rearrange its own hairs between strokes, so the randomness
   has to be a property of the brush, drawn once and kept. Seeded, so the same
   brush is the same brush every time it is built. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/* Superellipse radius at an angle: |x|^n + |y|^n = 1.
   n = 2 is a circle (round tuft). n = 3 is a rounded rectangle, which is the
   cross-section a chisel-cut flat actually has — near full thickness right
   across the blade, rounding off only at the two corners. An ellipse would
   thin the whole blade toward its ends and lose the corners, and the corners
   are the part of a flat you draw a line with. */
function superR(ang, n) {
  if (n === 2) return 1;
  const c = Math.abs(Math.cos(ang)), s = Math.abs(Math.sin(ang));
  return Math.pow(Math.pow(c, n) + Math.pow(s, n), -1 / n);
}

/**
 * Draw the hairs of one tuft, once.
 *
 * Returns roots in SECTION SPACE: a in [-1,1] across the blade (or the disc),
 * b in [-1,1] through the thickness. The carrier turns those into cells.
 */
export function drawTuft(t) {
  const n = t.count;
  const r = rng(t.seed);
  const hairs = [];
  /* Vogel's spiral. Even areal density with no rings and no seams — a
     concentric-rings layout puts hairs in circles, and circles are exactly the
     periodic structure that keeps showing up in the marks. */
  const jitR = t.rootJitter / Math.sqrt(n);

  for (let i = 0; i < n; i++) {
    const rr = Math.sqrt((i + 0.5) / n);
    const th = i * GOLDEN;
    let a = rr * Math.cos(th), b = rr * Math.sin(th);
    // Disc -> superellipse, then squash to the blade's thickness.
    const sr = superR(th, t.section);
    a *= sr; b *= sr * t.thickRatio;

    // Jitter off the lattice. Without this the spiral is still a pattern.
    const ja = r() * Math.PI * 2, jd = Math.sqrt(r()) * jitR;
    a += Math.cos(ja) * jd;
    b += Math.sin(ja) * jd * t.thickRatio;

    /* Hairs are not all the same length. This is the row that decides what a
       light touch does: at low pressure only the longest hairs are down, so the
       mark is a scatter of separate lines rather than the whole tuft at once. */
    const short = 1 - t.lenVar * Math.pow(r(), 1.6);

    /* Nor are they all the same stiffness. A hair is placed by blending its
       rest line toward the solved spine; blending PAST the spine gives a hair
       that lies over further, short of it gives one that stands up. That single
       number is why some hairs leave contact mid-stroke and others do not. */
    const bend = 1 + t.bendVar * (r() * 2 - 1);

    /* The hair that missed the dresser. A few per brush, and they are what
       leaves a line outside the mark — the thing a real brush does that a
       perfectly-made one never would. */
    const stray = r() < t.strayFrac;
    const sang = r() * Math.PI * 2, smag = stray ? t.strayAmt * (0.4 + 0.6 * r()) : 0;

    hairs.push({
      a, b, short, bend,
      stray,
      strayA: Math.cos(sang) * smag,
      strayB: Math.sin(sang) * smag,
      // Per-hair convergence: a brush points well, but not perfectly.
      conv: 1 + t.convVar * (r() * 2 - 1),
    });
  }
  return hairs;
}

/** Belly-to-tip radius profile. 1 at the ferrule, bulges, then converges. */
export function bellyAt(t, conv, bulge, at) {
  return t < at
    ? 1 + (bulge - 1) * smooth(t / at)
    : bulge + (conv - bulge) * smooth((t - at) / (1 - at));
}

/* ---- the carrier -------------------------------------------------------- */
/* Reads the recorded spines and places a hair in cells. Everything above is
   about the SHAPE of the bundle; this is about where the bundle is. */

function lerp3(p, q, u) {
  return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
}

/** Pull joint s of spine k out of a flat frame array. */
const jointAt = (arr, s) => [arr[s * 3], arr[s * 3 + 1], arr[s * 3 + 2]];

/**
 * One hair as a polyline in cells.
 *
 * @param frame  a recorded frame: { spines, rest }
 * @param spec   the brush's tuft spec (widths, convergence, belly)
 * @param hair   one entry from drawTuft
 * @param steps  how finely to walk the spine (hairs are smooth, the chain is not)
 */
export function hairPath(frame, spec, hair, steps = 20) {
  const J = frame.spines[0].length / 3;
  const nSpine = frame.spines.length;
  const twoSpine = nSpine >= 2;
  const out = [];
  const end = hair.short;

  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * end;          // shorter hairs simply stop earlier
    const f = t * (J - 1);
    const s0 = Math.min(J - 2, Math.floor(f)), fr = f - s0;

    /* Width convergence acts on the blade coordinate itself, so the blade
       narrows toward the tip instead of the hairs sliding inside a blade that
       never changes width. */
    const wF = bellyAt(t, spec.convW * hair.conv, spec.bulge, spec.bellyAt);
    const tF = bellyAt(t, spec.convT * hair.conv, spec.bulge, spec.bellyAt);

    let c, rest, eW, eT;
    if (twoSpine) {
      /* Across the blade: u = 0 at the first spine, 1 at the last. With a fan of
         more than two the hair lands between whichever neighbouring pair it
         falls between, exactly as Brush.bristlePoint does, so a bowed blade is
         drawn bowed instead of drawn as the average of its two edges. */
      const u = 0.5 + (hair.a * 0.5) * wF;
      const ff = Math.max(0, Math.min(1, u)) * (nSpine - 1);
      const k = Math.min(nSpine - 2, Math.floor(ff));
      const uu = ff - k;
      const p0 = jointAt(frame.spines[k], s0), p1 = jointAt(frame.spines[k], s0 + 1);
      const q0 = jointAt(frame.spines[k + 1], s0), q1 = jointAt(frame.spines[k + 1], s0 + 1);
      const P = lerp3(p0, p1, fr), Q = lerp3(q0, q1, fr);
      c = lerp3(P, Q, uu);
      const r0 = jointAt(frame.rest[k], s0), r1 = jointAt(frame.rest[k], s0 + 1);
      const v0 = jointAt(frame.rest[k + 1], s0), v1 = jointAt(frame.rest[k + 1], s0 + 1);
      rest = lerp3(lerp3(r0, r1, fr), lerp3(v0, v1, fr), uu);
      // Blade axis, and the thickness axis square to it and to the tuft.
      let bx = Q[0] - P[0], by = Q[1] - P[1], bz = Q[2] - P[2];
      const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
      let tx = p1[0] - p0[0], ty = p1[1] - p0[1], tz = p1[2] - p0[2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      eW = [bx, by, bz];
      eT = [by * tz - bz * ty, bz * tx - bx * tz, bx * ty - by * tx];
      const el = Math.hypot(eT[0], eT[1], eT[2]) || 1;
      eT = [eT[0] / el, eT[1] / el, eT[2] / el];
    } else {
      const p0 = jointAt(frame.spines[0], s0), p1 = jointAt(frame.spines[0], s0 + 1);
      c = lerp3(p0, p1, fr);
      const r0 = jointAt(frame.rest[0], s0), r1 = jointAt(frame.rest[0], s0 + 1);
      rest = lerp3(r0, r1, fr);
      let tx = p1[0] - p0[0], ty = p1[1] - p0[1], tz = p1[2] - p0[2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      // Any vector square to the tuft, then the third by cross product.
      let ex = -ty, ey = tx, ez = 0;
      const el = Math.hypot(ex, ey, ez);
      if (el < 1e-4) { ex = 1; ey = 0; ez = 0; } else { ex /= el; ey /= el; }
      eW = [ex, ey, ez];
      eT = [ty * ez - tz * ey, tz * ex - tx * ez, tx * ey - ty * ex];
    }

    /* Per-hair stiffness: blend the rest line toward the solved spine, and let
       the blend run past 1. Soft hairs lie over further than the spine does,
       stiff ones do not get all the way there. */
    let x = rest[0] + (c[0] - rest[0]) * hair.bend;
    let y = rest[1] + (c[1] - rest[1]) * hair.bend;
    let z = rest[2] + (c[2] - rest[2]) * hair.bend;

    // Section offset. On a round tuft both axes are the same radius.
    const across = twoSpine ? 0 : hair.a * spec.halfWidth * wF;
    const through = (twoSpine ? hair.b * spec.halfWidth : hair.b * spec.halfWidth) * tF;
    const sa = hair.strayA * spec.halfWidth * smooth(t) * t;
    const sb = hair.strayB * spec.halfWidth * smooth(t) * t;

    x += eW[0] * (across + sa) + eT[0] * (through + sb);
    y += eW[1] * (across + sa) + eT[1] * (through + sb);
    z += eW[2] * (across + sa) + eT[2] * (through + sb);

    /* A hair driven below the sheet lies ON it. Crude next to a real contact
       solve, but it is the reason a soft hair stays down through a stroke while
       a stiff one skips, and that is the behaviour being bought here. */
    if (z < 0) z = 0;
    out.push(x, y, z);
  }
  return out;
}

/* ---- what is there now, for comparison ---------------------------------- */
/* A faithful port of Brush.bristlePoint. Kept so the two pictures are the same
   picture with one thing changed, rather than two different drawings. */
export function nowHair(frame, def, tuftLength, b, splay) {
  const B = def.bristles;
  const J = def.segments;
  const u = B === 1 ? 0.5 : b / (B - 1);
  const out = [];
  for (let s = 0; s <= J; s++) {
    const t = s / J;
    const profile = Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)) * (1 - t * 0.75);
    const r = 0.5 * def.widthRatio * tuftLength * profile * splay;
    if (frame.spines.length >= 2) {
      // Mirrors Brush.bristlePoint, fan and all, so this stays a faithful port.
      const n = frame.spines.length;
      const f = u * (n - 1);
      const k = Math.min(n - 2, Math.floor(f));
      const uu = f - k;
      const a = jointAt(frame.spines[k], s), c = jointAt(frame.spines[k + 1], s);
      const thick = ((b % 2) - 0.5) * r * 0.35;
      let nx = c[1] - a[1], ny = -(c[0] - a[0]);
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      out.push(a[0] + (c[0] - a[0]) * uu + nx * thick,
               a[1] + (c[1] - a[1]) * uu + ny * thick,
               a[2] + (c[2] - a[2]) * uu);
    } else {
      const j = jointAt(frame.spines[0], s);
      const prev = jointAt(frame.spines[0], Math.max(0, s - 1));
      const ang = u * Math.PI * 2;
      let dx = j[0] - prev[0], dy = j[1] - prev[1], dz = j[2] - prev[2];
      const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      let ex = -dy, ey = dx, ez = 0;
      const el = Math.hypot(ex, ey, ez);
      if (el < 1e-4) { ex = 1; ey = 0; ez = 0; } else { ex /= el; ey /= el; }
      const fx = dy * ez - dz * ey, fy = dz * ex - dx * ez, fz = dx * ey - dy * ex;
      const ca = Math.cos(ang) * r, sa = Math.sin(ang) * r;
      out.push(j[0] + ex * ca + fx * sa, j[1] + ey * ca + fy * sa, j[2] + ez * ca + fz * sa);
    }
  }
  return out;
}
