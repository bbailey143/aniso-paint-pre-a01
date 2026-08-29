// Fish-scale stage discriminator, for EITHER solver route.
//
// Run the live WebGPU app with `?fish-scale=1`. The stroke is fixed and only
// how far the wet-paint pipeline may advance changes. The full cross-section is
// kept, so alternating edge lobes cannot cancel merely because total paint
// across the mark is constant.
//
// **The medium decides which solver runs, and therefore which ladder is even
// meaningful.** `fluid.ts` sets `paste = !hasCurrent || yieldStress > 0`, and
// for a paste it SKIPS UpdateVelocities and RelaxDivergence outright: a pile of
// paste is moved by its own steepness against its yield in flux_compute, and
// reads no velocity field. Watercolour is water (yieldStress 0); Oil is paste
// (yieldStress 0.34, hasCurrent false).
//
// That is not a footnote. A whole session was spent repairing the two velocity
// passes, verifying it here, and reporting it as fixed — and every number was a
// watercolour number, because this file used to hardcode Watercolour / Round
// Sable / Flat White. The repair could not touch oil at all. docs/19 E5a.
//
//   ?fish-scale=1                      water route: Watercolour / Round Sable
//   ?fish-scale=1&medium=oil           paste route: Oil / Flat Hog
//   ?fish-scale=1&medium=oil&brush=flat-sable&paper=canvas-duck
//
// Whatever is chosen, the panel states the medium, the brush, the paper AND the
// route, and lists the passes the engine actually ran. Read that line first.

import { BRUSHES } from '../brush/library';
import { SEG_FLOATS } from '../engine/fluid';
import { WATERCOLOR, OIL } from '../media/library';
import { FLAT_WHITE, PAPERS, CANVASES } from '../substrate/papers';
import { esc, ok, warn, bad, headline, makePanel } from './panel';

type AnyRec = Record<string, any>;

const X0 = 88;
const X1 = 424;
const Y = 256;
const INPUTS = 84;      // four cells between browser reports
/* Reports bundled into each simulated browser frame; 4 cells per report, so
   frame travel is 4 * GROUP cells. `?group=N` overrides it. This is the
   discriminator for a frame-locked wavelength: if a ripple's repeat tracks
   4 * GROUP it is made by frame bundling, and if it sits still at 16 cells
   whatever GROUP is, it is an artefact of TREND_RADIUS instead.
   [TRAP, baton #2] Changing GROUP also changes how many times engine.step runs,
   so a fluid-driven number would move for that reason alone. Only compare the
   deposit stages this way, or a route measured to be flat across fluid passes. */
const GROUP = Math.max(1, Math.min(16,
  Number(new URLSearchParams(location.search).get('group')) || 4));
const CORRIDOR = 42;
const TREND_RADIUS = 16;

const PASSES = [
  'vel', 'relax', 'outward', 'rim', 'fluxCompute', 'fluxPig', 'fluxWater',
  'transfer', 'capillary', 'rewet', 'dry', 'handoff',
];

type Stage = {
  name: string;
  smear: number;
  allow: string[];
};

/* ------------------------------------------------------------------ config */

type Route = 'water' | 'paste';

function resolveConfig() {
  const q = new URLSearchParams(location.search);
  const wantOil = (q.get('medium') || '').toLowerCase().startsWith('oil');
  const medium = wantOil ? OIL : WATERCOLOR;
  // The route is READ BACK from the medium's own numbers, using the same test
  // fluid.ts uses. It is never assumed from the name.
  const route: Route = (medium.hasCurrent === false || (medium.yieldStress ?? 0) > 0)
    ? 'paste' : 'water';
  const brushSlug = q.get('brush') || (wantOil ? 'flat-hog' : 'round-sable');
  const paperSlug = q.get('paper') || 'flat-white';
  const sheet = paperSlug === 'flat-white'
    ? FLAT_WHITE
    : [...PAPERS, ...CANVASES].find((p) => p.slug === paperSlug);
  return { medium, mediumName: wantOil ? 'oil' : 'watercolour', route, brushSlug, paperSlug, sheet };
}

const CFG = resolveConfig();

/* The passes that actually exist on this route. For a paste the engine skips
   `vel` and `relax`, so a ladder step named "+ velocity" would print a number
   identical to the step before it and read as "velocity changes nothing here",
   which is true but for the wrong reason and has already misled once. */
const MOTION = CFG.route === 'paste'
  ? ['outward', 'fluxCompute', 'fluxPig', 'fluxWater']
  : ['vel', 'relax', 'outward', 'fluxCompute', 'fluxPig', 'fluxWater'];

