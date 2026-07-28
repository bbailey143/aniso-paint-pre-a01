// CanvasEngine — the document surface (P3/P4).
//
// Owns the paper substrate, the fluid engine (the wet band), and the
// Composite + Light render. Paint arrives as resampled stroke segments; the
// fluid engine moves it; this class shows the result.

import type { Gpu } from './gpu';
import { createColorLibrary, PIGMENT_COUNT } from '../color/library';
import { PIGMENTS } from '../color/pigments';
import type { Recipe } from '../color/km';
import type { Paper } from '../substrate/papers';
import { FluidEngine, type Gauges, type FluidParams } from './fluid';
import paperWgsl from './shaders/paper.wgsl?raw';
import compositeWgsl from './shaders/composite.wgsl?raw';

const DOC = 1024;               // document resolution (square)
// Invariant 4: coarse simulation grid under a finer display grid. The physics
// does not need display resolution; the visual layer does. The paper lives at
// sim resolution because the fluid reads it per cell.
const SIM = 512;
// Dry media can be much finer than the fluid. A ballpoint hairline needs this
// extra resolution; water movement does not. Keep the relationship here rather
// than scattering the number through the canvas setup.
const INK = SIM * 4;

const STORAGE_TEX =
  GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;

const SLUG_TO_ID = new Map(PIGMENTS.map((p, i) => [p.slug, i]));

export class CanvasEngine {
  readonly sim = SIM;
  readonly doc = DOC;

  private gpu: Gpu;
  private paperTex: GPUTexture;
  /** Same sheet, sampled at the dry-media grid so tooth stays meaningful for a
   * fine nib instead of turning into four-by-four blocky copies of the wet map. */
  private inkPaperTex: GPUTexture;
  private lib: { ks: GPUBuffer; cie: GPUBuffer; params: GPUBuffer };
  private fluid: FluidEngine;

  private paperPipe: GPUComputePipeline;
  private compPipe: GPURenderPipeline;
  private paperParams: GPUBuffer;
  private compParams: GPUBuffer;
  private sampler: GPUSampler;
  private paperBind: GPUBindGroup;
  private inkPaperBind: GPUBindGroup;

