// Brush bench. Drives the tuft, the spine and the reservoir directly — they are
// plain TypeScript with no GPU in them, so they can be asked what they actually
// did rather than inspected through a picture.
//
// This is how the empty-brush fault was found on 2026-08-24: with the fresh dip
// skipped, a hog lays 33 units of paint on the first stroke, 20 on the second,
// 3.8 on the third and 0.7 on the fourth. No screenshot shows that; the numbers
// do, in a second.
//
//   node tools/brush-bench.build.mjs
//   node tools/brush-bench.mjs <slug> [lift|nolift] [size] [pressure]
//
import { StrokeEngine } from '../src/input/stroke';
import { BRUSH_BY_SLUG } from '../src/brush/library';
import { WET_MEDIA } from '../src/media/library';
import type { Reservoir } from '../src/brush/reservoir';
import { SEG_FLOATS } from '../src/engine/fluid';
import type { StylusSample } from '../src/input/pointer';

const sample = (overrides: Partial<StylusSample> = {}): StylusSample => ({
  x: 0, y: 0, px: 0, py: 0,
  pressure: 0.6, tiltX: 0, tiltY: 0, tiltAngle: 0, tiltAzimuth: 0, twist: 0,
  velocity: 0, dt: 8, time: 0, pointerType: 'pen', down: true,
  ...overrides,
});

const MODE = process.argv[2] ?? 'flat-hog';
const PROBES = new Set(['shape', 'sweep', 'ramp', 'field', 'turn', 'blame', 'blade', 'legs', 'model', 'film', 'tuft', 'spines', 'fan', 'chaos', 'drive', 'fill', 'pulse', 'density', 'reach', 'dryout', 'load']);
const slug = PROBES.has(MODE) ? 'flat-hog' : MODE;
const def = BRUSH_BY_SLUG.get(slug)!;
const size = Number(process.argv[4] ?? 1.0);
const pressure = Number(process.argv[5] ?? 0.6);
const stroke = new StrokeEngine(def, size);

const mix = new Float32Array(8);
mix[0] = 1;
stroke.charge(mix, 0.6, 0);

/** One stroke: a straight 120-cell drag, reported every frame. */
function paintStroke(y: number, frames = 12, perFrame = 10, lift = true) {
  let x = 60;
  let laidWater = 0, laidPig = 0, segs = 0;
  let minRadius = Infinity, maxRadius = 0;
  const gaps: number[] = [];
  const perFrameWater: number[] = [];
  let worstFrameSegs = 0;
  let lastEnd: [number, number] | null = null;

  for (let f = 0; f < frames; f++) {
    for (let k = 0; k < perFrame; k++) {
      x += 1.0;
      stroke.add(x, y, sample({ time: f * 16 + k, pressure }));
    }
    const { data, count } = stroke.drain();
    let frameWater = 0;
    for (let i = 0; i < count; i++) frameWater += data[i * SEG_FLOATS + 5];
    perFrameWater.push(+frameWater.toFixed(3));
    segs += count;
    worstFrameSegs = Math.max(worstFrameSegs, count);
    for (let i = 0; i < count; i++) {
      const o = i * SEG_FLOATS;
      laidWater += data[o + 5];
      laidPig += data[o + 6];
      minRadius = Math.min(minRadius, data[o + 4]);
      maxRadius = Math.max(maxRadius, data[o + 4]);
    }
    // Distance from the previous frame's last segment to this frame's first —
    // a jump here is an unpainted line across the stroke, once per frame.
    if (count > 0) {
      const first: [number, number] = [data[0], data[1]];
      if (lastEnd) gaps.push(Math.hypot(first[0] - lastEnd[0], first[1] - lastEnd[1]));
      const o = (count - 1) * SEG_FLOATS;
      lastEnd = [data[o + 2], data[o + 3]];
    }
  }
  if (lift) stroke.end();

  const res = (stroke as any).brush.reservoir;
  const water: Float32Array = res.water;
  const pigment: Float32Array = res.pigment;
  const capacity: Float32Array = res.capacity;
  let left = 0, cap = 0, pigLeft = 0;
  for (let i = 0; i < water.length; i++) { left += water[i]; cap += capacity[i]; }
  for (let i = 0; i < pigment.length; i++) pigLeft += pigment[i];

  // How far the tuft's rest shape has crept away from straight.
  const spines = (stroke as any).brush.spines as Array<{ restBend: number[] }>;
  const bend = spines.map((s) => s.restBend.map((b) => +(b * 180 / Math.PI).toFixed(1)));

  return {
    segs,
    laidWater: +laidWater.toFixed(3),
    laidPig: +laidPig.toFixed(3),
    reservoirLeft: +(left / cap).toFixed(4),
    pigmentLeft: +pigLeft.toFixed(4),
    radius: [+minRadius.toFixed(2), +maxRadius.toFixed(2)],
    worstFrameSegs,
    capPerFrame: 49152,
    restBendDeg: bend[0],
  };
}

const lift = process.argv[3] !== 'nolift';
if (!PROBES.has(MODE)) {
console.log(`--- ${def.name} (${slug}) --- ${lift ? 'lifting between strokes' : 'NEVER lifting (no re-dip)'}`);
for (let n = 1; n <= 5; n++) {
  const r = paintStroke(80 + n * 6, 14, 10, lift);
  console.log(`stroke ${n}:`, JSON.stringify(r));
}
}

/* ------------------------------------------------------------------ shape --
 * What the footprint actually looks like on the paper for one solve step:
 * how far it reaches ALONG the stroke versus ACROSS it, how many joints are
 * touching, and how far the tuft has bent. A flat brush dragged broadside
 * should reach a long way across and a little along; if it reaches almost
 * nothing in either, only the very tip is down.
 */
function shape(pressure: number, size: number, slug2: string, deg = 0, twist = 0, drive?: number) {
  const base0 = BRUSH_BY_SLUG.get(slug2)!;
  // Optional drive override, so the ramp can be compared at two drives without
  // editing the module constant and rebuilding between runs.
  const d = drive && drive > 0 ? { ...base0, drive } : base0;
  const st = new StrokeEngine(d, size);
  const mx = new Float32Array(8); mx[0] = 1;
  st.charge(mx, 1.0, 0);
  const ux = Math.cos(deg * Math.PI / 180), uy = Math.sin(deg * Math.PI / 180);
  st.begin(100, 100, sample({ pressure, twist }));
  // a short straight drag, so the tuft is loaded and moving
  for (let i = 1; i <= 12; i++) st.add(100 + ux * i, 100 + uy * i, sample({ pressure, twist }));
  const { data, count } = st.drain();

  let minA = Infinity, maxA = -Infinity, minC = Infinity, maxC = -Infinity;
  let segLen = 0;
  const last = { x: 0, y: 0 };
  for (let i = 0; i < count; i++) {
    const o = i * SEG_FLOATS;
    for (const [x, y] of [[data[o], data[o + 1]], [data[o + 2], data[o + 3]]]) {
      minA = Math.min(minA, x); maxA = Math.max(maxA, x);   // along  = x, the travel
      minC = Math.min(minC, y); maxC = Math.max(maxC, y);   // across = y
    }
    segLen += Math.hypot(data[o + 2] - data[o], data[o + 3] - data[o + 1]);
    last.x = data[o + 2]; last.y = data[o + 3];
  }
  const brush = (st as any).brush;
  const spines = brush.spines as Array<{ joints: Array<{ x: number; y: number; z: number; contact: boolean }> }>;
  const joints = spines.flatMap((s) => s.joints);
  const touching = joints.filter((j) => j.contact).length;
  // How far the tip trails behind the ferrule, in cells — the bend.
  const lag = spines.map((s) => {
    const a = s.joints[0], b = s.joints[s.joints.length - 1];
    return +Math.hypot(b.x - a.x, b.y - a.y).toFixed(2);
  });
  // What the smear gate actually sees: `reach` is the stress the paint is
  // tested against, and a gate that never fires is the failure mode this bench
  // exists to catch.
  /* Which way does a hair's mark point?
   *
   * A hair dragged through paint should leave a track ALONG the stroke. If the
   * footprint segments come out square to the travel, the brush is stamping the
   * hair's own body across the path instead of trailing it behind — which is
   * what the artist described on 2026-08-24: "horizontal marks that cut ACROSS
   * the stroke". Measured against the ACTUAL travel direction — the first
   * version of this only ever dragged along +x and reported a clean 0 for it,
   * which is exactly the sort of single-case result that reads as proof and
   * is not one.
   */
  let angSum = 0, angN = 0;
  const hist = [0, 0, 0];   // 0-30, 30-60, 60-90 degrees off the travel
  for (let i = 0; i < count; i++) {
    const o = i * SEG_FLOATS;
    const vx = data[o + 2] - data[o], vy = data[o + 3] - data[o + 1];
    const len = Math.hypot(vx, vy);
    if (len < 1e-4) continue;                       // degenerate: no direction
    const cross = Math.abs(vx * uy - vy * ux), dot = Math.abs(vx * ux + vy * uy);
    const deg = Math.atan2(cross, dot) * 180 / Math.PI;
    angSum += deg; angN++;
    hist[deg < 30 ? 0 : deg < 60 ? 1 : 2]++;
  }

  let rMax = 0, rSum = 0;
  for (let i = 0; i < count; i++) { const r = data[i * SEG_FLOATS + 7]; rMax = Math.max(rMax, r); rSum += r; }
  return {
    segs: count,
    reach: [+(rSum / Math.max(count, 1)).toFixed(3), +rMax.toFixed(3)],
    meanAngleOffTravel: angN ? +(angSum / angN).toFixed(1) : null,
    'along/diag/across': hist,
    acrossCells: +(maxC - minC).toFixed(2),
    alongCells: +(maxA - minA).toFixed(2),
    meanSegLen: +(segLen / Math.max(count, 1)).toFixed(3),
    jointsTouching: `${touching}/${joints.length}`,
    tipLagFromFerrule: lag,
  };
}

if (process.argv[2] === 'shape') {
  for (const s of ['flat-hog', 'flat-sable', 'round-sable']) {
    for (const p of [0.3, 0.65, 1.0]) {
      console.log(`${s} @ pressure ${p}:`, JSON.stringify(shape(p, 2.0, s)));
    }
  }
}

/* ------------------------------------------------------------------ sweep --
 * A rigid tuft cannot lie down. Its joints stack vertically, project to the
 * same point, and every hair emits a degenerate segment — a dot instead of a
 * track. This sweeps the two rows that decide it and reports how much of the
 * hair actually reaches the paper.
 */
