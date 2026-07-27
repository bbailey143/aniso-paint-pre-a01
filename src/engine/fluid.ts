// FluidEngine — the wet band (P4).
//
// Ports the main-branch bench's validated C97 shallow-water passes into the
// TS+WebGPU schema. The pass ORDER is part of the contract, not a detail:
//
//   Deposit -> UpdateVelocities -> RelaxDivergence xN -> FlowOutward
//           -> FluxCompute -> MovePigment -> MoveWater
//           -> TransferPigment -> CapillaryFlow -> DryTick
//
// MovePigment must run before MoveWater: the fraction of pigment leaving a cell
// is (water leaving / water present BEFORE the move). Update water first and
// the pass silently reads the wrong denominator.
//
// Resolution strategy (invariant 4): the sim grid is coarser than the display.
// The physics does not need display resolution; the visual layer does.

import type { Gpu } from './gpu';
import { PIGMENTS } from '../color/pigments';

import commonWgsl from './shaders/fluid/common.wgsl?raw';
import depositWgsl from './shaders/fluid/deposit.wgsl?raw';
import velWgsl from './shaders/fluid/update_velocities.wgsl?raw';
import relaxWgsl from './shaders/fluid/relax_divergence.wgsl?raw';
import outwardWgsl from './shaders/fluid/flow_outward.wgsl?raw';
import fluxComputeWgsl from './shaders/fluid/flux_compute.wgsl?raw';
import fluxPigWgsl from './shaders/fluid/flux_apply_pigment.wgsl?raw';
import fluxWaterWgsl from './shaders/fluid/flux_apply_water.wgsl?raw';
import transferWgsl from './shaders/fluid/transfer_pigment.wgsl?raw';
import capillaryWgsl from './shaders/fluid/capillary_flow.wgsl?raw';
import dryWgsl from './shaders/fluid/dry_tick.wgsl?raw';
import reduceWgsl from './shaders/fluid/reduce.wgsl?raw';
import zeroWgsl from './shaders/fluid/zero_fill.wgsl?raw';

const NQ = 13;                 // quantities per reduce workgroup
// Footprint segments per frame. The brush emits one per contacting bristle
// segment per resampled step, so this is bristles x contacts x substeps.
const MAX_SEGS = 8192;
const SEG_FLOATS = 8;          // vec2 a, vec2 b, radius, water, pigment, pad

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
}