function buildStages(route: Route): Stage[] {
  const tail = (base: string[]): Stage[] => [
    { name: '+ pigment transfer', smear: 1, allow: [...base, 'transfer'] },
    { name: '+ capillary', smear: 1, allow: [...base, 'transfer', 'capillary'] },
    { name: '+ drying', smear: 1, allow: [...base, 'transfer', 'capillary', 'rewet', 'dry'] },
    { name: 'full pipeline', smear: 1, allow: PASSES },
  ];
  if (route === 'paste') {
    // The paste ladder. `flux ledger` IS the slump: flux_compute takes the pile's
    // steepest direction over its 3x3, tests it against the yield, and splits
    // what it gives across its four faces. There is no velocity step to add.
    return [
      { name: 'deposit only', smear: 0, allow: [] },
      { name: 'deposit + brush shove', smear: 1, allow: [] },
      { name: '+ outward scratch', smear: 1, allow: ['outward'] },
      { name: '+ slump ledger', smear: 1, allow: ['outward', 'fluxCompute'] },
      { name: '+ pigment flux', smear: 1, allow: ['outward', 'fluxCompute', 'fluxPig'] },
      { name: '+ paint flux', smear: 1, allow: MOTION },
      ...tail(MOTION),
    ];
  }
  return [
    { name: 'deposit only', smear: 0, allow: [] },
    { name: 'deposit + brush shove', smear: 1, allow: [] },
    { name: '+ velocity', smear: 1, allow: ['vel'] },
    { name: '+ velocity relaxation', smear: 1, allow: ['vel', 'relax'] },
    { name: '+ outward scratch', smear: 1, allow: ['vel', 'relax', 'outward'] },
    { name: '+ flux ledger', smear: 1, allow: ['vel', 'relax', 'outward', 'fluxCompute'] },
    { name: '+ pigment flux', smear: 1, allow: ['vel', 'relax', 'outward', 'fluxCompute', 'fluxPig'] },
    { name: '+ water flux', smear: 1, allow: MOTION },
    ...tail(MOTION),
  ];
}

const STAGES: Stage[] = buildStages(CFG.route);

// Yield to the event loop WITHOUT a timer. A hidden page (any automated browser,
// or the app's preview pane simply not on screen) has setTimeout clamped to one
// call per minute by Chrome's intensive throttling after five minutes, which
// paced this bench at roughly one stroke-group per MINUTE and read as a hang.
// MessageChannel is exempt. Nothing physical changes: P.dt is fixed at 1.0 and
// every pass here is driven by step count, never by wall clock.
const yieldTick = (): Promise<void> => new Promise<void>((resolve) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
  ch.port2.postMessage(0);
});

const sample = () => ({
  px: 0, py: 0, pointerType: 'mouse', down: true, velocity: 0,
  pressure: 0.5, tiltAngle: 0, tiltAzimuth: 0, twist: 0,
});

function movingMean(values: number[], radius: number): number[] {
  const prefix = new Array(values.length + 1).fill(0);
  for (let i = 0; i < values.length; i++) prefix[i + 1] = prefix[i] + values[i];
  return values.map((_v, i) => {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(values.length, i + radius + 1);
    return (prefix[hi] - prefix[lo]) / Math.max(1, hi - lo);
  });
}

function residual(values: number[], radius = TREND_RADIUS) {
  const trend = movingMean(values, radius);
  return values.map((v, i) => v - trend[i]);
}

function rms(values: number[]): number {
  return Math.sqrt(values.reduce((s, v) => s + v * v, 0) / Math.max(1, values.length));
}

function relativeRms(values: number[]): number {
  const mean = values.reduce((s, v) => s + Math.abs(v), 0) / Math.max(1, values.length);
  return rms(residual(values)) / Math.max(mean, 1e-9);
}

function repeatLag(values: number[]) {
  const r = residual(values).slice(24, -24);
  const energy = r.reduce((s, v) => s + v * v, 0);
  if (energy < 1e-18) return { lag: 0, correlation: 0 };
  let bestLag = 0;
  let best = -1;
  for (let lag = 2; lag <= 40 && lag < r.length / 2; lag++) {
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i + lag < r.length; i++) {
      ab += r[i] * r[i + lag];
      aa += r[i] * r[i];
      bb += r[i + lag] * r[i + lag];
    }
    const c = ab / Math.max(Math.sqrt(aa * bb), 1e-18);
    if (c > best) { best = c; bestLag = lag; }
  }
  return { lag: bestLag, correlation: +best.toFixed(4) };
}

function smoothstep(lo: number, hi: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - lo) / Math.max(hi - lo, 1e-9)));
  return t * t * (3 - 2 * t);
}

