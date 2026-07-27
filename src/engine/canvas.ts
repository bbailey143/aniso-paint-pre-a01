// CanvasEngine — the document surface (P3).
//
// Owns the per-cell state textures and drives three passes: paper generation
// (once per sheet choice), flat fill (a P3 test deposit, not a brush), and the
// Composite + Light render every frame. The document is a fixed size, drawn
// "contain"-fit into the viewport.

import type { Gpu } from './gpu';
import { createColorLibrary, PIGMENT_COUNT } from '../color/library';
import { PIGMENTS } from '../color/pigments';
import type { Recipe } from '../color/km';
import type { Paper } from '../substrate/papers';
import paperWgsl from './shaders/paper.wgsl?raw';
import fillWgsl from './shaders/fill.wgsl?raw';
import compositeWgsl from './shaders/composite.wgsl?raw';

const DOC = 1024;               // document resolution (square, P3)
const STORAGE_TEX =
  GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;

const SLUG_TO_ID = new Map(PIGMENTS.map((p, i) => [p.slug, i]));

export class CanvasEngine {
  private gpu: Gpu;
  private paperTex: GPUTexture;
  private pigA: GPUTexture;
  private pigB: GPUTexture;
  private lib = { ks: null as unknown as GPUBuffer, cie: null as unknown as GPUBuffer, params: null as unknown as GPUBuffer };

  private paperPipe: GPUComputePipeline;
  private fillPipe: GPUComputePipeline;
  private compPipe: GPURenderPipeline;

  private paperParams: GPUBuffer;
  private fillParams: GPUBuffer;
  private compParams: GPUBuffer;
  private sampler: GPUSampler;

  private paperBind: GPUBindGroup;
  private fillBind: GPUBindGroup;
  private compBind: GPUBindGroup;

  // Active slot -> library id map (up to 8), mirrored into the composite uniform.
  private slotIds = new Int32Array(8).fill(-1);
  private thickScale = 6.0;
  private kInstrument = 1.0;
  private reliefStrength = 2.2;

