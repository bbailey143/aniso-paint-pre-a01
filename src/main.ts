// aniso-paint — app entry (P1).
//
// Acquires a WebGPU device, draws the placeholder sheet, and wires the pen tablet
// so pressure/tilt/velocity/twist read live. This is the proof that WebGPU and the
// tablet are working on this machine before any physics lands.

import { initGpu, resizeToDisplay, describeAdapter, WebGpuUnavailable, type Gpu } from './engine/gpu';
import { PointerInput, type StylusSample } from './input/pointer';
import { Palette } from './ui/palette';
import { CanvasEngine } from './engine/canvas';
import { PAPERS } from './substrate/papers';

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
  const engine = new CanvasEngine(gpu);

  // ---- Pigment tray + surface (P2/P3) -------------------------------------
  const palette = new Palette(document.body, {
    onMixChange(_hex, recipe, loading) { engine.fill(recipe, loading); },
    onPaperChange(paper) { engine.setPaper(paper); },
  });
  engine.setPaper(PAPERS[1]);              // cold press default
  engine.fill(palette.recipe, palette.loading);

  // Dev aid: expose for headless verification.
  (window as unknown as { __engine: CanvasEngine }).__engine = engine;

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
  function frame() {
    resizeToDisplay(gpu);
    engine.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener('resize', () => resizeToDisplay(gpu));
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
