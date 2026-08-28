// The pickup bench — does a stroke pull the layer beneath it?
//
// WHY THIS EXISTS. Six measurements went wrong in one session (docs/HANDOFF.md,
// head of Part B), every one caught by the artist looking at the screen rather
// than by the numbers. All six were ad-hoc probes typed into a console. This is
// the same measurements written down once, with the traps encoded, so a figure
// can be compared against last week's instead of re-derived and re-broken.
//
// Run it from the browser console against the live app:
//
//   const b = await import('/src/bench/pickup-bench.ts');
//   await b.crossing(__engine, __stroke);                 // the standard test
//   await b.crossing(__engine, __stroke, { floor: 0 });   // with pickup shut
//   await b.holding(__engine, __stroke);                  // the overfill guard
//   await b.watercolourControl(__engine, __stroke);       // must not drift
//
// Every function asserts its own setup and THROWS if the engine is not running
// what it claims. A run that is not what it says it is must fail loudly: the
// previous session spent an afternoon on numbers taken while the tool bar read
// "Watercolour / Round Sable" and the solver ran oil.

import { BRUSHES } from '../brush/library';
// Cotton Duck lives in CANVASES, not PAPERS — an oil bench that grabbed from
// PAPERS would silently run on watercolour paper, which is one of the setup
// slips this file exists to make impossible.
import { PAPERS, CANVASES } from '../substrate/papers';
import { OIL, WATERCOLOR } from '../media/library';

/** Everything the standard crossing holds fixed. Change these and old numbers
 *  stop being comparable, so they live in one place and are reported back. */
export const SETUP = {
  medium: 'oil',
  brush: 'flat-hog',
  /** Slug, not display name — see the CANVASES note on the import. */
  paper: 'canvas-duck',
  pressure: 0.7,
  tiltAngle: 35,
  /** Blue band: three passes, so there is a real layer to pull at. */
  band: { x0: 170, x1: 370, y: 212, passes: 3, spacing: 13, azimuth: 90 },
  /** Yellow crossing, straight down through the middle of the band. */
  cross: { x: 262, y0: 165, y1: 300, azimuth: 0 },
  samplesPerStroke: 50,
  settleSteps: 8,
} as const;

type AnyRec = Record<string, unknown>;


/**
 * Put the engine into the standard setup and PROVE it took.
 *
 * The proof is read back from `fluid.params`, not from what we just set and not
 * from the UI, because the UI's tool bar is independent of the engine when the
 * medium is set through the API — it will happily read "Watercolour" while the
 * solver runs oil.
 */
export function assertSetup(engine: AnyRec, stroke: AnyRec): AnyRec {
  const oil = OIL as unknown as AnyRec;
  const hog = BRUSHES.find((b) => b.slug === SETUP.brush);
  const duck = [...CANVASES, ...PAPERS].find((p) => p.slug === SETUP.paper);
  if (!hog) throw new Error(`pickup-bench: no brush '${SETUP.brush}'`);
  if (!duck) throw new Error(`pickup-bench: no paper '${SETUP.paper}'`);

  (engine as AnyRec & { setPaper(p: unknown): void }).setPaper(duck);
  (engine as AnyRec & { setWetMedium(m: unknown): void }).setWetMedium(oil);
  (stroke as AnyRec & { setWetMedium(m: unknown): void }).setWetMedium(oil);
  (stroke as AnyRec & { setBrush(b: unknown): void }).setBrush(hog);

  const p = ((engine as AnyRec).fluid as AnyRec).params as AnyRec;
  const want: Array<[string, unknown]> = [
    ['yieldStress', (oil as AnyRec).yieldStress],
    ['viscosity', (oil as AnyRec).viscosity],
    ['upRate', (oil as AnyRec).upRate],
    ['teflonMin', (oil as AnyRec).teflonMin],
    ['hasCurrent', false],
  ];
  const wrong = want.filter(([k, v]) => p[k] !== v);
  if (wrong.length) {
    throw new Error(
      `pickup-bench: the engine is NOT running ${SETUP.medium}. `
      + wrong.map(([k, v]) => `${k}=${String(p[k])} (want ${String(v)})`).join(', '));
  }
  const res = ((stroke as AnyRec).brush as AnyRec).reservoir as AnyRec;
  return {
    medium: SETUP.medium, brush: SETUP.brush, paper: SETUP.paper,
    yieldStress: p.yieldStress, hasCurrent: p.hasCurrent,
    materialUpRate: p.upRate, brushUpRate: (res as AnyRec).upRate,
    roomFractionWhenFull: null as number | null,
  };
}

