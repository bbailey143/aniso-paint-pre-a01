// The kinematic spine — the whole dynamic state of a brush (Card 6).
//
// VL's founding decision: solve one or two spines; hundreds of bristles are
// geometry riding a deformation lattice, never simulated. Four segments times
// two spines is ~16 numbers, so this runs in plain TypeScript on the CPU.
//
// Solved for STATIC EQUILIBRIUM, not time-stepped. VL rejects integration for
// bristles: a stiff, heavily damped system integrated with semi-implicit springs
// goes inaccurate or unstable. Equilibrium also gives the "snappy" behaviour of a
// real bristle regaining its shape the instant it lifts — pass/fail test #1.

import type { BrushDef } from './types';

export interface Joint {
  x: number; y: number; z: number;
  /** True while this joint is pinned to the paper (see the non-penetration trap). */
  contact: boolean;
}

const ITERATIONS = 12;   // relaxation sweeps to equilibrium

export class Spine {
  readonly def: BrushDef;
  /** Joint 0 is the ferrule; the last joint is the tip. */
  joints: Joint[] = [];
  /** Segment rest lengths, shortening toward the tip. */
  lengths: number[] = [];
  /** Angular spring constants, softening toward the tip. */
  stiffness: number[] = [];
  /** Per-segment rest bend, mutated by plasticity as the tuft remembers splay. */
  restBend: number[] = [];


  constructor(def: BrushDef, scale: number) {
    this.def = def;


    const n = def.segments;
    // Taper: decreasing lengths toward the tip, normalised so the total is
    // exactly def.length (so `size` means what it says).
    const raw: number[] = [];
    for (let i = 0; i < n; i++) {
      raw.push(1 - def.taper * (i / Math.max(1, n - 1)));
    }
    const sum = raw.reduce((a, b) => a + b, 0);
    const total = def.length * scale;
    this.lengths = raw.map((r) => (r / sum) * total);

    // Stiff at the ferrule where bristles are packed, flexible at the tip.
    let k = def.stiffness;
    for (let i = 0; i < n; i++) {
      this.stiffness.push(k);
      k *= def.stiffnessTaper;
    }

    this.restBend = def.restAngles
      ? def.restAngles.slice(0, n)
      : new Array(n).fill(0);
    while (this.restBend.length < n) this.restBend.push(0);

    for (let i = 0; i <= n; i++) {
      this.joints.push({ x: 0, y: 0, z: 0, contact: false });
    }
  }

  get tip(): Joint { return this.joints[this.joints.length - 1]; }
  get totalLength(): number { return this.lengths.reduce((a, b) => a + b, 0); }

  /**
   * Lay the tuft out straight from the ferrule along `dir` (unit, pointing from
   * ferrule toward the tip). This is the rest shape the solver starts from each
   * step — which is exactly what makes the brush snap back when lifted.
   */
  private resetTo(fx: number, fy: number, fz: number, dir: [number, number, number]) {
    const j = this.joints;
    j[0].x = fx; j[0].y = fy; j[0].z = fz; j[0].contact = false;
    for (let i = 0; i < this.lengths.length; i++) {
      const L = this.lengths[i];
      j[i + 1].x = j[i].x + dir[0] * L;
      j[i + 1].y = j[i].y + dir[1] * L;
      j[i + 1].z = j[i].z + dir[2] * L;
      j[i + 1].contact = false;
    }
  }

  /**
   * Solve the chain to equilibrium.
   *
   * @param fx,fy,fz  ferrule position (z = height above paper, in cells)
   * @param dir       unit direction ferrule -> tip
   * @param drag      xy displacement of the ferrule since the last solve
   * @param prefDir   preferred drag direction (unit) — the anisotropy axis
   */
  solve(
    fx: number, fy: number, fz: number,
    dir: [number, number, number],
    drag: [number, number],
    prefDir: [number, number],
  ) {
    // Remember where the contacting joints were, so friction can hold them back.
    const prev = this.joints.map((p) => ({ x: p.x, y: p.y }));
    const hadContact = this.joints.map((p) => p.contact);

    this.resetTo(fx, fy, fz, dir);

    const dragLen = Math.hypot(drag[0], drag[1]);
    let dhx = 0, dhy = 0;
    if (dragLen > 1e-6) { dhx = drag[0] / dragLen; dhy = drag[1] / dragLen; }

    // Anisotropic friction (VL). The brush is essentially always pulled, almost
    // never pushed. eta cancels friction along the preferred direction; the lobe
    // is a smooth power of a clamped dot product, which keeps it C1-continuous —
    // a hard directional if/else makes any solver chatter.
    const { mu, cEta, k } = this.def.friction;
    const align = Math.max(0, prefDir[0] * dhx + prefDir[1] * dhy);
    const eta = cEta * Math.pow(align, k);
    const frictionHold = Math.min(0.98, mu * (1 - eta));

    for (let iter = 0; iter < ITERATIONS; iter++) {
      this.applyBending(dir);
      this.applyLengths(fx, fy, fz);
      this.applyFloor(prev, hadContact, frictionHold, dragLen);
    }

    // Plasticity: the wet tuft nudges its rest shape toward how it is actually
    // bent, so it remembers splay through a stroke and recovers slowly.
    if (this.def.plasticity > 0) this.relaxRestShape();
  }

