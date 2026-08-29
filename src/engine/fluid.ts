// FluidEngine — the wet band (P4).
//
// Ports the main-branch bench's validated C97 shallow-water passes into the
// TS+WebGPU schema. The pass ORDER is part of the contract, not a detail:
//
//   Deposit -> UpdateVelocities -> RelaxDivergence xN -> FlowOutward
//           -> RimMigration -> FluxCompute -> MovePigment -> MoveWater
//           -> TransferPigment -> CapillaryFlow -> DryTick
//
// RimMigration sits after FlowOutward because it consumes the blurred film that
// pass emits, and before the flux ledger so the drying drift and the bulk
// advection both act on suspension in the same frame — with settling
// (TransferPigment) after both, which is the order a real ring forms in.
//
// MovePigment must run before MoveWater: the fraction of pigment leaving a cell
// is (water leaving / water present BEFORE the move). Update water first and
// the pass silently reads the wrong denominator.
//
// Resolution strategy (invariant 4): the sim grid is coarser than the display.
// The physics does not need display resolution; the visual layer does.

import type { Gpu } from './gpu';
import { PIGMENTS } from '../color/pigment-palette';

import commonWgsl from './shaders/fluid/common.wgsl?raw';
import depositWgsl from './shaders/fluid/deposit.wgsl?raw';
import levelFreshWgsl from './shaders/fluid/level_fresh.wgsl?raw';
import velWgsl from './shaders/fluid/update_velocities.wgsl?raw';
import relaxWgsl from './shaders/fluid/relax_divergence.wgsl?raw';
import outwardWgsl from './shaders/fluid/flow_outward.wgsl?raw';
import rimWgsl from './shaders/fluid/rim_migration.wgsl?raw';
import fluxComputeWgsl from './shaders/fluid/flux_compute.wgsl?raw';
import fluxPigWgsl from './shaders/fluid/flux_apply_pigment.wgsl?raw';
import fluxWaterWgsl from './shaders/fluid/flux_apply_water.wgsl?raw';
import transferWgsl from './shaders/fluid/transfer_pigment.wgsl?raw';
import capillaryWgsl from './shaders/fluid/capillary_flow.wgsl?raw';
import dryWgsl from './shaders/fluid/dry_tick.wgsl?raw';
import bakePushWgsl from './shaders/fluid/bake_push.wgsl?raw';
import dryStoreWgsl from './shaders/fluid/dry_store.wgsl?raw';
import wetClearWgsl from './shaders/fluid/wet_clear.wgsl?raw';
import rewetWgsl from './shaders/fluid/rewet.wgsl?raw';
import dryDepositWgsl from './shaders/fluid/dry_deposit.wgsl?raw';
import reduceWgsl from './shaders/fluid/reduce.wgsl?raw';
import reduceFinalWgsl from './shaders/fluid/reduce_final.wgsl?raw';
import reduceInkWgsl from './shaders/fluid/reduce_ink.wgsl?raw';
import reduceInkFinalWgsl from './shaders/fluid/reduce_ink_final.wgsl?raw';
import zeroWgsl from './shaders/fluid/zero_fill.wgsl?raw';
import capillaryAlarmWgsl from './shaders/fluid/capillary_alarm.wgsl?raw';

// Quantities per reduce workgroup. Stated in THREE places that must agree:
// here, `NQ` in reduce.wgsl, and `NQ` in reduce_final.wgsl. A mismatch reads
// scrambled lanes and has already cost a day.
const NQ = 15;
// The second reduction stage writes this many lanes (NQ, padded). Keep in step
// with LANES in reduce_final.wgsl — it is the size of every gauge readback.
const TOTAL_LANES = 16;
/** Pickup tally: the vehicle, then one lane per pigment slot. */
const PICKUP_LANES = 9;
/** Must match TALLY in deposit.wgsl. Fixed point, because WGSL has no atomic float. */
const PICKUP_TALLY = 1.0e5;
// Footprint segments per frame. The brush emits one per contacting bristle
// segment per resampled step, so this is bristles x contacts x substeps.
const MAX_SEGS = 8192;
const SEG_FLOATS = 12;         // deposit contact + local resampled drag vec2 + pad

/** Levelling sweeps per deposit chunk. One per brush solve step is the ideal —
 *  it is what a slow stroke gets — but a fast flick can carry dozens, so the
 *  count is capped and the per-sweep budget divided by the count actually used.
 *  8 is a cost ceiling, not a physical number. [UNVERIFIED as a visual choice;
 *  raise it and look, the arithmetic holds at any value.] */
const LEVEL_SWEEP_MAX = 8;
// Dry tools also carry the long axis of a tilted contact ellipse. It remains a
// separate layout so wet-brush footprints stay byte-for-byte unchanged.
const DRY_SEG_FLOATS = 10;

export interface FluidParams {
  dt: number;
  viscosity: number;
  drag: number;
  dryRate: number;
  evapRate: number;
  gravityX: number;
  gravityY: number;
  cosAlpha: number;
  edgeEta: number;
  paperInfluence: number;
  /** The active sheet's tooth amplitude. Set by the canvas from the paper row;
   * dry media read it to tell a smooth sheet from a rough one. */
  toothAmp: number;
  /** Fraction of the newest dry layer returning to suspension per unit time. */
  rewetRate: number;
  /** Wet-medium strength applied to the shared Lucas-Washburn uptake. */
  absorptionCoupling: number;
  /** Wet-medium response to the board's shared, normalised gravity field. */
  gravityResponse: number;
  /** Extra drag from saturation already held in the substrate. */
  wetLayerDrag: number;
  /** Pigment-side rim strength (log 13, E9). 0 skips the pass entirely, which
   * is both the oil row and the pre-E9 regression path. */
  rimMigration: number;
  /** Gaussian sigma in cells for the film blur that aims rimMigration. */
  rimReach: number;
  /** How much faster a film dries at its pinned edge than in its interior
   * (log 13, E11). 0 = evenly, the pre-E11 behaviour. */
  edgeEvaporation: number;
  /** Stress a face must clear before the material moves. 0 means nothing holds
   * it back, NOT that it is water — which solver runs is `hasCurrent`. */
  yieldStress: number;
  /** False for a material with no velocity field of its own: it slumps and is
   *  pushed, and the velocity and pressure passes are skipped. See
   *  WetMedium.hasCurrent, and docs/15 E4 for what deciding this from the
   *  yield stress cost. */
  hasCurrent: boolean;
  /** Film the brush cannot shove off the sheet however hard it scrubs. */
  teflonMin: number;
  /** How hard the brush shoves the paint already down. 1 is the lab's share. */
  smearStrength: number;
  /**
   * How readily this material comes back UP onto the tuft, per cell travelled.
   *
   * The material's half of the pickup; the tuft's own grabbiness is the other
   * half and lives on its reservoir row. Wet oil gives itself up readily, a
   * thin wash much less, and every dry medium not at all. The deposit pass
   * multiplies the two.
   */
  upRate: number;
  /**
   * Wet -> dry pigment handoff, and therefore glazing and re-wetting.
   *
   * Off is the fallback, not the intent: with it off a wash still dries
   * visually, but nothing can be glazed over dry paint and nothing re-wets.
   */
  handoffEnabled: boolean;
}

export const DEFAULT_FLUID: FluidParams = {
  dt: 1.0,
  viscosity: 0.1,        // C97 mu
  drag: 0.01,            // C97 kappa
  dryRate: 0.0015,
  evapRate: 0.0,         // off by default so conservation can be checked
  hasCurrent: true,      // a blank engine is water, as it always was
  gravityX: 0,
  gravityY: 0,
  cosAlpha: 1.0,
  edgeEta: 0.03,
  paperInfluence: 0.10,
  toothAmp: 0.45,          // cold press, the default sheet
  // Watercolour is reactivatable — this is what makes a dried wash come back.
  rewetRate: 0.10,
  // Watercolour's provisional row value; explicitly unverified in media/library.ts.
  absorptionCoupling: 0.01,
  gravityResponse: 1.0,
  wetLayerDrag: 0.0,
  rimMigration: 0.0,
  rimReach: 2.0,
  edgeEvaporation: 0.0,
  yieldStress: 0.0,
  teflonMin: 0.0,
  smearStrength: 1.0,
  // Off by default. A blank engine picks nothing up until a medium says it may.
  upRate: 0.0,
  handoffEnabled: true,
};

