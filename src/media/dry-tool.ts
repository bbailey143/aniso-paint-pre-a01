// Dry media deposition (P7).
//
// A dry tool is NOT a brush. There is no tuft to solve, no reservoir to run
// down, and no fluid to push around — a pencil is a hard tip scraped across a
// textured surface, and the whole character of the mark comes from the contest
// between how hard the tip is pressed and how rough the paper is.
//
// It shares the brush's OUTPUT though: the same `Seg` footprint the GPU already
// knows how to rasterise, with `water = 0`. That is deliberate — one deposit
// format, two very different tools feeding it.
//
// THE HEADLINE BEHAVIOUR, and where it lives:
//
//   `reach` is 0..1, how far into the paper's tooth the tip gets. The GPU gates
//   deposition on `smoothstep(need - 0.18, need + 0.18, toothH)` where
//   `need = 1 - reach`. So reach ~1 means the valleys fill and the line is
//   solid; reach ~0.3 means only the peaks catch and the line goes ragged.
//
//   Speed pulls reach down. Hardness pulls reach down. Pressure pushes it up.
//   Rough paper has a wider height spread, so the same reach breaks up far more
//   there than on hot press — the paper does that part for free, because the
//   gate is against the real height field.
//
// [UNVERIFIED] The response curves below are reasoned from Card 7's property
// surface, not measured. Card 7 says as much and says the numbers are tuned on
// the bench. They are marked here and in the library row.

import type { DryMedium, InkMedium } from './types';
import type { BrushInput } from '../brush/types';
import { SEG_FLOATS } from '../engine/fluid';

/**
 * Speed at which velocity break-up is at full strength, in grid cells per
 * resampled step. The resampler caps a step at ~0.9 cells (Card 6), so this is
 * expressed against that ceiling rather than against wall-clock: a "fast"
 * stroke is one that is asking for the maximum step every step.
 */
const REF_SPEED = 0.75;

/** Cheap deterministic value noise. Deterministic matters: the same stroke must
 * come out the same on a redraw, and a per-frame random would crawl. */
function hash1(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);            // smoothstep, so the flow glides
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}

export class DryTool {
  readonly medium: DryMedium;
  private size: number;
  /** Smoothed speed. A raw per-step delta is far too jittery to drive tooth
   * gating — the line would flicker between solid and broken within one
   * stroke, which reads as noise rather than as speed. */
  private speed = 0;
  /** Distance drawn so far this stroke, in cells. Drives ink starve/recover:
   * flow is a property of how far the ball has rolled, not of where it is, so
   * a second pass fills what the first one missed — as on paper. */
  private dist = 0;
  /** Per-stroke phase, so two strokes do not skip in the same places. */
  private phase = 0;

  constructor(medium: DryMedium, size = 1) {
    this.medium = medium;
    this.size = size;
  }

  setSize(size: number) { this.size = size; }

  /** The rim falloff this medium wants, handed to the deposit pass. */
  get edgeSharpness(): number { return this.medium.edgeSharpness; }

  begin() {
    this.speed = 0;
    this.dist = 0;
    // Deterministic per stroke, but different between strokes: hatching would
    // otherwise show identical skip marks on every parallel line.
    this.phase = hash1(this.strokes++) * 1000;
  }
  end() { this.speed = 0; }
  private strokes = 0;