function rasterFootprint(dst: Float64Array, n: number, data: Float32Array, count: number) {
  for (let i = 0; i < count; i++) {
    const o = i * SEG_FLOATS;
    const ax = data[o], ay = data[o + 1], bx = data[o + 2], by = data[o + 3];
    const radius = data[o + 4], water = data[o + 5], reach = data[o + 7];
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - radius - 1));
    const maxX = Math.min(n - 1, Math.ceil(Math.max(ax, bx) + radius + 1));
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - radius - 1));
    const maxY = Math.min(n - 1, Math.ceil(Math.max(ay, by) + radius + 1));
    const abx = bx - ax, aby = by - ay, len2 = abx * abx + aby * aby;
    // Flat White has toothAmp 0 and a constant paper height. This is the exact
    // water-medium contact gate used by deposit.wgsl for that reference sheet.
    const need = 1 - Math.max(0, Math.min(1, reach));
    const gate = smoothstep(need - 0.18, need + 0.18, 1);
    for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
      const px = cx + 0.5, py = cy + 0.5;
      const t = len2 < 1e-8 ? 0 : Math.max(0, Math.min(1,
        ((px - ax) * abx + (py - ay) * aby) / len2));
      const d = Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
      if (d >= radius + 0.5) continue;
      const cov = Math.max(0, Math.min(1, radius - d + 0.5));
      const prof = 1 - 0.55 * Math.max(0, Math.min(1, d / Math.max(radius, 1e-3)));
      dst[cy * n + cx] += cov * prof * gate * water;
    }
  }
}

/**
 * TONAL BANDING ALONG THE STROKE, from the RENDERED picture.
 *
 * Every other figure in this file measures `wet0.y`, the stored film, and scores
 * the wobble in the mark's EDGE across its width. The artist has been describing
 * something different — light and dark banding in the BODY of the mark, along
 * its length — and by 2026-08-29 the film numbers had stopped tracking what he
 * could see: edge ripple was flat across two surfaces and two speeds while he
 * still reported banding. So measure the thing itself.
 *
 * For each column of the stroke, take the mean luminance of the DARKEST few
 * pixels in the band. Darkest-few rather than a mean over the whole band
 * because a mean is diluted by however much bare canvas the band happens to
 * include, which makes the figure depend on the mark's width instead of its
 * tone — and the mark's width is the thing the other metric already measures.
 */
const TONE_BAND = 14;      // cells either side of the stroke centreline
const TONE_DARKEST = 8;    // how many darkest pixels make the column's tone

function toneProfile(img: { data: Uint8Array; size: number }): number[] {
  const { data, size } = img;
  const out: number[] = [];
  const col: number[] = [];
  for (let x = X0; x <= X1; x++) {
    col.length = 0;
    for (let y = Y - TONE_BAND; y <= Y + TONE_BAND; y++) {
      if (y < 0 || y >= size || x < 0 || x >= size) { continue; }
      const o = (y * size + x) * 3;
      // Rec.709 luma. The paint is blue on warm canvas, so a flat average over
      // channels would under-weight exactly the channel carrying the mark.
      col.push(0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]);
    }
    col.sort((a, b) => a - b);
    const k = Math.min(TONE_DARKEST, col.length);
    let sum = 0;
    for (let i = 0; i < k; i++) sum += col[i];
    out.push(k > 0 ? sum / k : 0);
  }
  return out;
}

function analyseTone(img: { data: Uint8Array; size: number }) {
  const profile = toneProfile(img);
  const inner = profile.slice(12, -12);
  const { lag, correlation } = repeatLag(profile);
  return {
    toneRipple: +relativeRms(profile).toFixed(5),
    toneMean: +(inner.reduce((a, b) => a + b, 0) / Math.max(1, inner.length)).toFixed(2),
    toneSwing: +(Math.max(...inner) - Math.min(...inner)).toFixed(2),
    toneLagCells: lag,
    toneCorrelation: correlation,
    profile: profile.map((v) => +v.toFixed(2)),
  };
}

function scalarFilm(wet0: Float32Array, n: number): Float64Array {
  const out = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = Math.max(0, wet0[i * 4 + 1]);
  return out;
}

function scalarFlux(flux: Float32Array, n: number): Float64Array {
  const out = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const o = i * 4;
    out[i] = Math.max(0, flux[o]) + Math.max(0, flux[o + 1])
      + Math.max(0, flux[o + 2]) + Math.max(0, flux[o + 3]);
  }
  return out;
}

function boundaryOutflow(wet0: Float32Array, n: number) {
  const sums = { east: 0, west: 0, south: 0, north: 0 };
  const heightSums = { east: 0, west: 0, south: 0, north: 0 };
  const faces = { east: 0, west: 0, south: 0, north: 0 };
  const wet = (x: number, y: number) => x >= 0 && x < n && y >= 0 && y < n
    && wet0[(y * n + x) * 4] >= 0.5;
  const u = (x: number, y: number) => x >= 0 && x < n && y >= 0 && y < n
    ? wet0[(y * n + x) * 4 + 2] : 0;
  const v = (x: number, y: number) => x >= 0 && x < n && y >= 0 && y < n
    ? wet0[(y * n + x) * 4 + 3] : 0;
  const h = (x: number, y: number) => x >= 0 && x < n && y >= 0 && y < n
    ? Math.max(0, wet0[(y * n + x) * 4 + 1]) : 0;

  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    if (!wet(x, y)) continue;
    if (!wet(x + 1, y)) { faces.east++; sums.east += Math.max(u(x, y), 0); heightSums.east += h(x, y); }
    if (!wet(x - 1, y)) { faces.west++; sums.west += Math.max(-u(x - 1, y), 0); heightSums.west += h(x, y); }
    if (!wet(x, y + 1)) { faces.south++; sums.south += Math.max(v(x, y), 0); heightSums.south += h(x, y); }
    if (!wet(x, y - 1)) { faces.north++; sums.north += Math.max(-v(x, y - 1), 0); heightSums.north += h(x, y); }
  }
  return Object.fromEntries((Object.keys(sums) as Array<keyof typeof sums>).map((side) => [side, {
    faces: faces[side],
    outwardSum: +sums[side].toFixed(8),
    outwardMean: +(sums[side] / Math.max(faces[side], 1)).toFixed(8),
    heightMean: +(heightSums[side] / Math.max(faces[side], 1)).toFixed(8),
  }]));
}