if (MODE === 'sweep') {
  const base = BRUSH_BY_SLUG.get('flat-hog')!;
  console.log('stiffness/taper      segLen@0.3  segLen@0.65  segLen@1.0   touching@0.65');
  for (const st of [0.98, 0.90]) {
    for (const tp of [0.96, 0.84, 0.80, 0.76, 0.72]) {
      const def = { ...base, slug: 'probe', stiffness: st, stiffnessTaper: tp };
      BRUSH_BY_SLUG.set('probe', def);
      const at = (p: number) => shape(p, 2.0, 'probe');
      const a = at(0.3), b = at(0.65), c = at(1.0);
      console.log(
        `  ${st.toFixed(2)} / ${tp.toFixed(2)}          ` +
        `${String(a.meanSegLen).padEnd(11)} ${String(b.meanSegLen).padEnd(12)} ` +
        `${String(c.meanSegLen).padEnd(12)} ${b.jointsTouching}`);
    }
  }
}

/* ------------------------------------------------------------------- ramp --
 * The pressure ramp, which is the thing the depth curve actually controls.
 * Two properties have to survive any change to it: the very bottom must still
 * be a hairline (VL Fig. 7 — a fine stroke from the tip of a large brush), and
 * more of the tuft must reach the paper as the hand presses.
 */
if (MODE === 'ramp') {
  const which = process.argv[3] ?? 'flat-hog';
  const dOver = Number(process.argv[4]);
  console.log(`${which}${dOver ? '  drive ' + dOver : ''}   pressure   across   along   segLen   joints touching`);
  for (const p of [0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 1.0]) {
    const r = shape(p, 2.0, which, 0, 0, dOver);
    console.log(`            ${p.toFixed(2).padEnd(10)} ${String(r.acrossCells).padEnd(8)} `
      + `${String(r.alongCells).padEnd(7)} ${String(r.meanSegLen).padEnd(8)} ${r.jointsTouching}`);
  }
}

/* ------------------------------------------------------------------ field --
 * Rasterise a whole stroke's footprint the way deposit.wgsl does, then ask
 * where the structure actually is: banding ALONG the stroke (which is hair
 * tracks, and wanted) or ACROSS it (which is stamping, and is what the artist
 * reported seeing).
 */
if (MODE === 'field') {
  const which = process.argv[3] ?? 'flat-hog';
  const ang = Number(process.argv[4] ?? 0) * Math.PI / 180;   // stroke direction
  const d = BRUSH_BY_SLUG.get(which)!;
  const st = new StrokeEngine(d, 2.0);
  const mx = new Float32Array(8); mx[0] = 1;
  st.charge(mx, 1.0, 0);

  const N = 220, G = new Float64Array(N * N);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  let x = 40, y = 110;
  st.begin(x, y, sample({ pressure: 0.65 }));
  // Drain per "frame" of 8 samples, like the real loop, and splat each frame.
  for (let f = 0; f < 14; f++) {
    for (let k = 0; k < 8; k++) { x += ux; y += uy; st.add(x, y, sample({ pressure: 0.65 })); }
    const { data, count } = st.drain();
    for (let i = 0; i < count; i++) {
      const o = i * SEG_FLOATS, r = data[o + 4], w = data[o + 5];
      const ax = data[o], ay = data[o + 1], bx = data[o + 2], by = data[o + 3];
      const lo = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1));
      const hi = Math.min(N - 1, Math.ceil(Math.max(ax, bx) + r + 1));
      const lo2 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1));
      const hi2 = Math.min(N - 1, Math.ceil(Math.max(ay, by) + r + 1));
      for (let cy = lo2; cy <= hi2; cy++) for (let cx = lo; cx <= hi; cx++) {
        const px = cx + 0.5, py = cy + 0.5;
        const abx = bx - ax, aby = by - ay;
        const L2 = abx * abx + aby * aby;
        const t = L2 < 1e-8 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / L2));
        const dist = Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
        if (dist < r + 0.5) {
          const cov = Math.max(0, Math.min(1, r - dist + 0.5));
          const prof = 1 - 0.55 * Math.min(1, dist / Math.max(r, 1e-3));
          G[cy * N + cx] += cov * prof * w;
        }
      }
    }
  }
  // Project onto the travel axis and onto the across axis; report how much the
  // signal wobbles in each. Strong wobble ALONG the path = stamping.
  const along = new Map<number, number>(), across = new Map<number, number>();
  for (let cy = 0; cy < N; cy++) for (let cx = 0; cx < N; cx++) {
    const v = G[cy * N + cx]; if (v <= 0) continue;
    const a = Math.round((cx - 40) * ux + (cy - 110) * uy);
    const b = Math.round(-(cx - 40) * uy + (cy - 110) * ux);
    along.set(a, (along.get(a) ?? 0) + v);
    across.set(b, (across.get(b) ?? 0) + v);
  }
  const wobble = (m: Map<number, number>) => {
    const ks = [...m.keys()].sort((p, q) => p - q);
    const v = ks.map((k) => m.get(k)!);
    const mid = v.slice(Math.floor(v.length * 0.2), Math.ceil(v.length * 0.8));
    const mean = mid.reduce((s, n) => s + n, 0) / Math.max(mid.length, 1);
    let sw = 0;
    for (let i = 1; i < mid.length; i++) sw += Math.abs(mid[i] - mid[i - 1]);
    return +((sw / Math.max(mid.length - 1, 1)) / Math.max(mean, 1e-9)).toFixed(3);
  };
  console.log(`${which} at ${(ang * 180 / Math.PI).toFixed(0)}deg — `
    + `wobble along the stroke: ${wobble(along)}   across it: ${wobble(across)}`);
  console.log('   (along-wobble is banding ACROSS the mark — stamping. across-wobble is hair tracks.)');
}

/* ------------------------------------------------------------------- turn --
 * The same drag, swept through every direction. A brush does not know which way
 * the canvas axes run, so the hairs must trail the stroke at 40 degrees exactly
 * as they do at 0.
 */
if (MODE === 'turn') {
  const which = process.argv[3] ?? 'flat-hog';
  console.log(`${which}   stroke   hair angle off travel   along/diag/across   segLen`);
  for (let deg = 0; deg < 180; deg += 15) {
    const r = shape(0.65, 2.0, which, deg);
    console.log(`          ${String(deg).padStart(3)}deg   `
      + `${String(r.meanAngleOffTravel).padEnd(22)} ${JSON.stringify(r['along/diag/across']).padEnd(19)} ${r.meanSegLen}`);
  }
}

/* --------------------------------------------------------------- pulse --
 * Does a flat tuft periodically lose contact or paint as it is pulled? The
 * artist sees repeated bars square across broadside strokes and asked whether
 * the brush is resetting to rest. Report each solve, not a rendered image, so
 * contact loss and reservoir cadence cannot hide behind canvas lighting. */
if (MODE === 'pulse') {
  const run = (which: string, dx: number, dy: number) => {
    const st = new StrokeEngine(BRUSH_BY_SLUG.get(which)!, 1.0);
    const m = new Float32Array(8); m[0] = 1;
    st.charge(m, 1.0, 0);
    let x = 100, y = 100;
    st.begin(x, y, sample({ pressure: 0.65 }));
    const rows: { contact: number; laid: number; segs: number }[] = [];
    for (let i = 0; i < 80; i++) {
      x += dx; y += dy;
      st.add(x, y, sample({ pressure: 0.65, time: i }));
      const { data, count } = st.drain();
      let laid = 0;
      for (let j = 0; j < count; j++) laid += data[j * SEG_FLOATS + 5];
      rows.push({
        contact: (st as any).brush.contactJoints(),
        laid: +laid.toFixed(5), segs: count,
      });
    }
    const cv = (vals: number[]) => {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      return Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) / (mean || 1);
    };
    console.log(`${which} ${dx ? 'horizontal' : 'vertical'}: contact ${Math.min(...rows.map(r => r.contact))}-${Math.max(...rows.map(r => r.contact))}, contact CV ${cv(rows.map(r => r.contact)).toFixed(3)}, laid CV ${cv(rows.map(r => r.laid)).toFixed(3)}`);
    console.log(rows.map(r => `${r.contact}/${r.laid}`).join(' '));
  };
  for (const which of ['flat-sable', 'flat-hog']) {
    run(which, 0.9, 0);
    run(which, 0, 0.9);
  }
}

/* Which row is turning the hairs off the stroke? Vary one at a time and watch
 * the angle at 90 degrees, where the fault is worst. */
if (MODE === 'blame') {
  const base = BRUSH_BY_SLUG.get('flat-hog')!;
  const probe = (patch: Partial<typeof base>, label: string) => {
    BRUSH_BY_SLUG.set('probe', { ...base, ...patch, slug: 'probe' });
    const a = shape(0.65, 2.0, 'probe', 0).meanAngleOffTravel;
    const b = shape(0.65, 2.0, 'probe', 90).meanAngleOffTravel;
    console.log(`  ${label.padEnd(30)} 0deg ${String(a).padEnd(6)} 90deg ${b}`);
  };
  console.log('flat-hog, one row at a time:');
  probe({}, 'as shipped');
  probe({ splayFromPressure: 0 }, 'splayFromPressure 1.15 -> 0');
  probe({ widthRatio: 0.3 }, 'widthRatio 1.05 -> 0.30');
  probe({ bristles: 2 }, 'bristles 22 -> 2');
  probe({ plasticity: 0 }, 'plasticity 0.18 -> 0');
  probe({ stiffness: 0.72, stiffnessTaper: 0.68 }, 'stiffness like the sable');
  probe({ friction: { mu: 0.6, cEta: 0.8, k: 2.4 } }, 'friction like the sable');
}

/* Is the fault locked to the CANVAS or to the BLADE? Barrel-roll the brush and
 * see whether the bad direction rolls with it. If it does, the hairs are being
 * turned by the tuft's own axis; if it stays put, something is nailed to x. */
if (MODE === 'blade') {
  console.log('flat-hog — hair angle off travel');
  console.log('  twist    stroke 0deg   stroke 45deg   stroke 90deg   stroke 135deg');
  for (const tw of [0, 30, 45, 60, 90]) {
    const at = (d: number) => String(shape(0.65, 2.0, 'flat-hog', d, tw).meanAngleOffTravel).padEnd(14);
    console.log(`  ${String(tw).padStart(3)}deg    ${at(0)}${at(45)}${at(90)}${at(135)}`);
  }
}

/* ------------------------------------------------------------------- legs --
 * How far a single dip actually goes. `Capacity` multiplies the tuft's
 * holding; this reports what that buys in cells of usable stroke, which is the
 * question actually being asked.
 */
