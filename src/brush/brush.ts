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
import {
  DEFAULT_TUFT, drawTuft, bundleRadius, hairPoint, tuftHalfWidth,
  type Hair, type HairPoint, type TuftDef,
} from './tuft';
import { SEG_FLOATS } from '../engine/fluid';

/** Height of the contact slab in cells — the thin band, just below the paper
 * surface to just above it, that the footprint is caught in. Contact depth is a
 * tunable, not a binary; this is also where drybrush comes from. */
const SLAB = 0.55;

/**
 * How far the ferrule is driven past first touch, as a fraction of the tuft, at
 * full pressure. Overridable per brush row (`BrushDef.drive`).
 *
 * ~~DRIVE = 1.0~~ **CHANGED 2026-08-24 from 1.0 to 0.35.**
 *
 * At 1.0 a 24-cell tuft had its ferrule shoved 22.8 cells past the paper at full
 * pressure. Five segments cannot absorb that by bending; they fold up, and
 * folding is a problem with many nearly-equal answers and nothing to choose
 * between them. What that looked like:
 *
 * [MEASURED, docs/14 E9, flat sable, `node tools/brush-bench.mjs drive`]
 *
 *   drive   kinks in the chain, across pressure 0.1 -> 1.0   blade span at full pressure
 *   1.00    0, 2, 0, 4, 8                                    50.2 cells of a 22.8 blade
 *   0.50    0, 0, 0, 2, 0                                    29.0
 *   0.35    0, 0, 0, 0, 0                                    27.2
 *   0.25    0, 0, 0, 3, 0                                    25.3
 *
 * A kink is the chain turning back on itself. At 1.0 the "blade" ends up
 * spanning more than twice its own width, which is not splay, it is the tuft
 * coming apart. 0.35 is the deepest drive with no kink anywhere on the dial.
 *
 * What it costs: footprint segments at full pressure fall from 147 to 102. What
 * it keeps: contact still triples from 34 to 102 as the hand presses, so the
 * ramp still ramps — and the 147 was being laid by a tuft in a random fold.
 *
 * The old value was not arbitrary. It was raised from 0.55 to 1.0 to answer
 * "fix the depth curve so more of the tuft touches", and it did. The mistake
 * was buying contact with depth: contact should come from the tuft LYING
 * ALONG the paper, which is what `Spine.resetTo` now starts it doing.
 *
 * The bottom of the ramp is still a hairline and contact still grows with
 * pressure — both checked with `node tools/brush-bench.mjs ramp`.
 */
const DRIVE = 0.35;

/** Hover, as a fraction of the drive range. See where it is used. */
const HOVER = 0.05;

/**
 * How strongly each spine's lay-over direction leans outward across the blade,
 * against the direction of travel.
 *
 * At 0 every spine folds the same way and a pressed blade stays a flat sheet.
 * Above about 1 the outward lean beats the stroke and the tuft opens sideways
 * even while being dragged, which reads as a brush being scrubbed. Kept modest
 * so travel wins and splay is what is left over when it does not.
 */
const SPLAY_OUT = 0.45;

export class Brush {
  readonly def: BrushDef;
  readonly reservoir: Reservoir;
  /** Previous position of every hair point, for the track it leaves. */
  private trail: Float32Array;
  /** False until a stroke has one step behind it. */
  private trailValid = false;
  private spines: Spine[];
  /** The hairs, drawn once. A brush does not rearrange its own hairs. */
  private hairs: Hair[];
  private tuftDef: TuftDef;
  /** How thick one drawn hair is, in cells — set by the packing, not the count. */
  private hairR: number;
  /** Scratch for one hair position, so the footprint loop allocates nothing. */
  private hp: HairPoint = { x: 0, y: 0, z: 0 };
  /** Where each spine sits across the blade, -1..+1. See the constructor. */
  private spineU: number[];
  /** Each spine's own previous contact point, xy. */
  private lastC: Float32Array;
  /** False until every spine has one step of history behind it. */
  private lastCValid = false;
  private scale: number;
  /** Scratch for one cell's pigment withdrawal. */
  private draw = new Float32Array(8);
  /** Cells travelled in the current solve step — what the reservoir charges by. */
  private travel = 0;
  private started = false;