function divergenceStats(wet0: Float32Array, n: number) {
  let count = 0, absSum = 0, squareSum = 0, maximum = 0;
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const o = (y * n + x) * 4;
    if (wet0[o] < 0.5) continue;
    const west = (y * n + x - 1) * 4;
    const north = ((y - 1) * n + x) * 4;
    const d = (wet0[o + 2] - wet0[west + 2]) + (wet0[o + 3] - wet0[north + 3]);
    count++; absSum += Math.abs(d); squareSum += d * d; maximum = Math.max(maximum, Math.abs(d));
  }
  return {
    wetCells: count,
    meanAbs: +(absSum / Math.max(count, 1)).toFixed(8),
    rms: +Math.sqrt(squareSum / Math.max(count, 1)).toFixed(8),
    maximum: +maximum.toFixed(8),
  };
}

function analyse(field: Float64Array, n: number) {
  const volumes: number[] = [];
  const widths: number[] = [];
  const centres: number[] = [];
  const profiles: number[][] = [];

  for (let x = X0; x <= X1; x++) {
    const section: number[] = [];
    let volume = 0, peak = 0, moment = 0;
    for (let y = Y - CORRIDOR; y <= Y + CORRIDOR; y++) {
      const v = field[y * n + x];
      section.push(v); volume += v; peak = Math.max(peak, v); moment += y * v;
    }
    const centre = volume > 1e-12 ? moment / volume : Y;
    let cumulative = 0, lo = Y, hi = Y;
    for (let j = 0; j < section.length; j++) {
      cumulative += section[j];
      if (cumulative >= volume * 0.05 && lo === Y) lo = Y - CORRIDOR + j;
      if (cumulative >= volume * 0.95) { hi = Y - CORRIDOR + j; break; }
    }
    volumes.push(volume);
    widths.push(volume > 1e-12 ? hi - lo : 0);
    centres.push(centre);
    profiles.push(section.map((v) => v / Math.max(volume, 1e-12)));
  }

  const safeLo = 24, safeHi = profiles.length - 24;
  const shapeDelta: number[] = new Array(profiles.length).fill(0);
  for (let x = safeLo; x < safeHi; x++) {
    let l1 = 0;
    for (let j = 0; j < profiles[x].length; j++) {
      let mean = 0, count = 0;
      for (let q = x - TREND_RADIUS; q <= x + TREND_RADIUS; q++) {
        if (q >= 0 && q < profiles.length) { mean += profiles[q][j]; count++; }
      }
      l1 += Math.abs(profiles[x][j] - mean / Math.max(1, count));
    }
    shapeDelta[x] = 0.5 * l1;
  }

  const interiorWidths = widths.slice(safeLo, safeHi);
  const interiorVolumes = volumes.slice(safeLo, safeHi);
  const centreResidual = residual(centres).slice(safeLo, safeHi);
  const meanWidth = interiorWidths.reduce((s, v) => s + v, 0) / Math.max(1, interiorWidths.length);
  const lag = repeatLag(widths);
  return {
    volumeRipple: +relativeRms(interiorVolumes).toFixed(5),
    edgeRipple: +(rms(residual(widths).slice(safeLo, safeHi)) / Math.max(meanWidth, 1)).toFixed(5),
    centreRipple: +(rms(centreResidual) / Math.max(meanWidth, 1)).toFixed(5),
    shapeRipple: +rms(shapeDelta.slice(safeLo, safeHi)).toFixed(5),
    repeatLagCells: lag.lag,
    repeatCorrelation: lag.correlation,
    meanWidth: +meanWidth.toFixed(3),
    totalFilm: +field.reduce((s, v) => s + v, 0).toFixed(5),
    widths: widths.map((v) => +v.toFixed(4)),
    volumes: volumes.map((v) => +v.toFixed(6)),
    centres: centres.map((v) => +v.toFixed(5)),
    shapeDelta: shapeDelta.map((v) => +v.toFixed(6)),
  };
}

