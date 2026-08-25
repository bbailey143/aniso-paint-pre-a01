// CanvasEngine — the document surface (P3/P4).
//
// Owns the paper substrate, the fluid engine (the wet band), and the
// Composite + Light render. Paint arrives as resampled stroke segments; the
// fluid engine moves it; this class shows the result.

import type { Gpu } from './gpu';
import { createColorLibrary, PIGMENT_COUNT } from '../color/library';
import { PIGMENTS } from '../color/pigment-palette';
import type { WetMedium } from '../media/types';
import type { Recipe } from '../color/km';
import type { Paper } from '../substrate/papers';
import { GRAIN_KIND } from '../substrate/papers';
import { DEFAULT_FLUID, FluidEngine, type Gauges, type FluidParams } from './fluid';
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

/**
 * Grain seed. Stated once here because THREE things must agree on it: the paper
 * texture the solver reads, the finer ink-grid copy of the same sheet, and the
 * composite's screen-resolution evaluation of the tooth. If they disagree, the
 * paper you can see stops being the paper the water is running over.
 */
const PAPER_SEED = 0.137;

// Zoom limits. The upper end is where one simulation cell is about 16 screen
// pixels — past that the view is honestly showing interpolation rather than
// paint, and saying so is better than letting the artist judge a pigment on it.
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 16;

/* Read lazily. GPUTextureUsage is a WebGPU global, so touching it while this
   module is being evaluated throws on any browser without WebGPU — which took
   the whole entry module down with it and left a blank page instead of the
   "WebGPU unavailable" message a few lines away in main.ts. A plain http:// LAN
   address is not a secure context, so that is every iPad on the home network. */