export interface Gauges {
  water: number;         // sum h_f + s
  film: number;
  saturation: number;
  pigment: number;       // sum over slots of (g + d)
  perSlot: number[];
  wetCells: number;
  meanDivergence: number;
  relaxIters: number;
  /** Pigment still in the wet band (suspended + settled). */
  wetPigment: number;
  /** Pigment in the dry layers. wetPigment + dryPigment must equal pigment —
   * that split is what tells a real leak apart from paint changing band. */
  dryPigment: number;
  /**
   * Dry media on the fine ink grid, kept OUT of `pigment` on purpose.
   *
   * [TRAP] Ink was briefly folded into `pigment` and `dryPigment`. The two
   * numbers are not commensurable: ink is summed over 2048^2 cells and its
   * amount is a concentration, so one ballpoint line reads ~2871 against a
   * whole watercolour wash's ~159. Merged, the meter jumps by a factor of
   * eighteen the moment you pick up a pen — and a 5 % leak in the wet band
   * disappears inside the rounding of that larger number. Invariant 1 is
   * "paint, lift the brush, watch it hold", which only works if the thing
   * being watched is one band.
   *
   * No material crosses between the grids, so the two ledgers are independent
   * and each holds on its own. When charcoal and pastel arrive they WILL cross,
   * and that bridge needs its own conservation test — at which point these two
   * numbers have to be checked as a sum.
   */
  inkPigment: number;
  inkPerSlot: number[];
}

// [MEASURED — the gauges caught this, and it changes D6 for the wet band]
//
// At rgba16float the sheet lost 6.5% of its pigment and up to 7% of its water
// every 200 hands-off frames — about three seconds. Localised with two
// discriminators: setting cosAlpha=0 (which zeroes capillary diffusion) took
// water drift to 0.000%, and pigment drift held at -6.5/-6.6/-6.7% across a 16x
// range of paint quantity. Scale-invariance is the signature of floating-point
// relative rounding, not an absolute threshold or an asymmetric formula.
//
// Cause: both capillary diffusion and TransferPigment add a small delta to a
// larger stored value every frame, and the give and receive halves round
// independently at a 10-bit mantissa. No formula change can fix that; the
// accumulating fields need real precision.
//
// So the wet band runs at rgba32float. This is affordable precisely because the
// simulation grid is coarse (invariant 4) — at 512 the whole band is ~117 MB.
// Display-side textures stay half-float per D6; it is accumulation that needs
// the bits, not storage in general.
const FLUID_FORMAT: GPUTextureFormat = 'rgba32float';

/**
 * Resolution of the dry-media (ink) band — FOUR TIMES the fluid grid.
 *
 * A ballpoint line is thinner than a fluid cell, and one number per cell cannot
 * say "a black hairline runs down the left edge of this square": all it can
 * record is "this square is a third inked", which reads back as a wide pale
 * line instead of a narrow dark one. Real biro hatching is dark AND thin at
 * once, and an artist spots the difference immediately.
 *
 * So dry media get their own finer grid. Crucially this is NOT a separate layer
 * type with its own physics — it is one more field in the same canvas, at a
 * different sampling rate, exactly as the display has always been finer than
 * the simulation. Nothing is ever flattened to make media interact.
 *
 * The safety rule that makes it free of risk: **no material ever moves between
 * grids.** Ink is deposited here and read here; the fluid may LOOK at it, but
 * nothing is transported across the resolution change, so there is no
 * resampling step where mass could leak or multiply. Charcoal and pastel, which
 * genuinely do lift into water, will need that bridge — and a conservation test
 * around it — when their rows arrive.
 */
const INK_RES = 2048;
const INK_Q = 8;
/**
 * Half-float is enough HERE, unlike the wet band (D6). The wet band accumulates
 * thousands of tiny increments per cell per second and ground away 6.5 % of its
 * pigment at f16; ink takes a handful of additions per stroke, so the rounding
 * has nothing to compound over.
 */
const INK_FORMAT: GPUTextureFormat = 'rgba16float';

/** A ping-pong pair of same-format textures. */
class PingPong {
  tex: GPUTexture[];
  view: GPUTextureView[];
  cur = 0;
  constructor(device: GPUDevice, n: number, label: string, format: GPUTextureFormat = FLUID_FORMAT) {
    this.tex = [0, 1].map((i) => device.createTexture({
      size: [n, n], format,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
           | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
      label: `${label}${i}`,
    }));
    this.view = this.tex.map((t) => t.createView());
  }
  get src() { return this.view[this.cur]; }
  get dst() { return this.view[1 - this.cur]; }
  get srcTex() { return this.tex[this.cur]; }
  flip() { this.cur = 1 - this.cur; }
}

export class FluidEngine {
  readonly n: number;
  private gpu: Gpu;
  private paper: GPUTextureView;

  // WET0 (M,h_f,u,v) · WET1/2 (g[8]) · WET3/4 (d[8]) · WET5 (s,w,h_p,flags)
  private wet0: PingPong;
  private wet1: PingPong;
  private wet2: PingPong;
  private wet3: PingPong;
  private wet4: PingPong;
  private wet5: PingPong;
  private press: PingPong;
  // Dry bands. dry1 is the newest dried application and stays re-wettable;
  // dry2 accumulates everything older (the auto-bake the artist never sees).
  private dry1a: PingPong;
  private dry1b: PingPong;
  private dry2a: PingPong;
  private dry2b: PingPong;
  /** Dry media, at INK_RES. Slots 0-3 and 4-7. */
  private ink0: PingPong;
  private ink1: PingPong;
  readonly inkRes = INK_RES;
  private inkPaper: GPUTextureView;

  private paramsBuf: GPUBuffer;
  private fluxBuf: GPUBuffer;
  private freshBuf: GPUBuffer;
  private segBuf: GPUBuffer;
  private inkSegBuf: GPUBuffer;
  /** The same stroke footprints in the finer dry-media coordinate system. */
  private inkSegs = new Float32Array(MAX_SEGS * DRY_SEG_FLOATS);
  private ctlBuf: GPUBuffer;
  private mixBuf: GPUBuffer;
  /** What the tuft lifted off the sheet this frame — see PICKUP_LANES. */
  private pickupBuf: GPUBuffer;
  private pickupRead: GPUBuffer;
  private pickupZero = new Uint32Array(PICKUP_LANES);
  private pickupBusy = false;
  /** True while the tally may still hold something nobody has collected. */
  private pickupPending = false;
  /** Bumped whenever the brush is dipped or rinsed. See `discardPickup`. */
  private pickupGen = 0;
  private pickupOut = new Float32Array(8);
  /**
   * Where the lifted paint goes: the brush's reservoir, via the host.
   *
   * It arrives a frame or two late, because the map is asynchronous and a frame
   * that finds one in flight skips rather than stalls. That is the right trade
   * here — the sheet has already given the paint up, so nothing is riding on
   * WHEN the tuft is told, only that it is told exactly once and told the truth.
   */
  onPickUp: ((water: number, pigment: Float32Array) => void) | null = null;
  private partialsBuf: GPUBuffer;
  /** Stage-2 output: one row of NQ totals. This is the ONLY buffer the host
   * copies from — 64 bytes a frame instead of the ~53 KB of raw partials. */
  private totalsBuf: GPUBuffer;
  private readbackBuf: GPUBuffer;
  /** Debug-only, GPU-resident latch set by a scan immediately after CapillaryFlow. */
  private capillaryAlarmBuf: GPUBuffer;
  /** The measurement path gets its OWN partials buffer. Sharing one with the
   * per-frame readout let a sample overwrite the partials another read was
   * still copying, so a reading could blend two different frames. */
  private samplePartials: GPUBuffer;
  private sampleTotals: GPUBuffer;
  /** The ink grid is four times wider, so it gets its own small reduction path.
   * Sharing the wet reducer would sample only its top-left quarter. */
  private inkPartials: GPUBuffer;
  private inkTotals: GPUBuffer;
  private inkSamplePartials: GPUBuffer;
  private inkSampleTotals: GPUBuffer;
  private inkReadback: GPUBuffer;
  private inkGauge = new Float32Array(INK_Q);
  /** Set whenever something writes the ink band; the only reason to re-reduce
   * it. Starts true so the first frame produces a reading. */
  private inkDirty = true;
  /** Pause the per-frame readout while measuring, so nothing else is in flight. */
  pauseReadback = false;
  /** Off during normal painting: the observer adds one full-grid compute scan. */
  capillaryAlarmEnabled = false;
  /** Debug discriminator; normal painting keeps the fine ink band's work enabled. */
  inkBandTrafficEnabled = true;