function setup(engine: AnyRec, stroke: AnyRec, stage: Stage) {
  const brush = BRUSHES.find((b) => b.slug === CFG.brushSlug);
  if (!brush) throw new Error(`brush row missing: ${CFG.brushSlug}`);
  if (!CFG.sheet) throw new Error(`paper row missing: ${CFG.paperSlug}`);
  engine.clear();
  engine.setPaper(CFG.sheet);
  engine.setWetMedium(CFG.medium);
  engine.setFluid({ smearStrength: stage.smear, gravityX: 0, gravityY: 0, cosAlpha: 1 });
  stroke.setWetMedium(CFG.medium);
  stroke.setBrush(brush, 1);
  engine.setMix(new Map([['ultramarine-blue', 1]]));
  stroke.charge(engine.mixWeights, 1, 0);
  // The live solver adapts this count from asynchronous gauge readbacks. That
  // is correct for painting and wrong for paired discrimination: a previous
  // condition can otherwise hand the next one a different starting solver.
  engine.fluid.relaxIters = 8;
  const skip: Set<string> = engine.fluid.skip;
  skip.clear();
  for (const pass of PASSES) if (!stage.allow.includes(pass)) skip.add(pass);
}

async function oneRun(engine: AnyRec, stroke: AnyRec, stage: Stage | null) {
  const cpu = stage === null;
  const activeStage = stage ?? { name: 'CPU footprint', smear: 0, allow: [] };
  setup(engine, stroke, activeStage);
  const n = engine.sim as number;
  const cpuField = new Float64Array(n * n);
  stroke.begin(X0, Y, sample());
  for (let k = 1; k <= INPUTS; k++) {
    stroke.add(X0 + ((X1 - X0) * k) / INPUTS, Y, sample());
    if (k % GROUP === 0 || k === INPUTS) {
      const d = stroke.drain();
      if (cpu) rasterFootprint(cpuField, n, d.data, d.count);
      else engine.step(
        d.data, d.count, d.dx, d.dy, stroke.brushMix,
        0, 0, // pickup/grab disabled: this test follows laid paint, not exchange
      );
      await yieldTick();
    }
  }
  stroke.end();
  if (cpu) return analyse(cpuField, n);
  const wet0 = await engine.dump('wet0') as Float32Array;
  const result: AnyRec = analyse(scalarFilm(wet0, n), n);
  /* The same mark as the eye sees it. Rendered offscreen in its own submit, so
     it cannot go stale behind a stubbed rAF the way a canvas read does. */
  result.tone = analyseTone(await engine.dumpComposite(n));
  if (stage?.allow.includes('fluxCompute')) {
    const flux = await engine.dumpFlux() as Float32Array;
    result.flux = analyse(scalarFlux(flux, n), n);
  }
  return result;
}

async function postFlowRun(
  engine: AnyRec, stroke: AnyRec, frames: number,
  allow = MOTION,
) {
  const depositStage = { name: 'deposit + brush shove', smear: 1, allow: [] };
  setup(engine, stroke, depositStage);
  const n = engine.sim as number;
  stroke.begin(X0, Y, sample());
  for (let k = 1; k <= INPUTS; k++) {
    stroke.add(X0 + ((X1 - X0) * k) / INPUTS, Y, sample());
    if (k % GROUP === 0 || k === INPUTS) {
      const d = stroke.drain();
      engine.step(d.data, d.count, d.dx, d.dy, stroke.brushMix, 0, 0);
      await yieldTick();
    }
  }
  stroke.end();

  const skip: Set<string> = engine.fluid.skip;
  skip.clear();
  for (const pass of PASSES) if (!allow.includes(pass)) skip.add(pass);
  engine.fluid.relaxIters = 8;
  const empty = new Float32Array(0);
  for (let i = 0; i < frames; i++) {
    engine.step(empty, 0, 0, 0, stroke.brushMix, 0, 0);
    await yieldTick();
  }
  const wet0 = await engine.dump('wet0') as Float32Array;
  const result: AnyRec = analyse(scalarFilm(wet0, n), n);
  const flux = await engine.dumpFlux() as Float32Array;
  result.flux = analyse(scalarFlux(flux, n), n);
  return result;
}

async function faceOwnershipRun(engine: AnyRec, stroke: AnyRec) {
  const depositStage = { name: 'deposit + brush shove', smear: 1, allow: [] };
  setup(engine, stroke, depositStage);
  stroke.begin(X0, Y, sample());
  for (let k = 1; k <= INPUTS; k++) {
    stroke.add(X0 + ((X1 - X0) * k) / INPUTS, Y, sample());
    if (k % GROUP === 0 || k === INPUTS) {
      const d = stroke.drain();
      engine.step(d.data, d.count, d.dx, d.dy, stroke.brushMix, 0, 0);
      await yieldTick();
    }
  }
  stroke.end();

  const skip: Set<string> = engine.fluid.skip;
  skip.clear();
  for (const pass of PASSES) if (pass !== 'vel') skip.add(pass);
  const empty = new Float32Array(0);
  engine.step(empty, 0, 0, 0, stroke.brushMix, 0, 0);
  await yieldTick();
  return boundaryOutflow(await engine.dump('wet0') as Float32Array, engine.sim as number);
}

