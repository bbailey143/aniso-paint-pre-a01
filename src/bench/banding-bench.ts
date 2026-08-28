// Flat-brush transverse-banding discriminator.
//
// Run from the app with `?banding=1`. The same geometric Flat Sable Oil stroke
// is submitted with one stylus report per engine frame and with four reports
// collected into each frame. Nothing about the brush path changes. We read
// wet0.y (the stored standing film) before compositing, so this answers one
// question cleanly: are the visible bars in the paint body, or only in its
// lighting?

import { BRUSHES } from '../brush/library';
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

const yieldTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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
  return [
    'FLAT-BRUSH STORED-HEIGHT TEST — finished',
    '',
    'Same Flat Sable / Oil / Cotton Duck stroke; only frame bundling changed.',
    'Numbers are paired identical runs.',
    '',
    `1 input/frame (4-cell frames):`,
    `  body ripple ${a[0].ripple} / ${a[1].ripple}`,
    `  frame-locked ridge span ${a[0].boundaryPhaseSpan} / ${a[1].boundaryPhaseSpan}`,
    `4 inputs/frame (16-cell frames):`,
    `  body ripple ${b[0].ripple} / ${b[1].ripple}`,
    `  frame-locked ridge span ${b[0].boundaryPhaseSpan} / ${b[1].boundaryPhaseSpan}`,
    `4 inputs/frame, pressure shove ONLY:`,
    `  body ripple ${p[0].ripple} / ${p[1].ripple}`,
    `  frame-locked ridge span ${p[0].boundaryPhaseSpan} / ${p[1].boundaryPhaseSpan}`,
    `4 inputs/frame, Smear OFF (levelling still ON):`,
    `  body ripple ${c[0].ripple} / ${c[1].ripple}`,
    `  frame-locked ridge span ${c[0].boundaryPhaseSpan} / ${c[1].boundaryPhaseSpan}`,
    '',
    `repeat difference: ${result.repeatDifference.onePerFrame} / ${result.repeatDifference.fourPerFrame} / ${result.repeatDifference.fourPerFramePressureOnly} / ${result.repeatDifference.fourPerFrameNoSmear}`,
    '',
    'The canvas now shows the final four-input/frame, Smear-off stroke.',
    'Full profiles: window.__bandingResult',
  ].join('\n');
}

export function maybeRunBanding(engine: unknown, stroke: unknown): void {
  if (!new URLSearchParams(location.search).has('banding')) return;
  const panel = document.createElement('div');
  panel.id = 'banding-result';
  panel.style.cssText =
    'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9999;' +
    'width:min(620px,92vw);padding:14px 16px;border-radius:10px;' +
    'background:rgba(12,12,14,.95);color:#e8e6e3;font:13px/1.45 ui-monospace,monospace;' +
    'box-shadow:0 8px 30px rgba(0,0,0,.5);white-space:pre-wrap;pointer-events:none';
  panel.textContent = 'FLAT-BRUSH STORED-HEIGHT TEST\n\nrunning eight controlled strokes…';
  document.body.appendChild(panel);
  // Let main.ts's already-requested opening frame finish before taking sole
  // ownership of frame advancement.
  setTimeout(() => {
    run(engine as AnyRec, stroke as AnyRec)
      .then((result) => { panel.textContent = summary(result); })
      .catch((err) => { panel.textContent = `banding test ERROR\n\n${String(err)}`; });
  }, 50);
}
