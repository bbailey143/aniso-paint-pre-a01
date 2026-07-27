// WebGPU device acquisition and surface configuration.
//
// D1: WebGPU *core* only in engine code — no optional features requested here.
// D6: the canvas half-float schema is RGBA16F; the swapchain itself is the
// platform's preferred format (usually bgra8unorm) and is a display target only.

export interface Gpu {
  adapter: GPUAdapter;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
  /** Device pixel ratio actually applied to the drawing buffer. */
  dpr: number;
}

export class WebGpuUnavailable extends Error {}

export async function initGpu(canvas: HTMLCanvasElement): Promise<Gpu> {
  if (!('gpu' in navigator)) {
    throw new WebGpuUnavailable(
      'This browser has no WebGPU. Use Chrome/Edge 113+, or Safari 26 on iPadOS.',
    );
  }

  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) {
    throw new WebGpuUnavailable('No WebGPU adapter (GPU blocklisted or unavailable).');
  }

  // Core only: request no optional features. Default limits are treated as real
  // (Card 0 / D1) — the 256 MB single-buffer ceiling is binding on target hardware.
  const device = await adapter.requestDevice();
  device.lost.then((info) => {
    // Surfaced rather than swallowed; a lost device is a real event to handle later.
    console.error('WebGPU device lost:', info.reason, info.message);
  });

  const context = canvas.getContext('webgpu');
  if (!context) throw new WebGpuUnavailable('Could not get a webgpu canvas context.');

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });

  const gpu: Gpu = { adapter, device, context, format, canvas, dpr: 1 };
  resizeToDisplay(gpu);
  return gpu;
}

/**
 * Size the drawing buffer to the canvas's CSS box × devicePixelRatio, clamped to
 * the device's max texture dimension. Returns true if the size changed.
 */
export function resizeToDisplay(gpu: Gpu): boolean {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const maxDim = gpu.device.limits.maxTextureDimension2D;
  const w = Math.max(1, Math.min(Math.floor(gpu.canvas.clientWidth * dpr), maxDim));
  const h = Math.max(1, Math.min(Math.floor(gpu.canvas.clientHeight * dpr), maxDim));
  if (gpu.canvas.width === w && gpu.canvas.height === h && gpu.dpr === dpr) return false;
  gpu.canvas.width = w;
  gpu.canvas.height = h;
  gpu.dpr = dpr;
  return true;
}

/** Adapter/vendor string for the HUD, best-effort across implementations. */
export function describeAdapter(gpu: Gpu): string {
  const info = (gpu.adapter as unknown as { info?: GPUAdapterInfo }).info;
  if (info && (info.vendor || info.architecture)) {
    return [info.vendor, info.architecture].filter(Boolean).join(' / ') || 'ready';
  }
  return 'ready';
}
