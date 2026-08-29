// Round-brush fish-scale discriminator.
//
// Run the live WebGPU app with `?fish-scale=1`. Every condition uses the same
// Round Sable / Watercolour / Flat White stroke at mouse pressure. The only
// change is how far the wet-paint pipeline is allowed to advance. Unlike the
// older banding bench, this keeps the full cross-section so alternating edge
// lobes cannot cancel merely because total paint across the mark is constant.

import { BRUSHES } from '../brush/library';
import { SEG_FLOATS } from '../engine/fluid';
import { WATERCOLOR } from '../media/library';
import { FLAT_WHITE } from '../substrate/papers';
import { esc, ok, warn, headline, makePanel } from './panel';

type AnyRec = Record<string, any>;

const X0 = 88;
const X1 = 424;
const Y = 256;
const INPUTS = 84;      // four cells between browser reports
const GROUP = 4;        // sixteen cells of travel per simulated browser frame
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

const MOTION = ['vel', 'relax', 'outward', 'fluxCompute', 'fluxPig', 'fluxWater'];
const STAGES: Stage[] = [
  { name: 'deposit only', smear: 0, allow: [] },
  { name: 'deposit + brush shove', smear: 1, allow: [] },
  { name: '+ velocity', smear: 1, allow: ['vel'] },
  { name: '+ velocity relaxation', smear: 1, allow: ['vel', 'relax'] },
  { name: '+ outward scratch', smear: 1, allow: ['vel', 'relax', 'outward'] },
  { name: '+ flux ledger', smear: 1, allow: ['vel', 'relax', 'outward', 'fluxCompute'] },
  { name: '+ pigment flux', smear: 1, allow: ['vel', 'relax', 'outward', 'fluxCompute', 'fluxPig'] },
  { name: '+ water flux', smear: 1, allow: MOTION },
  { name: '+ pigment transfer', smear: 1, allow: [...MOTION, 'transfer'] },
  { name: '+ capillary', smear: 1, allow: [...MOTION, 'transfer', 'capillary'] },
  { name: '+ drying', smear: 1, allow: [...MOTION, 'transfer', 'capillary', 'rewet', 'dry'] },
  { name: 'full pipeline', smear: 1, allow: PASSES },
];

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
  const brush = BRUSHES.find((b) => b.slug === 'round-sable');
  if (!brush) throw new Error('Round Sable row missing');
  engine.clear();
  engine.setPaper(FLAT_WHITE);
  engine.setWetMedium(WATERCOLOR);
  engine.setFluid({ smearStrength: stage.smear, gravityX: 0, gravityY: 0, cosAlpha: 1 });
  stroke.setWetMedium(WATERCOLOR);
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
    const result: AnyRec = {
      setup: {
        medium: 'watercolour', brush: 'round-sable', paper: 'flat-white',
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
    const variants: Record<string, string[]> = {
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
    result.faceOwnership = [
      await faceOwnershipRun(engine, stroke),
      await faceOwnershipRun(engine, stroke),
    ];
    for (const iters of [0, 1, 2, 4, 8, 16]) {
      result.relaxSweep[iters] = {
        runs: [await relaxSweepRun(engine, stroke, iters), await relaxSweepRun(engine, stroke, iters)],
      };
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
  const faceRows = ['east', 'west', 'south', 'north'].map((side) => {
    const a = result.faceOwnership[0][side], b = result.faceOwnership[1][side];
    return repro(same(a, b),
      `${side.padEnd(24)} speed ${a.outwardMean.toFixed(8)}/${b.outwardMean.toFixed(8)}  `
      + `height ${a.heightMean.toFixed(8)}/${b.heightMean.toFixed(8)}  faces ${a.faces}/${b.faces}`);
  });
  const relaxRows = Object.entries(result.relaxSweep).map(([iters, value]) => {
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
  return [
    headline(allRepro ? 'pass' : 'fail', 'ROUND FISH-SCALE STAGE TEST — finished'), '',
    esc('Watercolour / Round Sable / Flat White / mouse pressure 0.65'),
    allRepro
      ? ok('Every paired run reproduced exactly.')
      : warn('SOME PAIRED RUNS DISAGREED — read the amber rows before the numbers.'),
    esc('Shape and edge retain the full 2D cross-section.'), '',
    ...rows, '',
    esc('SMOOTH DEPOSIT, THEN FLOW ONLY'),
    ...growth, '',
    esc('EIGHT FLOW STEPS, ONE FORCE AT A TIME'),
    ...variants, '',
    esc('ONE VELOCITY STEP — OUTWARD SPEED AT WET/DRY FACES'),
    ...faceRows, '',
    esc('ONE VELOCITY STEP — RELAXATION SWEEP'),
    ...relaxRows, '',
    esc('Green = the pair reproduced. Ripple figures are diagnostic, never a pass.'),
    esc('Exact profiles: window.__fishScaleResult'),
  ].join('\n');
}

export function maybeRunFishScale(engine: unknown, stroke: unknown): void {
  if (!new URLSearchParams(location.search).has('fish-scale')) return;
  const panel = makePanel(
    'fish-scale-result', '1060px',
    'ROUND FISH-SCALE STAGE TEST\n\nrunning sixty-two controlled strokes…',
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