export const DEFAULT_FLUID: FluidParams = {
  dt: 1.0,
  viscosity: 0.1,        // C97 mu
  drag: 0.01,            // C97 kappa
  dryRate: 0.0015,
  evapRate: 0.0,         // off by default so conservation can be checked
  gravityX: 0,
  gravityY: 0,
  cosAlpha: 1.0,
  edgeEta: 0.03,
  paperInfluence: 0.10,
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

/** A ping-pong pair of same-format textures. */
class PingPong {
  tex: GPUTexture[];
  view: GPUTextureView[];
  cur = 0;
  constructor(device: GPUDevice, n: number, label: string) {
    this.tex = [0, 1].map((i) => device.createTexture({
      size: [n, n], format: FLUID_FORMAT,
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

  private paramsBuf: GPUBuffer;
  private fluxBuf: GPUBuffer;
  private segBuf: GPUBuffer;
  private ctlBuf: GPUBuffer;
  private mixBuf: GPUBuffer;
  private partialsBuf: GPUBuffer;
  private readbackBuf: GPUBuffer;
  /** The measurement path gets its OWN partials buffer. Sharing one with the
   * per-frame readout let a sample overwrite the partials another read was
   * still copying, so a reading could blend two different frames. */
  private samplePartials: GPUBuffer;
  /** Pause the per-frame readout while measuring, so nothing else is in flight. */
  pauseReadback = false;

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
    wetCells: 0, meanDivergence: 0, relaxIters: 8,
  };
  private readbackBusy = false;
  private frame = 0;

  constructor(gpu: Gpu, n: number, paper: GPUTextureView) {
    this.gpu = gpu;
    this.n = n;
    this.paper = paper;
    const { device } = gpu;

    this.wet0 = new PingPong(device, n, 'wet0');
    this.wet1 = new PingPong(device, n, 'wet1');
    this.wet2 = new PingPong(device, n, 'wet2');
    this.wet3 = new PingPong(device, n, 'wet3');
    this.wet4 = new PingPong(device, n, 'wet4');
    this.wet5 = new PingPong(device, n, 'wet5');
    this.press = new PingPong(device, n, 'press');

    // Params: 16 scalars (4 vec4 worth) + 8 vec4 pigment rows = 192 bytes.
    this.paramsBuf = device.createBuffer({
      size: 16 * 4 + 8 * 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'fluid-params',
    });
    this.fluxBuf = device.createBuffer({
      size: n * n * 4 * 4,
      // COPY_DST so it can be cleared. The ledger is written by flux_compute and
      // read by two passes after it; uninitialised, it seeded exactly 1.0 into
      // cells on a blank sheet. Never bet on lazy init.
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'flux',
    });
    this.segBuf = device.createBuffer({
      size: MAX_SEGS * SEG_FLOATS * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'segments',
    });
    this.ctlBuf = device.createBuffer({
      size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'deposit-ctl',
    });
    this.mixBuf = device.createBuffer({
      size: 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'deposit-mix',
    });

    const wgPerSide = Math.ceil(n / 16);
    const partialCount = wgPerSide * wgPerSide * NQ;
    this.partialsBuf = device.createBuffer({
      size: partialCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, label: 'partials',
    });
    this.readbackBuf = device.createBuffer({
      size: partialCount * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ, label: 'gauge-readback',
    });
    this.samplePartials = device.createBuffer({
      size: partialCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, label: 'sample-partials',
    });

    const mk = (src: string, label: string) => device.createComputePipeline({
      layout: 'auto', label,
      compute: {
        module: device.createShaderModule({ code: `${commonWgsl}\n${src}`, label }),
        entryPoint: 'main',
      },
    });
    this.pipes.deposit = mk(depositWgsl, 'deposit');
    this.pipes.vel = mk(velWgsl, 'update_velocities');
    this.pipes.relax = mk(relaxWgsl, 'relax_divergence');
    this.pipes.outward = mk(outwardWgsl, 'flow_outward');
    this.pipes.fluxCompute = mk(fluxComputeWgsl, 'flux_compute');
    this.pipes.fluxPig = mk(fluxPigWgsl, 'flux_apply_pigment');
    this.pipes.fluxWater = mk(fluxWaterWgsl, 'flux_apply_water');
    this.pipes.transfer = mk(transferWgsl, 'transfer_pigment');
    this.pipes.capillary = mk(capillaryWgsl, 'capillary_flow');
    this.pipes.dry = mk(dryWgsl, 'dry_tick');
    this.pipes.reduce = mk(reduceWgsl, 'reduce');
    this.pipes.zero = mk(zeroWgsl, 'zero_fill');

    this.writeParams();
    this.clear();
  }

  /** Views the renderer binds to show suspended + settled pigment and wetness. */
  get views() {
    return {
      wet0: this.wet0.src, wet1: this.wet1.src, wet2: this.wet2.src,
      wet3: this.wet3.src, wet4: this.wet4.src, wet5: this.wet5.src,
    };
  }

  get readings(): Gauges { return this.gauges; }

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
    const buf = new ArrayBuffer(16 * 4 + 8 * 16);
    const dv = new DataView(buf);
    const p = this.params;
    dv.setUint32(0, this.n, true);
    dv.setUint32(4, this.frame, true);
    dv.setUint32(8, this.relaxIters, true);
    dv.setUint32(12, 0, true);
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
    dv.setFloat32(60, 0, true);
    // Pigment transport rows for the active slots (Card 3: rho, omega, gamma).
    for (let i = 0; i < 8; i++) {
      const id = this.slotIds[i];
      const pig = id !== undefined && id >= 0 ? PIGMENTS[id] : undefined;
      const o = 64 + i * 16;
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

  private dispatch(pass: GPUComputePassEncoder, pipe: GPUComputePipeline, res: GPUBindingResource[]) {
    const g = Math.ceil(this.n / 8);
    pass.setPipeline(pipe);
    pass.setBindGroup(0, this.bind(pipe, res));
    pass.dispatchWorkgroups(g, g, 1);
  }

  /** Zero every wet field explicitly — never trust lazy init. */
  clear() {
    const enc = this.gpu.device.createCommandEncoder();
    const pass = enc.beginComputePass({ label: 'zero' });
    const all = [this.wet0, this.wet1, this.wet2, this.wet3, this.wet4, this.wet5, this.press];
    for (const pp of all) {
      for (const v of pp.view) {
        this.dispatch(pass, this.pipes.zero, [{ buffer: this.paramsBuf }, v]);
      }
    }
    pass.end();
    enc.clearBuffer(this.fluxBuf);
    this.gpu.device.queue.submit([enc.finish()]);
  }

  /**
   * Advance one frame. `segments` are resampled stroke pieces in grid space —
   * the host must space them <= 1 cell apart (Card 6; otherwise strokes bead).
   */
  step(segments: Float32Array<ArrayBuffer>, segCount: number, mixWeights: Float32Array<ArrayBuffer>) {
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

      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (let i = 0; i < n; i++) {
        const o = (done + i) * SEG_FLOATS;
        const r = segments[o + 4] + 1;
        minX = Math.min(minX, segments[o] - r, segments[o + 2] - r);
        maxX = Math.max(maxX, segments[o] + r, segments[o + 2] + r);
        minY = Math.min(minY, segments[o + 1] - r, segments[o + 3] - r);
        maxY = Math.max(maxY, segments[o + 1] + r, segments[o + 3] + r);
      }
      device.queue.writeBuffer(this.ctlBuf, 0,
        new Float32Array([n, minX, minY, maxX, maxY, 0, 0, 0]));

      const denc = device.createCommandEncoder({ label: 'deposit-chunk' });
      const dpass = denc.beginComputePass();
      this.dispatch(dpass, this.pipes.deposit, [
        U, { buffer: this.segBuf }, { buffer: this.ctlBuf }, { buffer: this.mixBuf },
        this.wet0.src, this.wet1.src, this.wet2.src, this.wet5.src,
        this.wet0.dst, this.wet1.dst, this.wet2.dst, this.wet5.dst,
      ]);
      dpass.end();
      device.queue.submit([denc.finish()]);
      this.wet0.flip(); this.wet1.flip(); this.wet2.flip(); this.wet5.flip();
    }

    const enc = device.createCommandEncoder({ label: 'fluid-frame' });
    // Clear the ledger every frame, before anything reads it. flux_compute is
    // supposed to write every cell, but the gauges say otherwise: with the flux
    // group enabled a blank sheet grows water and pigment out of nothing, and
    // with it disabled the sheet is exactly zero. Until that is understood, do
    // not rely on full write coverage of a buffer two later passes read.
    enc.clearBuffer(this.fluxBuf);
    const pass = enc.beginComputePass({ label: 'fluid' });

    const run = (name: string, fn: () => void) => { if (!this.skip.has(name)) fn(); };

    // 2 — UpdateVelocities
    run('vel', () => {
      this.dispatch(pass, this.pipes.vel, [U, this.wet0.src, this.paper, this.wet0.dst]);
      this.wet0.flip();
    });

    // 3 — RelaxDivergence, N iterations
    run('relax', () => {
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

    // 5 — flux ledger, then pigment BEFORE water (denominator order matters)
    run('flux', () => {
      this.dispatch(pass, this.pipes.fluxCompute, [U, this.wet0.src, this.press.src, { buffer: this.fluxBuf }]);
      this.dispatch(pass, this.pipes.fluxPig, [
        U, this.wet0.src, this.wet1.src, this.wet2.src, { buffer: this.fluxBuf },
        this.wet1.dst, this.wet2.dst,
      ]);
      this.wet1.flip(); this.wet2.flip();
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
    });

    // 8 — DryTick (the only pass that removes water)
    run('dry', () => {
      this.dispatch(pass, this.pipes.dry, [U, this.wet0.src, this.wet5.src, this.wet0.dst, this.wet5.dst]);
      this.wet0.flip(); this.wet5.flip();
    });

    // 9 — gauges
    const rg = Math.ceil(this.n / 16);
    pass.setPipeline(this.pipes.reduce);
    pass.setBindGroup(0, this.bind(this.pipes.reduce, [
      U, this.wet0.src, this.wet1.src, this.wet2.src, this.wet3.src, this.wet4.src, this.wet5.src,
      { buffer: this.partialsBuf },
    ]));
    pass.dispatchWorkgroups(rg, rg, 1);
    pass.end();

    if (!this.readbackBusy && !this.pauseReadback) {
      enc.copyBufferToBuffer(this.partialsBuf, 0, this.readbackBuf, 0, this.readbackBuf.size);
    }
    device.queue.submit([enc.finish()]);

    if (!this.readbackBusy && !this.pauseReadback) {
      this.readbackBusy = true;
      this.readbackBuf.mapAsync(GPUMapMode.READ).then(() => {
        const data = new Float32Array(this.readbackBuf.getMappedRange().slice(0));
        this.readbackBuf.unmap();
        this.accumulate(data);
        this.readbackBusy = false;
      }).catch(() => { this.readbackBusy = false; });
    }
  }

  /**
   * Read the gauges NOW. `readings` is filled by a readback that skips frames
   * whenever a map is in flight, so it can describe a state many frames old —
   * fine for a HUD, useless for measurement, and it manufactured a whole
   * phantom bisect before that was understood.
   */
  async sampleGauges(): Promise<Gauges> {
    const { device } = this.gpu;
    const rg = Math.ceil(this.n / 16);
    const bytes = this.samplePartials.size;
    const rb = device.createBuffer({
      size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = device.createCommandEncoder({ label: 'gauge-sample' });
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pipes.reduce);
    pass.setBindGroup(0, this.bind(this.pipes.reduce, [
      { buffer: this.paramsBuf },
      this.wet0.src, this.wet1.src, this.wet2.src, this.wet3.src, this.wet4.src, this.wet5.src,
      { buffer: this.samplePartials },
    ]));
    pass.dispatchWorkgroups(rg, rg, 1);
    pass.end();
    enc.copyBufferToBuffer(this.samplePartials, 0, rb, 0, bytes);
    device.queue.submit([enc.finish()]);
    await rb.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(rb.getMappedRange().slice(0));
    rb.unmap(); rb.destroy();
    return this.summarise(data);
  }

  /** Dump a whole fluid texture to the CPU as RGBA f32, for inspection. */
  async dump(name: string): Promise<Float32Array> {
    const map: Record<string, PingPong> = {
      wet0: this.wet0, wet1: this.wet1, wet2: this.wet2,
      wet3: this.wet3, wet4: this.wet4, wet5: this.wet5, press: this.press,
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

  /** Sum the per-workgroup partials into a reading. Pure; no side effects. */
  private summarise(data: Float32Array): Gauges {
    const q = new Float64Array(NQ);
    for (let i = 0; i + NQ <= data.length; i += NQ) {
      for (let k = 0; k < NQ; k++) q[k] += data[i + k];
    }
    const perSlot = Array.from({ length: 8 }, (_, k) => q[2 + k]);
    const wetCells = q[11];
    return {
      film: q[0], saturation: q[1], water: q[0] + q[1],
      pigment: perSlot.reduce((a, b) => a + b, 0), perSlot, wetCells,
      meanDivergence: wetCells > 0 ? q[12] / wetCells : 0,
      relaxIters: this.relaxIters,
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

export { MAX_SEGS, SEG_FLOATS };
