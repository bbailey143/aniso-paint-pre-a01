// Stroke resampling and brush driving (Card 6).
//
// [TRAP, confirmed twice] Stylus samples are far sparser than simulation steps.
// Depositing once per frame at the instantaneous position makes strokes bead into
// discrete dots where the hand moves fastest — the bench reproduced this exactly.
// VL: interpolate positions between samples and run the full contact-and-transfer
// sequence at each. B04, from the other direction: never move more than one cell
// per step. Two independent sources, one requirement.
//
// So this walks the path in sub-cell steps, re-solves the tuft at every one, and
// accumulates the footprints into the frame's segment buffer.

import type { StylusSample } from './pointer';
import { MAX_SEGS, SEG_FLOATS } from '../engine/fluid';
import { Brush } from '../brush/brush';
import type { BrushDef, BrushInput } from '../brush/types';
import { DryTool } from '../media/dry-tool';
import type { DryMedium } from '../media/types';

/** Frame footprint capacity. Larger than one GPU chunk — the fluid engine
 * dispatches it in chunks, so a fast flick is not truncated. */
const FRAME_SEGS = MAX_SEGS * 6;

export class StrokeEngine {
  private buf: Float32Array<ArrayBuffer> = new Float32Array(FRAME_SEGS * SEG_FLOATS);
  private count = 0;
  /** Dry media get their own footprint buffer, because the two go to different
   * GPU passes: wet through the fluid band, dry straight to the floor (P7). */
  private dryBuf: Float32Array<ArrayBuffer> = new Float32Array(FRAME_SEGS * SEG_FLOATS);
  private dryCount = 0;
  /** Null while a wet tool is selected. */
  private dry: DryTool | null = null;
  private last: { x: number; y: number; s: StylusSample } | null = null;
  private brush: Brush;
  private size: number;
  /** The mix currently on the brush, and how heavily it was charged. */
  private mix = new Float32Array(8);
  private loading = 0.6;

  /** Cells per solve step — never let the tuft jump more than this. */
  private maxStep = 0.9;

  constructor(def: BrushDef, size: number) {
    this.size = size;
    this.brush = new Brush(def, size);
  }

  get current(): Brush { return this.brush; }

  setBrush(def: BrushDef, size = this.size) {
    this.size = size;
    this.dry = null;                       // back to a wet tool
    this.brush = new Brush(def, size);
    this.brush.reservoir.charge(this.mix, this.loading);
  }

  /** Switch to a dry medium (P7). The brush is left as it was, loaded, so
   * picking the pencil up and putting it down again does not lose the paint. */
  setDryMedium(m: DryMedium, size = this.size) {
    this.size = size;
    this.dry = new DryTool(m, size);
  }

  get isDry(): boolean { return this.dry !== null; }

  /** Dip the brush. Called when the mix or load changes, and at stroke start. */
  charge(mix: Float32Array, loading: number) {
    this.mix.set(mix.subarray(0, 8));
    this.loading = loading;
    this.brush.reservoir.charge(this.mix, loading);
  }

  /**
   * Rinse: pigment out, clean water in. The brush stays loaded — it is now a
   * water brush. Because the mix on the brush is cleared too, the next stroke
   * lays clear water rather than quietly re-charging with the old colour.
   */
  rinse(waterFrac = 1) {
    this.mix.fill(0);
    this.brush.reservoir.rinse(waterFrac);
  }

  begin(gx: number, gy: number, s: StylusSample) {
    if (this.dry) {
      // Nothing to charge — a pencil does not run out mid-line.
      this.dry.begin();
      this.last = { x: gx, y: gy, s };
      return;
    }
    // A fresh dip each stroke: the brush goes back to the palette between
    // strokes, and within a stroke it runs down. That depletion is what makes a
    // long stroke fade rather than run forever.
    this.brush.reservoir.charge(this.mix, this.loading);
    this.brush.begin(this.toInput(gx, gy, s, 0, 0));
    this.last = { x: gx, y: gy, s };
  }

  end() {
    if (this.dry) this.dry.end();
    else this.brush.end();
    this.last = null;
  }

  private toInput(x: number, y: number, s: StylusSample, dx: number, dy: number): BrushInput {
    // A pen reports real pressure; a mouse reports 0.5 while held.
    const pressure = s.pointerType === 'mouse' ? 0.65 : Math.max(s.pressure, 0.01);
    return {
      x, y, pressure,
      tiltAngle: s.tiltAngle,
      tiltAzimuth: s.tiltAzimuth,
      twist: s.twist,
      dx, dy,
    };
  }

  /** Add a stylus sample (already in grid space) and lay down its footprint. */
  add(gx: number, gy: number, s: StylusSample) {
    if (!this.last) { this.begin(gx, gy, s); }
    const from = this.last!;
    const dx = gx - from.x;
    const dy = gy - from.y;
    const dist = Math.hypot(dx, dy);

    // Standing still still deposits — a held brush keeps bleeding into the paper.
    const steps = Math.max(1, Math.ceil(dist / this.maxStep));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + dx * t;
      const y = from.y + dy * t;
      // Interpolate the stylus channels across the bridge too, so pressure and
      // tilt sweep smoothly rather than stepping at each report.
      const interp: StylusSample = {
        ...s,
        pressure: from.s.pressure + (s.pressure - from.s.pressure) * t,
        tiltAngle: from.s.tiltAngle + (s.tiltAngle - from.s.tiltAngle) * t,
        tiltAzimuth: s.tiltAzimuth,
        twist: s.twist,
      };
      const input = this.toInput(x, y, interp, dx / steps, dy / steps);
      if (this.dry) {
        // One contact per resampled step, spanning from the previous one. A dry
        // tip has no bristles to smear across the gap, so the segment IS the
        // mark — emit a point and a fast stroke becomes a dotted line.
        const tPrev = (i - 1) / steps;
        const prev = { x: from.x + dx * tPrev, y: from.y + dy * tPrev };
        if (this.dryCount < FRAME_SEGS) {
          this.dryCount = this.dry.emit(this.dryBuf, this.dryCount, FRAME_SEGS, prev, input);
        }
        continue;
      }
      this.brush.solve(input);
      if (this.count < FRAME_SEGS) {
        this.count = this.brush.emitFootprint(this.buf, this.count, FRAME_SEGS);
      }
    }
    this.last = { x: gx, y: gy, s };
  }

  /** Hand the frame's footprint to the engine and reset for the next frame. */
  drain(): { data: Float32Array<ArrayBuffer>; count: number } {
    const count = this.count;
    this.count = 0;
    return { data: this.buf, count };
  }

  /** Same, for the dry-media channel (P7). `edge` is the rim falloff the
   * active medium wants — soft for graphite, crisp for a ballpoint. */
  drainDry(): { data: Float32Array<ArrayBuffer>; count: number; edge: number } {
    const count = this.dryCount;
    this.dryCount = 0;
    return { data: this.dryBuf, count, edge: this.dry ? this.dry.edgeSharpness : 1 };
  }
}