async function relaxSweepRun(engine: AnyRec, stroke: AnyRec, relaxIters: number) {
  const depositStage = { name: 'deposit + brush shove', smear: 1, allow: [] };
  setup(engine, stroke, depositStage);
  stroke.begin(X0, Y, sample());
  for (let k = 1; k <= INPUTS; k++) {
    stroke.add(X0 + ((X1 - X0) * k) / INPUTS, Y, sample());
    if (k % GROUP === 0 || k === INPUTS) {
      const d = stroke.drain();
      engine.step(d.data, d.count, d.dx, d.dy, stroke.brushMix, 0, 0);
      await yieldTick();
    }
  }
  stroke.end();

  const skip: Set<string> = engine.fluid.skip;
  skip.clear();
  for (const pass of PASSES) if (pass !== 'vel' && pass !== 'relax') skip.add(pass);
  engine.fluid.relaxIters = relaxIters;
  const empty = new Float32Array(0);
  engine.step(empty, 0, 0, 0, stroke.brushMix, 0, 0);
  await yieldTick();
  const wet0 = await engine.dump('wet0') as Float32Array;
  return { divergence: divergenceStats(wet0, engine.sim as number), faces: boundaryOutflow(wet0, engine.sim as number) };
}

function rmsDifference(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum / Math.max(1, n));
}

async function run(engine: AnyRec, stroke: AnyRec) {
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (() => 0) as typeof window.requestAnimationFrame;
  engine.pauseReadback = true;
  try {
    // Let any readback requested by the opening app frame finish before the
    // pinned paired runs begin. With pauseReadback on, no new one is launched.
    while (engine.fluid.readbackBusy) {
      await yieldTick();
    }
    /* The setup is read back off the LIVE engine, not copied from the config
       that was asked for. Trap 6 in the baton: a run once had the tool bar
       reading "Watercolour / Round Sable" while the solver ran oil, and the
       physics was right while the labels lied. Ask the engine. */
    engine.setWetMedium(CFG.medium);
    const live = engine.fluid.params;
    const liveRoute: Route = (live.hasCurrent === false || (live.yieldStress ?? 0) > 0)
      ? 'paste' : 'water';
    const result: AnyRec = {
      setup: {
        medium: CFG.mediumName, brush: CFG.brushSlug, paper: CFG.paperSlug,
        route: liveRoute,
        routeAsConfigured: CFG.route,
        routeAgrees: liveRoute === CFG.route,
        yieldStress: live.yieldStress, hasCurrent: live.hasCurrent,
        skippedByEngine: liveRoute === 'paste' ? ['vel', 'relax'] : [],
        pointer: 'mouse', effectivePressure: 0.65, size: 1,
        inputSpacingCells: 4, inputsPerFrame: GROUP,
        path: `${X0},${Y} to ${X1},${Y}`,
      },
      stages: {},
      postFlow: {},
      flowVariants: {},
      faceOwnership: [],
      relaxSweep: {},
    };
    const cases: Array<Stage | null> = [null, ...STAGES];
    for (const stage of cases) {
      const name = stage?.name ?? 'CPU footprint';
      const a = await oneRun(engine, stroke, stage);
      const b = await oneRun(engine, stroke, stage);
      result.stages[name] = {
        runs: [a, b],
        repeatWidthRms: +rmsDifference(a.widths, b.widths).toFixed(8),
        repeatVolumeRms: +rmsDifference(a.volumes, b.volumes).toFixed(8),
      };
    }
    for (const frames of [1, 2, 4, 8, 16, 32]) {
      const a = await postFlowRun(engine, stroke, frames);
      const b = await postFlowRun(engine, stroke, frames);
      result.postFlow[frames] = {
        runs: [a, b],
        repeatWidthRms: +rmsDifference(a.widths, b.widths).toFixed(8),
        repeatVolumeRms: +rmsDifference(a.volumes, b.volumes).toFixed(8),
      };
    }
    /* One force at a time. On the paste route there is no velocity field to
       isolate, so the split is over the terms a paste actually has: its own
       slump against the yield, and the outward edge bias. */
    const variants: Record<string, string[]> = liveRoute === 'paste'
      ? {
        'slump only': ['fluxCompute', 'fluxWater'],
        'outward bias only': ['outward', 'fluxCompute', 'fluxWater'],
        'slump + pigment flux': ['fluxCompute', 'fluxPig', 'fluxWater'],
        'all paste motion': MOTION,
      }
      : {
        'velocity only': ['vel', 'fluxCompute', 'fluxWater'],
        'velocity + relaxation': ['vel', 'relax', 'fluxCompute', 'fluxWater'],
        'outward bias only': ['outward', 'fluxCompute', 'fluxWater'],
        'velocity + outward': ['vel', 'outward', 'fluxCompute', 'fluxWater'],
        'all water motion': ['vel', 'relax', 'outward', 'fluxCompute', 'fluxWater'],
      };
    for (const [name, allow] of Object.entries(variants)) {
      const a = await postFlowRun(engine, stroke, 8, allow);
      const b = await postFlowRun(engine, stroke, 8, allow);
      result.flowVariants[name] = { runs: [a, b] };
    }
    /* Face ownership and the relaxation sweep read the velocity field and the
       divergence it leaves. A paste has neither — the engine never ran the
       passes that write them — so running these would print a table of zeros
       that looks like a measurement and is not one. Skipped, and SAID to be. */
    if (liveRoute === 'water') {
      result.faceOwnership = [
        await faceOwnershipRun(engine, stroke),
        await faceOwnershipRun(engine, stroke),
      ];
      for (const iters of [0, 1, 2, 4, 8, 16]) {
        result.relaxSweep[iters] = {
          runs: [await relaxSweepRun(engine, stroke, iters), await relaxSweepRun(engine, stroke, iters)],
        };
      }
    }
    engine.fluid.skip.clear();
    engine.render();
    (window as AnyRec).__fishScaleResult = result;
    return result;
  } finally {
    engine.pauseReadback = false;
    window.requestAnimationFrame = raf;
  }
}