const storageTex = () =>
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
  private valueShift = 0.0;
  /**
   * Debug display: show where the water is instead of the colour. Purely a
   * readout — it reads the same textures the paint path reads and feeds nothing
   * back, so leaving it on cannot change what dries or where.
   */
  waterView = false;

  /**
   * View transform. `zoom = 1` fits the whole sheet; `(panX, panY)` is the
   * document point held at the centre of the window. These describe how the
   * sheet is LOOKED AT and never what the paint does — D11's separation of view
   * from board tilt applies here too.
   *
   * `toGrid()` in src/main.ts inverts the same transform to place a brush. The
   * two must move together.
   */
  zoom = 1;
  panX = DOC / 2;
  panY = DOC / 2;
  /**
   * How far the sheet is turned on the desk, in radians, document -> screen.
   * Screen y runs downward here and in the composite alike, so both use the
   * same matrix and cannot disagree about which way round is which.
   *
   * Turning the sheet does not turn gravity. A wash still runs toward the
   * downhill the tilt pad was set to, because that is the board, and D11 keeps
   * the board apart from the view. Rotating the paper to bring a curve under
   * your wrist should not re-aim the water.
   */
  rot = 0;
  /** Grain rows for the active sheet, so the composite can evaluate the tooth
   * procedurally at screen resolution. Set by `setPaper`. */
  private paperTooth = 0.45;
  private paperFreq = 130;
  /** Display tone belongs to the selected paper row; paint still uses its shared paths. */
  private paperTone: readonly [number, number, number] = [0.93, 0.92, 0.88];
  /** 0 preserves the watercolour grain; 1 selects the shared fibrous pastel tooth. */
  private paperGrainKind = 0;
  private readonly paperSeed = PAPER_SEED;

  /** Zoom about a point given in document px, so the paper stays put under the
   * cursor rather than sliding toward the middle. */
  zoomAt(factor: number, docX: number, docY: number) {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const applied = next / this.zoom;
    if (applied === 1) return;
    // Keep (docX, docY) at the same screen position: the centre moves a
    // fraction of the way toward it equal to how much closer we just got.
    this.panX = docX + (this.panX - docX) / applied;
    this.panY = docY + (this.panY - docY) / applied;
    this.zoom = next;
    this.clampPan();
  }

  /** Pan by a screen-pixel delta at the current zoom. */
  panBy(dxScreen: number, dyScreen: number, viewW: number, viewH: number) {
    const scale = Math.min(viewW / DOC, viewH / DOC) * this.zoom;
    // The hand travels across the glass, but the sheet may be turned under it,
    // so the drag is rotated back into document space before it becomes a pan.
    // Without this, dragging sideways across a turned sheet walks off at an
    // angle and the paper slides out from under the fingers.
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    this.panX -= (dxScreen * c + dyScreen * s) / scale;
    this.panY -= (-dxScreen * s + dyScreen * c) / scale;
    this.clampPan();
  }

  /**
   * Turn the sheet by `delta` radians about a document point, so that point
   * stays where it is on the glass instead of the view swinging away from it.
   * The pinch pivots on the midpoint between the fingers; the R-drag pivots on
   * the middle of the window, which happens to be `(panX, panY)` and therefore
   * leaves the pan untouched.
   *
   * Zoom needs no such companion: scaling about a document point cancels the
   * rotation on both sides, so `zoomAt` is already correct at any angle.
   */
  rotateAt(delta: number, docX: number, docY: number) {
    if (delta === 0) return;
    // pan' = docP + R(-delta) * (pan - docP)
    const c = Math.cos(delta), s = Math.sin(delta);
    const dx = this.panX - docX, dy = this.panY - docY;
    this.panX = docX + dx * c + dy * s;
    this.panY = docY - dx * s + dy * c;
    // Kept inside one turn so the float handed to the shader stays precise
    // however long somebody spins. Gestures track their own running total, so
    // the wrap is never visible as a jump.
    const TAU = Math.PI * 2;
    this.rot = ((this.rot + delta + Math.PI) % TAU + TAU) % TAU - Math.PI;
    this.clampPan();
  }

  resetView() { this.zoom = 1; this.panX = DOC / 2; this.panY = DOC / 2; this.rot = 0; }

  /** Keep the sheet from being dragged entirely off-screen. Generous rather
   * than strict — half a sheet of slack in every direction. */
  private clampPan() {
    const m = DOC * 0.5;
    this.panX = Math.min(DOC + m, Math.max(-m, this.panX));
    this.panY = Math.min(DOC + m, Math.max(-m, this.panY));
  }
  private reliefStrength = 2.2;
  /** How completely the material in hand covers the sheet. 0 keeps the
   *  composite exactly as it was for every staining medium. */
  private hidesGround = 0;
  /** How far its film stands off the sheet. 0 is flat, and flat is the
   *  arithmetic the composite had before paint had a surface of its own. */
  private paintRelief = 0;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device, format } = gpu;

    this.paperTex = device.createTexture({
      size: [SIM, SIM], format: 'rgba16float', usage: storageTex(), label: 'paper',
    });
    this.inkPaperTex = device.createTexture({
      size: [INK, INK], format: 'rgba16float', usage: storageTex(), label: 'ink-paper',
    });

    this.lib = createColorLibrary(device);
    this.fluid = new FluidEngine(gpu, SIM, this.paperTex.createView(), this.inkPaperTex.createView());

    this.paperParams = device.createBuffer({
      // Three 16-byte uniform groups: the paper's water appetite is a ninth
      // scalar, so this can no longer be the old 32-byte row.
      size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'paperParams',
    });
    this.compParams = device.createBuffer({
      // 128, not 112: covering power added an eighth 16-byte group. This size,
      // the ArrayBuffer in writeCompParams, and `struct Comp` in composite.wgsl
      // must agree — an overflowing write is rejected whole and silently.
      size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'compParams',
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
  /** True while the wet layer still needs animation; dry media do not use it. */
  get isFluidActive(): boolean { return this.fluid.isActive; }
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
  /** Select a wet material by feeding its data row into the shared solver. */
  setWetMedium(m: WetMedium) {
    this.fluid.setParams({
      viscosity: m.viscosity,
      drag: m.drag,
      gravityResponse: m.gravityResponse,
      wetLayerDrag: m.wetLayerDrag,
      edgeEta: m.edgeDarkening,
      rimMigration: m.rimMigration,
      rimReach: m.rimReach,
      edgeEvaporation: m.edgeEvaporation,
      yieldStress: m.yieldStress,
      teflonMin: m.teflonMin,
      evapRate: m.evapRate,
      absorptionCoupling: m.absorptionCoupling,
      rewetRate: m.reactivatable ? DEFAULT_FLUID.rewetRate : 0,
    });
    this.kInstrument = m.kInstrument;
    this.valueShift = m.valueShift;
    this.hidesGround = m.hidesGround;
    this.paintRelief = m.relief;
  }
  setGloss(kInstrument: number) { this.kInstrument = kInstrument; }
  /** How completely the material covers the sheet. Drives the same row
   *  `setWetMedium` sets; the dial simply lets the artist find it faster. */
  setCover(v: number) { this.hidesGround = Math.max(0, v); }
  /** How far the paint stands off the sheet. */
  setRelief(v: number) { this.paintRelief = Math.max(0, v); }
  /** Wipe the sheet. A blank document has no history, so the slot map resets too. */
  clear() {
    this.fluid.clear();
    this.slotIds.fill(-1);
    this.mixWeights_.fill(0);
    this.dryWeights_.fill(0);
  }

  /** Regenerate the paper substrate for a chosen sheet. */
  setPaper(p: Paper) {
    const buf = new ArrayBuffer(48);
    new Float32Array(buf).set([
      p.toothAmp, p.featureFreq, p.sizing, p.rc, p.cMin, p.cMax, PAPER_SEED,
      GRAIN_KIND[p.grainKind], p.waterUptake,
    ]);
    this.gpu.device.queue.writeBuffer(this.paperParams, 0, buf);
    // The composite re-derives the same grain at screen resolution, so it needs
    // the two rows that shape it. Same seed, same function, same sheet.
    this.paperTooth = p.toothAmp;
    this.paperFreq = p.featureFreq;
    this.paperTone = p.tone;
    this.paperGrainKind = GRAIN_KIND[p.grainKind];

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
  depositDry(segments: Float32Array<ArrayBuffer>, segCount: number, edge = 1,
             profile: 'round' | 'chisel' = 'round', surfaceMobility = 0,
             compactionAmount = 1) {
    this.fluid.depositDry(
      segments, segCount, this.dryWeights_, edge, profile, surfaceMobility, compactionAmount,
    );
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
  step(segments: Float32Array<ArrayBuffer>, segCount: number, dx = 0, dy = 0): boolean {
    return this.fluid.step(segments, segCount, this.mixWeights_, dx, dy);
  }

  private writeCompParams(viewW: number, viewH: number) {
    // 128 bytes = 8 groups of 16. Must match `struct Comp` in composite.wgsl and
    // the createBuffer size above. An overflowing uniform write is rejected
    // whole and silently; this has cost time twice already.
    const buf = new ArrayBuffer(128);
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
    dv.setFloat32(60, this.valueShift, true);
    dv.setFloat32(64, this.waterView ? 1 : 0, true);
    dv.setFloat32(68, this.zoom, true);
    dv.setFloat32(72, this.panX, true);
    dv.setFloat32(76, this.panY, true);
    // Grain parameters, so the composite can evaluate the tooth at screen
    // resolution instead of stretching the baked 512 texture.
    dv.setFloat32(80, this.paperTooth, true);
    dv.setFloat32(84, this.paperFreq, true);
    dv.setFloat32(88, this.paperSeed, true);
    dv.setFloat32(92, this.paperGrainKind, true);
    dv.setFloat32(96, this.paperTone[0], true);
    dv.setFloat32(100, this.paperTone[1], true);
    dv.setFloat32(104, this.paperTone[2], true);
    // Rotation rides in the 4 bytes a vec3f already reserves for alignment, so
    // the buffer stays 112 and nothing above has to move.
    dv.setFloat32(108, this.rot, true);
    dv.setFloat32(112, this.hidesGround, true);
    dv.setFloat32(116, this.paintRelief, true);
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