if (MODE === 'legs') {
  const which = process.argv[3] ?? 'flat-hog';
  const FLOW = Number(process.argv[4] ?? 1);
  console.log(`${which} — one dip, how far it lasts (flow ${FLOW}x)`);
  console.log('  capacity   paint laid   cells until it drops below 20%   left in the tuft');
  for (const cap of [0.5, 1, 2, 3, 5]) {
    const st = new StrokeEngine(BRUSH_BY_SLUG.get(which)!, 2.0);
    const mx = new Float32Array(8); mx[0] = 1;
    st.charge(mx, 1.0, 0);
    (st as any).setCapacity(cap);
    (st as any).setFlow(FLOW);
    st.begin(20, 200, sample({ pressure: 0.65 }));
    let laid = 0, first = 0, fade = 0;
    for (let cell = 1; cell <= 400; cell++) {
      st.add(20 + cell, 200, sample({ pressure: 0.65 }));
      const { data, count } = st.drain();
      let w = 0;
      for (let i = 0; i < count; i++) w += data[i * SEG_FLOATS + 5];
      laid += w;
      if (cell <= 5) first = Math.max(first, w);
      if (!fade && cell > 5 && w < first * 0.2) fade = cell;
    }
    const res = (st as any).brush.reservoir;
    let left = 0, room = 0;
    for (let i = 0; i < res.water.length; i++) { left += res.water[i]; room += res.capacity[i]; }
    console.log(`  ${cap.toFixed(2)}x      ${laid.toFixed(1).padEnd(12)} `
      + `${String(fade || '>400').padEnd(31)} ${(100 * left / room).toFixed(0)}%`);
  }
}

/* ------------------------------------------------------------------ model --
 * Dump a brush's actual 3D geometry, straight out of the engine.
 *
 * Every point here is produced by the same `bristlePoint` the footprint pass
 * uses, on a tuft solved by the same spine solver. Nothing is drawn from
 * imagination — if a row does not exist, the shape simply does not have it.
 */
if (MODE === 'model') {
  const out: Record<string, unknown> = {};
  for (const slug2 of ['round-sable', 'flat-sable']) {
    const def = BRUSH_BY_SLUG.get(slug2)!;
    const st = new StrokeEngine(def, 1.0);
    const mx = new Float32Array(8); mx[0] = 1;
    st.charge(mx, 1.0, 0);
    /* Two poses, both produced by the engine rather than posed by hand.
       RESTING is pressure 0: the tuft hovers clear of the paper, so this is its
       own shape. PRESSED is a working stroke — pressure 0.65 with the brush
       moving, which is when it bends, splays and actually touches. `begin` only
       records where the stroke started; `add` is what solves the tuft. */
    const pose = process.argv[3] === 'pressed' ? 'pressed' : 'resting';
    const press = pose === 'pressed' ? 0.65 : 0;
    st.begin(0, 0, sample({ pressure: press }));
    if (pose === 'pressed') {
      for (let i = 1; i <= 10; i++) st.add(i * 0.9, 0, sample({ pressure: press }));
    } else {
      st.add(0, 0, sample({ pressure: press }));
    }
    st.drain();
    const brush: any = (st as any).brush;
    const B = def.bristles, J = def.segments + 1;
    // Splay is geometric and comes from how many joints are actually touching.
    const contact = brush.spines.reduce(
      (n: number, sp: any) => n + sp.joints.filter((j: any) => j.contact).length, 0);
    const splay = 1 + def.splayFromPressure * (contact / (brush.spines.length * J));
    const hairR = Math.max(0.45, (def.widthRatio * brush.tuftLength) / B * 0.5);

    const hairs = [];
    for (let b = 0; b < B; b++) {
      const u = B === 1 ? 0.5 : b / (B - 1);
      const pts = [];
      for (let s = 0; s < J; s++) {
        const p = brush.bristlePoint(b, u, s, splay);
        pts.push([+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)]);
      }
      hairs.push(pts);
    }
    const res = brush.reservoir;
    const cap = [];
    for (let s = 0; s < J; s++) cap.push(+res.capacity[s].toFixed(4));

    out[slug2] = {
      def,
      tuftLength: brush.tuftLength,
      segmentLengths: brush.spines[0].lengths.map((n: number) => +n.toFixed(4)),
      stiffnessPerSegment: brush.spines[0].stiffness.map((n: number) => +n.toFixed(4)),
      spines: brush.spines.map((sp: any) =>
        sp.joints.map((j: any) => [+j.x.toFixed(4), +j.y.toFixed(4), +j.z.toFixed(4)])),
      hairs,
      hairRadius: +hairR.toFixed(4),
      pose,
      splay: +splay.toFixed(4),
      jointsTouching: brush.spines.reduce(
        (n: number, sp: any) => n + sp.joints.filter((j: any) => j.contact).length, 0),
      capacityPerSegment: cap,
    };
  }
  console.log(JSON.stringify(out));
}

/* ------------------------------------------------------------------- film --
 * Record a whole action, frame by frame, straight out of the spine solver:
 * touch down, press, pull, release, settle. Every frame is engine output — the
 * viewer plays these back, it does not simulate anything of its own.
 */
if (MODE === 'film') {
  const out: Record<string, unknown> = {};
  for (const slug2 of ['round-sable', 'flat-sable', 'flat-hog']) {
    const def = BRUSH_BY_SLUG.get(slug2)!;
    const st = new StrokeEngine(def, 1.0);
    const mx = new Float32Array(8); mx[0] = 1;
    st.charge(mx, 1.0, 0);
    const brush: any = (st as any).brush;
    const B = def.bristles, J = def.segments + 1;

    const frames: unknown[] = [];
    const grab = (phase: string) => {
      const contact = brush.spines.reduce(
        (n: number, sp: any) => n + sp.joints.filter((j: any) => j.contact).length, 0);
      const splay = 1 + def.splayFromPressure * (contact / (brush.spines.length * J));
      const hairs = [];
      for (let b = 0; b < B; b++) {
        const u = B === 1 ? 0.5 : b / (B - 1);
        const pts = [];
        for (let s = 0; s < J; s++) {
          const p = brush.bristlePoint(b, u, s, splay);
          pts.push(+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2));
        }
        hairs.push(pts);
      }
      frames.push({
        phase, contact, splay: +splay.toFixed(3),
        spines: brush.spines.map((sp: any) =>
          sp.joints.flatMap((j: any) => [+j.x.toFixed(2), +j.y.toFixed(2), +j.z.toFixed(2)])),
        hairs,
      });
    };

    const pose = (x: number, pressure: number, dx: number) =>
      ({ x, y: 0, pressure, tiltAngle: 0, tiltAzimuth: 0, twist: 0, dx, dy: 0 });

    let x = 0;
    brush.begin(pose(0, 0, 0));
    for (let i = 0; i < 4; i++) { brush.solve(pose(x, 0, 0)); grab('hover'); }
    // Press: straight down, no travel. This is the smash.
    for (let i = 1; i <= 12; i++) { brush.solve(pose(x, (i / 12) * 0.9, 0)); grab('press'); }
    // Pull: hold the pressure and travel. This is the bend.
    for (let i = 0; i < 18; i++) { x += 0.9; brush.solve(pose(x, 0.9, 0.9)); grab('pull'); }
    // Release: the engine's own end-of-stroke, then hovering.
    brush.end();
    grab('release');
    for (let i = 0; i < 14; i++) { brush.solve(pose(x, 0, 0)); grab('settle'); }

    out[slug2] = {
      def, tuftLength: brush.tuftLength,
      segmentLengths: brush.spines[0].lengths.map((n: number) => +n.toFixed(3)),
      stiffnessPerSegment: brush.spines[0].stiffness.map((n: number) => +n.toFixed(3)),
      capacityPerSegment: Array.from({ length: J }, (_, s) => +brush.reservoir.capacity[s].toFixed(3)),
      hairRadius: +Math.max(0.45, (def.widthRatio * brush.tuftLength) / B * 0.5).toFixed(3),
      spineCount: brush.spines.length,
      joints: J, hairCount: B,
      releaseFrame: frames.findIndex((f: any) => f.phase === 'release'),
      frames,
    };
  }
  console.log(JSON.stringify(out));
}

/* ------------------------------------------------------------------- tuft --
 * The carrier for a tuft-fill experiment.
 *
 * Records the SPINES only — where the solved chain actually is, and where its
 * straight rest line would be — for every frame of the same action `film`
 * records. No hairs. The hairs are what is being redesigned, so recording the
 * current ones would only bake in the thing under review.
 *
 * The inspector reads this and generates a filled bundle on top of it. That
 * keeps the split honest: the spine is engine output, the fill is a proposal.
 */
if (MODE === 'tuft') {
  const out: Record<string, unknown> = {};
  for (const slug2 of ['round-sable', 'flat-sable', 'flat-hog']) {
    const def = BRUSH_BY_SLUG.get(slug2)!;
    const st = new StrokeEngine(def, 1.0);
    const mx = new Float32Array(8); mx[0] = 1;
    st.charge(mx, 1.0, 0);
    const brush: any = (st as any).brush;
    const J = def.segments + 1;
    const lengths: number[] = brush.spines[0].lengths;

    const frames: unknown[] = [];
    const grab = (phase: string, x: number, pressure: number) => {
      const contact = brush.spines.reduce(
        (n: number, sp: any) => n + sp.joints.filter((j: any) => j.contact).length, 0);
      /* The straight line the solver resets to every step, rebuilt with the same
         expressions Brush.solve uses. The whole film is untilted, so the tuft
         axis is straight down and this is the ferrule dropped by each segment
         length in turn. Recorded rather than assumed so a tilted take stays
         readable. */
      const rest = brush.spines.map((sp: any) => {
        const f = sp.joints[0];
        const pts = [+f.x.toFixed(3), +f.y.toFixed(3), +f.z.toFixed(3)];
        let z = f.z;
        for (const L of lengths) { z -= L; pts.push(+f.x.toFixed(3), +f.y.toFixed(3), +z.toFixed(3)); }
        return pts;
      });
      frames.push({
        phase, x: +x.toFixed(2), pressure: +pressure.toFixed(3), contact,
        spines: brush.spines.map((sp: any) =>
          sp.joints.flatMap((j: any) => [+j.x.toFixed(3), +j.y.toFixed(3), +j.z.toFixed(3)])),
        rest,
      });
    };

    const pose = (x: number, pressure: number, dx: number) =>
      ({ x, y: 0, pressure, tiltAngle: 0, tiltAzimuth: 0, twist: 0, dx, dy: 0 });

    let x = 0;
    brush.begin(pose(0, 0, 0));
    for (let i = 0; i < 4; i++) { brush.solve(pose(x, 0, 0)); grab('hover', x, 0); }
    for (let i = 1; i <= 12; i++) { const p = (i / 12) * 0.9; brush.solve(pose(x, p, 0)); grab('press', x, p); }
    for (let i = 0; i < 18; i++) { x += 0.9; brush.solve(pose(x, 0.9, 0.9)); grab('pull', x, 0.9); }
    brush.end();
    grab('release', x, 0);
    for (let i = 0; i < 14; i++) { brush.solve(pose(x, 0, 0)); grab('settle', x, 0); }

    out[slug2] = {
      def, tuftLength: brush.tuftLength,
      segmentLengths: lengths.map((n: number) => +n.toFixed(3)),
      stiffnessPerSegment: brush.spines[0].stiffness.map((n: number) => +n.toFixed(3)),
      spineCount: brush.spines.length,
      joints: J,
      hairCountNow: def.bristles,
      hairRadiusNow: +Math.max(0.45, (def.widthRatio * brush.tuftLength) / def.bristles * 0.5).toFixed(3),
      releaseFrame: frames.findIndex((f: any) => f.phase === 'release'),
      frames,
    };
  }
  console.log(JSON.stringify(out));
}