  constructor(gpu: Gpu) {
    this.gpu = gpu;
    const { device, format } = gpu;

    const mk = (label: string) => device.createTexture({
      size: [DOC, DOC], format: 'rgba16float', usage: STORAGE_TEX, label,
    });
    this.paperTex = mk('paper');
    this.pigA = mk('pigA');
    this.pigB = mk('pigB');

    const l = createColorLibrary(device);
    this.lib.ks = l.ks; this.lib.cie = l.cie; this.lib.params = l.params;

    this.paperParams = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'paperParams' });
    this.fillParams = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'fillParams' });
    this.compParams = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, label: 'compParams' });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    this.paperPipe = device.createComputePipeline({
      layout: 'auto', label: 'paper',
      compute: { module: device.createShaderModule({ code: paperWgsl }), entryPoint: 'main' },
    });
    this.fillPipe = device.createComputePipeline({
      layout: 'auto', label: 'fill',
      compute: { module: device.createShaderModule({ code: fillWgsl }), entryPoint: 'main' },
    });
    this.compPipe = device.createRenderPipeline({
      layout: 'auto', label: 'composite',
      vertex: { module: device.createShaderModule({ code: compositeWgsl }), entryPoint: 'vs' },
      fragment: {
        module: device.createShaderModule({ code: compositeWgsl }),
        entryPoint: 'fs', targets: [{ format }],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.paperBind = device.createBindGroup({
      layout: this.paperPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paperParams } },
        { binding: 1, resource: this.paperTex.createView() },
      ],
    });
    this.fillBind = device.createBindGroup({
      layout: this.fillPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.fillParams } },
        { binding: 1, resource: this.pigA.createView() },
        { binding: 2, resource: this.pigB.createView() },
      ],
    });
    this.compBind = device.createBindGroup({
      layout: this.compPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.compParams } },
        { binding: 1, resource: { buffer: this.lib.ks } },
        { binding: 2, resource: { buffer: this.lib.cie } },
        { binding: 3, resource: { buffer: this.lib.params } },
        { binding: 4, resource: this.pigA.createView() },
        { binding: 5, resource: this.pigB.createView() },
        { binding: 6, resource: this.paperTex.createView() },
        { binding: 7, resource: this.sampler },
      ],
    });
  }

  /** Regenerate the paper substrate for a chosen sheet. */
  setPaper(p: Paper) {
    const buf = new ArrayBuffer(32);
    const f = new Float32Array(buf);
    f.set([p.toothAmp, p.featureFreq, p.sizing, p.rc, p.cMin, p.cMax, 0.137, 0]);
    this.gpu.device.queue.writeBuffer(this.paperParams, 0, buf);
    const enc = this.gpu.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.paperPipe);
    pass.setBindGroup(0, this.paperBind);
    pass.dispatchWorkgroups(Math.ceil(DOC / 8), Math.ceil(DOC / 8));
    pass.end();
    this.gpu.device.queue.submit([enc.finish()]);
  }

  /** Flat-fill the document with a mix (P3 test deposit). loading 0..1 sets how
   * much paint sits on the sheet (thin wash -> opaque). Clears if recipe empty. */
  fill(recipe: Recipe, loading: number) {
    // Build the slot map: up to 8 distinct pigments, normalised concentrations.
    this.slotIds.fill(-1);
    const amounts = new Float32Array(8);
    let total = 0;
    for (const v of recipe.values()) total += Math.max(0, v);
    let slot = 0;
    if (total > 0) {
      for (const [slug, parts] of recipe) {
        if (slot >= 8 || parts <= 0) continue;
        const id = SLUG_TO_ID.get(slug);
        if (id === undefined) continue;
        this.slotIds[slot] = id;
        amounts[slot] = (parts / total) * loading;
        slot++;
      }
    }
    const fbuf = new Float32Array(8);
    fbuf.set(amounts);
    this.gpu.device.queue.writeBuffer(this.fillParams, 0, fbuf);

    const enc = this.gpu.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.fillPipe);
    pass.setBindGroup(0, this.fillBind);
    pass.dispatchWorkgroups(Math.ceil(DOC / 8), Math.ceil(DOC / 8));
    pass.end();
    this.gpu.device.queue.submit([enc.finish()]);
  }

  setGloss(kInstrument: number) { this.kInstrument = kInstrument; }

  /** Debug: render the composite into a small offscreen target and read pixels
   * back on the CPU. Lets a headless check confirm the GPU colour pipeline
   * (paper when empty, green for blue+yellow) without a visible surface. */
  async debugReadback(size = 64): Promise<{ center: number[]; corner: number[] }> {
    const { device, format } = this.gpu;
    const tex = device.createTexture({
      size: [size, size], format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const bytesPerRow = size * 4; // format is *8unorm (4 bytes); size=64 -> 256, aligned
    const rb = device.createBuffer({ size: bytesPerRow * size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

    // Point the composite at a size x size viewport (doc fills it under contain-fit).
    const buf = new ArrayBuffer(64);
    const dv = new DataView(buf);
    dv.setFloat32(0, size, true); dv.setFloat32(4, size, true);
    dv.setFloat32(8, DOC, true); dv.setFloat32(12, DOC, true);
    for (let i = 0; i < 4; i++) dv.setInt32(16 + i * 4, this.slotIds[i], true);
    for (let i = 0; i < 4; i++) dv.setInt32(32 + i * 4, this.slotIds[i + 4], true);
    dv.setFloat32(48, this.thickScale, true);
    dv.setFloat32(52, this.reliefStrength, true);
    dv.setFloat32(56, this.kInstrument, true);
    device.queue.writeBuffer(this.compParams, 0, buf);

    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: tex.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    });
    pass.setPipeline(this.compPipe);
    pass.setBindGroup(0, this.compBind);
    pass.draw(3);
    pass.end();
    enc.copyTextureToBuffer({ texture: tex }, { buffer: rb, bytesPerRow }, [size, size]);
    device.queue.submit([enc.finish()]);

    await rb.mapAsync(GPUMapMode.READ);
    const data = new Uint8Array(rb.getMappedRange());
    const at = (x: number, y: number) => {
      const o = y * bytesPerRow + x * 4;
      // format may be bgra8unorm; reorder to RGB for reporting.
      const b0 = data[o], b1 = data[o + 1], b2 = data[o + 2];
      return format.startsWith('bgra') ? [b2, b1, b0] : [b0, b1, b2];
    };
    const center = at(size >> 1, size >> 1);
    const corner = at(1, 1);
    rb.unmap();
    tex.destroy(); rb.destroy();
    return { center, corner };
  }

  /** Composite + Light to the swapchain. */
  render() {
    const { device, context, canvas } = this.gpu;

    const buf = new ArrayBuffer(64);
    const dv = new DataView(buf);
    dv.setFloat32(0, canvas.width, true);
    dv.setFloat32(4, canvas.height, true);
    dv.setFloat32(8, DOC, true);
    dv.setFloat32(12, DOC, true);
    for (let i = 0; i < 4; i++) dv.setInt32(16 + i * 4, this.slotIds[i], true);
    for (let i = 0; i < 4; i++) dv.setInt32(32 + i * 4, this.slotIds[i + 4], true);
    dv.setFloat32(48, this.thickScale, true);
    dv.setFloat32(52, this.reliefStrength, true);
    dv.setFloat32(56, this.kInstrument, true);
    device.queue.writeBuffer(this.compParams, 0, buf);

    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.043, g: 0.047, b: 0.055, a: 1 },
        loadOp: 'clear', storeOp: 'store',
      }],
    });
    pass.setPipeline(this.compPipe);
    pass.setBindGroup(0, this.compBind);
    pass.draw(3);
    pass.end();
    device.queue.submit([enc.finish()]);
  }
}

export { DOC, PIGMENT_COUNT };
