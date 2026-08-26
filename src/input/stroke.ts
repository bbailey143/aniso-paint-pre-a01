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
import { MAX_SEGS, SEG_FLOATS, DRY_SEG_FLOATS } from '../engine/fluid';
import { Brush } from '../brush/brush';
import type { BrushDef, BrushInput } from '../brush/types';
import { DryTool } from '../media/dry-tool';
import type { DryMedium, WetMedium } from '../media/types';

/** The live outline of the selected tool where it meets the paper. */
export type PaperContact = {
  profile: 'round' | 'chisel';
  minorRadius: number;
  majorRadius: number;
  angle: number;
};

/** Frame footprint capacity. Larger than one GPU chunk — the fluid engine
 * dispatches it in chunks, so a fast flick is not truncated. */
const FRAME_SEGS = MAX_SEGS * 6;

export class StrokeEngine {
  private buf: Float32Array<ArrayBuffer> = new Float32Array(FRAME_SEGS * SEG_FLOATS);
  private count = 0;
  /** Dry media get their own footprint buffer, because the two go to different
   * GPU passes: wet through the fluid band, dry straight to the floor (P7). */
  private dryBuf: Float32Array<ArrayBuffer> = new Float32Array(FRAME_SEGS * DRY_SEG_FLOATS);
  private dryCount = 0;
  /** Null while a wet tool is selected. */
  private dry: DryTool | null = null;
  private last: { x: number; y: number; s: StylusSample } | null = null;
  /** How far the brush travelled this frame, in grid cells. The smear needs a
   *  direction, and a footprint segment runs ALONG a hair rather than along the
   *  stroke, so it cannot be read back out of the footprint. */
  private travelX = 0;
  private travelY = 0;
  private brush: Brush;
  private size: number;
  /** The mix the brush was last DIPPED in, and how heavily it was charged. */
  private mix: Float32Array<ArrayBuffer> = new Float32Array(8);
  /** What the tuft is holding now, which drifts from `mix` as it picks paint
   *  up. Reused rather than allocated per frame — see `brushMix`. */
  private live: Float32Array<ArrayBuffer> = new Float32Array(8);
  private loading = 0.6;
  /** Extra clean water added to the colour charge, 0..1. */
  private waterCharge = 0;
  /** How big the tuft's reservoir is, as a multiple of the brush's own row.
   *  Kept here rather than on the brush because a brush is rebuilt whenever it
   *  is picked, and this must survive that. */
  private capacityScale = 1;
  /** How fast the tuft gives that load up, as a multiple of the brush's row. */
  private flowScale = 1;
  /** True for paste/body media. Derived from the material's existing yield
   * stress, so the brush never needs to know a material name. */
  private bodyTransfer = false;
  private layFlat = false;

  /** Cells per solve step — never let the tuft jump more than this. */
  private maxStep = 0.9;

  constructor(def: BrushDef, size: number) {
    this.size = size;
    this.brush = new Brush(def, size);
    this.brush.setBodyTransfer(this.bodyTransfer);
  }

  setWetMedium(m: WetMedium) {
    this.dry = null;
    this.bodyTransfer = m.yieldStress > 0;
    this.brush.setBodyTransfer(this.bodyTransfer);
  }

  get current(): Brush { return this.brush; }

  setBrush(def: BrushDef, size = this.size) {
    this.size = size;
    this.dry = null;                       // back to a wet tool
    this.brush = new Brush(def, size);
    this.brush.setBodyTransfer(this.bodyTransfer);
    this.brush.reservoir.setScale(this.capacityScale);
    this.brush.reservoir.setFlow(this.flowScale);
    this.brush.reservoir.charge(this.mix, this.loading, this.waterCharge);
  }

  /** Switch to a dry medium (P7). The brush is left as it was, loaded, so
   * picking the pencil up and putting it down again does not lose the paint. */
  setDryMedium(m: DryMedium, size = this.size) {
    this.size = size;
    this.dry = new DryTool(m, size);
    this.dry.setLayFlat(this.layFlat);
  }

  setLayFlat(on: boolean) {
    this.layFlat = on;
    this.dry?.setLayFlat(on);
  }

  get isDry(): boolean { return this.dry !== null; }

  /**
   * Describe the selected tool at the paper without starting a stroke.
   * Dry tools use their exact deposit geometry. Wet brushes use their selected
   * round or flat tuft silhouette; their individual hairs remain a live solver
   * result only once the brush is pressed into the sheet.
   */
  paperContact(s: Pick<StylusSample, 'pressure' | 'tiltAngle' | 'tiltAzimuth' | 'twist'>): PaperContact {
    if (this.dry) return this.dry.contact(s);

    const def = this.brush.def;
    const halfWidth = Math.max(0.75, 0.5 * def.widthRatio * this.brush.tuftLength);
    if (def.kind === 'round') {
      return { profile: 'round', minorRadius: halfWidth, majorRadius: halfWidth, angle: 0 };
    }

    // The flat brush's two spines are separated across the blade. Its short
    // axis is a restrained slice of the tuft length, so the cursor reads as a
    // brush contact instead of an unrealistically long handle.
    const minorRadius = Math.max(0.75, this.brush.tuftLength * 0.12);
    return {
      profile: 'chisel', minorRadius, majorRadius: halfWidth,
      // Lies the way the Pencil lies, hovering as well as touching, so the
      // cursor previews the blade the stroke will actually lay.
      angle: this.brush.contactAngle(s.tiltAzimuth, s.twist, s.tiltAngle),
    };
  }