/* ----------------------------------------------------------------- spines --
 * Does anything at all make the two spines of a flat brush differ?
 *
 * [MEASURED, docs/14 E1] They are the same curve, offset by a fixed half-width,
 * on every frame of a straight pull. This mode is the instrument for fixing
 * that, and it is deliberately built BEFORE the fix: a straight untilted pull
 * cannot tell a working flat brush from a broken one, so a film made only of
 * those reads 0.000000 either way and would call a correct fix a failure.
 *
 * Five takes, three of which SHOULD move the two edges of a blade differently
 * and two of which should genuinely leave it symmetric:
 *
 *   straight    pulled dead straight, upright    -> symmetric, and must stay so
 *   arc         pulled round a bend              -> outer edge travels further
 *   tiltBroad   leaned, blade square to the lean -> ferrule level, symmetric
 *   tiltEdge    leaned, blade along the lean     -> one edge lower than the other
 *   roll        barrel-rolled while pressed      -> the ends sweep opposite arcs
 */
if (MODE === 'spines') {
  const spose = (o: Record<string, number>) =>
    ({ x: 0, y: 0, pressure: 0.9, tiltAngle: 0, tiltAzimuth: 0, twist: 0, dx: 0, dy: 0, ...o });

  const TAKES: { name: string; run: (b: any) => void }[] = [
    { name: 'straight', run: (b) => {
      let x = 0;
      for (let i = 1; i <= 10; i++) b.solve(spose({ x, pressure: (i / 10) * 0.9 }));
      for (let i = 0; i < 18; i++) { x += 0.9; b.solve(spose({ x, dx: 0.9 })); }
    } },
    { name: 'arc', run: (b) => {
      let x = 0, y = 0;
      for (let i = 1; i <= 10; i++) b.solve(spose({ x, y, pressure: (i / 10) * 0.9 }));
      for (let i = 0; i < 18; i++) {
        const th = (i / 17) * (Math.PI / 2);
        const dx = Math.cos(th) * 0.9, dy = Math.sin(th) * 0.9;
        x += dx; y += dy;
        // The hand turns with the stroke, which is what a painter does.
        b.solve(spose({ x, y, dx, dy, tiltAzimuth: (th * 180) / Math.PI }));
      }
    } },
    { name: 'tiltBroad', run: (b) => {
      let x = 0;
      for (let i = 1; i <= 10; i++) b.solve(spose({ x, pressure: (i / 10) * 0.9, tiltAngle: 50 }));
      for (let i = 0; i < 18; i++) { x += 0.9; b.solve(spose({ x, dx: 0.9, tiltAngle: 50 })); }
    } },
    { name: 'tiltEdge', run: (b) => {
      let x = 0;
      for (let i = 1; i <= 10; i++) b.solve(spose({ x, pressure: (i / 10) * 0.9, tiltAngle: 50, twist: 90 }));
      for (let i = 0; i < 18; i++) { x += 0.9; b.solve(spose({ x, dx: 0.9, tiltAngle: 50, twist: 90 })); }
    } },
    { name: 'roll', run: (b) => {
      for (let i = 1; i <= 10; i++) b.solve(spose({ pressure: (i / 10) * 0.9 }));
      for (let i = 0; i < 18; i++) b.solve(spose({ twist: (i / 17) * 90 }));
    } },
  ];

  console.log('Difference between the OUTERMOST spines, over every joint of every frame.');
  console.log('A flat brush with one spine worth of behaviour reads 0.000000 everywhere.');
  console.log('bow = how far the middle spine sits off the line joining the outer two.\n');
  /* Optional spine-count override: `node tools/brush-bench.mjs spines 3`. Lets
     the same five takes be run at two and at three spines without editing the
     library, so the bow is a comparison rather than an assertion. */
  const forceSpines = Number(process.argv[3]);
  for (const slug2 of ['flat-sable', 'flat-hog']) {
    const base = BRUSH_BY_SLUG.get(slug2)!;
    const def2 = Number.isFinite(forceSpines) && forceSpines > 0
      ? { ...base, spines: forceSpines } : base;
    const st0 = new StrokeEngine(def2, 1.0);
    const n = ((st0 as any).brush as any).spines.length;
    console.log(`${def2.name}  (${n} spines)`);
    console.log('  take        max |dx|   max |dz|   ferrule dz   bow');
    for (const take of TAKES) {
      const st = new StrokeEngine(def2, 1.0);
      const mx2 = new Float32Array(8); mx2[0] = 1;
      st.charge(mx2, 1.0, 0);
      const brush: any = (st as any).brush;
      brush.begin(spose({ pressure: 0 }));
      let mdx = 0, mdz = 0, mfz = 0, mbow = 0;
      const sample = () => {
        const sp = brush.spines;
        const a = sp[0].joints, c = sp[sp.length - 1].joints;
        /* SHAPE, not position. Each chain is taken relative to its own ferrule
           before comparing, because the two spines are PLACED half a blade
           apart and that offset swings into x as soon as the blade is rolled or
           the hand turns. Comparing raw positions reports the blade's own width
           as divergence -- 22.8 cells for a flat sable, on a take where the two
           chains are in fact the same curve. */
        for (let i = 0; i < a.length; i++) {
          mdx = Math.max(mdx, Math.abs((a[i].x - a[0].x) - (c[i].x - c[0].x)));
          mdz = Math.max(mdz, Math.abs((a[i].z - a[0].z) - (c[i].z - c[0].z)));
        }
        mfz = Math.max(mfz, Math.abs(a[0].z - c[0].z));
        /* With three or more spines: how far the middle sits off the straight
           line joining the outer two. A ruled sheet cannot bow at all, so this
           is zero for any two-spine blade by construction. */
        if (sp.length > 2) {
          const m = sp[(sp.length - 1) >> 1].joints;
          for (let i = 0; i < m.length; i++) {
            mbow = Math.max(mbow, Math.abs(m[i].x - (a[i].x + c[i].x) / 2));
            mbow = Math.max(mbow, Math.abs(m[i].z - (a[i].z + c[i].z) / 2));
          }
        }
      };
      const solve0 = brush.solve.bind(brush);
      brush.solve = (inp: any) => { solve0(inp); sample(); };
      take.run(brush);
      console.log(`  ${take.name.padEnd(10)}  ${mdx.toFixed(6)}   ${mdz.toFixed(6)}   ` +
        `${mfz.toFixed(6)}     ${n > 2 ? mbow.toFixed(6) : '-'}`);
    }
    console.log('');
  }
}

/* -------------------------------------------------------------------- fan --
 * How many spines is enough?
 *
 * The hairs between spines are interpolated straight, so a fan of N spines
 * draws a bowed blade as N-1 straight chords. This asks what that costs: solve
 * the same take with a dense fan, then ask where a coarse fan's interpolation
 * would have put the same across-blade position, and report the gap in cells.
 *
 * Two spines is the interesting number, because two spines have no interior to
 * interpolate — the chord IS the blade, and any bow at all is invisible to it.
 */
if (MODE === 'fan') {
  const fpose = (o: Record<string, number>) =>
    ({ x: 0, y: 0, pressure: 0.9, tiltAngle: 0, tiltAzimuth: 0, twist: 0, dx: 0, dy: 0, ...o });

  /* Pressure from the command line: `node tools/brush-bench.mjs fan 0.25`. It
     matters, because how far the tuft is driven past the paper decides whether
     the fan is sampling a curve at all -- see the chaos probe. */
  const FP = Number(process.argv[3] ?? 0.9);
  const runArc = (def3: any) => {
    const st = new StrokeEngine(def3, 1.0);
    const m = new Float32Array(8); m[0] = 1;
    st.charge(m, 1.0, 0);
    const b: any = (st as any).brush;
    b.begin(fpose({ pressure: 0 }));
    let x = 0, y = 0;
    for (let i = 1; i <= 10; i++) b.solve(fpose({ x, y, pressure: (i / 10) * FP }));
    for (let i = 0; i < 18; i++) {
      const th = (i / 17) * (Math.PI / 2);
      const dx = Math.cos(th) * 0.9, dy = Math.sin(th) * 0.9;
      x += dx; y += dy;
      b.solve(fpose({ x, y, dx, dy, pressure: FP, tiltAzimuth: (th * 180) / Math.PI }));
    }
    return b.spines.map((sp: any) => sp.joints.map((j: any) => [j.x, j.y, j.z]));
  };

  console.log('Blade drawn as straight chords between spines. How far the true');
  console.log(`curve sits from that, at the end of a 90-degree arc, pressure ${FP}:`);
  for (const slug3 of ['flat-sable', 'flat-hog']) {
    const base = BRUSH_BY_SLUG.get(slug3)!;
    const truth = runArc({ ...base, spines: 17 });      // dense reference
    console.log(`${base.name}`);
    for (const n of [2, 3, 5, 9]) {
      const fan = runArc({ ...base, spines: n });
      let worst = 0;
      // Walk the dense fan; for each, ask where the coarse fan would place it.
      for (let d = 0; d < truth.length; d++) {
        const u = d / (truth.length - 1);            // 0..1 across the blade
        const f = u * (n - 1);
        const k = Math.min(n - 2, Math.floor(f));
        const uu = f - k;
        for (let s = 0; s < truth[d].length; s++) {
          const a = fan[k][s], c = fan[k + 1][s], q = truth[d][s];
          const px = a[0] + (c[0] - a[0]) * uu;
          const py = a[1] + (c[1] - a[1]) * uu;
          const pz = a[2] + (c[2] - a[2]) * uu;
          worst = Math.max(worst, Math.hypot(px - q[0], py - q[1], pz - q[2]));
        }
      }
      console.log(`  ${String(n).padStart(2)} spines   worst gap ${worst.toFixed(3)} cells`);
    }
    console.log('');
  }
}