  constructor(def: BrushDef, size: number) {
    this.def = def;
    this.scale = size;
    const count = Math.max(1, Math.round(def.spines ?? (def.kind === 'flat' ? 2 : 1)));
    this.spines = Array.from({ length: count }, () => new Spine(def, size));
    /* Where across the blade each spine sits, as a fraction of half-width from
       -1 at one edge to +1 at the other. One spine sits on the axis. */
    this.spineU = count === 1
      ? [0]
      : Array.from({ length: count }, (_, i) => (i / (count - 1)) * 2 - 1);
    /* Each spine's own previous contact point. The two edges of a blade only
       travel the same distance when the brush is going dead straight; on a bend
       or a barrel roll they do not, and that difference is the entire reason a
       flat brush has a leading corner. */
    this.lastC = new Float32Array(count * 2);

    /* The tuft, drawn once. Everything about which hair is where, how long it
       is and how stiff it is comes out of this and then never changes for the
       life of the brush. */
    this.tuftDef = def.tuft ?? DEFAULT_TUFT;
    this.hairs = drawTuft(this.tuftDef, def.bristles);
    this.hairR = Math.max(
      0.45, bundleRadius(this.tuftDef, def.bristles, tuftHalfWidth(def, def.length * size)));

    this.reservoir = new Reservoir(def.reservoir, def.bristles, def.segments + 1);
    /* Where every hair point was on the previous solve step. A hair's mark is
       the ground it has covered, and that cannot be known from one instant. */
    this.trail = new Float32Array(def.bristles * (def.segments + 1) * 2);
  }

  get tuftLength(): number { return this.def.length * this.scale; }