/**
 * A row that reproduced is a row that passed: identical paired runs are the
 * only claim this diagnostic makes on its own (the house rule is 'run it twice
 * before believing it'). Green says the pair agreed to the printed precision;
 * amber says two supposedly identical runs disagreed, which is a finding about
 * the instrument, not about the paint, and must be seen before the numbers are
 * read. Ripple figures themselves are diagnostic - there is no threshold that
 * makes one 'pass', so none of them is ever coloured green on its own merit.
 */
const repro = (same: boolean, text: string) => (same ? ok : warn)(text);

function summary(result: AnyRec) {
  /* The pair is compared on its WHOLE profile, not on the rounded figures the
     row prints: `analyse` keeps the full cross-section, so two runs that agree
     here agree cell by cell, not merely to five decimals. */
  let allRepro = true;
  const same = (a: unknown, b: unknown) => {
    const equal = JSON.stringify(a) === JSON.stringify(b);
    if (!equal) allRepro = false;
    return equal;
  };
  const rows = Object.entries(result.stages).map(([name, value]) => {
    const v = value as AnyRec;
    const a = v.runs[0], b = v.runs[1];
    return repro(same(a, b), `${name.padEnd(24)} `
      + `shape ${a.shapeRipple.toFixed(5)}/${b.shapeRipple.toFixed(5)}  `
      + `edge ${a.edgeRipple.toFixed(5)}/${b.edgeRipple.toFixed(5)}  `
      + `volume ${a.volumeRipple.toFixed(5)}/${b.volumeRipple.toFixed(5)}  `
      + `lag ${a.repeatLagCells}/${b.repeatLagCells}  `
      + `r ${a.repeatCorrelation.toFixed(3)}/${b.repeatCorrelation.toFixed(3)}`
      + (a.tone ? `  TONE ${a.tone.toneRipple.toFixed(5)}/${b.tone.toneRipple.toFixed(5)}`
        + ` tone-lag ${a.tone.toneLagCells}/${b.tone.toneLagCells}` : '')
      + (a.flux ? `  flux-edge ${a.flux.edgeRipple.toFixed(5)}/${b.flux.edgeRipple.toFixed(5)}`
        + ` flux-lag ${a.flux.repeatLagCells}/${b.flux.repeatLagCells}` : ''));
  });
  const growth = Object.entries(result.postFlow).map(([frames, value]) => {
    const v = value as AnyRec;
    const a = v.runs[0], b = v.runs[1];
    return repro(same(a, b), `${(`${frames} flow step${frames === '1' ? '' : 's'}`).padEnd(24)} `
      + `shape ${a.shapeRipple.toFixed(5)}/${b.shapeRipple.toFixed(5)}  `
      + `edge ${a.edgeRipple.toFixed(5)}/${b.edgeRipple.toFixed(5)}  `
      + `lag ${a.repeatLagCells}/${b.repeatLagCells}  `
      + `r ${a.repeatCorrelation.toFixed(3)}/${b.repeatCorrelation.toFixed(3)}  `
      + `flux-edge ${a.flux.edgeRipple.toFixed(5)}/${b.flux.edgeRipple.toFixed(5)}`);
  });
  const variants = Object.entries(result.flowVariants).map(([name, value]) => {
    const v = value as AnyRec;
    const a = v.runs[0], b = v.runs[1];
    return repro(same(a, b), `${name.padEnd(24)} `
      + `shape ${a.shapeRipple.toFixed(5)}/${b.shapeRipple.toFixed(5)}  `
      + `edge ${a.edgeRipple.toFixed(5)}/${b.edgeRipple.toFixed(5)}  `
      + `lag ${a.repeatLagCells}/${b.repeatLagCells}  `
      + `r ${a.repeatCorrelation.toFixed(3)}/${b.repeatCorrelation.toFixed(3)}`);
  });
  const paste = result.setup.route === 'paste';
  const faceRows = paste ? [] : ['east', 'west', 'south', 'north'].map((side) => {
    const a = result.faceOwnership[0][side], b = result.faceOwnership[1][side];
    return repro(same(a, b),
      `${side.padEnd(24)} speed ${a.outwardMean.toFixed(8)}/${b.outwardMean.toFixed(8)}  `
      + `height ${a.heightMean.toFixed(8)}/${b.heightMean.toFixed(8)}  faces ${a.faces}/${b.faces}`);
  });
  const relaxRows = paste ? [] : Object.entries(result.relaxSweep).map(([iters, value]) => {
    const v = value as AnyRec;
    const a = v.runs[0].divergence, b = v.runs[1].divergence;
    const af = v.runs[0].faces, bf = v.runs[1].faces;
    return repro(same(v.runs[0], v.runs[1]),
      `${(`${iters} iteration${iters === '1' ? '' : 's'}`).padEnd(24)} `
      + `mean|div| ${a.meanAbs.toFixed(8)}/${b.meanAbs.toFixed(8)}  `
      + `rms ${a.rms.toFixed(8)}/${b.rms.toFixed(8)}  `
      + `N/S ${af.north.outwardMean.toFixed(6)}/${af.south.outwardMean.toFixed(6)}  `
      + `${bf.north.outwardMean.toFixed(6)}/${bf.south.outwardMean.toFixed(6)}`);
  });
  const s = result.setup;
  /* SCOPE BANNER. This exists because a session reported "verified" from this
     bench when every figure in it was a watercolour figure, and the change it
     verified could not run for oil at all. The scope is now the second thing on
     screen and names the medium, the route, and what the route did NOT run. */
  const scope = [
    esc(`${s.medium} / ${s.brush} / ${s.paper} / mouse pressure ${s.effectivePressure}`),
    s.routeAgrees
      ? (paste
        ? warn(`PASTE ROUTE (yieldStress ${s.yieldStress}, hasCurrent ${s.hasCurrent}). `
          + 'The engine SKIPPED UpdateVelocities and RelaxDivergence. Nothing here '
          + 'measures them, and no change to them can move these numbers.')
        : ok(`WATER ROUTE (yieldStress ${s.yieldStress}, hasCurrent ${s.hasCurrent}). `
          + 'Velocity and relaxation both ran.'))
      : bad(`ROUTE MISMATCH: configured ${s.routeAsConfigured}, engine ran ${s.route}. `
        + 'Do not read these numbers.'),
    esc(`THIS RESULT IS ${String(s.medium).toUpperCase()} ONLY. `
      + `The other medium takes the other route; run it separately `
      + `(?fish-scale=1&medium=${s.medium === 'oil' ? 'watercolour' : 'oil'}).`),
  ];
  const velocitySections = paste ? [] : [
    esc('ONE VELOCITY STEP — OUTWARD SPEED AT WET/DRY FACES'),
    ...faceRows, '',
    esc('ONE VELOCITY STEP — RELAXATION SWEEP'),
    ...relaxRows, '',
  ];
  return [
    headline(allRepro && s.routeAgrees ? 'pass' : 'fail',
      `FISH-SCALE STAGE TEST (${s.medium}) — finished`), '',
    ...scope, '',
    allRepro
      ? ok('Every paired run reproduced exactly.')
      : warn('SOME PAIRED RUNS DISAGREED — read the amber rows before the numbers.'),
    esc('Shape and edge retain the full 2D cross-section.'), '',
    ...rows, '',
    esc('SMOOTH DEPOSIT, THEN FLOW ONLY'),
    ...growth, '',
    esc('EIGHT FLOW STEPS, ONE FORCE AT A TIME'),
    ...variants, '',
    ...velocitySections,
    paste ? esc('(face-ownership and relaxation sweep skipped: a paste has no velocity field)') : '',
    esc('Green = the pair reproduced. Ripple figures are diagnostic, never a pass.'),
    esc('Exact profiles: window.__fishScaleResult'),
  ].join('\n');
}

export function maybeRunFishScale(engine: unknown, stroke: unknown): void {
  if (!new URLSearchParams(location.search).has('fish-scale')) return;
  const panel = makePanel(
    'fish-scale-result', '1060px',
    `FISH-SCALE STAGE TEST — ${CFG.mediumName} / ${CFG.brushSlug} / ${CFG.paperSlug}`
    + '\n\nrunning the controlled strokes…',
  );
  document.body.appendChild(panel);
  setTimeout(() => {
    run(engine as AnyRec, stroke as AnyRec)
      .then((result) => { panel.innerHTML = summary(result); })
      .catch((err) => {
        panel.innerHTML = headline('fail', 'fish-scale test ERROR') + '\n\n' + esc(String(err));
      });
  }, 80);
}