/* ------------------------------------------------------------------ chaos --
 * Is the blade bowing, or is the solver just unstable?
 *
 * A bow is a smooth thing: two spines placed a cell and a half apart should
 * solve to nearly the same curve, and the difference between them should shrink
 * as they are placed closer together. If it does not shrink, the spines are not
 * sampling a curve at all — they are landing in different crumple states, and
 * every "divergence" number measured off them is noise wearing a physics
 * costume.
 *
 * Place a dense fan, then report the WORST difference between neighbouring
 * spines, against how far apart they were placed.
 */
if (MODE === 'chaos') {
  const cpose = (o: Record<string, number>) =>
    ({ x: 0, y: 0, pressure: 0.9, tiltAngle: 0, tiltAzimuth: 0, twist: 0, dx: 0, dy: 0, ...o });

  const runArc = (def4: any, press: number) => {
    const st = new StrokeEngine(def4, 1.0);
    const m = new Float32Array(8); m[0] = 1;
    st.charge(m, 1.0, 0);
    const b: any = (st as any).brush;
    b.begin(cpose({ pressure: 0 }));
    let x = 0, y = 0;
    for (let i = 1; i <= 10; i++) b.solve(cpose({ x, y, pressure: (i / 10) * press }));
    for (let i = 0; i < 18; i++) {
      const th = (i / 17) * (Math.PI / 2);
      const dx = Math.cos(th) * 0.9, dy = Math.sin(th) * 0.9;
      x += dx; y += dy;
      b.solve(cpose({ x, y, dx, dy, pressure: press, tiltAzimuth: (th * 180) / Math.PI }));
    }
    return b.spines.map((sp: any) => sp.joints.map((j: any) => [j.x, j.y, j.z]));
  };

  console.log('Worst SHAPE difference between NEIGHBOURING spines at the end of an arc.');
  console.log('Each chain is taken relative to its own ferrule first, so this is shape,');
  console.log('not placement. If the blade is a curve, this falls with the spacing.\n');
  const dOv = Number(process.argv[3]);
  for (const slug4 of ['flat-sable']) {
    const base0 = BRUSH_BY_SLUG.get(slug4)!;
    const base = dOv > 0 ? { ...base0, drive: dOv } : base0;
    const halfW = 0.5 * base.widthRatio * base.length;
    for (const press of [0.9, 0.5]) {
      console.log(`${base.name}, pressure ${press.toFixed(2)}`);
      for (const n of [3, 5, 9, 17]) {
        const fan = runArc({ ...base, spines: n }, press);
        const spacing = (2 * halfW) / (n - 1);
        let worst = 0;
        for (let k = 0; k + 1 < n; k++) {
          const a = fan[k], c = fan[k + 1];
          for (let s = 0; s < a.length; s++) {
            worst = Math.max(worst, Math.hypot(
              (a[s][0] - a[0][0]) - (c[s][0] - c[0][0]),
              (a[s][1] - a[0][1]) - (c[s][1] - c[0][1]),
              (a[s][2] - a[0][2]) - (c[s][2] - c[0][2])));
          }
        }
        console.log(`  ${String(n).padStart(2)} spines, placed ${spacing.toFixed(2)} cells apart` +
          `   worst neighbour gap ${worst.toFixed(3)} cells`);
      }
      console.log('');
    }
  }
}

/* ------------------------------------------------------------------ drive --
 * Does the crumpling track how far the tuft is DRIVEN, or the pressure dial?
 *
 * [MEASURED, docs/14 E8] A dense fan of spines stopped converging above about
 * quarter pressure — two spines placed 1.4 cells apart solving 22 cells apart.
 * The inference was that the ferrule is being shoved most of a tuft-length past
 * the paper and five segments can only absorb that by folding up. Inference is
 * not measurement, so: hold the pressure dial still and move the drive instead.
 *
 * If crumpling follows the DEPTH, the same pressure will converge at a low drive
 * and not at a high one. If it follows the DIAL, nothing here will change.
 */