  // Active slot -> library id map (up to 8), shared by fluid and composite.
  private slotIds = new Int32Array(8).fill(-1);
  private mixWeights_: Float32Array<ArrayBuffer> = new Float32Array(8);
  /** What the current dry medium lays, in the same slot space (P7). */
  private dryWeights_: Float32Array<ArrayBuffer> = new Float32Array(8);
  private thickScale = 5.0;
  private kInstrument = 1.0;
  private reliefStrength = 2.2;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device, format } = gpu;

    this.paperTex = device.createTexture({
      size: [SIM, SIM], format: 'rgba16float', usage: STORAGE_TEX, label: 'paper',
    });
    this.inkPaperTex = device.createTexture({
      size: [INK, INK], format: 'rgba16float', usage: STORAGE_TEX, label: 'ink-paper',
    });

    this.lib = createColorLibrary(device);
    this.fluid = new FluidEngine(gpu, SIM, this.paperTex.createView(), this.inkPaperTex.createView());

    this.paperParams = device.createBuffer({
      size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'paperParams',
    });
    this.compParams = device.createBuffer({
      size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'compParams',
    });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    this.paperPipe = device.createComputePipeline({
      layout: 'auto', label: 'paper',
      compute: { module: device.createShaderModule({ code: paperWgsl }), entryPoint: 'main' },
    });
    const compModule = device.createShaderModule({ code: compositeWgsl, label: 'composite' });
    this.compPipe = device.createRenderPipeline({
      layout: 'auto', label: 'composite',
      vertex: { module: compModule, entryPoint: 'vs' },
      fragment: { module: compModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });

    this.paperBind = device.createBindGroup({
      layout: this.paperPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paperParams } },
        { binding: 1, resource: this.paperTex.createView() },
      ],
    });
    this.inkPaperBind = device.createBindGroup({
      layout: this.paperPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paperParams } },
        { binding: 1, resource: this.inkPaperTex.createView() },
      ],
    });
  }

  get readings(): Gauges { return this.fluid.readings; }
  /** Fresh gauge read. Use this for measurement; `readings` lags (see fluid.ts). */
  sampleGauges(): Promise<Gauges> { return this.fluid.sampleGauges(); }
  set pauseReadback(v: boolean) { this.fluid.pauseReadback = v; }
  set capillaryAlarmEnabled(v: boolean) { this.fluid.capillaryAlarmEnabled = v; }
  set inkBandTrafficEnabled(v: boolean) { this.fluid.inkBandTrafficEnabled = v; }
  readCapillaryAlarm(): Promise<number> { return this.fluid.readCapillaryAlarm(); }
  dump(name: string): Promise<Float32Array> { return this.fluid.dump(name); }
  compareWet5ReadPaths() { return this.fluid.compareWet5ReadPaths(); }
  dumpFlux(): Promise<Float32Array> { return this.fluid.dumpFlux(); }
  /** Normalised concentration per cell slot — what the brush gets dipped in. */
  get mixWeights(): Float32Array<ArrayBuffer> { return this.mixWeights_; }

  setFluid(p: Partial<FluidParams>) { this.fluid.setParams(p); }
  setGloss(kInstrument: number) { this.kInstrument = kInstrument; }
  /** Wipe the sheet. A blank document has no history, so the slot map resets too. */
  clear() {
    this.fluid.clear();
    this.slotIds.fill(-1);
    this.mixWeights_.fill(0);
    this.dryWeights_.fill(0);
  }

  /** Regenerate the paper substrate for a chosen sheet. */
  setPaper(p: Paper) {
    const buf = new ArrayBuffer(32);
    new Float32Array(buf).set([p.toothAmp, p.featureFreq, p.sizing, p.rc, p.cMin, p.cMax, 0.137, 0]);
    this.gpu.device.queue.writeBuffer(this.paperParams, 0, buf);

    const enc = this.gpu.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.paperPipe);
    pass.setBindGroup(0, this.paperBind);
    pass.dispatchWorkgroups(Math.ceil(SIM / 8), Math.ceil(SIM / 8));
    // Same procedural sheet, evaluated at the ink grid. This preserves the
    // paper's continuous grain under a fine pen rather than magnifying a
    // coarse simulation-cell pattern.
    pass.setBindGroup(0, this.inkPaperBind);
    pass.dispatchWorkgroups(Math.ceil(INK / 8), Math.ceil(INK / 8));
    pass.end();
    this.gpu.device.queue.submit([enc.finish()]);

    // Dry media gate against the sheet's own tooth range, so they need to know
    // how rough it is, not just how high each point is (see dry_deposit.wgsl).
    this.fluid.setParams({ toothAmp: p.toothAmp });
  }

  /**
   * Set the paint on the brush: which pigments, in what proportion.
   *
   * The slot -> library-id map is held PER DOCUMENT and is sticky. A cell stores
   * amounts; the map says what those amounts are made of. Reassigning slots per
   * stroke would silently repaint history — dry a blue wash, pick up yellow, and
   * the dried blue would re-render as yellow, because it is stored as "0.4 of
   * slot 0". Once a pigment owns a slot it keeps it for the life of the document.
   */
  setMix(recipe: Recipe) {
    this.resolve(recipe, this.mixWeights_);
    this.fluid.setSlots(Array.from(this.slotIds));
  }

  /**
   * The pigment a dry medium lays (P7). Kept apart from the palette mix so a
   * pencil and the paint on the brush can coexist: switching tools must not
   * silently redefine what the brush is loaded with. Both share the one slot
   * map, which is correct — a document has a single map of what its slots mean.
   */
  setDryMix(recipe: Recipe) {
    this.resolve(recipe, this.dryWeights_);
    this.fluid.setSlots(Array.from(this.slotIds));
  }

  /** Normalise a recipe into slot weights, claiming slots as needed. */
  private resolve(recipe: Recipe, out: Float32Array) {
    out.fill(0);
    let total = 0;
    for (const v of recipe.values()) total += Math.max(0, v);
    if (total <= 0) return;
    for (const [slug, parts] of recipe) {
      if (parts <= 0) continue;
      const id = SLUG_TO_ID.get(slug);
      if (id === undefined) continue;
      const slot = this.slotFor(id);
      if (slot < 0) continue;             // palette full; see the note below
      out[slot] = parts / total;
    }
  }

  /** Lay dry media. No fluid pass runs; this goes straight to the dry floor. */
  depositDry(segments: Float32Array<ArrayBuffer>, segCount: number, edge = 1) {
    this.fluid.depositDry(segments, segCount, this.dryWeights_, edge);
  }

  /**
   * Find this pigment's slot, claiming a free one if it has not been used yet.
   *
   * `[LIMITATION]` Eight slots per cell. When all eight are claimed and a ninth
   * pigment is picked up, we reuse the slot holding the least paint on the sheet
   * — which repaints that pigment's history. The evidence base's answer is to
   * merge the two most spectrally similar pigments instead; that needs a
   * spectral-distance pass over the library and is not built. Until it is, the
   * honest behaviour is to refuse silently rather than corrupt: see below.
   */
  private slotFor(id: number): number {
    for (let i = 0; i < 8; i++) if (this.slotIds[i] === id) return i;
    for (let i = 0; i < 8; i++) {
      if (this.slotIds[i] < 0) { this.slotIds[i] = id; return i; }
    }
    return -1;
  }

  /** Slots in use, for the UI to warn before the palette fills. */
  get slotsUsed(): number { return this.slotIds.filter((s) => s >= 0).length; }

  /** Advance the physics one frame with this frame's stroke segments. */
  step(segments: Float32Array<ArrayBuffer>, segCount: number) {
    this.fluid.step(segments, segCount, this.mixWeights_);
  }

  private writeCompParams(viewW: number, viewH: number) {
    const buf = new ArrayBuffer(64);
    const dv = new DataView(buf);
    dv.setFloat32(0, viewW, true);
    dv.setFloat32(4, viewH, true);
    dv.setFloat32(8, DOC, true);
    dv.setFloat32(12, DOC, true);
    for (let i = 0; i < 4; i++) dv.setInt32(16 + i * 4, this.slotIds[i], true);
    for (let i = 0; i < 4; i++) dv.setInt32(32 + i * 4, this.slotIds[i + 4], true);
    dv.setFloat32(48, this.thickScale, true);
    dv.setFloat32(52, this.reliefStrength, true);
    dv.setFloat32(56, this.kInstrument, true);
    this.gpu.device.queue.writeBuffer(this.compParams, 0, buf);
  }

  /** Bind group must be rebuilt each frame: the fluid ping-pongs its views. */
  private compositeBind(): GPUBindGroup {
    const v = this.fluid.views;
    return this.gpu.device.createBindGroup({
      layout: this.compPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.compParams } },
        { binding: 1, resource: { buffer: this.lib.ks } },
        { binding: 2, resource: { buffer: this.lib.cie } },
        { binding: 3, resource: { buffer: this.lib.params } },
        { binding: 4, resource: v.wet1 },
        { binding: 5, resource: v.wet2 },
        { binding: 6, resource: this.paperTex.createView() },
        { binding: 7, resource: this.sampler },
        { binding: 8, resource: v.wet3 },
        { binding: 9, resource: v.wet4 },
        { binding: 10, resource: v.wet0 },
        { binding: 11, resource: v.wet5 },
        { binding: 12, resource: v.dry1a },
        { binding: 13, resource: v.dry1b },
        { binding: 14, resource: v.dry2a },
        { binding: 15, resource: v.dry2b },
        { binding: 16, resource: v.ink0 },
        { binding: 17, resource: v.ink1 },
      ],
    });
  }

  /** Composite + Light to the swapchain. */
  render() {
    const { device, context, canvas } = this.gpu;
    this.writeCompParams(canvas.width, canvas.height);

    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.043, g: 0.047, b: 0.055, a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
    });
    pass.setPipeline(this.compPipe);
    pass.setBindGroup(0, this.compositeBind());
    pass.draw(3);
    pass.end();
    device.queue.submit([enc.finish()]);
  }

  /** Debug: render the composite offscreen and read pixels back on the CPU. */
  async debugReadback(size = 64): Promise<any> {
    const { device, format } = this.gpu;
    const tex = device.createTexture({
      size: [size, size], format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const bytesPerRow = size * 4;
    const rb = device.createBuffer({
      size: bytesPerRow * size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    this.writeCompParams(size, size);
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: tex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
    });
    pass.setPipeline(this.compPipe);
    pass.setBindGroup(0, this.compositeBind());
    pass.draw(3);
    pass.end();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: rb, bytesPerRow }, [size, size]);
    device.queue.submit([enc.finish()]);

    await rb.mapAsync(GPUMapMode.READ);
    const data = new Uint8Array(rb.getMappedRange());
    const at = (x: number, y: number) => {
      const o = y * bytesPerRow + x * 4;
      const b0 = data[o], b1 = data[o + 1], b2 = data[o + 2];
      return format.startsWith('bgra') ? [b2, b1, b0] : [b0, b1, b2];
    };
    const center = at(size >> 1, size >> 1);
    const corner = at(1, 1);
    // Scan EVERY pixel for the darkest one. A sparse grid silently misses a
    // stroke only a few pixels wide, which reads as "nothing was painted" when
    // the paint is simply thin — exactly the false negative that cost time here.
    const scan: { x: number; y: number; rgb: number[] }[] = [];
    let darkest = [255, 255, 255];
    let darkAt = { x: 0, y: 0 };
    let sum = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = at(x, y);
        const l = p[0] + p[1] + p[2];
        sum += l / 3;
        if (l < darkest[0] + darkest[1] + darkest[2]) { darkest = p; darkAt = { x, y }; }
      }
    }
    scan.push({ x: darkAt.x, y: darkAt.y, rgb: darkest });
    const meanLum = sum / (size * size);
    rb.unmap();
    tex.destroy(); rb.destroy();
    return { center, corner, scan, darkest, darkAt, meanLum };
  }
}

export { DOC, SIM, PIGMENT_COUNT };
