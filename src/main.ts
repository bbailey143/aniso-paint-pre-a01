// aniso-paint — app entry.
//
// Acquires WebGPU, builds the canvas + fluid engines, and runs the frame loop:
// pointer samples are resampled into stroke segments, the fluid engine advances
// the wet band, and the composite pass shows the result.

import { initGpu, resizeToDisplay, describeAdapter, WebGpuUnavailable, type Gpu } from './engine/gpu';
import { PointerInput, type StylusSample } from './input/pointer';
import { StrokeEngine } from './input/stroke';
import { Palette } from './ui/palette';
import { CanvasEngine } from './engine/canvas';
import { PAPERS } from './substrate/papers';
import { BRUSHES } from './brush/library';
import { WATERCOLOR } from './media/library';

const canvas = document.getElementById('stage') as HTMLCanvasElement;

function setText(id: string, text: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** True while focus is somewhere a keystroke means a character, not a command. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  // A range slider is not typing — [ and ] should still resize with the size
  // control focused, which is exactly where a hand lands after dragging it.
  if (tag === 'input') return (el as HTMLInputElement).type !== 'range';
  return tag === 'textarea' || tag === 'select' || el.isContentEditable;
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
  const stroke = new StrokeEngine(BRUSHES[0], 1.0);
  // Windows commonly hides the system cursor while a tablet pen is in range or
  // touching down. Keep a canvas-drawn locator driven by the same PointerEvent
  // samples as the brush so pen hover and painting never become blind.
  const penCursor = document.createElement('div');
  penCursor.id = 'pen-cursor';
  penCursor.setAttribute('aria-hidden', 'true');
  document.body.appendChild(penCursor);
  const hidePenCursor = () => penCursor.classList.remove('on', 'down');
  const trackPenCursor = (event: PointerEvent) => {
    if (event.pointerType !== 'pen') {
      hidePenCursor();
      return;
    }
    // Use viewport coordinates and listen above both the canvas and the
    // controls. A tablet pen can hover from the sheet straight onto the palette;
    // leaving the canvas must not make its locator disappear.
    penCursor.style.left = `${event.clientX}px`;
    penCursor.style.top = `${event.clientY}px`;
    penCursor.classList.add('on');
    penCursor.classList.toggle('down', event.buttons !== 0 || event.pressure > 0);
  };
  window.addEventListener('pointermove', trackPenCursor, true);
  window.addEventListener('pointerdown', trackPenCursor, true);
  window.addEventListener('pointerup', trackPenCursor, true);
  window.addEventListener('pointerout', (event) => {
    if (event.pointerType === 'pen' && event.relatedTarget === null) hidePenCursor();
  }, true);
  window.addEventListener('blur', hidePenCursor);
  // Palette construction immediately announces its initial mix. Keep this
  // startup value outside the palette object so that first announcement can
  // charge the brush before `palette` itself has been assigned.
  let waterCharge = 0;

  // ---- Pigment tray + surface ---------------------------------------------
  const palette = new Palette(document.body, {
    onMixChange(_hex, recipe, loading) {
      engine.setMix(recipe);
      // Dip the brush: the mix and how heavily it is charged.
      stroke.charge(engine.mixWeights, loading, waterCharge);
    },
    onPaperChange(paper) { engine.setPaper(paper); },
    onEvapChange(evapRate) { engine.setFluid({ evapRate }); },
    onWaterChange(nextWaterCharge) {
      waterCharge = nextWaterCharge;
      stroke.charge(engine.mixWeights, palette.loading, waterCharge);
    },
    onTiltChange(gravityX, gravityY, cosAlpha) {
      engine.setFluid({ gravityX, gravityY, cosAlpha });
    },
    onClear() { engine.clear(); },
    onWaterView(on) { engine.waterView = on; },
    onBrushChange(def, size) {
      stroke.setBrush(def, size);
      stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge);
    },
    // A dry medium carries its own pigment — a pencil is graphite whatever is
    // on the palette — so it sets its own slot weights and leaves the mix alone.
    onDryMedium(medium, size) {
      stroke.setDryMedium(medium, size);
      engine.setDryMix(new Map(medium.pigments));
    },
    // Rinse: pigment out, clean water in. The brush stays loaded — it is now a
    // water brush, which is what you wet paper with. The sheet is untouched.
    onRinse() { stroke.rinse(1); },
    // Rinse and re-dip: back to a known state without wiping the painting.
    onRinseLoad() {
      stroke.rinse(1);
      engine.setMix(palette.recipe);
      stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge);
    },
  }, WATERCOLOR.evapRate);
  engine.setPaper(PAPERS[1]);              // cold press default
  engine.setWetMedium(WATERCOLOR);
  engine.setMix(palette.recipe);

  // Start with a usable colour so the first stroke shows something.
  if (palette.recipe.size === 0) {
    palette.add('ultramarine-blue');
  }
  stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge);

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'ANISO_BRUSH_UPDATE' && event.data.brush) {
      palette.brush = event.data.brush;
      stroke.setBrush(event.data.brush, palette.brushSize);
      stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge);
    }
  });

  // ---- Pointer -> stroke segments -----------------------------------------
  // Screen px -> document uv -> simulation grid. Mirrors the composite's
  // "contain" fit so the paint lands under the cursor.
  // This is the EXACT inverse of the fit block at the top of `fs` in
  // composite.wgsl. If one changes, change the other in the same edit — a
  // mismatch does not error, it just paints somewhere other than under the
  // cursor, and at high zoom that is far off the screen.
  function toDoc(px: number, py: number): { dx: number; dy: number } {
    const vw = gpu.canvas.width, vh = gpu.canvas.height;
    const scale = Math.min(vw / engine.doc, vh / engine.doc) * engine.zoom;
    return {
      dx: (px - vw / 2) / scale + engine.panX,
      dy: (py - vh / 2) / scale + engine.panY,
    };
  }

  function toGrid(s: StylusSample): { gx: number; gy: number } | null {
    const { dx, dy } = toDoc(s.px, s.py);
    if (dx < 0 || dy < 0 || dx > engine.doc || dy > engine.doc) return null;
    return { gx: (dx / engine.doc) * engine.sim, gy: (dy / engine.doc) * engine.sim };
  }

  // ---- View: zoom and pan --------------------------------------------------
  // Deliberately NOT on the brush's pointer path. Navigating the sheet is not
  // painting on it, and a stray wheel notch must never leave a mark.
  const setZoomHud = () => setText('hud-zoom', `${Math.round(engine.zoom * 100)}%`);
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    // Zoom about the cursor, so the bit of paper being looked at stays put.
    const r = canvas.getBoundingClientRect();
    const { dx, dy } = toDoc((ev.clientX - r.left) * gpu.dpr, (ev.clientY - r.top) * gpu.dpr);
    engine.zoomAt(Math.exp(-ev.deltaY * 0.0015), dx, dy);
    setZoomHud();
  }, { passive: false });

  // Classic hand pan: hold space and drag. Middle-drag does the same for anyone
  // who prefers it. Both are navigation, so both are kept strictly out of the
  // brush's path — `shouldIgnorePress` below is what guarantees a pan can never
  // leave a mark, rather than hoping the two handlers stay out of each other's
  // way.
  let panning = false;
  let lastPan = { x: 0, y: 0 };
  let spaceHeld = false;
  let painting = false;

  const setHand = () => {
    // Open hand while space is held, closed while actually dragging. Suppress
    // both mid-stroke: space during a stroke must not change anything.
    canvas.classList.toggle('hand', spaceHeld && !panning && !painting);
    canvas.classList.toggle('grabbing', panning);
  };

  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'Space' && !ev.repeat && !painting) {
      // Stop the page scrolling, and stop a focused palette button firing.
      ev.preventDefault();
      spaceHeld = true;
      hidePenCursor();
      setHand();
    }
    // A plain, findable way back when the view gets lost.
    if (ev.key === '0' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault(); engine.resetView(); setZoomHud();
    }

    // [ and ] step the tool size, as they do in every other painting app.
    // Guarded so they stay ordinary characters while a field has focus — the
    // JSON drawer in the studio is a textarea, and a bracket typed there must
    // be a bracket.
    if ((ev.key === '[' || ev.key === ']') && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      if (isTyping(ev.target)) return;
      ev.preventDefault();
      palette.nudgeSize(ev.key === ']' ? 1 : -1);
    }
  });
  window.addEventListener('keyup', (ev) => {
    if (ev.code === 'Space') { spaceHeld = false; setHand(); }
  });
  // Alt-tabbing away with space down would otherwise leave the hand stuck on.
  window.addEventListener('blur', () => {
    spaceHeld = false; panning = false; setHand();
  });

  canvas.addEventListener('pointerdown', (ev) => {
    const wantsPan = ev.button === 1 || (spaceHeld && ev.button === 0);
    if (!wantsPan || painting) return;
    ev.preventDefault();
    panning = true;
    lastPan = { x: ev.clientX, y: ev.clientY };
    canvas.setPointerCapture(ev.pointerId);
    setHand();
  }, { capture: true });

  canvas.addEventListener('pointermove', (ev) => {
    if (!panning) return;
    engine.panBy((ev.clientX - lastPan.x) * gpu.dpr, (ev.clientY - lastPan.y) * gpu.dpr,
                 gpu.canvas.width, gpu.canvas.height);
    lastPan = { x: ev.clientX, y: ev.clientY };
  }, { capture: true });

  const endPan = (ev: PointerEvent) => {
    if (!panning) return;
    panning = false;
    if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
    setHand();
  };
  canvas.addEventListener('pointerup', endPan, { capture: true });
  canvas.addEventListener('pointercancel', endPan, { capture: true });
  // Middle-click otherwise opens the browser's scroll widget on Windows.
  canvas.addEventListener('auxclick', (ev) => { if (ev.button === 1) ev.preventDefault(); });
  setZoomHud();

  let smoothV = 0;
  new PointerInput(canvas, () => gpu.dpr, {
    // The gate that makes hand-panning safe: while space is held or a pan is
    // under way, a press on the canvas never becomes a stroke.
    shouldIgnorePress() { return spaceHeld || panning; },
    onStrokeStart(s: StylusSample) {
      painting = true;
      setHand();
      const g = toGrid(s);
      if (g) stroke.begin(g.gx, g.gy, s);
    },
    onStrokeEnd() { painting = false; setHand(); stroke.end(); },
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
    // Dry media first: they deposit straight onto the floor and never enter the
    // fluid band, so a pencil line laid this frame is already under any wash
    // the same frame moves.
    const dry = stroke.drainDry();
    if (dry.count > 0) engine.depositDry(dry.data, dry.count, dry.edge, dry.profile);
    const { data, count } = stroke.drain();
    engine.step(data, count);
    engine.render();

    // Conservation readout (invariant 1): paint, lift, watch it hold.
    if (++gaugeTick % 10 === 0) {
      const r = engine.readings;
      setText('g-water', r.water.toFixed(2));
      setText('g-pigment', r.pigment.toFixed(3));
      setText('g-ink', r.inkPigment.toFixed(1));
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
  (window as unknown as Record<string, unknown>).__BRUSHES = BRUSHES;
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