if (MODE === 'drive') {
  const dpose = (o: Record<string, number>) =>
    ({ x: 0, y: 0, pressure: 0.9, tiltAngle: 0, tiltAzimuth: 0, twist: 0, dx: 0, dy: 0, ...o });

  const runArc = (def5: any, press: number) => {
    const st = new StrokeEngine(def5, 1.0);
    const m = new Float32Array(8); m[0] = 1;
    st.charge(m, 1.0, 0);
    const b: any = (st as any).brush;
    b.begin(dpose({ pressure: 0 }));
    let x = 0, y = 0;
    for (let i = 1; i <= 10; i++) b.solve(dpose({ x, y, pressure: (i / 10) * press }));
    for (let i = 0; i < 18; i++) {
      const th = (i / 17) * (Math.PI / 2);
      const dx = Math.cos(th) * 0.9, dy = Math.sin(th) * 0.9;
      x += dx; y += dy;
      b.solve(dpose({ x, y, dx, dy, pressure: press, tiltAzimuth: (th * 180) / Math.PI }));
    }
    return b;
  };

  /** Worst shape difference between neighbouring spines of a dense fan. */
  const spread = (b: any) => {
    const sp = b.spines;
    let worst = 0;
    for (let k = 0; k + 1 < sp.length; k++) {
      const a = sp[k].joints, c = sp[k + 1].joints;
      for (let i = 0; i < a.length; i++) {
        worst = Math.max(worst, Math.hypot(
          (a[i].x - a[0].x) - (c[i].x - c[0].x),
          (a[i].y - a[0].y) - (c[i].y - c[0].y),
          (a[i].z - a[0].z) - (c[i].z - c[0].z)));
      }
    }
    return worst;
  };

  /** The sharpest corner anywhere in the tuft, in degrees.
   *
   *  Replaces a counter of sign flips, which was a threshold and behaved like
   *  one: it read 4 folds at drive 0.35, 0 at 0.20 and 0 at 0.15, flickering on
   *  chains that were only marginally folded. An angle is continuous, so a tuft
   *  that is bending reads small and one that is doubling back reads near 180,
   *  with everything in between reported rather than rounded to a verdict. */
  const kinks = (b: any) => {
    let worst = 0;
    for (const sp of b.spines) {
      const j = sp.joints;
      for (let i = 1; i + 1 < j.length; i++) {
        const ax = j[i].x - j[i - 1].x, ay = j[i].y - j[i - 1].y, az2 = j[i].z - j[i - 1].z;
        const bx2 = j[i + 1].x - j[i].x, by2 = j[i + 1].y - j[i].y, bz2 = j[i + 1].z - j[i].z;
        const la = Math.hypot(ax, ay, az2) || 1, lb = Math.hypot(bx2, by2, bz2) || 1;
        const cos = (ax * bx2 + ay * by2 + az2 * bz2) / (la * lb);
        worst = Math.max(worst, (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
      }
    }
    return Math.round(worst);
  };

  const base = BRUSH_BY_SLUG.get(process.argv[3] ?? 'flat-sable')!;
  const L = base.length;
  console.log('Flat Sable, tuft ' + L + ' cells. Pressure held at 0.90 throughout.');
  console.log('Neighbour gap is measured with a 17-spine fan placed 1.42 cells apart:');
  console.log('a blade that is bending reads small, one that is buckling reads large.\n');
  console.log('  drive   depth at p0.9   neighbour gap   sharpest bend   joints down');
  for (const d of [1.0, 0.8, 0.6, 0.5, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15]) {
    const dense = runArc({ ...base, spines: 17, drive: d }, 0.9);
    const real = runArc({ ...base, spines: base.spines ?? 2, drive: d }, 0.9);
    const depth = (-0.05 * d * L) + d * L * 0.9;
    const down = real.spines.reduce(
      (n: number, sp: any) => n + sp.joints.filter((j: any) => j.contact).length, 0);
    console.log(`  ${d.toFixed(2)}    ${depth.toFixed(1).padStart(5)} cells` +
      ` (${((depth / L) * 100).toFixed(0).padStart(2)}%)   ${spread(dense).toFixed(3).padStart(9)}` +
      `        ${(kinks(dense) + ' deg').padStart(7)}   ${String(down).padStart(5)} of ${real.spines.length * (base.segments + 1)}`);
  }
  /* Contact, measured the way the paint is actually laid: walk the footprint
     the deposit pass consumes and report how much of it there is and how long
     each hair's track is. `joints touching` counts joints at exactly z <= 0 and
     undercounts badly -- a tuft lying along the surface a third of a cell up
     lays paint and scores nothing. */
  const footprint = (def6: any, press: number) => {
    const st = new StrokeEngine(def6, 1.0);
    const m = new Float32Array(8); m[0] = 1;
    st.charge(m, 1.0, 0);
    const b: any = (st as any).brush;
    b.begin(dpose({ pressure: 0 }));
    let x = 0;
    for (let i = 1; i <= 10; i++) b.solve(dpose({ x, pressure: (i / 10) * press }));
    const buf = new Float32Array(4096 * SEG_FLOATS);
    /* Emit after EVERY solve, as the real loop does. A hair's mark is the ground
       it covered since the last step, so a single emit at the end has no history
       to measure against and every track comes out exactly zero -- which is what
       the first version of this probe reported, and it was the probe lying. */
    let n = 0;
    for (let i = 0; i < 10; i++) {
      x += 0.9;
      b.solve(dpose({ x, dx: 0.9, pressure: press }));
      n = b.emitFootprint(buf, 0, 4096);
    }
    let lo = Infinity, hi = -Infinity, len = 0, water = 0, bite = 0;
    for (let i = 0; i < n; i++) {
      const o = i * SEG_FLOATS;
      len += Math.hypot(buf[o + 2] - buf[o], buf[o + 3] - buf[o + 1]);
      lo = Math.min(lo, buf[o + 1], buf[o + 3]);
      hi = Math.max(hi, buf[o + 1], buf[o + 3]);
      water += buf[o + 5];        // what the deposit pass actually lays
      bite += buf[o + 7];         // how hard each hair is pushed into the tooth
    }
    return { segs: n, track: n ? len / n : 0, across: n ? hi - lo : 0,
             water, press: n ? bite / n : 0 };
  };

  console.log('');
  console.log('What the deposit pass actually receives, across the pressure dial.');
  console.log('track = how far each hair is dragged per step: a stamp reads near zero,');
  console.log('hairs pulled through paint read long.');
  console.log('');
  for (const d of [1.0, 0.5, 0.35, 0.25]) {
    console.log('  drive ' + d.toFixed(2));
    console.log('    pressure   segs   water laid   mean press   blade down   sharpest bend');
    for (const pr of [0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 1.0]) {
      const dense = runArc({ ...base, spines: 17, drive: d }, pr);
      const f = footprint({ ...base, drive: d }, pr);
      console.log('    ' + pr.toFixed(2) + '    ' + String(f.segs).padStart(5) +
        '   ' + f.water.toFixed(3).padStart(8) + '    ' + f.press.toFixed(3).padStart(7) +
        '     ' + f.across.toFixed(1).padStart(5) + ' of ' + (base.widthRatio * L).toFixed(1) +
        '      ' + (kinks(dense) + ' deg').padStart(7));
    }
    console.log('');
  }

  /* The ramp is a STAIRCASE, and the steps are joints.
   *
   * `press` in the footprint is 1 - z/SLAB, which saturates at 1 the moment a
   * joint reaches the paper. So pressing harder does not push an already-down
   * joint harder; it only brings the NEXT joint down. With six joints per spine
   * there are at most six steps in the whole dial, and at a shallow drive only
   * three of them are reachable. A deep drive hid this by having more steps --
   * it was buying ramp resolution with the same depth that made the tuft fold.
   *
   * Chain resolution is the honest place to buy it back. Stiffness is respread
   * as the segment count changes (`stiffnessTaper ** (n-1)` held constant), or
   * a longer chain would arrive with a much softer tip and the comparison would
   * be measuring that instead.
   */
  console.log('Ramp resolution against chain length, at drive 0.35.');
  console.log('water laid at each pressure -- a good ramp climbs at every step.');
  console.log('');
  for (const segs of [5, 7, 9, 12]) {
    const taper = Math.pow(base.stiffnessTaper, 4 / (segs - 1));
    const def7 = { ...base, drive: 0.35, segments: segs, stiffnessTaper: taper };
    const row: string[] = [];
    let kink = 0;
    for (const pr of [0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 1.0]) {
      row.push(footprint(def7, pr).water.toFixed(2).padStart(6));
      kink = Math.max(kink, kinks(runArc({ ...def7, spines: 17 }, pr)));
    }
    console.log('  ' + String(segs).padStart(2) + ' segments  taper ' + taper.toFixed(3) +
      '  ' + row.join('') + '   worst bend ' + kink + ' deg' +
      '   cost ' + (base.bristles * (segs + 1)) + ' segs/step');
  }
  console.log('');
}

/* ------------------------------------------------------------------- fill --
 * The two claims the tuft rebuild was sold on, measured on the SHIPPED brush
 * rather than on the prototype in tools/tuft/.
 *
 *   1. how much of a mark's own area actually has paint in it
 *   2. how evenly the hair tracks are spaced across the blade
 *
 * Both are read straight off the footprint the deposit pass is handed, so this
 * is the engine answering, not a model of it.
 */
if (MODE === 'fill') {
  const fpose2 = (o: Record<string, number>) =>
    ({ x: 0, y: 0, pressure: 0.75, tiltAngle: 0, tiltAzimuth: 0, twist: 0, dx: 0, dy: 0, ...o });

  const hull2 = (pts: number[][]) => {
    if (pts.length < 3) return pts;
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o: number[], a: number[], b: number[]) =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo: number[][] = [], up: number[][] = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
      up.push(q);
    }
    lo.pop(); up.pop();
    return lo.concat(up);
  };
  const areaOf = (h: number[][]) => {
    let a = 0;
    for (let i = 0; i < h.length; i++) { const j = (i + 1) % h.length; a += h[i][0] * h[j][1] - h[j][0] * h[i][1]; }
    return Math.abs(a) / 2;
  };

  console.log('Of the area each mark covers, how much actually has paint in it,');
  console.log('and how even the hair tracks are across the blade.');
  console.log('A comb reads 0% variation. A real tuft does not.\n');

  /* Optional hair-count multiplier: `node tools/brush-bench.mjs fill 0.5`.
     The cost of the fill is linear in the count and the quality of it is very
     nearly flat, so the two want measuring together before anyone pays. */
  const mult = Number(process.argv[3]) > 0 ? Number(process.argv[3]) : 1;
  for (const slug5 of ['round-sable', 'flat-sable', 'flat-hog']) {
    const base5 = BRUSH_BY_SLUG.get(slug5)!;
    const d5 = mult === 1 ? base5
      : { ...base5, bristles: Math.max(8, Math.round(base5.bristles * mult)) };
    console.log(`${d5.name}  ${d5.bristles} hairs`);
    console.log('    pressure   paint in the mark   tracks   spacing variation');
    for (const pr of [0.25, 0.5, 0.75, 1.0]) {
      const st = new StrokeEngine(d5, 1.0);
      const m = new Float32Array(8); m[0] = 1;
      st.charge(m, 1.0, 0);
      const b: any = (st as any).brush;
      b.begin(fpose2({ pressure: 0 }));
      let x = 0;
      for (let i = 1; i <= 10; i++) b.solve(fpose2({ x, pressure: (i / 10) * pr }));
      const buf = new Float32Array(8192 * SEG_FLOATS);
      let n = 0;
      for (let i = 0; i < 6; i++) {
        x += 0.9;
        b.solve(fpose2({ x, dx: 0.9, pressure: pr }));
        n = b.emitFootprint(buf, 0, 8192);
      }
      const r = b.hairR ?? 0.5;

      // Ink every footprint point, then count only what lands inside the mark's
      // own outline -- the band a disc paints outside the edge otherwise reads
      // as more than a full mark and measures the rim, not the middle.
      const pts: number[][] = [];
      for (let i = 0; i < n; i++) { const o = i * SEG_FLOATS; pts.push([buf[o], buf[o + 1]], [buf[o + 2], buf[o + 3]]); }
      let frac = 0;
      if (pts.length >= 3) {
        const C = 0.15;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
        x0 -= r + C; x1 += r + C; y0 -= r + C; y1 += r + C;
        const W = Math.ceil((x1 - x0) / C), H = Math.ceil((y1 - y0) / C);
        const g = new Uint8Array(W * H), rc = Math.ceil(r / C);
        for (const p of pts) {
          const cx = Math.round((p[0] - x0) / C), cy = Math.round((p[1] - y0) / C);
          for (let dy = -rc; dy <= rc; dy++) for (let dx = -rc; dx <= rc; dx++) {
            if (dx * dx + dy * dy > rc * rc) continue;
            const gx = cx + dx, gy = cy + dy;
            if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
            g[gy * W + gx] = 1;
          }
        }
        const h = hull2(pts), A = areaOf(h);
        let on = 0;
        for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
          if (!g[gy * W + gx]) continue;
          const px = x0 + gx * C, py = y0 + gy * C;
          let inside = false;
          for (let i = 0, j = h.length - 1; i < h.length; j = i++) {
            if ((h[i][1] > py) !== (h[j][1] > py) &&
                px < ((h[j][0] - h[i][0]) * (py - h[i][1])) / (h[j][1] - h[i][1]) + h[i][0]) inside = !inside;
          }
          if (inside) on++;
        }
        frac = A > 0 ? (on * C * C) / A : 0;
      }

      // Spacing between neighbouring tracks across the stroke.
      const ys = [...new Set(pts.map((p) => +p[1].toFixed(4)))].sort((a, b2) => a - b2);
      const gaps: number[] = [];
      for (let i = 1; i < ys.length; i++) gaps.push(ys[i] - ys[i - 1]);
      let cv = 0;
      if (gaps.length > 1) {
        const mu2 = gaps.reduce((a, b2) => a + b2, 0) / gaps.length;
        cv = Math.sqrt(gaps.reduce((a, b2) => a + (b2 - mu2) * (b2 - mu2), 0) / gaps.length) / (mu2 || 1);
      }
      console.log(`    ${pr.toFixed(2)}          ${(frac * 100).toFixed(0).padStart(3)}%` +
        `            ${String(ys.length).padStart(4)}        ${(cv * 100).toFixed(0).padStart(3)}%`);
    }
    console.log('');
  }
}

/* ------------------------------------------------------------------ reach --
 * What the tooth gate is being handed.
 *
 * `deposit.wgsl` gates every contact on `smoothstep(need - hw, need + hw, ride)`
 * where `need = 1 - reach` and `hw` narrows with viscosity: at Oil's 0.85 it is
 * 0.18 * 0.15 = 0.027, a ramp 0.054 wide, which is a threshold in all but name.
 * So the question is how steady `reach` is. If it wobbles by more than a few
 * hundredths from one solve step to the next, that near-binary gate turns the
 * wobble into hairs switching fully on and fully off.
 */
if (MODE === 'reach') {
  const which = process.argv[3] ?? 'flat-hog';
  const st = new StrokeEngine(BRUSH_BY_SLUG.get(which)!, 1.0);
  const m = new Float32Array(8); m[0] = 1;
  st.charge(m, 1.0, 0);
  const REPORT = Number(process.argv[4] ?? 0.8);
  st.begin(60, 100, sample({ pressure: 0.65 }));
  const rows: { n: number; mean: number; lo: number; hi: number; adv: number }[] = [];
  let prevCx = 60;
  for (let i = 1; i <= Math.ceil(60 * 0.8 / REPORT); i++) {
    st.add(60 + i * REPORT, 100, sample({ pressure: 0.65, time: i }));
    const { data, count } = st.drain();
    let s = 0, lo = 1, hi = 0, cx = 0;
    for (let j = 0; j < count; j++) {
      const r = data[j * SEG_FLOATS + 7];
      s += r; lo = Math.min(lo, r); hi = Math.max(hi, r);
      cx += data[j * SEG_FLOATS + 2];
    }
    if (!count) continue;
    rows.push({ n: count, mean: s / count, lo, hi, adv: cx / count - prevCx });
    prevCx = cx / count;
  }
  const use = rows.slice(10);
  const cv = (v: number[]) => {
    const mu = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / v.length) / (mu || 1);
  };
  const means = use.map((r) => r.mean);
  console.log(`${which} — per stylus REPORT of ${REPORT} cells (${Math.max(1, Math.ceil(REPORT / 0.9))} solve steps each)`);
  console.log(`  contact reach: mean ${(means.reduce((a, b) => a + b, 0) / means.length).toFixed(4)}`
    + `  swing ${Math.min(...means).toFixed(4)}-${Math.max(...means).toFixed(4)}`
    + `  CV ${cv(means).toFixed(4)}`);
  console.log(`  tuft advance : CV ${cv(use.map((r) => r.adv)).toFixed(4)}`
    + `  ${Math.min(...use.map((r) => r.adv)).toFixed(3)}-${Math.max(...use.map((r) => r.adv)).toFixed(3)}`);
  console.log(`  segments/step: CV ${cv(use.map((r) => r.n)).toFixed(4)}`
    + `  ${Math.min(...use.map((r) => r.n))}-${Math.max(...use.map((r) => r.n))}`);
  console.log('  reach per step: ' + use.slice(0, 30).map((r) => r.mean.toFixed(3)).join(' '));
  console.log('  advance      : ' + use.slice(0, 30).map((r) => r.adv.toFixed(3)).join(' '));
  // How much of the tuft sits inside Oil's gate ramp, where a hundredth of
  // reach is the difference between laying paint and laying none.
  console.log('  reach spread within one step: '
    + use.slice(0, 12).map((r) => `${r.lo.toFixed(2)}-${r.hi.toFixed(2)}`).join('  '));
}