  /* The pose is no longer needed here: each spine now records its own contact
     point on its own first solve, so there is nothing for begin to seed. Kept in
     the signature because it is the natural place to hang per-stroke state and
     every caller already passes it. */
  begin(_input?: BrushInput) {
    this.started = true;
    // A new stroke has no history. The first step lays a touch-down, not a
    // smear from wherever the last stroke left the hairs.
    this.trailValid = false;
    this.lastCValid = false;
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

    // Pen axis, unit, pointing from the tip up toward the hand. The floor on z
    // keeps a nearly-flat pen from giving a degenerate frame; normalising after
    // it keeps the axis a unit vector, which the blade frame below needs. For
    // any tilt under 81 degrees the floor does not bite and this is exactly the
    // vector it always was.
    let ax = Math.sin(tilt) * Math.cos(az);
    let ay = Math.sin(tilt) * Math.sin(az);
    let azc = Math.max(0.15, Math.cos(tilt));
    const alen = Math.hypot(ax, ay, azc) || 1;
    ax /= alen; ay /= alen; azc /= alen;

    // Contact depth: how far the ferrule is driven past first touch. Pressure
    // drives it; the hover bias means a barely-touching pen leaves nothing.
    // The tuft hovers slightly, so a pen that is merely near the paper leaves
    // nothing; past that the tip engages and the mark grows with pressure. Kept
    // small (~5% of the tuft) so a light touch still draws — a high bias reads
    // as a dead zone under the hand.
    const L = this.tuftLength;
    const drive = this.def.drive ?? DRIVE;
    /* The hover is a slice off the bottom of the PRESSURE range, not a fixed
       distance. Written as a fraction of the tuft it moved with the drive: cut
       the drive and the dead zone under the hand grew in proportion, so a
       lighter ramp would have arrived with a wider patch of pressure that draws
       nothing. This way the dead zone stays at 5% of the dial whatever the
       drive is. */
    const hover = HOVER * drive * L;
    const depth = -hover + (drive * L) * input.pressure;

    /* THE BLADE AXIS, IN THREE DIMENSIONS.
     *
     * A blade sits ACROSS the pen, so its direction has to be perpendicular to
     * the pen axis in space, not merely in plan. It used to be built flat:
     * `(cos, sin)` of the azimuth plus the roll, with no z at all. That put
     * both ends of the ferrule at the same height however the pen was leaning,
     * which is a brush held permanently upright — the exact thing the marks
     * looked like.
     *
     * [MEASURED, docs/14 E5] Lean a flat brush 50 degrees with the blade lying
     * along the lean and the two ferrule ends differed in height by 0.000000
     * cells. They should differ by the blade's width times the sine of the
     * lean, which for a flat sable is 17.5 cells — one corner digging in while
     * the other is well clear of the paper. That is how a flat brush draws a
     * thin line with its corner, and it was not possible.
     *
     * `u` is square to the lean and horizontal; `v` is square to both, and tips
     * out of the horizontal by exactly the lean. Rolling the barrel turns the
     * blade from one toward the other, so an upright pen behaves precisely as
     * it did (v never gets used when the tilt is zero) and a leaning one gains
     * a low edge and a high edge.
     */
    const roll = (input.twist * Math.PI) / 180;
    const ux = -Math.sin(az), uy = Math.cos(az);
    const vx = -azc * Math.cos(az), vy = -azc * Math.sin(az), vz = Math.sin(tilt);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const bx = ux * cr + vx * sr;
    const by = uy * cr + vy * sr;
    const bz = vz * sr;
    const halfWidth = 0.5 * this.def.widthRatio * L;
    /* Leaning the brush must not also press it deeper. Without this, tipping a
       blade onto its corner drives the whole ferrule down by half a blade and
       reads as extra pressure the hand never applied — a dead knob's opposite,
       a knob that secretly drives something else. */
    const lift = halfWidth * Math.abs(bz);

    // Preferred drag direction — the anisotropy axis. The pen's lean is the
    // natural pull direction; upright pens fall back to the blade axis.
    let px = Math.cos(az), py = Math.sin(az);
    if (input.tiltAngle < 5) { px = bx; py = by; }

    const dir: [number, number, number] = [-ax, -ay, -azc];

    for (let i = 0; i < this.spines.length; i++) {
      // Spines are spread evenly across the blade; one spine sits on the axis.
      const off = this.spineU[i] * halfWidth;
      const cx = input.x + bx * off;
      const cy = input.y + by * off;
      /* This spine's own drag, from its own previous contact point. Pulled dead
         straight every spine moves alike and the blade stays symmetric, which is
         correct. Turn the hand or roll the barrel and the outer edge covers more
         ground than the inner one, so it lags further against friction — a
         leading corner, out of the friction that is already there rather than
         out of a new term. */
      const px0 = this.lastC[i * 2], py0 = this.lastC[i * 2 + 1];
      const drag: [number, number] = this.lastCValid ? [cx - px0, cy - py0] : [0, 0];
      this.lastC[i * 2] = cx;
      this.lastC[i * 2 + 1] = cy;
      // Ferrule sits up the pen axis from the contact point. `bz * off` is what
      // makes one edge of a leaning blade lower than the other.
      const fx = cx + ax * (L - depth);
      const fy = cy + ay * (L - depth);
      const fz = azc * (L - depth) + lift + bz * off;

      /* Which way this spine lies over once it meets the paper.
       *
       * Dragged, it trails the stroke — that is what a brush does, and it is
       * why the marks run along a stroke rather than across it. Standing still,
       * it opens OUTWARD across the blade, each spine away from the axis, which
       * is a tuft splaying under the hand. The outward part is what
       * `splayFromPressure` has been faking with a multiplier on the section:
       * this is the same thing arrived at honestly, and the two will want
       * reconciling once the fill lands.
       */
      let lx = drag[0], ly = drag[1];
      const dl = Math.hypot(lx, ly);
      if (dl > 1e-6) { lx /= dl; ly /= dl; } else { lx = px; ly = py; }
      const uSign = this.spineU[i];
      lx += bx * uSign * SPLAY_OUT;
      ly += by * uSign * SPLAY_OUT;
      const ll = Math.hypot(lx, ly) || 1;

      this.spines[i].solve(fx, fy, fz, dir, drag, [px, py], [lx / ll, ly / ll]);
    }
    this.lastCValid = true;

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
    // First step of a stroke: there is no previous position, so every hair
    // emits a point where it landed. That is a true touch-down, and it is what
    // starts a stroke with a dab rather than a smear from nowhere.
    const firstStep = !this.trailValid;
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

    /* A drawn hair stands for a bundle, so its thickness follows the packing.
       Kept at least half a cell so it still registers on the grid. */
    const hairR = this.hairR;
    const halfWidth = tuftHalfWidth(def, this.tuftLength);

    for (let b = 0; b < B && count < maxSegs; b++) {
      const hair = this.hairs[b];

      for (let s = 0; s < J && count < maxSegs; s++) {
        const p = this.hp;
        hairPoint(this.spines, hair, this.tuftDef, halfWidth, s, J - 1, splay, p);
        const inSlab = p.z <= SLAB;

        // A single joint in the slab is the very tip touching down. It still
        // marks — as a point, which dragged becomes a hairline. Without this an
        // isolated contact emitted nothing and the lightest touch drew nothing
        // at all, which kills "a fine stroke from the tip of a large round
        // brush" (VL Fig. 7). Emit a degenerate segment for it.
        /* Where this same hair point was last time. */
        const ti = (b * J + s) * 2;
        const wasX = firstStep ? p.x : this.trail[ti];
        const wasY = firstStep ? p.y : this.trail[ti + 1];
        this.trail[ti] = p.x;
        this.trail[ti + 1] = p.y;

        if (inSlab) {
          // Contact strength: firmest where the hair is pressed hardest into
          // the paper. This is what makes a light touch skip the valleys.
          const press = Math.max(0, Math.min(1, 1 - p.z / SLAB));
          const cell = b * J + s;
          const w = this.reservoir.withdraw(cell, press, this.draw, this.travel);
          let pig = 0;
          for (let k = 0; k < 8; k++) pig += this.draw[k];

          if (w > 0 || pig > 0) {
            /* THE HAIR'S TRACK, NOT THE HAIR.
             *
             * This used to run from one joint of the tuft to the next — the
             * hair's own BODY, projected onto the paper. That points along the
             * stroke only when the tuft happens to be strongly bent, and the
             * bend depends on direction, because friction is anisotropic: a
             * flat brush slides edge-on and grips broadside. So the marks came
             * out along the stroke when it ran one way and square across it
             * when it ran another, and the whole thing read as a stamp being
             * skipped over the canvas.
             *
             * [MEASURED, tools/brush-bench.mjs turn] Hair angle off the
             * direction of travel, flat hog: 0 degrees at a stroke of 0, but
             * 28 at 45 degrees and 37 at 90. And `blade` shows it follows the
             * barrel roll — twist the brush 45 degrees and the one clean
             * direction moves to 45 too. The hairs were being turned by the
             * tuft's own axis instead of by the direction of the pull.
             *
             * A hair leaves a track because it is dragged, so the mark is the
             * ground it covered between one step and this one. That trails the
             * stroke by construction, at every angle, for every brush, however
             * much or little the tuft is bent. The body is not lost: every
             * joint in contact lays its own track, and their union is the
             * swept area of the laid-over hair.
             */
            const o = count * SEG_FLOATS;
            buf[o + 0] = wasX;
            buf[o + 1] = wasY;
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
      }
    }
    this.trailValid = true;
    return count;
  }

  /**
   * Where one hair is, right now.
   *
   * Kept as a thin pass-through to `tuft.ts` because the bench and the viewer
   * both reach in for it by name. The lattice idea is unchanged — hairs are
   * geometry riding the solved spines and are never themselves simulated. What
   * changed is that they now fill the tuft's section instead of sitting on its
   * rim, and that each one differs from its neighbours.
   */
  bristlePoint(b: number, _u: number, s: number, splay: number): HairPoint {
    const out = { x: 0, y: 0, z: 0 };
    hairPoint(this.spines, this.hairs[b], this.tuftDef,
      tuftHalfWidth(this.def, this.tuftLength), s, this.def.segments, splay, out);
    return out;
  }

  /** Debug/UI: how much of the tuft is touching the paper right now. */
  contactJoints(): number {
    return this.spines.reduce((n, s) => n + s.joints.filter((j) => j.contact).length, 0);
  }
}