  private pipes: Record<string, GPUComputePipeline> = {};
  private params: FluidParams = { ...DEFAULT_FLUID };

  // Adaptive relaxation: size next frame's count from this frame's residual.
  // C97 allows up to 50 with early exit under tau=0.01; the bench settled at ~2
  // under gentle load and must climb when a real stroke injects sharp divergence.
  private relaxIters = 8;
  private readonly relaxMax = 50;
  private readonly tau = 0.01;

  private slotIds: number[] = [];
  private gauges: Gauges = {
    water: 0, film: 0, saturation: 0, pigment: 0, perSlot: new Array(8).fill(0),
    wetCells: 0, meanDivergence: 0, relaxIters: 8, wetPigment: 0, dryPigment: 0,
    inkPigment: 0, inkPerSlot: new Array(8).fill(0),
  };
  private readbackBusy = false;
  private frame = 0;
  /**
   * A blank or settled sheet has no reason to run the whole wet-paint pipeline.
   * This latch wakes on a wet brush deposit and sleeps only after the existing
   * full-sheet gauge reports no wet cells. It is intentionally not a new paint
   * threshold: the shaders remain the authority on when a wash is finished.
   */
  private active = false;
  /** Bumps for every fresh wet input so an older gauge may not stop newer paint. */
  private activityEpoch = 0;

