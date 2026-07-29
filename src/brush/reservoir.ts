// The brush reservoir (VL Table 1/2, Card 6).
//
// A 2D grid over the tuft: one cell per (bristle, segment). Each holds water and
// eight pigment slots, with its own capacity — the belly of a mop holds more than
// its tip, and that is DATA, not code. The sponge in VL's paper is nothing but
// large capacity plus a high upRate, which is why lifting and scrubbing are brush
// parameters rather than a separate eraser mode.
//
// Transfer is bidirectional per contacting cell:
//   toCanvas    = downRate * reservoirQuantity
//   toReservoir = upRate   * canvasQuantity
// clamped on both sides against remaining capacity, applied symmetrically so
// mass is conserved.

import type { ReservoirDef } from './types';

export class Reservoir {
  readonly bristles: number;
  readonly segments: number;
  /** Water per cell. */
  water: Float32Array;
  /** Pigment per cell per slot, cell-major: [cell * 8 + slot]. */
  pigment: Float32Array;
  /** Per-cell capacity — the belly/tip profile. */
  capacity: Float32Array;
  private def: ReservoirDef;

  constructor(def: ReservoirDef, bristles: number, segments: number) {
    this.def = def;
    this.bristles = bristles;
    this.segments = segments;
    const n = bristles * segments;
    this.water = new Float32Array(n);
    this.pigment = new Float32Array(n * 8);
    this.capacity = new Float32Array(n);

    for (let b = 0; b < bristles; b++) {
      for (let s = 0; s < segments; s++) {
        // s = 0 at the ferrule, s = segments-1 at the tip. The belly sits a
        // little below the ferrule, so capacity peaks around a third along.
        const t = s / Math.max(1, segments - 1);
        const belly = 1 - Math.abs(t - 0.35) / 0.65;
        const cap = def.capacityTip +
          (def.capacityBelly - def.capacityTip) * Math.max(0, belly);
        this.capacity[b * segments + s] = cap;
      }
    }
  }

  /**
   * Dip the brush. `load` is how much paint is in the tuft; `waterCharge` is
   * clean water added on top of that paint charge.
   *
   * Added water must not silently remove pigment. A clean-water-only brush is
   * the explicit rinse action; this control changes dilution and flow while
   * leaving the selected pigment charge intact.
   *
   * `[UNVERIFIED — artist-control mapping]` `capacity` describes the tuft's
   * normal internal paint holding. A freshly flooded brush can also carry water
   * around the outside of the hairs. `waterOvercharge` is that brush-specific
   * exterior holding in nominal capacities. Keeping it in the same reservoir
   * field is the smallest model that lets "load" and "water" remain independent
   * physical controls; a later exterior-film model can split the storage without
   * changing their meaning.
   */
  charge(mix: Float32Array, load = 1, waterCharge = 0) {
    const paintLoad = Math.min(1, Math.max(0, load));
    const extraWater = Math.min(1, Math.max(0, waterCharge));
    const n = this.bristles * this.segments;
    for (let i = 0; i < n; i++) {
      const cap = this.capacity[i];
      this.water[i] = cap * (paintLoad + extraWater * this.def.waterOvercharge);
      for (let k = 0; k < 8; k++) {
        this.pigment[i * 8 + k] = cap * mix[k] * paintLoad;
      }
    }
  }

  /**
   * Capillary flow *inside* the tuft: paint wicks from the belly down toward
   * the tip as the tip is used up.
   *
   * `[UNVERIFIED — reasoned, not sourced]` VL's reservoir does not describe
   * this. Without it the brush is unusable: only the handful of cells actually
   * touching the paper deplete, so a stroke dies after ~40 cells while three
   * quarters of the load is still stranded higher up the tuft. Every real brush
   * feeds its tip from its belly, and it is the same mechanism as the paper's
   * capillary layer, so it belongs here. Rate is a tunable; test it on the bench.
   *
   * Exchange is computed from the input state on both sides of every pair and
   * applied afterwards, so it is exactly antisymmetric and conserves mass — the
   * same discipline the capillary pass needs (see 05-fluid.md).
   */
  wick(rate: number) {
    const S = this.segments;
    const B = this.bristles;
    const dw = new Float32Array(this.water.length);
    const dp = new Float32Array(this.pigment.length);

    for (let b = 0; b < B; b++) {
      for (let s = 0; s < S - 1; s++) {
        const i = b * S + s;
        const j = i + 1;
        // Drive on concentration relative to capacity, so the belly (which
        // holds more) genuinely feeds the tip rather than merely equalising.
        const ci = this.water[i] / Math.max(this.capacity[i], 1e-6);
        const cj = this.water[j] / Math.max(this.capacity[j], 1e-6);
        const flow = rate * (ci - cj) * Math.min(this.capacity[i], this.capacity[j]);
        dw[i] -= flow;
        dw[j] += flow;
        for (let k = 0; k < 8; k++) {
          const pi = this.pigment[i * 8 + k] / Math.max(this.capacity[i], 1e-6);
          const pj = this.pigment[j * 8 + k] / Math.max(this.capacity[j], 1e-6);
          const pf = rate * (pi - pj) * Math.min(this.capacity[i], this.capacity[j]);
          dp[i * 8 + k] -= pf;
          dp[j * 8 + k] += pf;
        }
      }
    }
    for (let i = 0; i < this.water.length; i++) {
      this.water[i] = Math.max(0, this.water[i] + dw[i]);
    }
    for (let i = 0; i < this.pigment.length; i++) {
      this.pigment[i] = Math.max(0, this.pigment[i] + dp[i]);
    }
  }