/* ---------------------------------------------------------------- density --
 * THE FISHSCALE, MEASURED IN NODE.
 *
 * docs/19 E11 put the residual ripple in the BRUSH FOOTPRINT — the CPU
 * footprint stage carried 0.06279, larger than anything downstream of it. So it
 * can be measured here, with no GPU, no browser and no frame scheduler, which
 * means in a second rather than a bench run and identically every time.
 *
 * This is a deliberate REPLICA of `fish-scale-bench.ts`'s CPU footprint stage —
 * same X0/X1, same 84 reports (four cells apart), same GROUP of 4, same
 * CORRIDOR, same TREND_RADIUS detrend, and `rasterFootprint` copied line for
 * line. If it does not return the bench's figure it is not measuring the same
 * thing and nothing it says can be trusted.
 *
 * [TRAP that cost a session] The first version of this probe omitted
 * `setWetMedium`, so it ran the WATER withdrawal path. Oil is a body paint and
 * takes a different branch in `Reservoir.withdraw` entirely. It read dead flat
 * and looked like a refutation of E11.
 */
if (MODE === 'density') {
  const which = process.argv[3] ?? 'flat-hog';
  const mediumSlug = process.argv[4] ?? 'oil';
  const medium = WET_MEDIA.find((m) => m.slug === mediumSlug)!;
  const X0 = 88, X1 = 424, YMID = 256, INPUTS = 84, N = 512;
  const CORRIDOR = 42, TREND = 16;

  const movingMean = (v: number[], r: number) => {
    const pre = new Array(v.length + 1).fill(0);
    for (let i = 0; i < v.length; i++) pre[i + 1] = pre[i] + v[i];
    return v.map((_x, i) => {
      const lo = Math.max(0, i - r), hi = Math.min(v.length - 1, i + r);
      return (pre[hi + 1] - pre[lo]) / (hi - lo + 1);
    });
  };
  const residual = (v: number[], r = TREND) => {
    const t = movingMean(v, r); return v.map((x, i) => x - t[i]);
  };
  const rms = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / Math.max(1, v.length));
  const smooth3 = (lo: number, hi: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - lo) / Math.max(hi - lo, 1e-9)));
    return t * t * (3 - 2 * t);
  };
  const repeatLag = (v: number[]) => {
    const r = residual(v).slice(24, -24);
    if (r.reduce((s, x) => s + x * x, 0) < 1e-18) return { lag: 0, c: 0 };
    let bl = 0, best = -1;
    for (let lag = 2; lag <= 40 && lag < r.length / 2; lag++) {
      let ab = 0, aa = 0, bb = 0;
      for (let i = 0; i + lag < r.length; i++) { ab += r[i] * r[i + lag]; aa += r[i] * r[i]; bb += r[i + lag] * r[i + lag]; }
      const c = ab / Math.max(Math.sqrt(aa * bb), 1e-18);
      if (c > best) { best = c; bl = lag; }
    }
    return { lag: bl, c: +best.toFixed(3) };
  };

  /** `fish-scale-bench.ts` rasterFootprint, copied. */
  const raster = (dst: Float64Array, data: Float32Array, count: number) => {
    for (let i = 0; i < count; i++) {
      const o = i * SEG_FLOATS;
      const ax = data[o], ay = data[o + 1], bx = data[o + 2], by = data[o + 3];
      const radius = data[o + 4], water = data[o + 5], reach = data[o + 7];
      const minX = Math.max(0, Math.floor(Math.min(ax, bx) - radius - 1));
      const maxX = Math.min(N - 1, Math.ceil(Math.max(ax, bx) + radius + 1));
      const minY = Math.max(0, Math.floor(Math.min(ay, by) - radius - 1));
      const maxY = Math.min(N - 1, Math.ceil(Math.max(ay, by) + radius + 1));
      const abx = bx - ax, aby = by - ay, len2 = abx * abx + aby * aby;
      const need = 1 - Math.max(0, Math.min(1, reach));
      const gate = smooth3(need - 0.18, need + 0.18, 1);
      for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
        const px = cx + 0.5, py = cy + 0.5;
        const t = len2 < 1e-8 ? 0 : Math.max(0, Math.min(1,
          ((px - ax) * abx + (py - ay) * aby) / len2));
        const d = Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
        if (d >= radius + 0.5) continue;
        const cov = Math.max(0, Math.min(1, radius - d + 0.5));
        const prof = 1 - 0.55 * Math.max(0, Math.min(1, d / Math.max(radius, 1e-3)));
        dst[cy * N + cx] += cov * prof * gate * water;
      }
    }
  };

  const run = (group: number, flow: number, label: string, inputs = INPUTS) => {
    const st = new StrokeEngine(BRUSH_BY_SLUG.get(which)!, 1);
    st.setWetMedium(medium);
    st.setBrush(BRUSH_BY_SLUG.get(which)!, 1);
    if (flow !== 1) (st as any).setFlow(flow);
    const m = new Float32Array(8); m[0] = 1;
    st.charge(m, 1, 0);
    const field = new Float64Array(N * N);
    st.begin(X0, YMID, sample({ pointerType: 'mouse', pressure: 0.5 }));
    for (let k = 1; k <= inputs; k++) {
      st.add(X0 + ((X1 - X0) * k) / inputs, YMID, sample({ pointerType: 'mouse', pressure: 0.5 }));
      if (k % group === 0 || k === inputs) {
        const d = st.drain();
        raster(field, d.data, d.count);
      }
    }
    st.end();
    const volumes: number[] = [];
    /* THICKNESS, not volume — and the difference is the whole measurement.
     *
     * A column SUM over 85 rows averages the mark's own noise away: it answers
     * "how much paint is in this column", which is nearly constant by
     * conservation whatever the paint is doing inside the column. The eye reads
     * Kubelka-Munk on the film depth AT A POINT. So take the same quantity
     * `analyseTone` takes from the rendered picture: the thickest few cells in a
     * narrow band on the centreline. On the same field the two differ by more
     * than an order of magnitude, and only one of them is the complaint. */
    const thick: number[] = [];
    for (let x = X0; x <= X1; x++) {
      let v = 0;
      for (let y = YMID - CORRIDOR; y <= YMID + CORRIDOR; y++) v += field[y * N + x];
      volumes.push(v);
      const band: number[] = [];
      for (let y = YMID - 7; y <= YMID + 7; y++) band.push(field[y * N + x]);
      band.sort((a, b) => b - a);
      thick.push(band.slice(0, 8).reduce((a, b) => a + b, 0) / 8);
    }
    const inner = volumes.slice(24, -24);
    const mean = inner.reduce((a, b) => a + b, 0) / inner.length;
    const ripple = rms(residual(volumes).slice(24, -24)) / Math.max(mean, 1e-9);
    const tInner = thick.slice(24, -24);
    const tMean = tInner.reduce((a, b) => a + b, 0) / tInner.length;
    const tRipple = rms(residual(thick).slice(24, -24)) / Math.max(tMean, 1e-9);
    const { lag, c } = repeatLag(thick);
    console.log(`  ${label.padEnd(30)} thickness ${tRipple.toFixed(5)}`
      + `   repeat ${String(lag).padStart(2)} (r ${c.toFixed(2)})`
      + `   volume ${ripple.toFixed(5)}   mean ${tMean.toFixed(4)}`);
    if (process.argv.includes('--profile')) {
      const r = residual(thick);
      console.log('      ' + r.slice(30, 100).map((v) => (v / tMean).toFixed(2)).join(' '));
    }
    return tRipple;
  };

  console.log(`${which} / ${medium.name} — CPU footprint, replica of the fish-scale bench`);
  run(4, 1, 'as the bench runs it');
  run(1, 1, 'one report per frame');
  run(16, 1, 'sixteen reports per frame');
  console.log('  --- the artist\'s Flow clue ---');
  for (const f of [0, 0.25, 0.5, 1, 2]) run(4, f, `flow ${f}`);
  /* SLOW AGAINST FAST — the artist's own observation, and the one symptom no
     instrument here has yet reproduced. Speed is cells between stylus reports:
     the same 336-cell stroke, reported more or less often. Frame bundling is
     held at one report per frame so this is the hand's sampling alone. */
  console.log('  --- speed: cells between stylus reports ---');
  for (const [inputs, gap] of [[336, 1], [168, 2], [112, 3], [84, 4], [56, 6], [42, 8], [28, 12], [21, 16]] as const) {
    run(1, 1, gap + ' cells per report', inputs);
  }
}

/* ----------------------------------------------------------------- dryout --
 * HOW LONG DOES ONE DIP LAST?
 *
 * The artist's question, 2026-08-29: "how long are these brushes holding on to
 * oil? It seems too long by a lot."
 *
 * `legs` already asks something close, but it runs the WATER withdrawal path
 * for every medium, and oil is a body paint that takes a different branch in
 * `Reservoir.withdraw` entirely. This sets the medium first.
 *
 * Reports, for one full dip dragged in a straight line:
 *   - what the tuft still holds, every 100 cells
 *   - the cell where the paint being laid falls below 50 %, 10 % and 1 % of
 *     what the same brush laid at the start
 *   - the cell where the tuft's own holding falls below 1 % of capacity, which
 *     is the definition the on-canvas dry-out mark uses
 */
