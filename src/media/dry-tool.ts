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

import type { DryMedium } from './types';
import type { BrushInput } from '../brush/types';
import { SEG_FLOATS } from '../engine/fluid';

/**
 * Speed at which velocity break-up is at full strength, in grid cells per
 * resampled step. The resampler caps a step at ~0.9 cells (Card 6), so this is
 * expressed against that ceiling rather than against wall-clock: a "fast"
 * stroke is one that is asking for the maximum step every step.
 */
const REF_SPEED = 0.75;

export class DryTool {
  readonly medium: DryMedium;
  private size: number;
  /** Smoothed speed. A raw per-step delta is far too jittery to drive tooth
   * gating — the line would flicker between solid and broken within one
   * stroke, which reads as noise rather than as speed. */
  private speed = 0;

  constructor(medium: DryMedium, size = 1) {
    this.medium = medium;
    this.size = size;
  }

  setSize(size: number) { this.size = size; }

  begin() { this.speed = 0; }
  end() { this.speed = 0; }

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
    reach = Math.min(Math.max(reach, 0), 1);

    // How much comes off the tip. Speed thins the mark as well as breaking it,
    // but only half as strongly — a fast pencil line is lighter AND patchier,
    // and if you only model the patchiness the fast stroke reads as too dark.
    const amount = m.deposition * press * (1 - 0.5 * m.velocityCoupling * speedNorm);

    // Lean widens the mark: past ~45 degrees you are drawing with the flank of
    // the lead, not its point. sin() rather than a linear ramp, because the
    // contact ellipse grows with the sine of the lean.
    const tilt = Math.sin((Math.min(s.tiltAngle, 89) * Math.PI) / 180);
    let radius = m.tipRadius * this.size * (1 + m.tiltWiden * tilt);

    // A mark narrower than the grid cannot be drawn narrower — only fainter.
    //
    // Below about a cell the line starts to fall between cell centres and beads
    // into dots on any diagonal. The deposit shader's coverage term stops that
    // becoming gaps, but a 0.4-cell tip would still ripple visibly. So widen the
    // contact to the narrowest the grid carries cleanly and take the SAME total
    // ink over that wider band: the pen keeps its ink, the line keeps its
    // continuity, and a finer nib reads as a lighter line rather than a
    // stuttering one. This is a sampling limit of the 512 grid, not physics —
    // at a finer simulation resolution the floor drops with it.
    const MIN_R = 0.9;
    let spread = 1;
    if (radius < MIN_R) { spread = radius / MIN_R; radius = MIN_R; }

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
