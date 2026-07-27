// aniso-paint — app entry.
//
// Acquires WebGPU, builds the canvas + fluid engines, and runs the frame loop:
// pointer samples are resampled into stroke segments, the fluid engine advances
// the wet band, and the composite pass shows the result.

import { initGpu, resizeToDisplay, describeAdapter, WebGpuUnavailable, type Gpu } from './engine/gpu';
import { PointerInput, type StylusSample } from './input/pointer';
import { StrokeBuilder } from './input/stroke';
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
  const stroke = new StrokeBuilder();

  // ---- Pigment tray + surface ---------------------------------------------
  const palette = new Palette(document.body, {
    onMixChange(_hex, recipe, loading) {
      engine.setMix(recipe);
      // "Load" scales how much water and pigment the brush lays down.
      stroke.style.water = 0.10 * loading;
      stroke.style.pigment = 0.055 * loading;
    },
    onPaperChange(paper) { engine.setPaper(paper); },
    onDryChange(evapRate) { engine.setFluid({ evapRate }); },
    onClear() { engine.clear(); },
  });
  engine.setPaper(PAPERS[1]);              // cold press default
  engine.setMix(palette.recipe);

  // Start with a usable colour so the first stroke shows something.
  if (palette.recipe.size === 0) {
    palette.add('ultramarine-blue');
  }

  // ---- Pointer -> stroke segments -----------------------------------------
  // Screen px -> document uv -> simulation grid. Mirrors the composite's
  // "contain" fit so the paint lands under the cursor.
  function toGrid(s: StylusSample): { gx: number; gy: number } | null {
    const vw = gpu.canvas.width, vh = gpu.canvas.height;
    const scale = Math.min(vw / engine.doc, vh / engine.doc);
    const shown = engine.doc * scale;
    const offX = (vw - shown) / 2, offY = (vh - shown) / 2;
    const dx = (s.px - offX) / scale;      // document px
    const dy = (s.py - offY) / scale;
    if (dx < 0 || dy < 0 || dx > engine.doc || dy > engine.doc) return null;
    return { gx: (dx / engine.doc) * engine.sim, gy: (dy / engine.doc) * engine.sim };
  }

  let smoothV = 0;
  new PointerInput(canvas, () => gpu.dpr, {
    onStrokeStart() { stroke.begin(); },
    onStrokeEnd() { stroke.end(); },
    onSample(s: StylusSample) {
      smoothV = smoothV * 0.8 + s.velocity * 0.2;
      setText('s-type', s.pointerType);
      setText('s-pressure', s.down || s.pointerType !== 'mouse' ? s.pressure.toFixed(3) : '—');
      setText('s-tilt', `${s.tiltAngle.toFixed(0)}° @ ${s.tiltAzimuth.toFixed(0)}°`);
      setText('s-velocity', `${smoothV.toFixed(2)} px/ms`);
      setText('s-twist', s.twist ? `${s.twist.toFixed(0)}°` : '—');

      if (!s.down) return;
      const g = toGrid(s);
      if (g) stroke.add(g.gx, g.gy, s);
    },
  });

  // ---- Frame loop ----------------------------------------------------------
  let gaugeTick = 0;
  function frame() {
    resizeToDisplay(gpu);
    const { data, count } = stroke.drain();
    engine.step(data, count);
    engine.render();

    // Conservation readout (invariant 1): paint, lift, watch it hold.
    if (++gaugeTick % 10 === 0) {
      const r = engine.readings;
      setText('g-water', r.water.toFixed(2));
      setText('g-pigment', r.pigment.toFixed(3));
      setText('g-wet', r.wetCells.toFixed(0));
      setText('g-div', r.meanDivergence.toFixed(5));
      setText('g-relax', String(r.relaxIters));
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener('resize', () => resizeToDisplay(gpu));

  // Dev aid: expose for headless verification.
  (window as unknown as Record<string, unknown>).__engine = engine;
  (window as unknown as Record<string, unknown>).__stroke = stroke;
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
