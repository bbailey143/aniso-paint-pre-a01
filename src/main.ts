// aniso-paint — app entry.
//
// Acquires WebGPU, builds the canvas + fluid engines, and runs the frame loop:
// pointer samples are resampled into stroke segments, the fluid engine advances
// the wet band, and the composite pass shows the result.

import { initGpu, resizeToDisplay, describeAdapter, WebGpuUnavailable, type Gpu } from './engine/gpu';
import { PointerInput, type StylusSample } from './input/pointer';
import { StrokeEngine } from './input/stroke';
import { Palette } from './ui/palette';
import { Rail } from './ui/rail';
import { CanvasEngine } from './engine/canvas';
import { PAPERS } from './substrate/papers';
import { BRUSHES } from './brush/library';
import { WATERCOLOR } from './media/library';

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
  const stroke = new StrokeEngine(BRUSHES[0], 1.0);
  const conteViewer = document.getElementById('conte-viewer')!;
  const conteStick = document.getElementById('conte-stick')!;
  const conteShadow = document.getElementById('conte-shadow')!;
  const conteContact = document.getElementById('conte-contact')!;
  const conteTilt = document.getElementById('conte-tilt')!;
  const conteAzimuth = document.getElementById('conte-azimuth')!;
  const conteTwist = document.getElementById('conte-twist')!;
  const conteLayFlat = document.getElementById('conte-lay-flat') as HTMLInputElement;
  let conteSelected = false;
  let layFlat = false;
  let lastContePose = { tiltAngle: 0, tiltAzimuth: 0, twist: 0 };

  const updateConteViewer = (pose = lastContePose) => {
    lastContePose = pose;
    const rawTilt = Math.min(89, Math.max(0, pose.tiltAngle));
    const shownTilt = layFlat ? 82 : rawTilt;
    const azimuth = ((pose.tiltAzimuth % 360) + 360) % 360;
    const twist = ((pose.twist % 360) + 360) % 360;
    // Azimuth aims the lean around the page; tilt lowers the long axis; twist
    // rolls the rectangular faces. This is the same sample used by DryTool.
    conteStick.style.transform =
      `translateX(-50%) rotateZ(${azimuth}deg) rotateX(${shownTilt}deg) rotateZ(${twist}deg)`;
    const contactLength = layFlat ? 78 : 22 + (rawTilt / 89) * 56;
    conteShadow.style.width = `${contactLength}px`;
    conteShadow.style.transform = `translateX(-50%) rotate(${azimuth}deg)`;
    conteTilt.textContent = `${rawTilt.toFixed(0)} deg`;
    conteAzimuth.textContent = `${azimuth.toFixed(0)} deg`;
    conteTwist.textContent = `${twist.toFixed(0)} deg`;
    const contact = layFlat ? 'full side'
      : rawTilt < 16 ? 'square end'
      : rawTilt < 58 ? 'edge / corner' : 'broad side';
    conteContact.textContent = contact;
    conteViewer.classList.toggle('lay-flat', layFlat);
  };

  const setConteSelected = (on: boolean) => {
    conteSelected = on;
    conteViewer.classList.toggle('on', on);
    conteViewer.setAttribute('aria-hidden', String(!on));
    if (on) updateConteViewer();
  };

  conteLayFlat.addEventListener('change', () => {
    layFlat = conteLayFlat.checked;
    stroke.setLayFlat(layFlat);
    updateConteViewer();
    updatePenCursorContact();
  });
  // Windows commonly hides the system cursor while a tablet pen is in range or
  // touching down. Keep a canvas-drawn locator driven by the same PointerEvent
  // samples as the brush so pen hover and painting never become blind.
  const penCursor = document.createElement('div');
  penCursor.id = 'pen-cursor';
  penCursor.setAttribute('aria-hidden', 'true');
  document.body.appendChild(penCursor);
  let lastToolPointer: PointerEvent | null = null;
  const hidePenCursor = () => {
    penCursor.classList.remove('on', 'down');
    canvas.classList.remove('contact-cursor');
  };
  const updatePenCursorContact = (event = lastToolPointer) => {
    if (!event) return;
    const radians = Math.PI / 180;
    const tiltX = event.tiltX ?? 0;
    const tiltY = event.tiltY ?? 0;
    const tx = Math.tan(tiltX * radians);
    const ty = Math.tan(tiltY * radians);
    const tiltAngle = Math.atan(Math.hypot(tx, ty)) / radians;
    let tiltAzimuth = Math.atan2(ty, tx) / radians;
    if (tiltAzimuth < 0) tiltAzimuth += 360;
    const contact = stroke.paperContact({
      pressure: event.pressure,
      tiltAngle, tiltAzimuth,
      twist: event.twist ?? 0,
    });
    // The canvas operates in device pixels while this overlay is laid out in
    // CSS pixels. This is the same contain-and-zoom scale used by `toDoc()`.
    const cellPx = Math.min(gpu.canvas.width / engine.doc, gpu.canvas.height / engine.doc)
      * engine.zoom / gpu.dpr;
    // A hairline must remain findable on a high-resolution display. This only
    // affects the locator's minimum visible outline, never the paint contact.
    const width = Math.max(4, 2 * contact.majorRadius * cellPx);
    const height = Math.max(4, 2 * contact.minorRadius * cellPx);
    penCursor.style.setProperty('--pen-width', `${width}px`);
    penCursor.style.setProperty('--pen-height', `${height}px`);
    penCursor.style.setProperty('--pen-angle', `${contact.angle}deg`);
    penCursor.classList.toggle('chisel', contact.profile === 'chisel');
  };
  const trackPenCursor = (event: PointerEvent) => {
    const onPaper = event.composedPath().includes(canvas);
    const toolPointer = event.pointerType === 'pen' || (event.pointerType === 'mouse' && onPaper);
    if (!toolPointer) {
      hidePenCursor();
      return;
    }
    // Use viewport coordinates and listen above both the canvas and the
    // controls. A tablet pen can hover from the sheet straight onto the palette;
    // leaving the canvas must not make its locator disappear.
    lastToolPointer = event;
    penCursor.style.left = `${event.clientX}px`;
    penCursor.style.top = `${event.clientY}px`;
    updatePenCursorContact(event);
    penCursor.classList.add('on');
    penCursor.classList.toggle('down', event.buttons !== 0 || event.pressure > 0);
    canvas.classList.toggle('contact-cursor', event.pointerType === 'mouse' && onPaper);
  };
  window.addEventListener('pointermove', trackPenCursor, true);
  window.addEventListener('pointerdown', trackPenCursor, true);
  window.addEventListener('pointerup', trackPenCursor, true);
  window.addEventListener('pointerout', (event) => {
    if ((event.pointerType === 'pen' && event.relatedTarget === null)
      || event.pointerType === 'mouse') hidePenCursor();
  }, true);
  window.addEventListener('blur', hidePenCursor);
  // Palette construction immediately announces its initial mix. Keep this
  // startup value outside the palette object so that first announcement can
  // charge the brush before `palette` itself has been assigned.
  let waterCharge = 0;

  // A blank sheet should be still. Request a frame only when there is something
  // new to show, or while the wet solver says paint is still moving.
  let framePending = false;
  let renderRequested = true;
  const requestFrame = () => {
    renderRequested = true;
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(frame);
  };

  // ---- Pigment tray + surface ---------------------------------------------
  const palette = new Palette(document.body, {
    onMixChange(_hex, recipe, loading) {
      engine.setMix(recipe);
      // Dip the brush: the mix and how heavily it is charged.
      stroke.charge(engine.mixWeights, loading, waterCharge);
    },
    onPaperChange(paper) { engine.setPaper(paper); requestFrame(); },
    onEvapChange(evapRate) { engine.setFluid({ evapRate }); },
    onWaterChange(nextWaterCharge) {
      waterCharge = nextWaterCharge;
      stroke.charge(engine.mixWeights, palette.loading, waterCharge);
    },
    onTiltChange(gravityX, gravityY, cosAlpha) {
      engine.setFluid({ gravityX, gravityY, cosAlpha });
    },
    onClear() {
      engine.clear();
      // Clear Sheet affects only the document. `clear()` resets its pigment-slot
      // map, so restore the current palette mix and re-dip the selected brush.
      engine.setMix(palette.recipe);
      stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge);
      requestFrame();
    },
    onWaterView(on) { engine.waterView = on; requestFrame(); },
    onBrushChange(def, size) {
      setConteSelected(false);
      stroke.setBrush(def, size);
      stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge);
      updatePenCursorContact();
    },
    // A dry medium carries its own pigment — a pencil is graphite whatever is
    // on the palette — so it sets its own slot weights and leaves the mix alone.
    onDryMedium(medium, size) {
      stroke.setDryMedium(medium, size);
      engine.setDryMix(new Map(medium.pigments));
      setConteSelected(medium.slug === 'conte-crayon');
      updatePenCursorContact();
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
  // ---- Left rail: the instrument side --------------------------------------
  // The studio's own five drawers hang off the right rail, built inside the
  // palette. This side carries what is not a painting control: the readouts,
  // and a switch for the paint box itself.
  const leftRail = new Rail('left');
  const debugPanel = document.getElementById('debug-panel')!;
  debugPanel.hidden = false;               // the drawer owns visibility now
  leftRail.addPanel({
    id: 'debug', label: 'Debug', title: 'Debug Information', body: debugPanel,
  });
  leftRail.addToggle({
    id: 'paints', label: 'Paints', title: 'Show or hide the paint box', on: true,
    onChange: (on) => palette.setPanSetVisible(on),
  });

  // Two discriminators for a slow frame, reported into the Performance card.
  // Render scale changes only how many pixels the sheet is displayed at — the
  // fluid grid is SIM² regardless — so a lag that clears at 50% is fill rate,
  // and one that does not is somewhere else.
  const scaleSelect = document.getElementById('p-scale') as HTMLSelectElement;
  scaleSelect.addEventListener('change', () => {
    gpu.renderScale = parseFloat(scaleSelect.value);
    resizeToDisplay(gpu);
    updatePenCursorContact();
    requestFrame();
  });
  const blurToggle = document.getElementById('p-blur') as HTMLInputElement;
  blurToggle.addEventListener('change', () => {
    document.body.classList.toggle('no-blur', !blurToggle.checked);
    requestFrame();
  });
  // Resolve the colour into a smaller buffer and stretch it, keeping the paper
  // grain per-pixel. Both routes stay live so the two can be compared on the
  // same painting rather than argued about.
  const colourSelect = document.getElementById('p-colour') as HTMLSelectElement;
  colourSelect.addEventListener('change', () => {
    engine.colourScale = parseFloat(colourSelect.value);
    requestFrame();
  });
  // The third candidate: the paper's tooth lighting, which is four procedural
  // noise evaluations on every fragment of the sheet regardless of paint.
  const reliefToggle = document.getElementById('p-relief') as HTMLInputElement;
  reliefToggle.addEventListener('change', () => {
    engine.reliefEnabled = reliefToggle.checked;
    requestFrame();
  });
  document.getElementById('p-reset')!.addEventListener('click', () => {
    worstFrame = 0; missedFrames = 0; runFrames = 0; smoothFrame = 0; smoothCpu = 0;
  });
  // The touch equivalent of Ctrl+0.
  document.getElementById('view-fit')!.addEventListener('click', () => {
    engine.resetView();
    setZoomHud();
    updatePenCursorContact();
    requestFrame();
  });

  engine.setPaper(PAPERS[1]);              // cold press default
  engine.setWetMedium(WATERCOLOR);
  engine.setMix(palette.recipe);

  // Start with a usable colour so the first stroke shows something.
  if (palette.recipe.size === 0) {
    palette.add('ultramarine-blue');
  }
  stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge);

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
    updatePenCursorContact();
    requestFrame();
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
      ev.preventDefault(); engine.resetView(); setZoomHud(); requestFrame();
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
    requestFrame();
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

  // ---- Touch: fingers move the paper, the Pencil paints --------------------
  //
  // There is no wheel and no space bar on an iPad, so without this the sheet
  // cannot be moved or zoomed at all.
  //
  // Fingers deliberately never paint. A pinch always begins with one finger
  // landing a moment before the second, so if a single finger painted, every
  // zoom would start by laying a mark on the paper — and on a wet wash that
  // mark spreads and cannot be taken back. Keeping the Pencil for paint and
  // fingers for navigation removes that failure entirely rather than trying to
  // detect it after the fact.
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { spread: number; cx: number; cy: number } | null = null;

  const touchCentre = () => {
    let x = 0, y = 0;
    for (const t of touches.values()) { x += t.x; y += t.y; }
    const n = Math.max(1, touches.size);
    return { x: x / n, y: y / n };
  };
  // Distance between the first two fingers. Zero with fewer than two down,
  // which is what makes a one-finger drag a pure slide.
  const touchSpread = () => {
    if (touches.size < 2) return 0;
    const [a, b] = [...touches.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  // Re-baseline instead of applying a delta. Adding or lifting a finger moves
  // the centre point, and without this the sheet jumps at the moment a second
  // finger arrives.
  const rebase = () => {
    const c = touchCentre();
    pinch = { spread: touchSpread(), cx: c.x, cy: c.y };
  };

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType !== 'touch') return;
    // A finger landing mid-stroke must not drag the sheet out from under the
    // Pencil that is drawing on it.
    if (painting) return;
    ev.preventDefault();
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    // Capture keeps the gesture alive if a finger slides off the canvas onto a
    // rail. It can throw on a pointer the browser no longer considers active,
    // and a failed capture must not abandon the gesture.
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* gesture still tracks */ }
    rebase();
  }, { capture: true });

  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'touch' || !touches.has(ev.pointerId)) return;
    ev.preventDefault();
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (!pinch) return;
    const c = touchCentre();
    const spread = touchSpread();

    // Slide first: the sheet follows the centre of the fingers.
    engine.panBy((c.x - pinch.cx) * gpu.dpr, (c.y - pinch.cy) * gpu.dpr,
                 gpu.canvas.width, gpu.canvas.height);

    // Then zoom about that same point, so the bit of paper between the fingers
    // is the bit that stays put — the same rule the mouse wheel follows.
    if (spread > 0 && pinch.spread > 0) {
      const r = canvas.getBoundingClientRect();
      const { dx, dy } = toDoc((c.x - r.left) * gpu.dpr, (c.y - r.top) * gpu.dpr);
      engine.zoomAt(spread / pinch.spread, dx, dy);
    }

    pinch = { spread, cx: c.x, cy: c.y };
    setZoomHud();
    updatePenCursorContact();
    requestFrame();
  }, { capture: true });

  const endTouch = (ev: PointerEvent) => {
    if (!touches.has(ev.pointerId)) return;
    touches.delete(ev.pointerId);
    if (touches.size === 0) pinch = null;
    else rebase();
  };
  canvas.addEventListener('pointerup', endTouch, { capture: true });
  canvas.addEventListener('pointercancel', endTouch, { capture: true });

  let smoothV = 0;
  new PointerInput(canvas, () => gpu.dpr, {
    // The gate that makes hand-panning safe: while space is held or a pan is
    // under way, a press on the canvas never becomes a stroke. A finger is
    // refused here too — this, not event ordering, is what guarantees a pinch
    // cannot leave paint behind.
    shouldIgnorePress(e: PointerEvent) {
      return spaceHeld || panning || e.pointerType === 'touch';
    },
    onStrokeStart(s: StylusSample) {
      painting = true;
      setHand();
      const g = toGrid(s);
      if (g) { stroke.begin(g.gx, g.gy, s); requestFrame(); }
    },
    onStrokeEnd() { painting = false; setHand(); stroke.end(); },
    onSample(s: StylusSample) {
      smoothV = smoothV * 0.8 + s.velocity * 0.2;
      setText('s-type', s.pointerType);
      setText('s-pressure', s.down || s.pointerType !== 'mouse' ? s.pressure.toFixed(3) : '—');
      setText('s-tilt', `${s.tiltAngle.toFixed(0)}° @ ${s.tiltAzimuth.toFixed(0)}°`);
      setText('s-velocity', `${smoothV.toFixed(2)} px/ms`);
      setText('s-twist', s.twist ? `${s.twist.toFixed(0)}°` : '—');
      if (conteSelected) updateConteViewer(s);

      if (!s.down) return;
      const g = toGrid(s);
      if (g) { stroke.add(g.gx, g.gy, s); requestFrame(); }
    },
  });

  // ---- Frame loop ----------------------------------------------------------
  // Frames are drawn on demand, so wall-clock fps means nothing on a still
  // sheet. Only consecutive frames close enough together to belong to the same
  // continuous run are averaged — otherwise the idle gap between two strokes
  // gets averaged in and a perfectly healthy wet sheet reports 2 fps.
  const FRAME_RUN_GAP_MS = 250;
  // A 60 Hz budget. Anything past this missed a refresh, and enough of those is
  // what "still some lag" feels like even when the average says 60 fps.
  const BUDGET_60_MS = 16.7;
  let lastFrameStart = 0;
  let smoothFrame = 0;
  let smoothCpu = 0;
  let worstFrame = 0;
  let missedFrames = 0;
  let runFrames = 0;

  // Driven off a timer rather than the frame loop on purpose. The loop stops
  // the moment the paint does, so a readout written only from inside it shows
  // a dash on a still sheet and looks broken. The values hold the last
  // continuous run — which is the number worth reading, and you can only read
  // it once the pen is off the paper anyway.
  const updatePerf = () => {
    setText('p-frame', smoothFrame > 0 ? `${smoothFrame.toFixed(1)} ms` : '—');
    setText('p-fps', smoothFrame > 0 ? String(Math.round(1000 / smoothFrame)) : '—');
    setText('p-worst', worstFrame > 0 ? `${worstFrame.toFixed(1)} ms` : '—');
    setText('p-missed', runFrames > 0 ? `${missedFrames} / ${runFrames}` : '—');
    setText('p-cpu', smoothCpu > 0 ? `${smoothCpu.toFixed(2)} ms` : '—');
    setText('p-buffer', `${gpu.canvas.width}×${gpu.canvas.height} @${gpu.dpr.toFixed(2)}x`);
  };
  window.setInterval(updatePerf, 250);
  updatePerf();

  let gaugeTick = 0;
  function frame() {
    framePending = false;
    const frameStart = performance.now();
    const gap = frameStart - lastFrameStart;
    if (lastFrameStart > 0 && gap < FRAME_RUN_GAP_MS) {
      smoothFrame = smoothFrame > 0 ? smoothFrame * 0.9 + gap * 0.1 : gap;
      // Worst and missed are NOT smoothed. Smoothing is exactly what buries a
      // hitch, and the hitch is the thing being hunted.
      runFrames++;
      if (gap > worstFrame) worstFrame = gap;
      if (gap > BUDGET_60_MS * 1.5) missedFrames++;
    }
    lastFrameStart = frameStart;
    const resized = resizeToDisplay(gpu);
    // Dry media first: they deposit straight onto the floor and never enter the
    // fluid band, so a pencil line laid this frame is already under any wash
    // the same frame moves.
    const dry = stroke.drainDry();
    if (dry.count > 0) {
      engine.depositDry(
        dry.data, dry.count, dry.edge, dry.profile,
        dry.surfaceMobility, dry.compactionAmount,
      );
    }
    const { data, count } = stroke.drain();
    engine.step(data, count);
    const shouldRender = renderRequested || resized || dry.count > 0 || count > 0 || engine.isFluidActive;
    renderRequested = false;
    if (shouldRender) engine.render();

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
    const cpu = performance.now() - frameStart;
    smoothCpu = smoothCpu > 0 ? smoothCpu * 0.9 + cpu * 0.1 : cpu;
    if (engine.isFluidActive) requestFrame();
  }
  requestFrame();

  window.addEventListener('resize', requestFrame);

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
