/*
 * TEMPORARY TEST HARNESS — added 2026-08-23, not part of the project.
 *
 * `docs/11-open-fault-conservation.md` closes with one cheap, decisive
 * experiment that has never been run: take the reproduction soak to a
 * DIFFERENT GPU. If it stays clean there, the fault is the AMD Polaris card
 * and the sane() guards are the correct permanent answer. If it fires there
 * too, the cause is ours and the guards are hiding it.
 *
 * That experiment was postponed waiting for a second computer. An iPad is a
 * second computer, with an entirely different GPU and driver — but there is no
 * JavaScript console on one, and the recipe in docs/12 §3.3 is a console
 * script. This wraps that exact recipe so it runs from a URL and reports on
 * screen:
 *
 *     <the tunnel address>/?soak=8
 *
 * The stroke sequence, the loading, the pigment and the blow-up threshold are
 * copied from §3.3 unchanged. Do not commit this file.
 */

import { esc, ok, bad, headline } from './bench/panel';

type Gauges = { water: number; pigment: number; wetCells: number };

const SESSIONS_DEFAULT = 8;
const STROKES = 26;
const BLOWN = 1e6;

/**
 * Hand the frame back so the painting is visible while the soak runs.
 *
 * `[TRAP, measured]` A HIDDEN page never fires requestAnimationFrame at all,
 * so this soak did not advance by a single session in an automated browser -
 * it sat on "running 1 of 4" forever. The rAF is only here so the picture
 * draws and the tab does not look hung (see the call site); every solver step
 * and the gauge readback happen around it, not inside it. So when the page is
 * hidden, yield through a MessageChannel instead, which is neither clamped nor
 * suspended. A visible page keeps the original rAF pacing exactly.
 */
const nextFrame = () => new Promise<void>((r) => {
  if (document.hidden) {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { ch.port1.close(); r(); };
    ch.port2.postMessage(0);
    return;
  }
  requestAnimationFrame(() => r());
});

/** docs/12 §3.3, verbatim in substance: 26 strokes, mouse input, load 0.75. */
async function runOneSession(engine: any, stroke: any): Promise<Gauges> {
  const sample = () => ({
    px: 0, py: 0, pointerType: 'mouse', down: true, velocity: 0,
    pressure: 0.65, tiltAngle: 0, tiltAzimuth: 0, twist: 0,
  });

  engine.clear();
  // setMix must follow clear(): clear wipes the slot map, and a mix set before
  // it silently gives a colourless brush. (docs/12 §4)
  engine.setMix(new Map([['ultramarine-blue', 1]]));
  stroke.charge(engine.mixWeights, 0.75, 0);

  for (let i = 0; i < STROKES; i++) {
    const y = 120 + ((i * 37) % 280);
    const x = 100 + ((i * 53) % 200);
    const x1 = x + 220;
    const y1 = y + ((i % 3) - 1) * 40;
    const steps = 60;

    stroke.begin(x, y, sample());
    for (let k = 1; k <= steps; k++) {
      stroke.add(x + ((x1 - x) * k) / steps, y + ((y1 - y) * k) / steps, sample());
      const d = stroke.drain();
      engine.step(d.data, d.count);
    }
    stroke.end();
    for (let q = 0; q < 20; q++) {
      const d = stroke.drain();
      engine.step(d.data, d.count);
    }

    // Draw it and give the browser its frame back, so Safari does not decide
    // the page has hung and so the painting is actually visible while it runs.
    engine.render();
    await nextFrame();
  }

  return (await engine.sampleGauges()) as Gauges;
}

const isBlown = (g: Gauges) =>
  !Number.isFinite(g.water) || !Number.isFinite(g.pigment) ||
  g.water > BLOWN || g.pigment > BLOWN;

export function maybeRunSoak(engine: unknown, stroke: unknown): void {
  const asked = new URLSearchParams(location.search).get('soak');
  if (asked === null) return;
  const sessions = Math.max(1, Math.min(64, Number(asked) || SESSIONS_DEFAULT));

  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9999;' +
    'max-width:min(560px,92vw);padding:14px 16px;border-radius:10px;' +
    'background:rgba(12,12,14,.94);color:#e8e6e3;font:14px/1.5 ui-monospace,monospace;' +
    'box-shadow:0 8px 30px rgba(0,0,0,.5);white-space:pre-wrap';
  document.body.appendChild(panel);

  const lines: string[] = [];
  // Rendered as HTML so a passing run reads green (src/bench/panel.ts).
  // Every fragment is escaped where it is built, never here.
  const paint = (status: string) => { panel.innerHTML = status + '\n\n' + lines.join('\n'); };

  (async () => {
    let blowups = 0;
    paint(esc(`soak — ${sessions} sessions of ${STROKES} strokes\nrunning 1 of ${sessions}…`));

    for (let n = 1; n <= sessions; n++) {
      paint(esc(`soak — ${sessions} sessions of ${STROKES} strokes\nrunning ${n} of ${sessions}…`));
      let g: Gauges;
      try {
        g = await runOneSession(engine as any, stroke as any);
      } catch (err) {
        lines.push(bad(`${String(n).padStart(2)}  ERROR  ${(err as Error).message}`));
        paint(headline('fail', 'soak stopped'));
        return;
      }
      const blown = isBlown(g);
      if (blown) blowups++;
      const row =
        `${String(n).padStart(2)}  ` +
        `pigment ${g.pigment.toPrecision(6).padStart(12)}  ` +
        `water ${g.water.toPrecision(6).padStart(12)}  ` +
        (blown ? 'BLOWN' : 'ok');
      lines.push(blown ? bad(row) : ok(row));
    }

    const clean = blowups === 0;
    const verdict = clean
      ? ok(`CLEAN — ${sessions}/${sessions} sessions healthy.`) +
        esc('\nOn the AMD Polaris card the old build blew up 24 times out of 24.' +
            '\nClean here points at the card, not the code.')
      : bad(`${blowups} of ${sessions} sessions blew up.`) +
        esc('\nIt fires on this GPU too, so the cause is in the code, not the card.');
    paint(headline(clean ? 'pass' : 'fail', 'soak finished') + '\n\n' + verdict +
      esc('\n\nnormal is pigment ≈ 4180, water ≈ 3500'));
  })();
}
