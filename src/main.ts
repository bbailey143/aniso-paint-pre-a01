// aniso-paint — app entry (P1).
//
// Acquires a WebGPU device, draws the placeholder sheet, and wires the pen tablet
// so pressure/tilt/velocity/twist read live. This is the proof that WebGPU and the
// tablet are working on this machine before any physics lands.

import { initGpu, resizeToDisplay, describeAdapter, WebGpuUnavailable, type Gpu } from './engine/gpu';
import { PointerInput, type StylusSample } from './input/pointer';
import { Palette } from './ui/palette';
import fullscreenWgsl from './engine/shaders/fullscreen.wgsl?raw';

const canvas = document.getElementById('stage') as HTMLCanvasElement;

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

async function main() {
  let gpu: Gpu;
  try {
    gpu = await initGpu(canvas);
  } catch (err) {
    const msg = err instanceof WebGpuUnavailable ? err.message : String(err);
    setText('hud-gpu', 'webgpu: unavailable');
    showFatal(msg);
    return;
  }

  setText('hud-gpu', `webgpu: ${describeAdapter(gpu)}`);
  const sheet = new SheetPass(gpu, fullscreenWgsl);

  // ---- Pigment tray + mixing (P2) -----------------------------------------
  new Palette(document.body);

  // ---- Pen input → live readout -------------------------------------------
  // A short exponential smoothing on velocity so the number is readable rather
  // than jittering every sample.
  let smoothV = 0;
  new PointerInput(canvas, () => gpu.dpr, {
    onSample(s: StylusSample) {
      smoothV = smoothV * 0.8 + s.velocity * 0.2;
      setText('s-type', s.pointerType);
      setText('s-pressure', s.down || s.pointerType !== 'mouse' ? s.pressure.toFixed(3) : '—');
      setText('s-tilt', `${s.tiltAngle.toFixed(0)}° @ ${s.tiltAzimuth.toFixed(0)}°`);
      setText('s-velocity', `${smoothV.toFixed(2)} px/ms`);
      setText('s-twist', s.twist ? `${s.twist.toFixed(0)}°` : '—');
    },
  });

  // ---- Frame loop ----------------------------------------------------------
  const start = performance.now();
  function frame() {
    if (resizeToDisplay(gpu)) sheet.onResize();
    sheet.render((performance.now() - start) / 1000);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener('resize', () => resizeToDisplay(gpu));
}

/** The P1 placeholder render: one fullscreen pipeline + a small frame uniform. */
class SheetPass {
  private gpu: Gpu;
  private pipeline: GPURenderPipeline;
  private uniform: GPUBuffer;
  private bindGroup: GPUBindGroup;

  constructor(gpu: Gpu, wgsl: string) {
    this.gpu = gpu;
    const { device, format } = gpu;
    const module = device.createShaderModule({ code: wgsl, label: 'fullscreen' });

    this.uniform = device.createBuffer({
      size: 16, // vec2 resolution + f32 time + pad
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'frame-uniform',
    });

    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      label: 'sheet',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });

    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniform } }],
    });
  }

  onResize() { /* auto-sized render targets; nothing to rebuild yet */ }

  render(time: number) {
    const { device, context } = this.gpu;
    device.queue.writeBuffer(
      this.uniform, 0,
      new Float32Array([this.gpu.canvas.width, this.gpu.canvas.height, time, 0]),
    );

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.043, g: 0.047, b: 0.055, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
}

function showFatal(message: string) {
  const el = document.createElement('div');
  el.className = 'panel';
  el.style.cssText =
    'top:50%;left:50%;transform:translate(-50%,-50%);max-width:420px;text-align:center;color:var(--ink);line-height:1.6';
  el.innerHTML = `<b style="color:var(--accent)">WebGPU unavailable</b><br><br>${message}`;
  document.body.appendChild(el);
}

main();