const pen = (az: number) => ({
  px: 0, py: 0, pointerType: 'pen', down: true, velocity: 0,
  pressure: SETUP.pressure, tiltAngle: SETUP.tiltAngle, tiltAzimuth: az, twist: 0,
});

async function stroke1(engine: AnyRec, stroke: AnyRec,
                       x0: number, y0: number, x1: number, y1: number, az: number) {
  const s = stroke as AnyRec & {
    begin(x: number, y: number, p: unknown): void;
    add(x: number, y: number, p: unknown): void;
    end(): void;
    drain(): { data: Float32Array; count: number; dx: number; dy: number };
    brushMix: Float32Array; brushTake: number;
  };
  const e = engine as AnyRec & {
    step(d: Float32Array, c: number, dx: number, dy: number, m: Float32Array, t: number): void;
  };
  s.begin(x0, y0, pen(az));
  const N = SETUP.samplesPerStroke;
  for (let k = 1; k <= N; k++) {
    s.add(x0 + ((x1 - x0) * k) / N, y0 + ((y1 - y0) * k) / N, pen(az));
    const d = s.drain();
    e.step(d.data, d.count, d.dx, d.dy, s.brushMix, s.brushTake);
    // Yield to the browser so the async pickup readback can land. Without this
    // the credit arrives after the measurement and the brush reads empty.
    await new Promise((r) => setTimeout(r, 0));
  }
  s.end();
  for (let q = 0; q < SETUP.settleSteps; q++) {
    const d = s.drain();
    e.step(d.data, d.count, 0, 0, s.brushMix, 0);
    await new Promise((r) => setTimeout(r, 0));
  }
}

/**
 * Silence the APP's own animation loop for the duration of a run.
 *
 * `[TRAP, measured]` The bench yields to the browser between steps so the async
 * pickup readback can land. While it yields, `main.ts`'s `requestAnimationFrame`
 * loop is free to run its own `engine.step()` — so the fluid advances a variable
 * number of extra frames depending on machine load, and identical runs return
 * different numbers. It showed first as a watercolour control that drifted
 * 32.92 / 33.01, then as a lift figure that would not repeat (38.9 / 36.3).
 *
 * Stubbing rAF for the duration makes a run depend only on what the bench does.
 * Restored in `finally`, always.
 */
function quietApp<T>(body: () => Promise<T>): Promise<T> {
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = ((): number => 0) as typeof window.requestAnimationFrame;
  return body().finally(() => { window.requestAnimationFrame = raf; });
}

/** Temporarily floor `roomFraction`, for A/B against the shipped value. Bench
 *  only — it patches the prototype and always restores it. */
function withFloor<T>(stroke: AnyRec, floor: number | undefined, body: () => Promise<T>): Promise<T> {
  if (floor === undefined) return body();
  const proto = Object.getPrototypeOf(((stroke as AnyRec).brush as AnyRec).reservoir as object);
  const orig = proto.roomFraction as () => number;
  proto.roomFraction = function patched(this: AnyRec) {
    // Recompute the raw value rather than calling orig, which already floors.
    const water = this.water as Float32Array;
    const pigment = this.pigment as Float32Array;
    const capacity = this.capacity as Float32Array;
    let w = 0, p = 0, c = 0;
    for (let i = 0; i < water.length; i++) {
      c += capacity[i]; w += water[i];
      for (let k = 0; k < 8; k++) p += pigment[i * 8 + k];
    }
    if (c <= 1e-6) return 0;
    return Math.max(floor, 1 - Math.max(0, Math.min(1, Math.max(w, p) / c)));
  };
  return body().finally(() => { proto.roomFraction = orig; });
}

/**
 * THE STANDARD CROSSING. Blue band, then a fully-charged yellow brush across it.
 *
 * `[TRAP]` Removal is counted ONLY in cells the yellow actually reached.
 * Measuring the whole region understates it about twentyfold, because most of
 * the band is never touched — that mistake produced "0.5 %" for something that
 * was locally 10.7 %.
 */