  /**
   * Called whenever the tuft's whole load is replaced - a dip or a rinse.
   *
   * The host wires this to the engine, which throws away any pickup still in
   * the post. Paint the brush lifted a moment ago belongs to the brush as it
   * was; crediting it after a dip puts the last stroke's colour onto a tuft
   * that has just been washed out.
   */
  onBrushReset: (() => void) | null = null;

  /** Dip the brush. Called when the mix or load changes, and at stroke start. */
  charge(mix: Float32Array, loading: number, waterCharge = this.waterCharge) {
    this.mix.set(mix.subarray(0, 8));
    this.loading = loading;
    this.waterCharge = Math.min(1, Math.max(0, waterCharge));
    this.brush.reservoir.charge(this.mix, loading, this.waterCharge);
    this.onBrushReset?.();
  }

  /**
   * The colour on the tuft RIGHT NOW, as slot weights summing to 1.
   *
   * Not the same thing as the colour on the palette: once the brush can lift
   * paint off the sheet, what it is holding drifts away from what it was dipped
   * in, and this is what makes the trail past a crossing come out muddied. The
   * palette recipe is still what `charge` puts in — this is what comes out.
   *
   * Dry tools have no tuft; they keep laying exactly what they are made of.
   */
  get brushMix(): Float32Array<ArrayBuffer> {
    if (this.dry) return this.mix;
    this.brush.reservoir.composition(this.live);
    return this.live;
  }

  /**
   * The tuft's side of the pickup exchange: how grabby these bristles are,
   * times how much room they have left.
   *
   * Both halves are real and both are data rows. A hog scrubs where a sable
   * barely touches, and a brush that has run down drinks where a freshly
   * dipped one mostly shoves. The material has its own say - see
   * `FluidParams.upRate` - and the deposit pass multiplies the two together.
   *
   * A dry tool has no tuft and picks nothing up.
   */
  get brushTake(): number {
    if (this.dry) return 0;
    return this.brush.reservoir.upRate * this.brush.reservoir.roomFraction();
  }

  /**
   * The same grabbiness WITHOUT the room term — how hard these bristles take
   * hold of paint already on the sheet, whether or not they have anywhere to
   * put it.
   *
   * `brushTake` above is this times the room left, and that product is what may
   * be DRUNK. The rest of the grab does not stop existing when the tuft is
   * full: it becomes a shove. The deposit pass needs both numbers to divide the
   * one grab between the two outcomes, and it recovers the room fraction as
   * `brushTake / brushGrab` rather than being sent a third number that could
   * drift out of step with the first two.
   */
  get brushGrab(): number {
    if (this.dry) return 0;
    return this.brush.reservoir.upRate;
  }

  /**
   * Take up what the sheet just gave. Called by the engine after it has read
   * back what the deposit pass subtracted, so this is a credit for a debit that
   * has already happened — never a decision to make here.
   */
  pickUp(water: number, pigment: Float32Array) {
    if (this.dry) return;
    this.brush.reservoir.pickUp(water, pigment);
  }

  /** How fast the tuft gives its load up. Lower makes one dip go further. */
  setFlow(scale: number) {
    this.flowScale = Math.max(0.02, scale);
    this.brush.reservoir.setFlow(this.flowScale);
  }

  /** How much the tuft holds, as a multiple of the brush's own row. */
  setCapacity(scale: number) {
    this.capacityScale = Math.max(0.05, scale);
    this.brush.reservoir.setScale(this.capacityScale);
    // Resizing an empty jug leaves it empty; top it back up to the same Load.
    this.brush.reservoir.charge(this.mix, this.loading, this.waterCharge);
  }

  /**
   * Rinse: pigment out, clean water in. The brush stays loaded — it is now a
   * water brush. Because the mix on the brush is cleared too, the next stroke
   * lays clear water rather than quietly re-charging with the old colour.
   */
  rinse(waterFrac = 1) {
    this.mix.fill(0);
    this.brush.reservoir.rinse(waterFrac);
    this.onBrushReset?.();
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
    this.brush.reservoir.charge(this.mix, this.loading, this.waterCharge);
    this.onBrushReset?.();
    this.brush.begin();
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
      this.travelX += input.dx;
      this.travelY += input.dy;
      if (this.count < FRAME_SEGS) {
        this.count = this.brush.emitFootprint(this.buf, this.count, FRAME_SEGS);
      }
    }
    this.last = { x: gx, y: gy, s };
  }

  /** Hand the frame's footprint to the engine and reset for the next frame.
   *  `dx`/`dy` are the frame's net travel — one direction for the whole frame,
   *  which is an approximation a curved flick would notice and a normal stroke
   *  will not, since a frame covers a few cells at most. */
  drain(): { data: Float32Array<ArrayBuffer>; count: number; dx: number; dy: number } {
    const count = this.count;
    const dx = this.travelX, dy = this.travelY;
    this.count = 0;
    this.travelX = 0;
    this.travelY = 0;
    return { data: this.buf, count, dx, dy };
  }

  /** Same, for the dry-media channel (P7). `edge` is the rim falloff the
   * active medium wants — soft for graphite, crisp for a ballpoint. */
  drainDry(): {
    data: Float32Array<ArrayBuffer>;
    count: number;
    edge: number;
    profile: 'round' | 'chisel';
    surfaceMobility: number;
    compactionAmount: number;
  } {
    const count = this.dryCount;
    this.dryCount = 0;
    return {
      data: this.dryBuf, count,
      edge: this.dry ? this.dry.edgeSharpness : 1,
      profile: this.dry ? this.dry.contactProfile : 'round',
      surfaceMobility: this.dry?.surfaceMobility ?? 0,
      compactionAmount: this.dry?.compactionAmount ?? 1,
    };
  }
}
