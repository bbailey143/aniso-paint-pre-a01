// The brush — spines, the deformation lattice, and the footprint (Card 6).
//
// Dynamics at spine resolution; footprint at bristle resolution. The spines are
// solved (spine.ts); the bristles are pure geometry riding the deformation, never
// simulated. But the footprint is produced from the ACTUAL bristle geometry, so
// the mark carries per-hair structure that nothing per-hair computed. That is
// how you get streaks without paying for them.
//
// The footprint does not draw anything. It deposits water and pigment into the
// wet film, and the fluid engine makes the mark. Wet media are never stamped.

import { Spine } from './spine';
import { Reservoir } from './reservoir';
import type { BrushDef, BrushInput } from './types';
import { SEG_FLOATS } from '../engine/fluid';

/** Height of the contact slab in cells — the thin band, just below the paper
 * surface to just above it, that the footprint is caught in. Contact depth is a
 * tunable, not a binary; this is also where drybrush comes from. */
const SLAB = 0.55;

export class Brush {
  readonly def: BrushDef;
  readonly reservoir: Reservoir;
  private spines: Spine[];
  private scale: number;
  /** Scratch for one cell's pigment withdrawal. */
  private draw = new Float32Array(8);
  /** Cells travelled in the current solve step — what the reservoir charges by. */
  private travel = 0;
  private lastX = 0;
  private lastY = 0;
  private started = false;

  constructor(def: BrushDef, size: number) {
    this.def = def;
    this.scale = size;
    const count = def.kind === 'flat' ? 2 : 1;
    this.spines = Array.from({ length: count }, () => new Spine(def, size));
    this.reservoir = new Reservoir(def.reservoir, def.bristles, def.segments + 1);
  }

  get tuftLength(): number { return this.def.length * this.scale; }

  begin(input: BrushInput) {
    this.lastX = input.x;
    this.lastY = input.y;
    this.started = true;
  }

  end() {
    this.started = false;
    // Off the paper the tuft recovers its manufactured shape. VL's pass/fail
    // test #1: the tuft must snap back instantly when lifted.
    for (const s of this.spines) s.recover(0.5);
  }

  /** Solve the tuft for one resampled stylus position. */
  solve(input: BrushInput) {
    if (!this.started) this.begin(input);
    this.travel = Math.hypot(input.dx, input.dy);

    const tilt = (input.tiltAngle * Math.PI) / 180;
    const az = (input.tiltAzimuth * Math.PI) / 180;

    // Pen axis, pointing from the tip up toward the hand.
    const ax = Math.sin(tilt) * Math.cos(az);
    const ay = Math.sin(tilt) * Math.sin(az);
    const azc = Math.max(0.15, Math.cos(tilt));

    // Contact depth: how far the ferrule is driven past first touch. Pressure
    // drives it; the hover bias means a barely-touching pen leaves nothing.
    // The tuft hovers slightly, so a pen that is merely near the paper leaves
    // nothing; past that the tip engages and the mark grows with pressure. Kept
    // small (~5% of the tuft) so a light touch still draws — a high bias reads
    // as a dead zone under the hand.
    const L = this.tuftLength;
    const hover = 0.05 * L;
    const depth = -hover + (0.55 * L) * input.pressure;

    // Blade axis for a flat brush: how the tuft is turned in the hand. Barrel
    // roll rotates it, which is a real physical consequence of a real input.
    const blade = az + (input.twist * Math.PI) / 180;
    const bx = Math.cos(blade + Math.PI / 2);
    const by = Math.sin(blade + Math.PI / 2);
    const halfWidth = 0.5 * this.def.widthRatio * L;

    // Preferred drag direction — the anisotropy axis. The pen's lean is the
    // natural pull direction; upright pens fall back to the blade axis.
    let px = Math.cos(az), py = Math.sin(az);
    if (input.tiltAngle < 5) { px = bx; py = by; }

    const drag: [number, number] = [input.x - this.lastX, input.y - this.lastY];

    for (let i = 0; i < this.spines.length; i++) {
      // Two spines sit either side of the blade centre; each drives one side of
      // the lattice, and that is what lets a flat brush spread and scratch.
      const off = this.spines.length === 2 ? (i === 0 ? -halfWidth : halfWidth) : 0;
      const cx = input.x + bx * off;
      const cy = input.y + by * off;
      // Ferrule sits up the pen axis from the contact point.
      const fx = cx + ax * (L - depth);
      const fy = cy + ay * (L - depth);
      const fz = azc * (L - depth);
      const dir: [number, number, number] = [-ax, -ay, -azc];
      this.spines[i].solve(fx, fy, fz, dir, drag, [px, py]);
    }

    this.lastX = input.x;
    this.lastY = input.y;

    // Paint wicks down the tuft toward whatever is being used.
    this.reservoir.wick(0.5);
  }