export async function crossing(engine: AnyRec, stroke: AnyRec, opts: { floor?: number } = {}) {
  const setup = assertSetup(engine, stroke);
  const e = engine as AnyRec & {
    clear(): void; setMix(m: Map<string, number>): void; mixWeights: Float32Array;
    dump(n: string): Promise<Float32Array>; render(): void; sim: number;
  };
  const s = stroke as AnyRec & {
    charge(m: Float32Array, load: number, water: number): void;
    brush: { reservoir: AnyRec & { totals(): { water: number; pigment: number; capacity: number };
                                   pigment: Float32Array; roomFraction(): number } };
  };

  return quietApp(() => withFloor(stroke, opts.floor, async () => {
    e.clear();
    e.setMix(new Map([['ultramarine-blue', 1]]));
    s.charge(e.mixWeights, 1.0, 0);
    for (let i = 0; i < SETUP.band.passes; i++) {
      const y = SETUP.band.y + i * SETUP.band.spacing;
      await stroke1(engine, stroke, SETUP.band.x0, y, SETUP.band.x1, y, SETUP.band.azimuth);
    }

    const beforeG = await e.dump('wet1');
    const beforeFilm = await e.dump('wet0');

    e.setMix(new Map([['hansa-yellow', 1]]));
    s.charge(e.mixWeights, 1.0, 0);
    setup.roomFractionWhenFull = +s.brush.reservoir.roomFraction().toFixed(3);
    await stroke1(engine, stroke,
      SETUP.cross.x, SETUP.cross.y0, SETUP.cross.x, SETUP.cross.y1, SETUP.cross.azimuth);

    const afterG = await e.dump('wet1');
    const afterFilm = await e.dump('wet0');
    const n = e.sim;

    // Contacted = the yellow slot gained here AND there was blue here to take.
    let blueBefore = 0, blueAfter = 0, filmBefore = 0, filmAfter = 0, cells = 0;
    for (let y = 190; y <= 260; y++) {
      for (let x = 230; x <= 295; x++) {
        const i = (y * n + x) * 4;
        if (afterG[i + 1] - beforeG[i + 1] > 0.002 && beforeG[i] > 0.002) {
          blueBefore += beforeG[i]; blueAfter += afterG[i];
          filmBefore += beforeFilm[i + 1]; filmAfter += afterFilm[i + 1];
          cells++;
        }
      }
    }

    // Trail: how blue the mark is at increasing distance past the crossing.
    const trail: Array<{ cellsPast: number; bluePct: number }> = [];
    for (let band = 0; band < 5; band++) {
      const y0 = 250 + band * 10;
      let blue = 0, total = 0;
      for (let y = y0; y < y0 + 10; y++) {
        for (let x = SETUP.cross.x - 14; x <= SETUP.cross.x + 14; x++) {
          const i = (y * n + x) * 4;
          blue += afterG[i]; total += afterG[i] + afterG[i + 1];
        }
      }
      trail.push({ cellsPast: (band + 1) * 10, bluePct: +(100 * blue / Math.max(total, 1e-9)).toFixed(1) });
    }

    const t = s.brush.reservoir.totals();
    /* `[TRAP]` Count the SURFACE FILM as well as the tuft's own stores. Reading
       `reservoir.pigment` alone reported the brush as 0.00 % blue at the exact
       moment the film was carrying all of it — the instrument would have hidden
       Part B working. */
    const per = new Array(8).fill(0);
    const rp = s.brush.reservoir.pigment;
    for (let i = 0; i < rp.length; i++) per[i % 8] += rp[i];
    const sp = s.brush.reservoir.surfacePig as Float32Array;
    for (let k = 0; k < 8; k++) per[k] += sp[k];
    const brushTotal = per.reduce((a, b) => a + b, 0);

    e.render();
    return {
      setup, floor: opts.floor ?? 'as shipped',
      contactedCells: cells,
      bluePigmentRemovedPct: +(100 * (blueBefore - blueAfter) / Math.max(blueBefore, 1e-9)).toFixed(1),
      /* `[CONFOUNDED — do not read as removal]` The crossing DEPOSITS film into
         the same cells it lifts from, so this nets the two and comes out
         negative on any real crossing. It is kept only as a sanity signal: a
         large positive number would mean the brush is stripping the sheet bare,
         which is the 2026-08-25 failure. Judge lifting by the pigment line
         above, which is colour-separable and therefore not confounded. */
      filmNetChangePct: +(100 * (filmAfter - filmBefore) / Math.max(filmBefore, 1e-9)).toFixed(1),
      brushBluePct: +(100 * per[0] / Math.max(brushTotal, 1e-9)).toFixed(2),
      trailBlueByDistance: trail,
      holdingPctOfCapacity: +(100 * Math.max(t.water, t.pigment) / t.capacity).toFixed(1),
    };
  }));
}