  /**
   * Emit one contact footprint. Returns the new segment count.
   *
   * `prev` is the previous contact point so the segment spans the gap — a dry
   * tool has no bristles to smear across it, so without this a fast stroke
   * would be a row of dots for exactly the reason Card 6 warns about.
   */
  emit(
    buf: Float32Array, at: number, maxSegs: number,
    prev: { x: number; y: number } | null, s: BrushInput,
  ): number {
    if (at >= maxSegs) return at;
    const m = this.medium;

    const step = Math.hypot(s.dx, s.dy);
    this.speed = this.speed * 0.7 + step * 0.3;
    const speedNorm = Math.min(this.speed / REF_SPEED, 1);
    this.dist += step;

    // Pressure response. A graphite tip answers the hand almost linearly; a
    // ballpoint barely answers at all, which is the whole feel of a biro.
    const p = Math.max(s.pressure, 0.01);
    const press = Math.pow(p, m.pressureExp);

    // How deep the tip gets into the tooth. Hardness sets the ceiling — a 4H
    // simply cannot reach the valleys however hard you lean — and speed drags
    // it down from there.
    const ceiling = 0.95 - 0.5 * Math.max(m.hardness, 0);
    const floorReach = 0.18;
    let reach = floorReach + (ceiling - floorReach) * press;
    reach *= 1 - m.velocityCoupling * speedNorm;
    // A hard ball rides the peaks and simply cannot get into the valleys, however
    // hard it is pressed. `toothThreshold` is that ceiling, and it is why a biro
    // skips the low points while a soft pencil fills them.
    reach = Math.min(reach, 1 - m.toothThreshold);
    reach = Math.min(Math.max(reach, 0), 1);

    // How much comes off the tip. Speed thins the mark as well as breaking it,
    // but only half as strongly — a fast pencil line is lighter AND patchier,
    // and if you only model the patchiness the fast stroke reads as too dark.
    let amount = m.deposition * press * (1 - 0.5 * m.velocityCoupling * speedNorm);

    // Ink flow: the ball starves and recovers as it rolls. Two octaves — a slow
    // starve over several cells, and fine chatter on top — which together give
    // the irregular thick-and-thin that makes a biro line look drawn rather
    // than plotted. Driven by distance rolled, NOT by position, so going back
    // over a gap fills it in.
    let flow = 1;
    if ('skipStrength' in m) {
      const ink = m as InkMedium;
      const u = this.phase + this.dist / Math.max(ink.skipScale, 1e-3);
      // Shaped, not uniform. A biro runs at full flow MOST of the time and
      // starves occasionally — a uniform dip just makes the whole line mottled
      // and grey. Raising (1 - starve) to a power keeps the line solid and lets
      // the rare deep dips become real skips, which is the look in the
      // reference: long clean runs punctuated by a break.
      const dip = Math.pow(1 - vnoise(u), 2.5);
      const fine = vnoise(u * 5.3 + 37.1);
      flow = 1 - ink.skipStrength * dip - ink.chatter * (1 - fine) * 0.35;
      flow = Math.min(Math.max(flow, 0), 1);
      amount *= flow;
    }

    // Lean widens the mark: past ~45 degrees you are drawing with the flank of
    // the lead, not its point. sin() rather than a linear ramp, because the
    // contact ellipse grows with the sine of the lean.
    const tilt = Math.sin((Math.min(s.tiltAngle, 89) * Math.PI) / 180);
    // A starved ball lays a thinner line as well as a lighter one. Thick AND
    // thin together is what reads as organic; vary only the darkness and the
    // line looks like a constant-width stroke with the opacity animated.
    //
    // The range is wide on purpose. It used to be 0.78-1.0, which is barely a
    // tenth of the width — and then the minimum-width floor clamped even that
    // away, so the pen had no width variation at all at the sizes anyone draws
    // at. With true coverage in the deposit pass there is no floor, so this can
    // do what it says.
    // A rolling ball changes width, but the reference is mostly calm hairlines
    // with small, slow variations. Keep that shape variation separate from the
    // ink-flow dips above: tying them together makes every pale patch become an
    // exaggerated pinch instead of a natural hesitation.
    let widthFlow = 0.82 + 0.18 * flow;
    let widthGrain = 1.0;
    if ('skipStrength' in m) {
      const ink = m as InkMedium;
      // Slower than the starve-and-recover cycle, so hatching feels related
      // without every parallel stroke repeating the exact same rhythm.
      widthGrain = 0.92 + 0.16 * vnoise(this.phase * 0.17 + this.dist / Math.max(ink.skipScale * 2.7, 1e-3));
    }
    let radius = m.tipRadius * this.size * (1 + m.tiltWiden * tilt) * widthFlow * widthGrain;

    // [REMOVED — it was doing more harm than the aliasing it hid] There used to
    // be a 0.9-cell minimum contact width here, with the ink spread thinner to
    // compensate. It stopped fine nibs beading, but at the cost of clamping
    // EVERY fine nib to the same width: the smallest ballpoint came out as wide
    // as a large one, and the ball's starve could not thin the line because the
    // line could not get thinner. The deposit pass now measures true coverage by
    // supersampling, so a tip finer than a cell resolves as a faint continuous
    // line rather than a broken one, and the floor is only a numerical guard.
    const MIN_R = 0.12;
    let spread = 1;
    if (radius < MIN_R) { spread = radius / MIN_R; radius = MIN_R; }

    // A PEN METERS INK BY DISTANCE ROLLED; A PENCIL ABRADES BY CONTACT AREA.
    //
    // The deposit pass lays `amount x coverage`, so amount is a surface
    // concentration and the ink landing per unit length comes out proportional
    // to the width. For graphite that is right — lay a pencil over on its flank
    // and it really does shed more, over a wider band. For a pen it is wrong,
    // and visibly so: the finest nib came out as a barely-there ghost, because
    // halving the ball halved the ink as well as the width. A ball meters ink by
    // how far it rolls, and the film thickness is set by the ball-to-paper gap,
    // not by the ball's diameter. So a fine biro draws a NARROWER line, not a
    // paler one, which is the whole reason anyone reaches for a 0.5 over a 1.0.
    //
    // Hence: for ink, `deposition` is ink per unit LENGTH, and the concentration
    // is that divided by the width it is being spread over.
    if ('skipStrength' in m) {
      // The floor caps how concentrated a sub-cell line may get. Lower means a
      // fine nib stays darker as it narrows; too low and it saturates into a
      // hard 1-cell line that cannot get finer. 0.2 is about a fifth of a cell,
      // which is where the 4x4 supersampling runs out of resolution anyway.
      amount = amount / Math.max(2 * radius, 0.2);
    }

    const o = at * SEG_FLOATS;
    const ax = prev ? prev.x : s.x;
    const ay = prev ? prev.y : s.y;
    buf[o + 0] = ax;
    buf[o + 1] = ay;
    buf[o + 2] = s.x;
    buf[o + 3] = s.y;
    buf[o + 4] = radius;
    buf[o + 5] = 0;             // water — a dry medium lays none, by definition
    buf[o + 6] = amount * spread;
    buf[o + 7] = reach;
    return at + 1;
  }
}
