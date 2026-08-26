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
  /** How big the tuft is, as a multiple of its own row. See `setScale`. */
  private scale = 1;
  /** How fast it gives its load up, as a multiple of its own row. See `setFlow`. */
  private flow = 1;

  constructor(def: ReservoirDef, bristles: number, segments: number) {
    this.def = def;
    this.bristles = bristles;
    this.segments = segments;
    const n = bristles * segments;
    this.water = new Float32Array(n);
    this.pigment = new Float32Array(n * 8);
    this.capacity = new Float32Array(n);
    this.buildProfile();
  }

  /** The belly/tip profile, at the current scale. */
  private buildProfile() {
    const { capacityTip, capacityBelly } = this.def;
    for (let b = 0; b < this.bristles; b++) {
      for (let s = 0; s < this.segments; s++) {
        // s = 0 at the ferrule, s = segments-1 at the tip. The belly sits a
        // little below the ferrule, so capacity peaks around a third along.
        const t = s / Math.max(1, this.segments - 1);
        const belly = 1 - Math.abs(t - 0.35) / 0.65;
        const cap = capacityTip + (capacityBelly - capacityTip) * Math.max(0, belly);
        this.capacity[b * this.segments + s] = cap * this.scale;
      }
    }
  }

  /**
   * Resize the tuft's holding, keeping its belly-to-tip shape.
   *
   * Load fills the brush; this changes how big the brush IS. They are different
   * questions and only one of them was answerable: a brush at full Load that
   * still runs out after forty cells needs a bigger reservoir, not a fuller
   * one.
   *
   * The rows this multiplies are explicitly not measured — the brush doc says
   * "reservoir capacities are tuned to the engine's units, not measured", and
   * records that the first values were about fifty times too small and a whole
   * stroke came out invisible. So a dial on top of them is honest.
   *
   * Does not itself refill: the caller charges, because only it knows the mix.
   */
  setScale(scale: number) {
    this.scale = Math.max(0.05, scale);
    this.buildProfile();
  }

  /**
   * How fast the tuft gives its load up, per cell travelled.
   *
   * [MEASURED, tools/brush-bench.mjs legs] This is the one that changes how FAR
   * a dip goes, and capacity is not. `withdraw` takes a fraction of what is in
   * a cell, so a bigger reservoir lays proportionally more at every step and
   * empties over exactly the same distance: at 0.5x through 5x capacity a flat
   * hog laid 48 units then 484, and faded at 88 cells every single time. Bigger
   * tuft, heavier stroke, same legs.
   *
   * The distance is set here. Halve this and one dip goes twice as far, laying
   * half as much at each point along the way.
   */
  setFlow(flow: number) { this.flow = Math.max(0.02, flow); }

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
  withdraw(cell: number, contactFrac: number, out: Float32Array, travel = 1,
           bodyPaint = false): number {
    // A brush held still still bleeds into the paper, so distance never falls
    // to zero — it just stops being what drives the transfer.
    const STILL = 0.25;
    const dist = Math.max(STILL, travel);
    const ordinaryRate = Math.min(1, this.def.downRate * this.flow * dist)
                       * Math.max(0, Math.min(1, contactFrac));

    /* A wash grows paler as less colour remains in the hair, so its release is
       a fraction of what is left. A body paint does not turn into white paint
       as a bristle runs dry: it leaves fewer loaded contacts, then none.

       Give body paint one nominal packet from this reservoir cell, capped by
       what is actually left. The packet is built only from the existing cell
       capacity, down-rate, and actual hair contact — no new tuning constant.
       Contact scales the VOLUME released, while water/vehicle and every pigment
       lane still use ONE common fraction, so clear medium cannot carry on after
       the pigment has stopped and a grazing hair cannot unload a full packet.

       [UNVERIFIED — artist transfer mapping, 2026-08-25.] */
    let rate = ordinaryRate;
    if (bodyPaint) {
      let pigmentHeld = 0;
      for (let k = 0; k < 8; k++) pigmentHeld += this.pigment[cell * 8 + k];
      const held = Math.max(this.water[cell], pigmentHeld);
      const packet = this.capacity[cell]
                   * Math.min(1, this.def.downRate * this.flow * dist)
                   * Math.max(0, Math.min(1, contactFrac));
      rate = held > 1e-12 ? Math.min(1, packet / held) : 0;
    }
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
   * How grabby the TUFT is. What it is dragged through has its own say — see
   * `MediumPhysics.upRate` — and the deposit pass multiplies the two, because
   * both are true at once: a hog bristle scrubs harder than a sable, and wet
   * oil gives itself up far more readily than a thin wash. Neither number is
   * measured off a source; both are tuning rows.
   */
  get upRate(): number { return this.def.upRate; }

  /**
   * How readily the tuft will take more on, 0..1.
   *
   * The deposit pass multiplies its pickup by this, which is what makes a
   * thirsty brush drink and a laden one mostly shove.
   *
   * It reaches **zero** at capacity, and that is the point. It used to floor at
   * 0.3 on the reasoning that a brim-full tuft still exchanges paint at its
   * surface, and that letting it hit zero would make Load a switch that
   * silently turned picking-up off. Both halves of that were wrong:
   *
   *   - [MEASURED, docs/16 E7] With a floor, nothing ever stopped the brush
   *     taking. It finished strokes holding **158 %** of its own capacity while
   *     the sheet went bare — which is not a brush picking paint up, it is a
   *     brush that cannot be filled.
   *   - It is not a dead control either. A brush at the brim is laying paint
   *     with every step, so it drops below full within a few cells and starts
   *     taking again on its own. "Full brushes shove, emptying brushes drink"
   *     is the behaviour, not a switch.
   *
   * The clamp still lives HERE and not in the shader's subtraction, because a
   * cap applied on the brush side would refuse paint the sheet had already
   * given up, and refused paint is paint destroyed. This throttles what is
   * asked for; it never rejects what has already arrived.
   *
   * Occupancy is the WORSE of water and pigment rather than their sum, because
   * `charge` fills both to the same capacity at full load — a brush charged to
   * the brim holds one capacity of each, not two capacities of one thing.
   */
  roomFraction(): number {
    let water = 0, pig = 0, cap = 0;
    for (let i = 0; i < this.water.length; i++) {
      cap += this.capacity[i];
      water += this.water[i];
      for (let k = 0; k < 8; k++) pig += this.pigment[i * 8 + k];
    }
    if (cap <= 1e-6) return 0;
    const full = Math.max(0, Math.min(1, Math.max(water, pig) / cap));
    return 1 - full;
  }

  /**
   * Take up what the sheet gave. `water` and `pig[8]` are the frame's totals,
   * measured on the GPU as it removed them, so what arrives here is exactly
   * what left the canvas — the two are the same subtraction, reported.
   *
   * Spread across the tuft in proportion to each cell's remaining room, so the
   * emptier parts drink first and nothing piles into one hair. Where there is
   * no room left it still goes in; see `roomFraction`.
   *
   * `[UNVERIFIED — reasoned]` Which reservoir cell a given canvas cell ought to
   * credit is knowable in principle: Card 6's footprint carries the tuft's own
   * texcoords for exactly this purpose. Until it does, spreading by room is the
   * honest stand-in, and `wick` evens the tuft out every step regardless.
   */
  pickUp(water: number, pig: Float32Array) {
    let pigTotal = 0;
    for (let k = 0; k < 8; k++) pigTotal += pig[k];
    if (water <= 0 && pigTotal <= 0) return;

    const n = this.bristles * this.segments;
    const per = new Float32Array(n);
    let room = 0;
    for (let i = 0; i < n; i++) {
      let held = this.water[i];
      for (let k = 0; k < 8; k++) held += this.pigment[i * 8 + k];
      per[i] = Math.max(0, this.capacity[i] - held);
      room += per[i];
    }
    // A brush with no room anywhere still has to put it somewhere; share it out
    // by capacity then, so the belly takes more than the tip either way.
    if (room <= 1e-9) {
      room = 0;
      for (let i = 0; i < n; i++) { per[i] = this.capacity[i]; room += per[i]; }
    }
    if (room <= 1e-9) return;

    for (let i = 0; i < n; i++) {
      const share = per[i] / room;
      if (share <= 0) continue;
      this.water[i] += water * share;
      for (let k = 0; k < 8; k++) this.pigment[i * 8 + k] += pig[k] * share;
    }
  }

  /**
   * What the tuft is holding, as slot weights summing to 1.
   *
   * This is the colour the brush actually lays, and once it can pick paint up
   * that is no longer the colour it was dipped in. All zeros for an empty or
   * rinsed brush, which correctly lays nothing.
   */
  composition(out: Float32Array) {
    out.fill(0);
    let total = 0;
    for (let i = 0; i < this.water.length; i++) {
      for (let k = 0; k < 8; k++) {
        const g = this.pigment[i * 8 + k];
        out[k] += g;
        total += g;
      }
    }
    if (total <= 1e-12) { out.fill(0); return; }
    for (let k = 0; k < 8; k++) out[k] /= total;
  }
}