  /**
   * Walk the bristle geometry and emit everything caught in the contact slab as
   * footprint segments, withdrawing the paint from the reservoir as it goes.
   *
   * Returns the number of segments written.
   */
  emitFootprint(buf: Float32Array, at: number, maxSegs: number): number {
    const def = this.def;
    const B = def.bristles;
    const J = def.segments + 1;
    let count = at;

    // Pressing the tuft spreads it — the lattice stretching. Splay is geometric,
    // not emergent (the documented ceiling); a bristle fans because the lattice
    // stretches, not because it found its own way round a paper ridge.
    const contactCount = this.spines.reduce(
      (n, s) => n + s.joints.filter((j) => j.contact).length, 0);
    const splay = 1 + def.splayFromPressure * (contactCount / (this.spines.length * J));

    // A bristle is thin. Keep it at least half a cell so it registers on the grid.
    const hairR = Math.max(0.45, (def.widthRatio * this.tuftLength) / B * 0.5);

    for (let b = 0; b < B && count < maxSegs; b++) {
      // Cross-section parameter for this bristle.
      const u = B === 1 ? 0.5 : b / (B - 1);

      let prevX = 0, prevY = 0, prevIn = false;
      for (let s = 0; s < J && count < maxSegs; s++) {
        const p = this.bristlePoint(b, u, s, splay);
        const inSlab = p.z <= SLAB;

        // A single joint in the slab is the very tip touching down. It still
        // marks — as a point, which dragged becomes a hairline. Without this an
        // isolated contact emitted nothing and the lightest touch drew nothing
        // at all, which kills "a fine stroke from the tip of a large round
        // brush" (VL Fig. 7). Emit a degenerate segment for it.
        if (inSlab && !prevIn) {
          prevX = p.x; prevY = p.y;
        }

        if (inSlab) {
          // Contact strength: firmest where the hair is pressed hardest into
          // the paper. This is what makes a light touch skip the valleys.
          const press = Math.max(0, Math.min(1, 1 - p.z / SLAB));
          const cell = b * J + s;
          const w = this.reservoir.withdraw(cell, press, this.draw, this.travel);
          let pig = 0;
          for (let k = 0; k < 8; k++) pig += this.draw[k];

          if (w > 0 || pig > 0) {
            const o = count * SEG_FLOATS;
            buf[o + 0] = prevX;
            buf[o + 1] = prevY;
            buf[o + 2] = p.x;
            buf[o + 3] = p.y;
            buf[o + 4] = hairR;
            buf[o + 5] = w;
            buf[o + 6] = pig;
            // How deep this hair reaches into the paper's tooth. A hair barely
            // in the slab only skims the peaks (drybrush); one driven well below
            // the surface reaches the valleys and lays a solid mark.
            buf[o + 7] = press;
            count++;
          }
        }
        prevX = p.x; prevY = p.y; prevIn = inSlab;
      }
    }
    return count;
  }

  /**
   * The deformation lattice. A bristle's position at spine station `s` is the
   * spine there, plus an offset in the local frame, scaled by the tuft's radius
   * profile. When the spines move apart the offsets stretch with them, so the
   * mesh inherits whatever the spines do.
   */
  private bristlePoint(b: number, u: number, s: number, splay: number) {
    const J = this.def.segments;
    const t = s / J;                       // 0 at ferrule, 1 at tip
    // Radius profile: full at the belly, tapering to a point at the tip. This
    // is what lets a big round brush draw a hairline with its very tip.
    const profile = Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)) * (1 - t * 0.75);
    const r = 0.5 * this.def.widthRatio * this.tuftLength * profile * splay;

    if (this.spines.length === 2) {
      // Flat: interpolate across the blade between the two spines, then add a
      // little thickness so the blade is not infinitely thin.
      const a = this.spines[0].joints[s];
      const c = this.spines[1].joints[s];
      const thick = ((b % 2) - 0.5) * r * 0.35;
      // Perpendicular to the line joining the spines, in-plane.
      let nx = c.y - a.y, ny = -(c.x - a.x);
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      return {
        x: a.x + (c.x - a.x) * u + nx * thick,
        y: a.y + (c.y - a.y) * u + ny * thick,
        z: a.z + (c.z - a.z) * u,
      };
    }

    // Round: bristles ringed about the single spine.
    const j = this.spines[0].joints[s];
    const ang = u * Math.PI * 2;
    // Local frame from the spine's own direction, so the ring stays
    // perpendicular to the tuft rather than to the page.
    const prev = this.spines[0].joints[Math.max(0, s - 1)];
    let dx = j.x - prev.x, dy = j.y - prev.y, dz = j.z - prev.z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    // Any vector perpendicular to the spine direction.
    let ex = -dy, ey = dx, ez = 0;
    const el = Math.hypot(ex, ey, ez);
    if (el < 1e-4) { ex = 1; ey = 0; ez = 0; } else { ex /= el; ey /= el; }
    // Second perpendicular = d x e.
    const fx = dy * ez - dz * ey;
    const fy = dz * ex - dx * ez;
    const fz = dx * ey - dy * ex;
    const ca = Math.cos(ang) * r, sa = Math.sin(ang) * r;
    return {
      x: j.x + ex * ca + fx * sa,
      y: j.y + ey * ca + fy * sa,
      z: j.z + ez * ca + fz * sa,
    };
  }

  /** Debug/UI: how much of the tuft is touching the paper right now. */
  contactJoints(): number {
    return this.spines.reduce((n, s) => n + s.joints.filter((j) => j.contact).length, 0);
  }
}
