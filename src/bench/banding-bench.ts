// Flat-brush transverse-banding discriminator.
//
// Run from the app with `?banding=1`. The same geometric Flat Sable Oil stroke
// is submitted with one stylus report per engine frame and with four reports
// collected into each frame. Nothing about the brush path changes. We read
// wet0.y (the stored standing film) before compositing, so this answers one
// question cleanly: are the visible bars in the paint body, or only in its
// lighting?

import { BRUSHES } from '../brush/library';
import { esc, ok, warn, headline, makePanel } from './panel';
import { OIL } from '../media/library';
import { CANVASES } from '../substrate/papers';

type AnyRec = Record<string, any>;

const X0 = 120;
const X1 = 392;
const Y = 250;
const INPUTS = 68; // exactly 4 cells between stylus reports
const CORRIDOR = 24;

const sample = () => ({
  px: 0, py: 0, pointerType: 'pen', down: true, velocity: 0,
  pressure: 0.75, tiltAngle: 35, tiltAzimuth: 90, twist: 0,
});

/* `[TRAP, measured 2026-08-29]` This MUST stay a timer, and this bench must be
   run on a VISIBLE page. It yields so asynchronous pickup credit can land, and
   this bench runs WITH pickup enabled, so how long the yield takes changes what
   is measured. Chrome clamps setTimeout on a HIDDEN page to one call per MINUTE,
   which makes this look hung; a MessageChannel yield fixes the hang and moves
   the numbers, so it was reverted. Show the page instead. */
const yieldTask = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

function setUp(engine: AnyRec, stroke: AnyRec) {
  const brush = BRUSHES.find((b) => b.slug === 'flat-sable');
  const paper = CANVASES.find((p) => p.slug === 'canvas-duck');
  if (!brush || !paper) throw new Error('banding bench setup row missing');
  engine.setPaper(paper);
  engine.setWetMedium(OIL);
  stroke.setWetMedium(OIL);
  stroke.setBrush(brush, 1);
}

function movingMean(values: number[], radius: number): number[] {
  const prefix = new Array(values.length + 1).fill(0);
  for (let i = 0; i < values.length; i++) prefix[i + 1] = prefix[i] + values[i];
  return values.map((_v, i) => {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(values.length, i + radius + 1);
    return (prefix[hi] - prefix[lo]) / Math.max(1, hi - lo);
  });
}

function analyse(film: Float32Array, n: number, group: number) {
  // Sum the film across the brush width at every x. This measures the paint
  // body and does not confuse a wider mark with a taller centre pixel.
  const volume: number[] = [];
  const peak: number[] = [];
  for (let x = X0; x <= X1; x++) {
    let sum = 0;
    let high = 0;
    for (let y = Y - CORRIDOR; y <= Y + CORRIDOR; y++) {
      const h = Math.max(0, film[(y * n + x) * 4 + 1]);
      sum += h;
      high = Math.max(high, h);
    }
    volume.push(sum);
    peak.push(high);
  }

  // Remove slow brush-load depletion. What remains is the short repeated
  // ridge/valley rhythm the artist sees as transverse scales.
  const trend = movingMean(volume, 16);
  const residual = volume.map((v, i) => (v - trend[i]) / Math.max(trend[i], 1e-6));
  const safeLo = 20;
  const safeHi = residual.length - 20;
  const interior = residual.slice(safeLo, safeHi);
  const ripple = Math.sqrt(interior.reduce((s, v) => s + v * v, 0) / Math.max(1, interior.length));

  // Frame boundaries are known from the input grouping. Average the stored
  // height pattern around every internal boundary. A real frame seam produces
  // the same ridge/valley at the same offset each time; random bristle texture
  // cancels out.
  const boundaries: number[] = [];
  for (let input = group; input < INPUTS; input += group) {
    const x = Math.round(X0 + ((X1 - X0) * input) / INPUTS) - X0;
    if (x >= safeLo && x < safeHi) boundaries.push(x);
  }
  const phase: number[] = [];
  for (let off = -8; off <= 8; off++) {
    let sum = 0;
    let count = 0;
    for (const b of boundaries) {
      const i = b + off;
      if (i >= safeLo && i < safeHi) { sum += residual[i]; count++; }
    }
    phase.push(count ? sum / count : 0);
  }
  const phaseSpan = Math.max(...phase) - Math.min(...phase);

  return {
    group,
    engineFrames: Math.ceil(INPUTS / group),
    frameSpacingCells: 4 * group,
    ripple: +ripple.toFixed(4),
    boundaryPhaseSpan: +phaseSpan.toFixed(4),
    phase: phase.map((v) => +v.toFixed(4)),
    volume: volume.map((v) => +v.toFixed(5)),
    peak: peak.map((v) => +v.toFixed(5)),
  };
}