  /**
   * Rinse the brush in the water jar: the pigment goes, the water stays.
   *
   * This is a real painting action, not a reset — a rinsed brush is a *loaded*
   * brush carrying clean water, which is what you use to wet paper before a
   * wash, to soften an edge, or to lift colour back off. Squeeze it out with
   * `waterFrac = 0` for a thirsty brush.
   */
  rinse(waterFrac = 1) {
    const n = this.bristles * this.segments;
    for (let i = 0; i < n; i++) {
      this.water[i] = this.capacity[i] * waterFrac;
      for (let k = 0; k < 8; k++) this.pigment[i * 8 + k] = 0;
    }
  }

  /** Total load remaining, for the UI's "brush is running dry" readout. */
  totals(): { water: number; pigment: number; capacity: number } {
    let w = 0, p = 0, c = 0;
    for (let i = 0; i < this.water.length; i++) {
      w += this.water[i];
      c += this.capacity[i];
      for (let k = 0; k < 8; k++) p += this.pigment[i * 8 + k];
    }
    return { water: w, pigment: p, capacity: c };
  }

  /**
   * Withdraw this contact cell's share for one footprint step. Returns the
   * amounts leaving the brush; the caller deposits them onto the canvas.
   *
   * `contactFrac` scales with how firmly this part of the tuft is pressed.
   * `travel` is how far the tuft moved this step, in grid cells.
   *
   * [TRAP, measured — this was a fence violation, invariant 2] `downRate` used
   * to be applied as a flat fraction PER SOLVE STEP, with no reference to
   * distance. The resampler takes a step every <= 0.9 cells, so the brush lost
   * `downRate` of its load every 0.9 cells travelled — an exponential decay
   * with a very short half-life. Measured along one stroke, the paint laid fell
   * 2.603 -> 0.211 -> 0.004 from start to 300 cells in: a 650x falloff, dead
   * within about fifty cells. Once the amounts are that small the ordinary 2x
   * variation between cells reads as a trail of specks, which is what it looked
   * like on screen.
   *
   * Charging per unit distance instead makes a stroke of a given LENGTH cost
   * the same paint however finely it was resampled — which is the invariant the
   * card states, and it is also just true of brushes.
   */
  withdraw(cell: number, contactFrac: number, out: Float32Array, travel = 1): number {
    // A brush held still still bleeds into the paper, so distance never falls
    // to zero — it just stops being what drives the transfer.
    const STILL = 0.25;
    const dist = Math.max(STILL, travel);
    const rate = Math.min(1, this.def.downRate * dist)
               * Math.max(0, Math.min(1, contactFrac));
    const w = this.water[cell] * rate;
    this.water[cell] -= w;
    for (let k = 0; k < 8; k++) {
      const idx = cell * 8 + k;
      const g = this.pigment[idx] * rate;
      this.pigment[idx] -= g;
      out[k] = g;
    }
    return w;
  }

  /**
   * The reverse direction — canvas back into the brush (lifting, scrubbing,
   * picking up a neighbouring colour and dragging it along).
   *
   * `[DEFERRED — P6]` Needs the canvas state read back to the CPU, which means a
   * GPU->CPU path with a frame of lag. The rate lives here now so the schema is
   * complete and the plumbing is the only thing missing.
   */
  get upRate(): number { return this.def.upRate; }
}
