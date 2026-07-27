// Stroke resampling (Card 6 TRAP, confirmed twice).
//
// Stylus samples are far sparser than simulation steps. Depositing once per
// frame at the instantaneous position makes strokes bead into discrete dots
// where the hand moves fastest — the bench reproduced this exactly. VL says
// interpolate positions between samples and run the full contact-and-transfer
// sequence at each; B04 says never move more than one cell per step. Two
// independent sources, one requirement.
//
// This accumulates pointer samples into segments in SIM GRID space, spaced at
// most `maxStep` cells apart, and hands them to the deposit pass.

import type { StylusSample } from './pointer';
import { MAX_SEGS, SEG_FLOATS } from '../engine/fluid';

export interface StrokeStyle {
  /** Contact radius in grid cells at full pressure. */
  radius: number;
  /** Water laid at the centreline per unit path length, at full pressure. */
  water: number;
  /** Pigment laid at the centreline per unit path length. */
  pigment: number;
  /** How strongly stroke speed thins the deposit (0 = no effect). */
  velocityThinning: number;
}

export const DEFAULT_STROKE: StrokeStyle = {
  radius: 9,
  water: 0.10,
  pigment: 0.055,
  velocityThinning: 0.55,
};

export class StrokeBuilder {
  private buf: Float32Array<ArrayBuffer> = new Float32Array(MAX_SEGS * SEG_FLOATS);
  private count = 0;
  private last: { x: number; y: number; pressure: number } | null = null;
  style: StrokeStyle = { ...DEFAULT_STROKE };

  /** Cells per simulation step — a segment is never longer than this. */
  private maxStep = 1.0;

  begin() {
    this.last = null;
  }

  end() {
    this.last = null;
  }

  /**
   * Add a stylus sample, already converted to grid space. Emits as many
   * <= maxStep segments as needed to bridge from the previous sample.
   */
  add(gx: number, gy: number, s: StylusSample) {
    // Pen pressure is real; a mouse reports 0.5 while held, which is fine.
    const pressure = s.pointerType === 'mouse' ? 0.6 : Math.max(s.pressure, 0.02);

    // Fast strokes lay less media — the substrate/velocity interaction that
    // makes rapid marks break up and slow ones run smooth and connected.
    const speedFactor = 1 / (1 + this.style.velocityThinning * s.velocity);

    // Tilt flattens the contact: a laid-over pen covers more, presses lighter.
    const tiltSpread = 1 + (s.tiltAngle / 90) * 0.8;

    if (!this.last) {
      this.emit(gx, gy, gx, gy, pressure, speedFactor, tiltSpread);
      this.last = { x: gx, y: gy, pressure };
      return;
    }

    const dx = gx - this.last.x;
    const dy = gy - this.last.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) return;

    const steps = Math.max(1, Math.ceil(dist / this.maxStep));
    let px = this.last.x;
    let py = this.last.y;
    const p0 = this.last.pressure;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const nx = this.last.x + dx * t;
      const ny = this.last.y + dy * t;
      const pr = p0 + (pressure - p0) * t;
      this.emit(px, py, nx, ny, pr, speedFactor, tiltSpread);
      px = nx;
      py = ny;
    }
    this.last = { x: gx, y: gy, pressure };
  }

  private emit(ax: number, ay: number, bx: number, by: number,
               pressure: number, speedFactor: number, tiltSpread: number) {
    if (this.count >= MAX_SEGS) return;
    const o = this.count * SEG_FLOATS;
    const st = this.style;
    // Pressure drives both footprint and load, as it does with a real brush.
    const radius = st.radius * (0.35 + 0.65 * pressure) * tiltSpread;
    const load = pressure * speedFactor;
    this.buf[o + 0] = ax;
    this.buf[o + 1] = ay;
    this.buf[o + 2] = bx;
    this.buf[o + 3] = by;
    this.buf[o + 4] = radius;
    this.buf[o + 5] = st.water * load;
    this.buf[o + 6] = st.pigment * load;
    this.buf[o + 7] = 0;
    this.count++;
  }

  /** Hand the frame's segments to the engine and reset for the next frame. */
  drain(): { data: Float32Array<ArrayBuffer>; count: number } {
    const count = this.count;
    this.count = 0;
    return { data: this.buf, count };
  }
}