  /** Angular springs pulling each joint toward its rest bend. */
  private applyBending(dir: [number, number, number]) {
    const j = this.joints;
    for (let i = 1; i < j.length - 1; i++) {
      const inx = j[i].x - j[i - 1].x;
      const iny = j[i].y - j[i - 1].y;
      const inz = j[i].z - j[i - 1].z;
      const inLen = Math.hypot(inx, iny, inz) || 1;

      // Target: continue in the incoming direction (rest bend 0 = straight,
      // i.e. the 180-degree rest angle VL assumes for a fresh brush).
      const L = this.lengths[i];
      let tx = j[i].x + (inx / inLen) * L;
      let ty = j[i].y + (iny / inLen) * L;
      let tz = j[i].z + (inz / inLen) * L;

      // A non-zero rest bend tips the target toward the tuft's own curl —
      // this is what makes a worn or fan brush a data row rather than code.
      const bend = this.restBend[i];
      if (bend !== 0) {
        tz += Math.sin(bend) * L * dir[2];
        tx += Math.sin(bend) * L * dir[0];
        ty += Math.sin(bend) * L * dir[1];
      }

      // Stiffness is a blend weight toward the rest target. Stiff at the
      // ferrule, soft at the tip.
      const w = Math.min(1, this.stiffness[i]);
      j[i + 1].x += (tx - j[i + 1].x) * w;
      j[i + 1].y += (ty - j[i + 1].y) * w;
      j[i + 1].z += (tz - j[i + 1].z) * w;
    }
  }

  /** Hard distance constraints, walked outward from the pinned ferrule. */
  private applyLengths(fx: number, fy: number, fz: number) {
    const j = this.joints;
    j[0].x = fx; j[0].y = fy; j[0].z = fz;
    for (let i = 0; i < this.lengths.length; i++) {
      const a = j[i], b = j[i + 1];
      let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      let d = Math.hypot(dx, dy, dz);
      if (d < 1e-8) { dx = 0; dy = 0; dz = -1; d = 1; }
      const s = this.lengths[i] / d;
      b.x = a.x + dx * s;
      b.y = a.y + dy * s;
      b.z = a.z + dz * s;
    }
  }

  /**
   * Non-penetration and friction.
   *
   * [TRAP — VL] With a pure inequality constraint (z >= 0) the optimizer can
   * decide that lifting a joint costs less energy than paying the friction to
   * drag it, and the bristle hops across the canvas. The fix is to replace the
   * inequality with an EQUALITY for any joint currently violating it: pin it to
   * the surface and make it pay.
   */
  private applyFloor(
    prev: { x: number; y: number }[],
    hadContact: boolean[],
    frictionHold: number,
    dragLen: number,
  ) {
    const j = this.joints;
    for (let i = 1; i < j.length; i++) {
      if (j[i].z <= 0) {
        j[i].z = 0;              // equality pin, not a clamp-and-release
        j[i].contact = true;

        // A pinned joint resists sliding. Pull it back toward where it was,
        // by the anisotropic friction fraction — so it trails behind the
        // ferrule instead of tracking it rigidly.
        if (hadContact[i] && dragLen > 1e-6) {
          j[i].x += (prev[i].x - j[i].x) * frictionHold;
          j[i].y += (prev[i].y - j[i].y) * frictionHold;
        }
      } else {
        j[i].contact = false;
      }
    }
  }

  /** Chu-style plasticity: the rest shape drifts toward the current bend. */
  private relaxRestShape() {
    const j = this.joints;
    const rate = this.def.plasticity;
    for (let i = 1; i < j.length - 1; i++) {
      const ax = j[i].x - j[i - 1].x, ay = j[i].y - j[i - 1].y, az = j[i].z - j[i - 1].z;
      const bx = j[i + 1].x - j[i].x, by = j[i + 1].y - j[i].y, bz = j[i + 1].z - j[i].z;
      const la = Math.hypot(ax, ay, az) || 1;
      const lb = Math.hypot(bx, by, bz) || 1;
      const cos = (ax * bx + ay * by + az * bz) / (la * lb);
      const bend = Math.acos(Math.max(-1, Math.min(1, cos)));
      this.restBend[i] += (bend - this.restBend[i]) * rate;
    }
  }

  /** Recovery toward the manufactured shape when the brush is off the paper. */
  recover(rate: number) {
    for (let i = 0; i < this.restBend.length; i++) {
      this.restBend[i] += (0 - this.restBend[i]) * rate;
    }
  }
}