/**
 * The overfill guard. Six scrubs through wet paint with no recharge; holding
 * must never exceed 100 %. This is the test the 2026-08-25 revert was protecting
 * — it belongs to the bench now so nobody has to take the fear on trust.
 */
export async function holding(engine: AnyRec, stroke: AnyRec, opts: { floor?: number } = {}) {
  const setup = assertSetup(engine, stroke);
  const e = engine as AnyRec & { clear(): void; setMix(m: Map<string, number>): void;
                                 mixWeights: Float32Array; render(): void };
  const s = stroke as AnyRec & { charge(m: Float32Array, l: number, w: number): void;
                                 brush: { reservoir: { totals(): { water: number; pigment: number; capacity: number } } } };
  return quietApp(() => withFloor(stroke, opts.floor, async () => {
    const hold = () => {
      const t = s.brush.reservoir.totals();
      return +(100 * Math.max(t.water, t.pigment) / t.capacity).toFixed(1);
    };
    e.clear();
    e.setMix(new Map([['ultramarine-blue', 1]]));
    s.charge(e.mixWeights, 1.0, 0);
    for (let i = 0; i < 4; i++) {
      await stroke1(engine, stroke, 170, 200 + i * 12, 370, 200 + i * 12, 90);
    }
    e.setMix(new Map([['hansa-yellow', 1]]));
    s.charge(e.mixWeights, 1.0, 0);
    const series = [hold()];
    for (let i = 0; i < 6; i++) {
      await stroke1(engine, stroke, 200 + i * 14, 180, 200 + i * 14, 280, 0);
      series.push(hold());
    }
    e.render();
    return { setup, floor: opts.floor ?? 'as shipped', holdingPctAfterEachScrub: series,
             peak: Math.max(...series), passed: Math.max(...series) <= 100.5 };
  }));
}

/**
 * Watercolour must not move. Every change to the pickup path is gated on
 * `workableBody`, which is zero for any medium with `yieldStress 0` — so this
 * number is a regression test on that gating, not on watercolour itself.
 */
export async function watercolourControl(engine: AnyRec, stroke: AnyRec) {
  const wc = WATERCOLOR as unknown as AnyRec;
  const e = engine as AnyRec & {
    clear(): void; setMix(m: Map<string, number>): void; mixWeights: Float32Array;
    setWetMedium(m: unknown): void; sampleGauges(): Promise<AnyRec>; render(): void;
  };
  const s = stroke as AnyRec & { setWetMedium(m: unknown): void;
                                 charge(m: Float32Array, l: number, w: number): void };
  e.setWetMedium(wc); s.setWetMedium(wc);
  const p = ((engine as AnyRec).fluid as AnyRec).params as AnyRec;
  if (p.yieldStress !== 0) throw new Error('pickup-bench: watercolour control is not on watercolour');
  e.clear();
  e.setMix(new Map([['ultramarine-blue', 1]]));
  s.charge(e.mixWeights, 1.0, 0.6);
  await stroke1(engine, stroke, 180, 240, 360, 240, 90);
  const g = await e.sampleGauges();
  e.render();
  return { medium: 'watercolour', pigment: +(g.pigment as number).toFixed(4),
           water: +(g.water as number).toFixed(4), wetCells: g.wetCells };
}

/**
 * Force the material's `upRate` for the duration of a run, restoring it after.
 *
 * Setting it to 0 shuts pickup off completely and in BOTH places it matters:
 * `fluid.ts:850` stops sending it to the shader, and `fluid.ts:902` stops
 * arming the readback, so no credit can arrive late and land in the next
 * condition's numbers. Bench only.
 */