async function oneStroke(
  engine: AnyRec, stroke: AnyRec, group: number, smearStrength = 1, grabStrength = 1,
) {
  engine.clear();
  engine.setFluid({ smearStrength });
  // clear() wipes the colour-slot map, so mix and charge must follow it.
  engine.setMix(new Map([['ultramarine-blue', 1]]));
  stroke.charge(engine.mixWeights, 1, 0);
  stroke.begin(X0, Y, sample());

  for (let k = 1; k <= INPUTS; k++) {
    stroke.add(X0 + ((X1 - X0) * k) / INPUTS, Y, sample());
    if (k % group === 0 || k === INPUTS) {
      const d = stroke.drain();
      engine.step(
        d.data, d.count, d.dx, d.dy, stroke.brushMix,
        stroke.brushTake * grabStrength, stroke.brushGrab * grabStrength,
      );
      // Match the live app: asynchronous pickup credit may land between frames.
      await yieldTask();
    }
  }
  stroke.end();
  const film = await engine.dump('wet0');
  engine.render();
  return analyse(film, engine.sim, group);
}

function rmsDifference(a: number[], b: number[]) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const scale = Math.max(1e-6, (Math.abs(a[i]) + Math.abs(b[i])) * 0.5);
    const d = (a[i] - b[i]) / scale;
    sum += d * d;
  }
  return Math.sqrt(sum / Math.max(1, n));
}

async function run(engine: AnyRec, stroke: AnyRec) {
  setUp(engine, stroke);
  const raf = window.requestAnimationFrame;
  // The app loop would add uncounted fluid frames while this async bench yields.
  window.requestAnimationFrame = (() => 0) as typeof window.requestAnimationFrame;
  try {
    const oneA = await oneStroke(engine, stroke, 1, 1);
    const oneB = await oneStroke(engine, stroke, 1, 1);
    const fourA = await oneStroke(engine, stroke, 4, 1);
    const fourB = await oneStroke(engine, stroke, 4, 1);
    // Pressure-carried shove only. Pickup and the laden-brush grab route share
    // brushTake/brushGrab, so zeroing both leaves the pressure route intact and
    // conservatively disables the other pair together.
    const pressureOnlyA = await oneStroke(engine, stroke, 4, 1, 0);
    const pressureOnlyB = await oneStroke(engine, stroke, 4, 1, 0);
    // Same coarse frame rhythm with the movement term disabled. The fresh-paint
    // levelling still runs. If the seam collapses here, the shove—not the
    // levelling—is what is stepping the paint at frame boundaries.
    const noSmearA = await oneStroke(engine, stroke, 4, 0);
    const noSmearB = await oneStroke(engine, stroke, 4, 0);
    const result = {
      setup: {
        medium: 'oil', brush: 'flat-sable', paper: 'canvas-duck',
        pressure: 0.75, tiltAngle: 35, tiltAzimuth: 90,
        path: `${X0},${Y} to ${X1},${Y}`,
      },
      onePerFrame: [oneA, oneB],
      fourPerFrame: [fourA, fourB],
      fourPerFramePressureOnly: [pressureOnlyA, pressureOnlyB],
      fourPerFrameNoSmear: [noSmearA, noSmearB],
      repeatDifference: {
        onePerFrame: +rmsDifference(oneA.volume, oneB.volume).toFixed(6),
        fourPerFrame: +rmsDifference(fourA.volume, fourB.volume).toFixed(6),
        fourPerFramePressureOnly: +rmsDifference(pressureOnlyA.volume, pressureOnlyB.volume).toFixed(6),
        fourPerFrameNoSmear: +rmsDifference(noSmearA.volume, noSmearB.volume).toFixed(6),
      },
    };
    (window as AnyRec).__bandingResult = result;
    return result;
  } finally {
    window.requestAnimationFrame = raf;
  }
}