if (MODE === 'dryout') {
  const LEN = Number(process.argv[5] ?? 3000);
  console.log('one full dip, dragged straight, 0.8 cells per report');
  console.log('  brush / medium              laid/cell at start   50%   10%    1%   tuft empty   left at end');
  for (const slug of ['flat-hog', 'round-sable', 'flat-sable']) {
    const def2 = BRUSH_BY_SLUG.get(slug);
    if (!def2) continue;
    for (const mslug of ['oil', 'watercolour']) {
      const med = WET_MEDIA.find((m) => m.slug === mslug);
      if (!med) continue;
      const st = new StrokeEngine(def2, 1);
      st.setWetMedium(med);
      st.setBrush(def2, 1);
      const mx = new Float32Array(8); mx[0] = 1;
      st.charge(mx, 1, 0);
      st.begin(20, 200, sample({ pointerType: 'mouse', pressure: 0.5 }));
      const res = (st as { brush: { reservoir: Reservoir } }).brush.reservoir;
      let first = 0;
      let at50 = 0, at10 = 0, at1 = 0, empty = 0;
      for (let cell = 1; cell <= LEN; cell++) {
        st.add(20 + cell * 0.8, 200, sample({ pointerType: 'mouse', pressure: 0.5 }));
        const { data, count } = st.drain();
        let w = 0;
        for (let i = 0; i < count; i++) w += data[i * SEG_FLOATS + 5];
        if (cell <= 10) first = Math.max(first, w);
        if (!at50 && cell > 10 && w < first * 0.5) at50 = cell;
        if (!at10 && cell > 10 && w < first * 0.1) at10 = cell;
        if (!at1 && cell > 10 && w < first * 0.01) at1 = cell;
        // The same test the on-canvas mark uses: holding under 1 % of capacity.
        const t = res.totals();
        if (!empty && cell > 10
          && Math.max(t.water, t.pigment) < t.capacity * 0.01) empty = cell;
      }
      const t = res.totals();
      const held = 100 * Math.max(t.water, t.pigment) / Math.max(t.capacity, 1e-9);
      console.log(`  ${(slug + ' / ' + mslug).padEnd(28)}`
        + `${first.toFixed(4).padEnd(20)}`
        + `${String(at50 || '>' + LEN).padStart(5)} `
        + `${String(at10 || '>' + LEN).padStart(5)} `
        + `${String(at1 || '>' + LEN).padStart(5)} `
        + `${String(empty || '>' + LEN).padStart(12)} `
        + `${held.toFixed(1)}%`);
    }
  }
  console.log('  (cells of stroke; the canvas is 1024 cells across)');

  /* The on-canvas marks, from the same run. This is the check that the overlay
     is fed at all: if the ladder never fires here it will draw nothing there. */
  console.log('');
  console.log('dry-out marks the overlay would draw (flat-hog / oil, 3000 cells):');
  {
    const def3 = BRUSH_BY_SLUG.get('flat-hog')!;
    const med = WET_MEDIA.find((m) => m.slug === 'oil')!;
    const st = new StrokeEngine(def3, 1);
    st.setWetMedium(med);
    st.setBrush(def3, 1);
    const mx = new Float32Array(8); mx[0] = 1;
    st.charge(mx, 1, 0);
    st.begin(20, 200, sample({ pointerType: 'mouse', pressure: 0.5 }));
    for (let cell = 1; cell <= 3000; cell++) {
      st.add(20 + cell * 0.8, 200, sample({ pointerType: 'mouse', pressure: 0.5 }));
      st.drain();
    }
    const marks = (st as unknown as { dryMarks: Array<Record<string, number>> }).dryMarks;
    if (marks.length === 0) console.log('  none - the brush never got that low');
    for (const m of marks) {
      console.log(`  level ${String(m.level).padEnd(5)} at x ${m.x.toFixed(1)}`
        + ` (${((m.x - 20) / 0.8).toFixed(0)} cells in)`
        + `  blade ${m.dx.toFixed(2)},${m.dy.toFixed(2)}`
        + `  half-width ${m.half.toFixed(2)} cells`);
    }
  }
}

/* ------------------------------------------------------------------- load --
 * THE BRUSH LOAD, IN MILLILITRES.
 *
 * The artist supplied a coatings-industry sizing model, 2026-08-30:
 *
 *     wet film thickness = target dry film thickness / volume solids
 *     deposited volume   = stroke area * wet film thickness
 *     required load      = deposited volume / transfer efficiency
 *
 * with transfer efficiency 0.35 to 0.50. **The load a brush carries is one
 * stroke's worth of paint, divided by how much of it actually leaves.** So a
 * loaded brush should give up between a third and a half of everything it holds
 * in a single designed stroke — and E14 measured this engine giving up half its
 * load over 573 cells and still holding 12.8 % after three canvas widths.
 *
 * THE SCALE, and it had to be established before the model could be applied at
 * all. Nothing in `docs/` records what one cell is in millimetres. The brush
 * rows do, implicitly and unmistakably: the flat hog is `length: 22` with
 * `widthRatio: 1.05`, so a blade 23.1 cells wide on bristles 22 cells long.
 * At **one cell to one millimetre** that is a 23 mm blade on 22 mm bristles,
 * which is a real #12 flat hog, and the 512-cell grid becomes a 512 mm sheet —
 * a standard 20-inch canvas. No other scale makes both of those true at once.
 *
 * Film height rides the same ruler: Cotton Duck's `toothAmp` 0.30 is 0.30 mm of
 * weave depth, which is right for cotton duck, and the measured Oil film of
 * 0.018 is 18 microns wet. So **one unit of paint in the reservoir is one cubic
 * millimetre — one microlitre** — since depositing it with full coverage raises
 * a 1 mm x 1 mm cell by that many millimetres.
 *
 * [UNVERIFIED — arithmetic from the brush rows, not a measurement.] The paper
 * rows disagree: Cotton Duck's `featureFreq` 64 would be 64 threads across
 * 512 mm, far coarser than real canvas. That row is explicitly marked "chosen
 * to read correctly, not measured" in papers.ts, so the brush anchors the scale
 * and the thread count is the number that is wrong.
 */
if (MODE === 'load') {
  const DFT = Number(process.argv[3] ?? 40);        // microns, dry
  const SOLIDS = Number(process.argv[4] ?? 0.90);
  const TRANSFER = Number(process.argv[5] ?? 0.40);
  const STROKE_MM = Number(process.argv[6] ?? 250); // one designed stroke

  console.log(`the artist's model: DFT ${DFT} um, solids ${SOLIDS}, transfer ${TRANSFER},`
    + ` one stroke ${STROKE_MM} mm`);
  console.log('  1 cell = 1 mm, 1 paint unit = 1 mm^3 = 1 uL. Sheet is 512 mm.');
  console.log('');
  console.log('  brush / medium              blade   MODEL load   HAS      MODEL lays   LAYS'
    + '     transfer    WFT');
  for (const slug of ['flat-hog', 'round-sable', 'flat-sable']) {
    const def3 = BRUSH_BY_SLUG.get(slug);
    if (!def3) continue;
    for (const mslug of ['oil', 'watercolour']) {
      const med = WET_MEDIA.find((m) => m.slug === mslug);
      if (!med) continue;
      const st = new StrokeEngine(def3, 1);
      st.setWetMedium(med);
      st.setBrush(def3, 1);
      const mx = new Float32Array(8); mx[0] = 1;
      st.charge(mx, 1, 0);
      const res = (st as unknown as { brush: {
        reservoir: Reservoir; bladeHalfWidth: number } }).brush;

      // What the model asks for, in microlitres.
      st.begin(20, 200, sample({ pointerType: 'mouse', pressure: 0.5 }));
      const capacity = res.reservoir.totals().capacity;

      // What the engine does over the same stroke. Sum what LEAVES the brush;
      // the deposit's own coverage gate can only reduce it, so this is the
      // generous reading and the gap below is real either way.
      let laid = 0;
      for (let mm = 1; mm <= STROKE_MM; mm++) {
        st.add(20 + mm, 200, sample({ pointerType: 'mouse', pressure: 0.5 }));
        const { data, count } = st.drain();
        for (let i = 0; i < count; i++) laid += data[i * SEG_FLOATS + 5];
      }
      // Read the blade AFTER a solve; `begin` does not lay the tuft out.
      const bladeMM = 2 * res.bladeHalfWidth;
      const areaMM2 = STROKE_MM * bladeMM;
      const wftMM = (DFT / SOLIDS) / 1000;
      const wantsLaid = areaMM2 * wftMM;          // mm^3
      const wantsLoad = wantsLaid / TRANSFER;
      const transfer = laid / Math.max(capacity, 1e-9);
      const wft = 1000 * laid / areaMM2;          // microns

      console.log(`  ${(slug + ' / ' + mslug).padEnd(28)}`
        + `${bladeMM.toFixed(0).padStart(3)}mm  `
        + `${wantsLoad.toFixed(0).padStart(8)} uL  `
        + `${capacity.toFixed(0).padStart(5)} uL  `
        + `${wantsLaid.toFixed(0).padStart(8)} uL  `
        + `${laid.toFixed(0).padStart(5)} uL  `
        + `${transfer.toFixed(3).padStart(8)}  `
        + `${wft.toFixed(1).padStart(6)} um`);
    }
  }
  console.log('');
  console.log(`  transfer should land between 0.35 and 0.50; WFT should be near`
    + ` ${(DFT / SOLIDS).toFixed(0)} um`);

  /* TRANSFER IS A `downRate` QUESTION AND CAPACITY CANNOT REACH IT.
   * `transfer` is what LEAVES divided by what was HELD, and what leaves is a
   * fraction of what is held, so scaling capacity scales both alike and the
   * ratio does not move. Only the rate per millimetre does. Sweep it. */
  console.log('');
  console.log('  transfer against downRate (oil, same 250 mm stroke):');
  for (const slug of ['flat-hog', 'round-sable', 'flat-sable']) {
    const base = BRUSH_BY_SLUG.get(slug);
    if (!base) continue;
    const med = WET_MEDIA.find((m) => m.slug === 'oil')!;
    const row: string[] = [];
    for (const k of [1, 1.25, 1.5, 2, 3]) {
      const probe = { ...base, slug: 'probe-load',
        reservoir: { ...base.reservoir, downRate: base.reservoir.downRate * k } };
      BRUSH_BY_SLUG.set('probe-load', probe);
      const st = new StrokeEngine(probe, 1);
      st.setWetMedium(med);
      st.setBrush(probe, 1);
      const mx = new Float32Array(8); mx[0] = 1;
      st.charge(mx, 1, 0);
      const rs = (st as unknown as { brush: { reservoir: Reservoir } }).brush.reservoir;
      const cap = rs.totals().capacity;
      st.begin(20, 200, sample({ pointerType: 'mouse', pressure: 0.5 }));
      let laid = 0;
      for (let mm = 1; mm <= STROKE_MM; mm++) {
        st.add(20 + mm, 200, sample({ pointerType: 'mouse', pressure: 0.5 }));
        const { data, count } = st.drain();
        for (let i = 0; i < count; i++) laid += data[i * SEG_FLOATS + 5];
      }
      row.push(`x${k}: ${(laid / cap).toFixed(3)}`);
    }
    console.log(`  ${slug.padEnd(14)} ${row.join('   ')}`);
  }
}