function withUpRate<T>(engine: AnyRec, rate: number | undefined, body: () => Promise<T>): Promise<T> {
  if (rate === undefined) return body();
  const p = ((engine as AnyRec).fluid as AnyRec).params as AnyRec;
  const orig = p.upRate;
  p.upRate = rate;
  return body().finally(() => { p.upRate = orig; });
}

/**
 * STACKING — does oil keep building when you paint over your own stroke?
 *
 * `docs/18` §2. E10 measured a four-pass pile adding +0.56, +0.25, +0.12, +0.08
 * and converging, where real oil keeps building. The suspect is docs/17 Part A:
 * contact is now an exchange, and an exchange has no notion of LIKE paint, so a
 * loaded brush restating its own colour lifts what it is simultaneously laying.
 *
 * This is the discriminator. Same four passes, pickup on vs pickup off. If the
 * off column keeps climbing where the on column flattens, the exchange is
 * eating the pile and the fix belongs in `rExchange`, not in the deposit.
 *
 * `[TRAP]` The brush is RECHARGED before every pass. Without that a flattening
 * curve is explained trivially by a tuft running dry, and the measurement says
 * nothing about pickup at all.
 *
 * `[TRAP]` Every pass is laid on the SAME line. The point is paint on its own
 * colour; offsetting the passes would measure coverage instead.
 */
export async function stacking(engine: AnyRec, stroke: AnyRec,
                               opts: { upRate?: number; passes?: number } = {}) {
  const setup = assertSetup(engine, stroke);
  const e = engine as AnyRec & {
    clear(): void; setMix(m: Map<string, number>): void; mixWeights: Float32Array;
    dump(n: string): Promise<Float32Array>; render(): void; sim: number;
  };
  const s = stroke as AnyRec & { charge(m: Float32Array, l: number, w: number): void };
  const passes = opts.passes ?? 4;
  const X0 = 170, X1 = 370, Y = 240;

  return quietApp(() => withUpRate(engine, opts.upRate, async () => {
    e.clear();
    const series: Array<{ pass: number; peakFilm: number; volume: number; wetCells: number; added: number }> = [];
    let prevMean = 0;
    for (let i = 0; i < passes; i++) {
      e.setMix(new Map([['ultramarine-blue', 1]]));
      s.charge(e.mixWeights, 1.0, 0);
      await stroke1(engine, stroke, X0, Y, X1, Y, 90);

      const film = await e.dump('wet0');
      const n = e.sim;
      /* `[TRAP, measured 2026-08-27]` MASS is the SUM over a fixed corridor, not
         the mean over wetted cells. The first version of this bench averaged
         over `h > 0.0005` and read a saturating curve — but each pass also wets
         more thin edge cells, and those drag the average down while the pile is
         still growing. Peak film climbed dead linearly (0.0363, 0.0418, 0.0472,
         0.0529) through the same run whose mean "saturated". A mean over a
         changing denominator is not a measure of how much paint is there. */
      let peak = 0, sum = 0, cells = 0;
      for (let y = Y - 25; y <= Y + 25; y++) {
        for (let x = X0; x <= X1; x++) {
          const h = film[(y * n + x) * 4 + 1];
          if (h > 0.0005) { peak = Math.max(peak, h); cells++; }
          sum += Math.max(h, 0);
        }
      }
      series.push({
        pass: i + 1,
        peakFilm: +peak.toFixed(4),
        /** Total film in the corridor — the honest mass number. */
        volume: +sum.toFixed(3),
        wetCells: cells,
        added: +(sum - prevMean).toFixed(3),
      });
      prevMean = sum;
    }
    e.render();
    const first = series[0]?.added ?? 0;
    const last = series[series.length - 1]?.added ?? 0;
    return {
      setup,
      upRate: opts.upRate === undefined ? 'as shipped' : opts.upRate,
      perPass: series,
      /* The whole question in one number: what fraction of the first pass's
         gain does the last pass still deliver? Real oil should stay near 1.
         Converging toward 0 is the fault docs/18 §2 is chasing. */
      lastGainVsFirst: +(last / Math.max(first, 1e-9)).toFixed(3),
    };
  }));
}