function summary(result: AnyRec): string {
  const a = result.onePerFrame;
  const b = result.fourPerFrame;
  const p = result.fourPerFramePressureOnly;
  const c = result.fourPerFrameNoSmear;
  // A pair that agrees is a row that passed; nothing else here has a threshold.
  let allRepro = true;
  const pairRow = (x: AnyRec, y: AnyRec, text: string) => {
    const equal = JSON.stringify(x) === JSON.stringify(y);
    if (!equal) allRepro = false;
    return (equal ? ok : warn)(text);
  };
  const block = (label: string, r: AnyRec) => [
    esc(label),
    pairRow(r[0], r[1],
      `  body ripple ${r[0].ripple} / ${r[1].ripple}\n`
      + `  frame-locked ridge span ${r[0].boundaryPhaseSpan} / ${r[1].boundaryPhaseSpan}`),
  ];
  /* Build every row FIRST. `allRepro` is only true once each pairRow has had its
     say, and an array literal evaluates in order - putting the headline inline
     above the rows read "reproduced exactly" in green over four amber rows. */
  const rows = [
    ...block('1 input/frame (4-cell frames):', a),
    ...block('4 inputs/frame (16-cell frames):', b),
    ...block('4 inputs/frame, pressure shove ONLY:', p),
    ...block('4 inputs/frame, Smear OFF (levelling still ON):', c),
  ];
  return [
    headline(allRepro ? 'pass' : 'fail', 'FLAT-BRUSH STORED-HEIGHT TEST — finished'),
    '',
    esc('Same Flat Sable / Oil / Cotton Duck stroke; only frame bundling changed.'),
    allRepro
      ? ok('Every paired run reproduced exactly.')
      : warn('SOME PAIRED RUNS DISAGREED — read the amber rows before the numbers.'),
    '',
    ...rows,
    '',
    esc(`repeat difference: ${result.repeatDifference.onePerFrame} / ${result.repeatDifference.fourPerFrame} / ${result.repeatDifference.fourPerFramePressureOnly} / ${result.repeatDifference.fourPerFrameNoSmear}`),
    '',
    esc('Green = the pair reproduced. Ripple figures are diagnostic, never a pass.'),
    esc('The canvas now shows the final four-input/frame, Smear-off stroke.'),
    esc('Full profiles: window.__bandingResult'),
  ].join('\n');
}

export function maybeRunBanding(engine: unknown, stroke: unknown): void {
  if (!new URLSearchParams(location.search).has('banding')) return;
  const panel = makePanel(
    'banding-result', '620px',
    'FLAT-BRUSH STORED-HEIGHT TEST\n\nrunning eight controlled strokes…',
  );
  document.body.appendChild(panel);
  // Let main.ts's already-requested opening frame finish before taking sole
  // ownership of frame advancement.
  setTimeout(() => {
    run(engine as AnyRec, stroke as AnyRec)
      .then((result) => { panel.innerHTML = summary(result); })
      .catch((err) => {
        panel.innerHTML = headline('fail', 'banding test ERROR') + '\n\n' + esc(String(err));
      });
  }, 50);
}