  constructor(gpu: Gpu, n: number, paper: GPUTextureView, inkPaper: GPUTextureView) {
    this.gpu = gpu;
    this.n = n;
    this.paper = paper;
    this.inkPaper = inkPaper;
    const { device } = gpu;

    this.wet0 = new PingPong(device, n, 'wet0');
    this.wet1 = new PingPong(device, n, 'wet1');
    this.wet2 = new PingPong(device, n, 'wet2');
    this.wet3 = new PingPong(device, n, 'wet3');
    this.wet4 = new PingPong(device, n, 'wet4');
    this.wet5 = new PingPong(device, n, 'wet5');
    this.press = new PingPong(device, n, 'press');
    this.dry1a = new PingPong(device, n, 'dry1a');
    this.dry1b = new PingPong(device, n, 'dry1b');
    this.dry2a = new PingPong(device, n, 'dry2a');
    this.dry2b = new PingPong(device, n, 'dry2b');
    this.ink0 = new PingPong(device, INK_RES, 'ink0', INK_FORMAT);
    this.ink1 = new PingPong(device, INK_RES, 'ink1', INK_FORMAT);

    // Params: 24 scalars (6 vec4 worth) + 8 vec4 pigment rows = 224 bytes.
    // MUST match the ArrayBuffer in writeParams and the struct in common.wgsl.
    this.paramsBuf = device.createBuffer({
      size: 24 * 4 + 8 * 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'fluid-params',
    });
    this.fluxBuf = device.createBuffer({
      size: n * n * 4 * 4,
      // COPY_DST so it can be cleared. The ledger is written by flux_compute and
      // read by two passes after it; uninitialised, it seeded exactly 1.0 into
      // cells on a blank sheet. Never bet on lazy init.
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
           | GPUBufferUsage.COPY_SRC, label: 'flux',
    });
    this.freshBuf = device.createBuffer({
      // vec2 per cell: what the deposit just laid here, and the hair pressure.
      // Written for every cell by deposit.wgsl each dispatch, so it needs no
      // clearing - but COPY_DST anyway, because this file's own comment on the
      // flux ledger is right: never bet on lazy init.
      size: n * n * 2 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'fresh-paint',
    });
    this.segBuf = device.createBuffer({
      size: MAX_SEGS * SEG_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'segments',
    });
    this.inkSegBuf = device.createBuffer({
      size: MAX_SEGS * DRY_SEG_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'dry-segments',
    });
    this.ctlBuf = device.createBuffer({
      // Three aligned vec4 groups. Wet deposit reads the first two; dry deposit
      // also reads surface mobility and compaction from the third.
      size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'deposit-ctl',
    });
    this.mixBuf = device.createBuffer({
      size: 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'deposit-mix',
    });
    /* The pickup tally: vehicle, then the eight pigment slots, in fixed point
       because WGSL has no atomic float. Cleared before the frame's first
       deposit chunk and summed across all of them. */
    this.pickupBuf = device.createBuffer({
      size: PICKUP_LANES * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'pickup-tally',
    });
    this.pickupRead = device.createBuffer({
      size: PICKUP_LANES * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ, label: 'pickup-readback',
    });

    const wgPerSide = Math.ceil(n / 16);
    const partialCount = wgPerSide * wgPerSide * NQ;
    this.partialsBuf = device.createBuffer({
      size: partialCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, label: 'partials',
    });
    this.samplePartials = device.createBuffer({
      size: partialCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, label: 'sample-partials',
    });
    // Stage 2 lands here, and only these 64 bytes ever cross to the host.
    const totalBytes = TOTAL_LANES * 4;
    this.totalsBuf = device.createBuffer({
      size: totalBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, label: 'totals',
    });
    this.sampleTotals = device.createBuffer({
      size: totalBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, label: 'sample-totals',
    });
    const inkGroups = Math.ceil(INK_RES / 16);
    const inkPartialBytes = inkGroups * inkGroups * INK_Q * 4;
    this.inkPartials = device.createBuffer({
      size: inkPartialBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, label: 'ink-partials',
    });
    this.inkSamplePartials = device.createBuffer({
      size: inkPartialBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, label: 'ink-sample-partials',
    });
    this.inkTotals = device.createBuffer({
      size: TOTAL_LANES * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, label: 'ink-totals',
    });
    this.inkSampleTotals = device.createBuffer({
      size: TOTAL_LANES * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, label: 'ink-sample-totals',
    });
    this.inkReadback = device.createBuffer({
      size: TOTAL_LANES * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ, label: 'ink-readback',
    });
    this.readbackBuf = device.createBuffer({
      size: totalBytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ, label: 'gauge-readback',
    });
    this.capillaryAlarmBuf = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      label: 'capillary-alarm',
    });

    const mk = (src: string, label: string) => device.createComputePipeline({
      layout: 'auto', label,
      compute: {
        module: device.createShaderModule({ code: `${commonWgsl}\n${src}`, label }),
        entryPoint: 'main',
      },
    });
    this.pipes.deposit = mk(depositWgsl, 'deposit');
    this.pipes.levelFresh = mk(levelFreshWgsl, 'level_fresh');
    this.pipes.vel = mk(velWgsl, 'update_velocities');
    this.pipes.relax = mk(relaxWgsl, 'relax_divergence');
    this.pipes.outward = mk(outwardWgsl, 'flow_outward');
    this.pipes.rim = mk(rimWgsl, 'rim_migration');
    this.pipes.fluxCompute = mk(fluxComputeWgsl, 'flux_compute');
    this.pipes.fluxPig = mk(fluxPigWgsl, 'flux_apply_pigment');
    this.pipes.fluxWater = mk(fluxWaterWgsl, 'flux_apply_water');
    this.pipes.transfer = mk(transferWgsl, 'transfer_pigment');
    this.pipes.capillary = mk(capillaryWgsl, 'capillary_flow');
    this.pipes.capillaryAlarm = mk(capillaryAlarmWgsl, 'capillary_alarm');
    this.pipes.dry = mk(dryWgsl, 'dry_tick');
    this.pipes.bakePush = mk(bakePushWgsl, 'bake_push');
    this.pipes.dryStore = mk(dryStoreWgsl, 'dry_store');
    this.pipes.wetClear = mk(wetClearWgsl, 'wet_clear');
    this.pipes.rewet = mk(rewetWgsl, 'rewet');
    // Fine dry media cannot inherit P.grid: their textures are four times
    // wider than the fluid simulation. Each variant gets its extent from the
    // texture it is actually writing, while the wet shaders stay on P.grid.
    this.pipes.dryDeposit = mk(dryDepositWgsl, 'dry_deposit');
    this.pipes.dryDepositInk = mk(
      dryDepositWgsl
        .replace('let n = i32(P.grid);', 'let n = i32(textureDimensions(dry2a_in).x);')
        .replace(/rgba32float/g, 'rgba16float'),
      'dry_deposit_ink',
    );
    // The ink variant differs by STORAGE FORMAT ALONE. It used to also swap
    // `P.grid` for the texture's own size, which left the params uniform
    // statically unused — `layout: 'auto'` then dropped binding 0, binding it
    // was a validation error, and the whole clear encoder was discarded. See
    // the trap note at the top of zero_fill.wgsl; that shader now sizes itself
    // from `dst` for every resolution, so there is nothing left to patch here.
    this.pipes.zeroInk = mk(zeroWgsl.replace(/rgba32float/g, 'rgba16float'), 'zero_ink');
    this.pipes.reduce = mk(reduceWgsl, 'reduce');
    this.pipes.reduceFinal = mk(reduceFinalWgsl, 'reduce_final');
    this.pipes.reduceInk = mk(reduceInkWgsl, 'reduce_ink');
    this.pipes.reduceInkFinal = mk(reduceInkFinalWgsl, 'reduce_ink_final');
    this.pipes.zero = mk(zeroWgsl, 'zero_fill');

    this.writeParams();
    this.clear();
  }

  /** Views the renderer binds to show suspended + settled pigment and wetness. */
  get views() {
    return {
      wet0: this.wet0.src, wet1: this.wet1.src, wet2: this.wet2.src,
      wet3: this.wet3.src, wet4: this.wet4.src, wet5: this.wet5.src,
      dry1a: this.dry1a.src, dry1b: this.dry1b.src,
      dry2a: this.dry2a.src, dry2b: this.dry2b.src,
      ink0: this.ink0.src, ink1: this.ink1.src,
    };
  }

  get readings(): Gauges { return this.gauges; }
  get isActive(): boolean { return this.active; }

  setParams(p: Partial<FluidParams>) {
    Object.assign(this.params, p);
    this.writeParams();
  }

  /** Which library pigment sits in each of the 8 slots (drives transport params). */
  setSlots(ids: number[]) {
    this.slotIds = ids.slice(0, 8);
    this.writeParams();
  }

  private writeParams() {
    // 24 scalars (six 16-byte groups) then the 8-slot pigment array. The count
    // here, the struct in common.wgsl, and the `96 +` offset below must all
    // agree; a mismatch reads scrambled rows rather than failing.
    const buf = new ArrayBuffer(24 * 4 + 8 * 16);
    const dv = new DataView(buf);
    const p = this.params;
    dv.setUint32(0, this.n, true);
    dv.setUint32(4, this.frame, true);
    dv.setUint32(8, this.relaxIters, true);
    dv.setFloat32(12, p.toothAmp, true);
    dv.setFloat32(16, p.dt, true);
    dv.setFloat32(20, p.viscosity, true);
    dv.setFloat32(24, p.drag, true);
    dv.setFloat32(28, p.dryRate, true);
    dv.setFloat32(32, p.evapRate, true);
    dv.setFloat32(36, p.gravityX, true);
    dv.setFloat32(40, p.gravityY, true);
    dv.setFloat32(44, p.cosAlpha, true);
    dv.setFloat32(48, p.edgeEta, true);
    dv.setFloat32(52, p.paperInfluence, true);
    dv.setFloat32(56, this.frame / 60, true);
    dv.setFloat32(60, p.rewetRate, true);
    dv.setFloat32(64, p.absorptionCoupling, true);
    dv.setFloat32(68, p.gravityResponse, true);
    dv.setFloat32(72, p.wetLayerDrag, true);
    dv.setFloat32(76, p.rimMigration, true);
    dv.setFloat32(80, p.rimReach, true);
    dv.setFloat32(84, p.edgeEvaporation, true);
    dv.setFloat32(88, p.yieldStress, true);
    dv.setFloat32(92, p.teflonMin, true);
    // Pigment transport rows for the active slots (Card 3: rho, omega, gamma).
    for (let i = 0; i < 8; i++) {
      const id = this.slotIds[i];
      const pig = id !== undefined && id >= 0 ? PIGMENTS[id] : undefined;
      const o = 96 + i * 16;
      dv.setFloat32(o + 0, pig ? pig.rho : 0.2, true);
      dv.setFloat32(o + 4, pig ? pig.omega : 3.0, true);
      dv.setFloat32(o + 8, pig ? pig.gamma : 0.3, true);
      dv.setFloat32(o + 12, 0, true);
    }
    this.gpu.device.queue.writeBuffer(this.paramsBuf, 0, buf);
  }

  private bind(pipe: GPUComputePipeline, resources: GPUBindingResource[]): GPUBindGroup {
    return this.gpu.device.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: resources.map((resource, binding) => ({ binding, resource })),
    });
  }

  /** Debug: names in here are skipped (dispatch AND flip) to bisect faults. */
  readonly skip = new Set<string>();

  private dispatchAt(pass: GPUComputePassEncoder, pipe: GPUComputePipeline,
                     n: number, res: GPUBindingResource[]) {
    const g = Math.ceil(n / 8);
    pass.setPipeline(pipe);
    pass.setBindGroup(0, this.bind(pipe, res));
    pass.dispatchWorkgroups(g, g, 1);
  }

  private dispatch(pass: GPUComputePassEncoder, pipe: GPUComputePipeline, res: GPUBindingResource[]) {
    const g = Math.ceil(this.n / 8);
    pass.setPipeline(pipe);
    pass.setBindGroup(0, this.bind(pipe, res));
    pass.dispatchWorkgroups(g, g, 1);
  }

  /** Zero every wet field explicitly — never trust lazy init. */
  clear() {
    this.active = false;
    this.activityEpoch++;
    const enc = this.gpu.device.createCommandEncoder();
    const pass = enc.beginComputePass({ label: 'zero' });
    const all = [this.wet0, this.wet1, this.wet2, this.wet3, this.wet4, this.wet5, this.press,
                 this.dry1a, this.dry1b, this.dry2a, this.dry2b];
    for (const pp of all) {
      for (const v of pp.view) {
        this.dispatch(pass, this.pipes.zero, [v]);
      }
    }
    if (this.inkBandTrafficEnabled) {
      for (const pp of [this.ink0, this.ink1]) {
        for (const v of pp.view) {
          this.dispatchAt(pass, this.pipes.zeroInk, INK_RES, [v]);
        }
      }
    }
    pass.end();
    enc.clearBuffer(this.fluxBuf);
    enc.clearBuffer(this.capillaryAlarmBuf);
    // A tally standing from a stroke on the old sheet would be credited to the
    // brush after the sheet it came from had ceased to exist.
    enc.clearBuffer(this.pickupBuf);
    this.pickupPending = false;
    this.inkDirty = this.inkBandTrafficEnabled;
    this.gpu.device.queue.submit([enc.finish()]);
  }

  /** Bounding box of a run of segments, padded by each contact shape. */
  /** How many distinct brush solves this chunk carries. `stepId` is lane 10 and
   *  segments arrive in solve order, so a change of id is a new contact. This is
   *  the honest measure of how much brush travel a frame bundled up. */
  private solveSteps(segments: Float32Array, from: number, n: number): number {
    let steps = 0;
    let last = NaN;
    for (let i = 0; i < n; i++) {
      const id = segments[(from + i) * SEG_FLOATS + 10];
      if (id !== last) { steps++; last = id; }
    }
    return steps;
  }

  private segBounds(segments: Float32Array, from: number, n: number,
                    stride = SEG_FLOATS, hasTiltedContact = false) {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (let i = 0; i < n; i++) {
      const o = (from + i) * stride;
      const r = segments[o + 4] + 1;
      const ex = hasTiltedContact ? Math.abs(segments[o + 8]) : 0;
      const ey = hasTiltedContact ? Math.abs(segments[o + 9]) : 0;
      minX = Math.min(minX, segments[o] - r - ex, segments[o + 2] - r - ex);
      maxX = Math.max(maxX, segments[o] + r + ex, segments[o + 2] + r + ex);
      minY = Math.min(minY, segments[o + 1] - r - ey, segments[o + 3] - r - ey);
      maxY = Math.max(maxY, segments[o + 1] + r + ey, segments[o + 3] + r + ey);
    }
    return new Float32Array([n, minX, minY, maxX, maxY, 0, 0, 0, 0, 0, 0, 0]);
  }

  /**
   * Lay dry media (P7) — graphite, ballpoint, and future rows on `DryMedium`.
   *
   * Deliberately NOT part of `step()`: no fluid pass runs for a dry medium, so
   * this deposits into the permanent dry floor and returns. Call it whether or
   * not the fluid is also stepping — a pencil line over a wet wash is two
   * independent things happening on the same sheet, which is what it is in life.
   */
  depositDry(segments: Float32Array<ArrayBuffer>, segCount: number,
             mixWeights: Float32Array<ArrayBuffer>, edge = 1,
             profile: 'round' | 'chisel' = 'round', surfaceMobility = 0,
             compactionAmount = 1) {
    if (segCount <= 0) return;
    const { device } = this.gpu;
    device.queue.writeBuffer(this.mixBuf, 0, mixWeights);

    // Chunked and submitted per chunk for the same reason the wet deposit is:
    // writeBuffer runs on the queue timeline, so recording several chunks into
    // one encoder leaves every dispatch reading the LAST write.
    for (let done = 0; done < segCount; done += MAX_SEGS) {
      const n = Math.min(segCount - done, MAX_SEGS);
      // Stroke input is expressed in the 512-cell simulation grid. Scale the
      // footprint itself—not its pigment amount—into the 2048-cell dry grid.
      // That keeps a 0.5 mm pen narrow while preserving its ink-per-distance.
      const scale = INK_RES / this.n;
      for (let i = 0; i < n; i++) {
        const src = (done + i) * DRY_SEG_FLOATS;
        const dst = i * DRY_SEG_FLOATS;
        this.inkSegs[dst] = segments[src] * scale;
        this.inkSegs[dst + 1] = segments[src + 1] * scale;
        this.inkSegs[dst + 2] = segments[src + 2] * scale;
        this.inkSegs[dst + 3] = segments[src + 3] * scale;
        this.inkSegs[dst + 4] = segments[src + 4] * scale;
        this.inkSegs[dst + 5] = segments[src + 5];
        this.inkSegs[dst + 6] = segments[src + 6];
        this.inkSegs[dst + 7] = segments[src + 7];
        this.inkSegs[dst + 8] = segments[src + 8] * scale;
        this.inkSegs[dst + 9] = segments[src + 9] * scale;
      }
      device.queue.writeBuffer(
        this.inkSegBuf, 0, this.inkSegs, 0, n * DRY_SEG_FLOATS);
      const ctl = this.segBounds(this.inkSegs, 0, n, DRY_SEG_FLOATS, true);
      ctl[5] = edge;                    // rim falloff, per medium
      ctl[6] = profile === 'chisel' ? 1 : 0;
      ctl[8] = Math.min(0.24, Math.max(0, surfaceMobility));
      ctl[9] = Math.max(1e-4, compactionAmount);
      device.queue.writeBuffer(this.ctlBuf, 0, ctl);

      const enc = device.createCommandEncoder({ label: 'dry-deposit' });
      const pass = enc.beginComputePass();
      this.dispatchAt(pass, this.pipes.dryDepositInk, INK_RES, [
        { buffer: this.paramsBuf }, { buffer: this.inkSegBuf },
        { buffer: this.ctlBuf }, { buffer: this.mixBuf },
        this.ink0.src, this.ink1.src, this.inkPaper,
        this.ink0.dst, this.ink1.dst,
      ]);
      pass.end();
      device.queue.submit([enc.finish()]);
      this.ink0.flip(); this.ink1.flip();
      this.inkDirty = true;
    }
  }

  /**
   * Throw away any pickup the brush has not been told about yet.
   *
   * Call this when the brush is dipped or rinsed. What it lifted a moment ago
   * belongs to the brush as it was, and a dip replaces that brush's whole load
   * — so crediting it afterwards puts the last stroke's colour onto a tuft that
   * has just been washed and recharged.
   *
   * [MEASURED 2026-08-25] Without this, an orange stroke laid across a blue
   * stripe came out carrying blue from its FIRST cell — before it had reached
   * the stripe. The blue was the previous stroke's, arriving late.
   */
  discardPickup() {
    this.pickupGen++;
    this.pickupPending = false;
    this.gpu.device.queue.writeBuffer(this.pickupBuf, 0, this.pickupZero);
  }

  /**
   * Hand what the tuft lifted back to the brush.
   *
   * The tally is NEVER cleared at the top of a frame, and that is the whole
   * trick. A frame that finds a map still in flight has to skip its own read
   * rather than stall the queue, and if the tally were per-frame that skipped
   * frame's paint would simply cease to exist — debited from the sheet by the
   * shader and never credited to anything. So the tally accumulates, the copy
   * takes everything standing, and the wipe is queued immediately behind the
   * copy. A skip therefore costs a frame of lag and nothing else.
   *
   * `writeBuffer` and `submit` share the queue timeline in call order, which is
   * what makes "copy, then wipe" safe to write as two separate calls.
   */
  private drainPickup() {
    const { device } = this.gpu;
    if (!this.onPickUp) {
      // Nobody is listening, so nothing may be lifted into limbo. Wipe it.
      device.queue.writeBuffer(this.pickupBuf, 0, this.pickupZero);
      return;
    }
    if (this.pickupBusy) return;
    this.pickupBusy = true;
    const gen = this.pickupGen;
    const enc = device.createCommandEncoder({ label: 'pickup-read' });
    enc.copyBufferToBuffer(this.pickupBuf, 0, this.pickupRead, 0, this.pickupRead.size);
    device.queue.submit([enc.finish()]);
    device.queue.writeBuffer(this.pickupBuf, 0, this.pickupZero);
    this.pickupRead.mapAsync(GPUMapMode.READ).then(() => {
      const raw = new Uint32Array(this.pickupRead.getMappedRange().slice(0));
      this.pickupRead.unmap();
      this.pickupBusy = false;
      // Dipped or rinsed while this was in the post: it belongs to a brush that
      // no longer exists. See `discardPickup`.
      if (gen !== this.pickupGen) { this.pickupPending = false; return; }
      const water = raw[0] / PICKUP_TALLY;
      let any = water;
      for (let k = 0; k < 8; k++) {
        this.pickupOut[k] = raw[k + 1] / PICKUP_TALLY;
        any += this.pickupOut[k];
      }
      // Nothing came back, so the buffer is genuinely empty and may rest.
      if (any > 0) this.onPickUp?.(water, this.pickupOut);
      else this.pickupPending = false;
    }).catch(() => { this.pickupBusy = false; });
  }

  /**
   * Advance one frame. `segments` are resampled stroke pieces in grid space —
   * the host must space them <= 1 cell apart (Card 6; otherwise strokes bead).
   */
  step(segments: Float32Array<ArrayBuffer>, segCount: number, mixWeights: Float32Array<ArrayBuffer>,
       travelX = 0, travelY = 0, brushTake = 0, brushGrab = 0) {
    // Do not continually simulate an untouched sheet. The first wet footprint
    // wakes the solver; after that the normal gauge decides when it may rest.
    if (segCount > 0) {
      this.active = true;
      this.activityEpoch++;
    }
    if (!this.active) return false;
    const activityEpoch = this.activityEpoch;
    const { device } = this.gpu;
    this.frame++;
    this.writeParams();

    device.queue.writeBuffer(this.mixBuf, 0, mixWeights);
    const U = { buffer: this.paramsBuf };

    // 1 — deposit (BrushContact + Transfer). A frame's footprint can exceed one
    // buffer: a fast flick with a many-bristled brush emits thousands of hair
    // segments. Dispatch it in chunks rather than truncating — dropping the tail
    // silently loses paint, which the conservation gauge would then report as a
    // leak that isn't one.
    //
    // Each chunk is submitted on its own, because writeBuffer runs on the queue
    // timeline: recording several chunks into one encoder would leave every
    // dispatch reading whatever the LAST write left in the buffer.
    const total = Math.max(0, segCount);
    for (let done = 0; done < total; done += MAX_SEGS) {
      const n = Math.min(total - done, MAX_SEGS);
      device.queue.writeBuffer(
        this.segBuf, 0, segments, done * SEG_FLOATS, n * SEG_FLOATS);
      /* Where the brush went, for the smear. Lanes 5 and 6 are spare in the
         wet control block; the dry path writes its own meanings into the same
         two, and each writes immediately before its own dispatch. */
      const ctl = this.segBounds(segments, done, n);
      ctl[5] = travelX;
      ctl[6] = travelY;
      ctl[7] = this.params.smearStrength;
      /* The pickup, in the two lanes the dry path uses for its own meanings.
         Safe for the same reason lanes 5 and 6 are: each path writes the whole
         block immediately before its own dispatch. */
      ctl[8] = Math.max(0, this.params.upRate);
      ctl[9] = Math.max(0, Math.min(1, brushTake));
      /* The tuft's grab before the room clamp. Lane 10 is spare in both paths.
         The shader divides lane 9 by this to recover how full the tuft is, so
         the drink and the shove are two shares of ONE grab and cannot drift. */
      ctl[10] = Math.max(0, Math.min(1, brushGrab));
      device.queue.writeBuffer(this.ctlBuf, 0, ctl);

      const denc = device.createCommandEncoder({ label: 'deposit-chunk' });
      const dpass = denc.beginComputePass();
      this.dispatch(dpass, this.pipes.deposit, [
        U, { buffer: this.segBuf }, { buffer: this.ctlBuf }, { buffer: this.mixBuf },
        this.wet0.src, this.wet1.src, this.wet2.src, this.wet5.src,
        this.wet0.dst, this.wet1.dst, this.wet2.dst, this.wet5.dst,
        this.paper, { buffer: this.fluxBuf }, { buffer: this.pickupBuf },
        { buffer: this.freshBuf },
      ]);
      dpass.end();
      this.wet0.flip(); this.wet1.flip(); this.wet2.flip(); this.wet5.flip();

      /* Move what the brush just shoved. The deposit wrote it as an outflow per
         cell; these are the same two appliers the fluid uses, so the smear is
         carried by the one conservative ledger rather than a second one.
         Pigment BEFORE water — the fraction leaving is measured against the
         vehicle present before the move, which is what makes a dirty brush
         drag one colour through another instead of bleaching it. */
      /* Fresh-paint levelling, for pastes. TWO things make it frame-invariant,
         and it took both.

         (1) It MUST be its own pass. It compares each cell's new height with
         its neighbours' NEW heights, and inside the deposit those do not exist
         yet — a cell there compared post-deposit self against pre-deposit
         neighbours, which was the whole of oil's fish scales.

         (2) It must run once per BRUSH SOLVE STEP, not once per browser frame.
         Levelling is a smoothing sweep, and one sweep over a frame carrying
         sixteen cells of travel is not the same as sixteen sweeps over one cell
         each — the second is what a slow stroke gets, and the artist confirmed
         by eye on 2026-08-29 that slow strokes come out visibly cleaner. So the
         sweep count follows the paint, and the per-sweep budget is divided by
         it, leaving the TOTAL paint moved identical however the stroke is cut
         into frames. docs/19 E7/E8.

         Cost is bounded: the cap is LEVEL_SWEEP_MAX, and the expensive case is
         exactly the fast flick that currently looks worst, which is brief. The
         shader returns immediately for any zero-yield medium, so watercolour
         pays one cheap dispatch and nothing else. */
      const sweeps = this.params.yieldStress > 0
        ? Math.max(1, Math.min(LEVEL_SWEEP_MAX, this.solveSteps(segments, done, n)))
        : 1;
      for (let sweep = 0; sweep < sweeps; sweep++) {
        ctl[11] = sweeps;
        device.queue.writeBuffer(this.ctlBuf, 0, ctl);
        const lpass = denc.beginComputePass({ label: 'level-fresh' });
        this.dispatch(lpass, this.pipes.levelFresh, [
          U, this.wet0.src, { buffer: this.ctlBuf }, { buffer: this.freshBuf },
          { buffer: this.fluxBuf },
        ]);
        lpass.end();

        /* Every wet material, matching the shader. Gating this on a yield
           stress would have left watercolour writing a smear flux that nothing
           applied — and `flux_compute` overwrites the buffer later in the
           frame, so it would have been discarded without a trace. Only runs
           when there are segments, so it costs an idle sheet nothing.
           Pigment BEFORE water: the fraction leaving is measured against the
           vehicle present before the move, which is what makes a dirty brush
           drag one colour through another instead of bleaching it. */
        const spass = denc.beginComputePass({ label: 'smear' });
        this.dispatch(spass, this.pipes.fluxPig, [
          U, this.wet0.src, this.wet1.src, this.wet2.src, { buffer: this.fluxBuf },
          this.wet1.dst, this.wet2.dst,
        ]);
        this.wet1.flip(); this.wet2.flip();
        this.dispatch(spass, this.pipes.fluxWater, [
          U, this.wet0.src, { buffer: this.fluxBuf }, this.wet0.dst,
        ]);
        this.wet0.flip();
        spass.end();
        /* The brush's shove is in the ledger for the FIRST sweep only; clearing
           here stops later sweeps re-applying it, and leaves them carrying
           levelling alone. flux_compute overwrites this buffer later in the
           frame regardless, so clearing costs nothing downstream. */
        denc.clearBuffer(this.fluxBuf);
      }
      device.queue.submit([denc.finish()]);
    }

    /* NOT `if (segCount > 0)`. The last frames of a stroke add to the tally
       after the final footprint has already been collected, and gating the
       drain on contact left that sitting in the buffer until some later stroke
       happened to sweep it up — which read as a brush going dirty long after it
       was rinsed. The latch keeps an idle sheet from paying for a readback
       without leaving the hole open. */
    if (segCount > 0 && this.params.upRate > 0) this.pickupPending = true;
    if (this.pickupPending) this.drainPickup();

    const enc = device.createCommandEncoder({ label: 'fluid-frame' });
    // Clear the ledger every frame, before anything reads it. Uninitialised, it
    // seeded exactly 1.0 into cells on a blank sheet — two passes read what
    // flux_compute writes, and betting on full write coverage of a buffer that
    // large cost days. This is one of the two changes that closed the
    // conservation fault; the sheet now measures flat. See docs/11.
    enc.clearBuffer(this.fluxBuf);
    const pass = enc.beginComputePass({ label: 'fluid' });

    const run = (name: string, fn: () => void) => { if (!this.skip.has(name)) fn(); };

    /* A paste has no velocity field. For a material with a yield stress the
       flux pass moves paint by slump — the steepness of the pile against the
       yield — and reads neither the velocities nor the pressure. So these two
       are skipped rather than computed and ignored, which is both the honest
       statement of the model and, as it happens, the removal of the two most
       expensive passes in the frame. */
    /* Which solver, decided by what the MATERIAL is and not by where a dial
       sits. ~~`yieldStress > 0`~~ RETRACTED 2026-08-25: that made Body a
       solver switch as well as a stiffness, so sliding it to zero moved oil
       onto the water path in the middle of a painting and printed a
       right-angled grid into the paint. docs/15 E4. */
    const paste = !this.params.hasCurrent || this.params.yieldStress > 0;

    // 2 — UpdateVelocities
    if (!paste) run('vel', () => {
      this.dispatch(pass, this.pipes.vel, [
        U, this.wet0.src, this.wet5.src, this.paper, this.wet0.dst,
      ]);
      this.wet0.flip();
    });

    // 3 — RelaxDivergence, N iterations
    if (!paste) run('relax', () => {
      for (let i = 0; i < this.relaxIters; i++) {
        this.dispatch(pass, this.pipes.relax, [U, this.wet0.src, this.wet0.dst]);
        this.wet0.flip();
      }
    });

    // 4 — FlowOutward (edge darkening bias into its own scratch field)
    run('outward', () => {
      this.dispatch(pass, this.pipes.outward, [U, this.wet0.src, this.press.dst]);
      this.press.flip();
    });

    // 4b — RimMigration (the pigment side of edge darkening, E9). Skipped
    // entirely at rimMigration = 0, so an oil row and the pre-E9 baseline cost
    // nothing and reproduce to all digits rather than merely closely.
    run('rim', () => {
      if (this.params.rimMigration <= 0) return;
      this.dispatch(pass, this.pipes.rim, [
        U, this.wet0.src, this.press.src, this.wet1.src, this.wet2.src,
        this.wet1.dst, this.wet2.dst,
      ]);
      this.wet1.flip(); this.wet2.flip();
    });

    // 5 — flux ledger, then pigment BEFORE water (denominator order matters)
    run('fluxCompute', () => {
      this.dispatch(pass, this.pipes.fluxCompute, [U, this.wet0.src, this.press.src, { buffer: this.fluxBuf }]);
    });
    run('fluxPig', () => {
      this.dispatch(pass, this.pipes.fluxPig, [
        U, this.wet0.src, this.wet1.src, this.wet2.src, { buffer: this.fluxBuf },
        this.wet1.dst, this.wet2.dst,
      ]);
      this.wet1.flip(); this.wet2.flip();
    });
    run('fluxWater', () => {
      this.dispatch(pass, this.pipes.fluxWater, [U, this.wet0.src, { buffer: this.fluxBuf }, this.wet0.dst]);
      this.wet0.flip();
    });

    // 6 — TransferPigment (g <-> d): granulation and lifting
    run('transfer', () => {
      this.dispatch(pass, this.pipes.transfer, [
        U, this.wet0.src, this.wet1.src, this.wet2.src, this.wet3.src, this.wet4.src, this.paper,
        this.wet1.dst, this.wet2.dst, this.wet3.dst, this.wet4.dst,
      ]);
      this.wet1.flip(); this.wet2.flip(); this.wet3.flip(); this.wet4.flip();
    });

    // 7 — CapillaryFlow (absorption + creep; backruns)
    run('capillary', () => {
      this.dispatch(pass, this.pipes.capillary, [
        U, this.wet0.src, this.wet5.src, this.paper, this.wet0.dst, this.wet5.dst,
      ]);
      this.wet0.flip(); this.wet5.flip();
      if (this.capillaryAlarmEnabled) {
        this.dispatch(pass, this.pipes.capillaryAlarm, [
          this.wet5.src, { buffer: this.capillaryAlarmBuf },
        ]);
      }
    });

    // 8 — ReWet. Water reaching a dried layer brings its pigment back into
    // suspension — the thing that makes watercolour NOT a one-way door. Runs
    // before DryTick so freshly re-wetted paint gets a frame of fluid life
    // rather than being handed straight back to the dry band.
    run('rewet', () => {
      this.dispatch(pass, this.pipes.rewet, [
        U, this.wet0.src, this.wet1.src, this.wet2.src, this.dry1a.src, this.dry1b.src,
        this.wet1.dst, this.wet2.dst, this.dry1a.dst, this.dry1b.dst,
      ]);
      this.wet1.flip(); this.wet2.flip(); this.dry1a.flip(); this.dry1b.flip();
    });

    // 9 — DryTick (the only pass that removes water). Flags cells that just dried.
    run('dry', () => {
      // press.src carries the blurred wet mask that edge-weighted evaporation
      // reads. It was written by `outward` earlier this frame and not touched
      // since, so this is the current frame's contact line, not last frame's.
      this.dispatch(pass, this.pipes.dry, [
        U, this.wet0.src, this.wet5.src, this.press.src, this.wet0.dst, this.wet5.dst,
      ]);
      this.wet0.flip(); this.wet5.flip();
    });

    // 10 — the drying handoff, in three steps because WebGPU core allows only
    // four storage textures per stage and the whole move writes ten. Order
    // matters: push dry1 down BEFORE overwriting it, and clear the wet band last,
    // so the pigment is MOVED rather than duplicated.
    run('handoff', () => {
      if (!this.params.handoffEnabled) return;
      this.dispatch(pass, this.pipes.bakePush, [
        U, this.wet5.src, this.dry1a.src, this.dry1b.src, this.dry2a.src, this.dry2b.src,
        this.dry2a.dst, this.dry2b.dst,
      ]);
      this.dry2a.flip(); this.dry2b.flip();

      this.dispatch(pass, this.pipes.dryStore, [
        U, this.wet5.src, this.wet1.src, this.wet2.src, this.wet3.src, this.wet4.src,
        this.dry1a.src, this.dry1b.src, this.dry1a.dst, this.dry1b.dst,
      ]);
      this.dry1a.flip(); this.dry1b.flip();

      this.dispatch(pass, this.pipes.wetClear, [
        U, this.wet5.src, this.wet1.src, this.wet2.src, this.wet3.src, this.wet4.src,
        this.wet1.dst, this.wet2.dst, this.wet3.dst, this.wet4.dst,
      ]);
      this.wet1.flip(); this.wet2.flip(); this.wet3.flip(); this.wet4.flip();
    });

    // 11 — gauges, reduced all the way down on the GPU
    this.recordGauge(pass, this.partialsBuf, this.totalsBuf);
    // The ink band has no physics: nothing moves in it between deposits, so its
    // total cannot change unless a dry tool put something there. Reducing four
    // million texels every frame to re-derive a number that did not move was
    // most of the idle GPU load. `inkTotals` keeps its last value, which is
    // still the right one.
    if (this.inkBandTrafficEnabled && this.inkDirty) {
      this.recordInkGauge(pass, this.inkPartials, this.inkTotals);
      this.inkDirty = false;
    }
    pass.end();

    if (!this.readbackBusy && !this.pauseReadback) {
      enc.copyBufferToBuffer(this.totalsBuf, 0, this.readbackBuf, 0, this.readbackBuf.size);
      enc.copyBufferToBuffer(this.inkTotals, 0, this.inkReadback, 0, this.inkReadback.size);
    }
    device.queue.submit([enc.finish()]);

    if (!this.readbackBusy && !this.pauseReadback) {
      this.readbackBusy = true;
      Promise.all([this.readbackBuf.mapAsync(GPUMapMode.READ), this.inkReadback.mapAsync(GPUMapMode.READ)]).then(() => {
        const data = new Float32Array(this.readbackBuf.getMappedRange().slice(0));
        this.inkGauge.set(new Float32Array(this.inkReadback.getMappedRange().slice(0, INK_Q * 4)));
        this.readbackBuf.unmap();
        this.inkReadback.unmap();
        this.accumulate(data);
        if (this.activityEpoch === activityEpoch && this.gauges.wetCells === 0) this.active = false;
        this.readbackBusy = false;
      }).catch(() => { this.readbackBusy = false; });
    }
    return this.active;
  }

  /**
   * Record both reduction stages into an open compute pass: every cell -> one
   * partial per workgroup -> one row of NQ totals. Dispatches inside a pass are
   * ordered and synchronised, so stage 2 sees stage 1's writes.
   */
  private recordGauge(pass: GPUComputePassEncoder, partials: GPUBuffer, totals: GPUBuffer) {
    const rg = Math.ceil(this.n / 16);
    pass.setPipeline(this.pipes.reduce);
    pass.setBindGroup(0, this.bind(this.pipes.reduce, [
      { buffer: this.paramsBuf },
      this.wet0.src, this.wet1.src, this.wet2.src, this.wet3.src, this.wet4.src, this.wet5.src,
      { buffer: partials },
      // The dry layers hold pigment too. Leave them out of the ledger and the
      // gauge reports a total collapse the moment a wash dries — a phantom leak
      // that is really just paint changing band.
      this.dry1a.src, this.dry1b.src, this.dry2a.src, this.dry2b.src,
    ]));
    pass.dispatchWorkgroups(rg, rg, 1);

    pass.setPipeline(this.pipes.reduceFinal);
    pass.setBindGroup(0, this.bind(this.pipes.reduceFinal, [
      { buffer: partials }, { buffer: totals },
    ]));
    pass.dispatchWorkgroups(1, 1, 1);
  }

  /** Reduce the fine ink band separately, then merge it into the live ledger on
   * the CPU. It is a display-resolution band, so it must not inherit `P.grid`. */
  private recordInkGauge(pass: GPUComputePassEncoder, partials: GPUBuffer, totals: GPUBuffer) {
    const g = Math.ceil(INK_RES / 16);
    pass.setPipeline(this.pipes.reduceInk);
    pass.setBindGroup(0, this.bind(this.pipes.reduceInk, [
      this.ink0.src, this.ink1.src, { buffer: partials },
    ]));
    pass.dispatchWorkgroups(g, g, 1);
    pass.setPipeline(this.pipes.reduceInkFinal);
    pass.setBindGroup(0, this.bind(this.pipes.reduceInkFinal, [
      { buffer: partials }, { buffer: totals },
    ]));
    pass.dispatchWorkgroups(1, 1, 1);
  }

  /**
   * Read the gauges NOW. `readings` is filled by a readback that skips frames
   * whenever a map is in flight, so it can describe a state many frames old —
   * fine for a HUD, useless for measurement, and it manufactured a whole
   * phantom bisect before that was understood.
   */
  async sampleGauges(): Promise<Gauges> {
    const { device } = this.gpu;
    const bytes = this.sampleTotals.size;
    const rb = device.createBuffer({
      size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = device.createCommandEncoder({ label: 'gauge-sample' });
    const pass = enc.beginComputePass();
    this.recordGauge(pass, this.samplePartials, this.sampleTotals);
    this.recordInkGauge(pass, this.inkSamplePartials, this.inkSampleTotals);
    pass.end();
    enc.copyBufferToBuffer(this.sampleTotals, 0, rb, 0, bytes);
    const inkRb = device.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyBufferToBuffer(this.inkSampleTotals, 0, inkRb, 0, bytes);
    device.queue.submit([enc.finish()]);
    await Promise.all([rb.mapAsync(GPUMapMode.READ), inkRb.mapAsync(GPUMapMode.READ)]);
    const data = new Float32Array(rb.getMappedRange().slice(0));
    const ink = new Float32Array(inkRb.getMappedRange().slice(0, INK_Q * 4));
    rb.unmap(); rb.destroy(); inkRb.unmap(); inkRb.destroy();
    return this.summarise(data, ink);
  }

  /** Dump the flux ledger (vec4 per cell: out east, west, south, north). */
  async dumpFlux(): Promise<Float32Array> {
    const { device } = this.gpu;
    const rb = device.createBuffer({
      size: this.fluxBuf.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = device.createCommandEncoder({ label: 'dump-flux' });
    enc.copyBufferToBuffer(this.fluxBuf, 0, rb, 0, this.fluxBuf.size);
    device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(rb.getMappedRange().slice(0));
    rb.unmap(); rb.destroy();
    return out;
  }

  /** Dump a whole fluid texture to the CPU as RGBA f32, for inspection. */
  async dump(name: string): Promise<Float32Array> {
    const map: Record<string, PingPong> = {
      wet0: this.wet0, wet1: this.wet1, wet2: this.wet2,
      wet3: this.wet3, wet4: this.wet4, wet5: this.wet5, press: this.press,
      dry1a: this.dry1a, dry1b: this.dry1b, dry2a: this.dry2a, dry2b: this.dry2b,
    };
    const pp = map[name];
    if (!pp) throw new Error(`no such texture: ${name}`);
    const { device } = this.gpu;
    const bytesPerRow = this.n * 16;          // 512*16 = 8192, already 256-aligned
    const rb = device.createBuffer({
      size: bytesPerRow * this.n,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = device.createCommandEncoder({ label: `dump-${name}` });
    enc.copyTextureToBuffer(
      { texture: pp.srcTex }, { buffer: rb, bytesPerRow }, [this.n, this.n]);
    device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(rb.getMappedRange().slice(0));
    rb.unmap(); rb.destroy();
    return out;
  }

  /**
   * Compare the compute gauge and a raw texture copy from one frozen GPU command.
   * Debug-only: it does not advance or alter the simulation.
   */
  async compareWet5ReadPaths(): Promise<{
    gaugeSaturation: number; dumpedSaturation: number; dumpedPeak: number; cur: number;
  }> {
    const { device } = this.gpu;
    const gaugeRb = device.createBuffer({
      size: this.sampleTotals.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const bytesPerRow = this.n * 16;
    const texRb = device.createBuffer({
      size: bytesPerRow * this.n,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = device.createCommandEncoder({ label: 'compare-wet5-read-paths' });
    const pass = enc.beginComputePass();
    this.recordGauge(pass, this.samplePartials, this.sampleTotals);
    pass.end();
    enc.copyBufferToBuffer(this.sampleTotals, 0, gaugeRb, 0, this.sampleTotals.size);
    enc.copyTextureToBuffer(
      { texture: this.wet5.srcTex }, { buffer: texRb, bytesPerRow }, [this.n, this.n]);
    const cur = this.wet5.cur;
    device.queue.submit([enc.finish()]);
    await Promise.all([gaugeRb.mapAsync(GPUMapMode.READ), texRb.mapAsync(GPUMapMode.READ)]);
    const gauge = new Float32Array(gaugeRb.getMappedRange().slice(0));
    const tex = new Float32Array(texRb.getMappedRange().slice(0));
    gaugeRb.unmap(); gaugeRb.destroy(); texRb.unmap(); texRb.destroy();

    let dumpedSaturation = 0;
    let dumpedPeak = -Infinity;
    for (let i = 0; i < tex.length; i += 4) {
      const saturation = tex[i];
      dumpedSaturation += saturation;
      if (saturation > dumpedPeak) dumpedPeak = saturation;
    }
    return { gaugeSaturation: gauge[1], dumpedSaturation, dumpedPeak, cur };
  }

  /** Read the latched post-capillary alarm once, without resetting it. */
  async readCapillaryAlarm(): Promise<number> {
    const { device } = this.gpu;
    const rb = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      label: 'capillary-alarm-readback',
    });
    const enc = device.createCommandEncoder({ label: 'read-capillary-alarm' });
    enc.copyBufferToBuffer(this.capillaryAlarmBuf, 0, rb, 0, 4);
    device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const value = new Uint32Array(rb.getMappedRange().slice(0))[0];
    rb.unmap();
    rb.destroy();
    return value;
  }

  /**
   * Turn one row of GPU totals into a reading. Pure; no side effects.
   * The summing now happens in reduce_final — this reads lane by lane, and must
   * NOT re-fold the row, or the padding lanes would be counted as data.
   */
  private summarise(data: Float32Array, ink = this.inkGauge): Gauges {
    const q = new Float64Array(NQ);
    for (let k = 0; k < NQ; k++) q[k] = data[k] ?? 0;
    const perSlot = Array.from({ length: 8 }, (_, k) => q[2 + k]);
    const inkPerSlot = Array.from({ length: 8 }, (_, k) => ink[k] ?? 0);
    const wetCells = q[11];
    return {
      film: q[0], saturation: q[1], water: q[0] + q[1],
      pigment: perSlot.reduce((a, b) => a + b, 0), perSlot, wetCells,
      meanDivergence: wetCells > 0 ? q[12] / wetCells : 0,
      relaxIters: this.relaxIters,
      wetPigment: q[13],
      dryPigment: q[14],
      inkPigment: inkPerSlot.reduce((a, b) => a + b, 0),
      inkPerSlot,
    };
  }

  /** Sum the per-workgroup partials on the CPU and update the adaptive count. */
  private accumulate(data: Float32Array) {
    this.gauges = this.summarise(data);
    const meanDiv = this.gauges.meanDivergence;
    if (meanDiv > this.tau * 2) {
      this.relaxIters = Math.min(this.relaxMax, this.relaxIters + 4);
    } else if (meanDiv < this.tau * 0.5) {
      this.relaxIters = Math.max(2, this.relaxIters - 1);
    }
  }
}

export { MAX_SEGS, SEG_FLOATS, DRY_SEG_FLOATS };
