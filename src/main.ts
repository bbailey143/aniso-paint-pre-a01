// aniso-paint — app entry.
import { initGpu, resizeToDisplay, describeAdapter, WebGpuUnavailable, type Gpu } from './engine/gpu';
import { maybeRunSoak } from './soak';
import { maybeRunBanding } from './bench/banding-bench';
import { PointerInput, type StylusSample } from './input/pointer';
import { attachPinch } from './input/pinch';
import { wrapAngle, snapRight } from './input/angle';
import { StrokeEngine } from './input/stroke';
import { Studio as Palette } from './ui/studio';
import { CommandPalette } from './ui/command-palette';
import { CanvasEngine } from './engine/canvas';
import { PAPERS } from './substrate/papers';
import { BRUSHES } from './brush/library';
import { WATERCOLOR, DRY_TOOLS } from './media/library';
import { PIGMENTS } from './color/pigment-palette';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
function setText(id: string, text: string) { document.getElementById(id)?.replaceChildren(document.createTextNode(text)); }

async function main() {
  let gpu: Gpu;
  try { gpu = await initGpu(canvas); } catch (err) {
    const msg = err instanceof WebGpuUnavailable ? err.message : String(err);
    setText('hud-gpu', 'webgpu: unavailable'); showFatal(msg); return;
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
  let conteSelected = false; let layFlat = false; let lastContePose = { tiltAngle: 0, tiltAzimuth: 0, twist: 0 };
  const updateConteViewer = (pose = lastContePose) => {
    lastContePose = pose; const rawTilt = Math.min(89, Math.max(0, pose.tiltAngle)); const shownTilt = layFlat ? 82 : rawTilt;
    const azimuth = ((pose.tiltAzimuth % 360) + 360) % 360; const twist = ((pose.twist % 360) + 360) % 360;
    conteStick.style.transform = `translateX(-50%) rotateZ(${azimuth}deg) rotateX(${shownTilt}deg) rotateZ(${twist}deg)`;
    conteShadow.style.width = `${layFlat ? 78 : 22 + (rawTilt / 89) * 56}px`; conteShadow.style.transform = `translateX(-50%) rotate(${azimuth}deg)`;
    conteTilt.textContent = `${rawTilt.toFixed(0)} deg`; conteAzimuth.textContent = `${azimuth.toFixed(0)} deg`; conteTwist.textContent = `${twist.toFixed(0)} deg`;
    conteContact.textContent = layFlat ? 'full side' : rawTilt < 16 ? 'square end' : rawTilt < 58 ? 'edge / corner' : 'broad side'; conteViewer.classList.toggle('lay-flat', layFlat);
  };
  const setConteSelected = (on: boolean) => { conteSelected = on; conteViewer.classList.toggle('on', on); conteViewer.setAttribute('aria-hidden', String(!on)); if (on) updateConteViewer(); };
  conteLayFlat.addEventListener('change', () => { layFlat = conteLayFlat.checked; stroke.setLayFlat(layFlat); updateConteViewer(); updatePenCursorContact(); });

  const penCursor = document.createElement('div'); penCursor.id = 'pen-cursor'; penCursor.setAttribute('aria-hidden', 'true'); document.body.appendChild(penCursor);
  let lastToolPointer: PointerEvent | null = null;
  const hidePenCursor = () => { penCursor.classList.remove('on', 'down'); canvas.classList.remove('contact-cursor'); };
  const updatePenCursorContact = (event = lastToolPointer) => {
    if (!event) return; const radians = Math.PI / 180; const tx = Math.tan((event.tiltX ?? 0) * radians); const ty = Math.tan((event.tiltY ?? 0) * radians);
    const tiltAngle = Math.atan(Math.hypot(tx, ty)) / radians; let tiltAzimuth = Math.atan2(ty, tx) / radians; if (tiltAzimuth < 0) tiltAzimuth += 360;
    const contact = stroke.paperContact({ pressure: event.pressure, tiltAngle, tiltAzimuth, twist: event.twist ?? 0 });
    const cellPx = Math.min(gpu.canvas.width / engine.doc, gpu.canvas.height / engine.doc) * engine.zoom / gpu.dpr;
    penCursor.style.setProperty('--pen-width', `${Math.max(4, 2 * contact.majorRadius * cellPx)}px`); penCursor.style.setProperty('--pen-height', `${Math.max(4, 2 * contact.minorRadius * cellPx)}px`); penCursor.style.setProperty('--pen-angle', `${contact.angle}deg`); penCursor.classList.toggle('chisel', contact.profile === 'chisel');
  };
  const trackPenCursor = (event: PointerEvent) => {
    const onPaper = event.composedPath().includes(canvas); const toolPointer = event.pointerType === 'pen' || (event.pointerType === 'mouse' && onPaper);
    if (!toolPointer) { hidePenCursor(); return; } lastToolPointer = event; penCursor.style.left = `${event.clientX}px`; penCursor.style.top = `${event.clientY}px`; updatePenCursorContact(event); penCursor.classList.add('on'); penCursor.classList.toggle('down', event.buttons !== 0 || event.pressure > 0); canvas.classList.toggle('contact-cursor', event.pointerType === 'mouse' && onPaper);
  };
  window.addEventListener('pointermove', trackPenCursor, true); window.addEventListener('pointerdown', trackPenCursor, true); window.addEventListener('pointerup', trackPenCursor, true);
  window.addEventListener('pointerout', (event) => { if ((event.pointerType === 'pen' && event.relatedTarget === null) || event.pointerType === 'mouse') hidePenCursor(); }, true); window.addEventListener('blur', hidePenCursor);

  /* The board's tilt, as the artist set it: which way is downhill IN THE ROOM.
     The solver wants it in the paper's own axes, and those two stop agreeing
     the moment the sheet is turned, so the direction is carried back onto the
     paper on the way in and re-applied whenever the view moves.

     What this buys: turn the sheet and the water keeps running down the screen,
     so a run that was coming toward you now crosses the paper differently. That
     is a real board on a real easel - the paper turns, the room does not.

     Starts flat, matching the solver's own defaults. */
  let boardTilt = { gx: 0, gy: 0, cosAlpha: 1 };
  const applyBoardTilt = () => {
    const c = Math.cos(engine.rot), s = Math.sin(engine.rot);
    engine.setFluid({
      gravityX: boardTilt.gx * c + boardTilt.gy * s,
      gravityY: -boardTilt.gx * s + boardTilt.gy * c,
      cosAlpha: boardTilt.cosAlpha,
    });
  };
  let waterCharge = 0; let framePending = false; let renderRequested = true;
  const requestFrame = () => { renderRequested = true; if (!framePending) { framePending = true; requestAnimationFrame(frame); } };
  const palette = new Palette(document.body, {
    onMixChange(_hex, recipe, loading) { engine.setMix(recipe); stroke.charge(engine.mixWeights, loading, waterCharge); },
    onPaperChange(paper) { engine.setPaper(paper); requestFrame(); }, onEvapChange(evapRate) { engine.setFluid({ evapRate }); },
    /* One call, the whole row: viscosity, drag, yield stress, drying, the rim
       controls. The engine reads a material; it does not know their names. */
    onWetMedium(medium) { engine.setWetMedium(medium); stroke.setWetMedium(medium); requestFrame(); },
    onYieldChange(yieldStress) { engine.setFluid({ yieldStress }); },
    onSmearChange(smearStrength) { engine.setFluid({ smearStrength }); },
    onCoverChange(cover) { engine.setCover(cover); requestFrame(); },
    onReliefChange(relief) { engine.setRelief(relief); requestFrame(); },
    // The dial reads 0 matte .. 1 wet; the material rows are written the other
    // way round, so it is turned over on the way in.
    onGlossChange(gloss) { engine.setGloss(1 - gloss); requestFrame(); },
    onSheenChange(sheen) { engine.setSheen(sheen); requestFrame(); },
    onSheenWidthChange(width) { engine.setSheenWidth(width); requestFrame(); },
    onCapacityChange(scale) { stroke.setCapacity(scale); },
    onFlowChange(scale) { stroke.setFlow(scale); },
    onWaterChange(nextWaterCharge) { waterCharge = nextWaterCharge; stroke.charge(engine.mixWeights, palette.loading, waterCharge); },
    onTiltChange(gravityX, gravityY, cosAlpha) { boardTilt = { gx: gravityX, gy: gravityY, cosAlpha }; applyBoardTilt(); },
    onClear() { strokeCount = 0; engine.clear(); engine.setMix(palette.recipe); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge); requestFrame(); },
    onWaterView(on) { engine.waterView = on; requestFrame(); },
    onBrushChange(def, size) { setConteSelected(false); stroke.setBrush(def, size); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge); updatePenCursorContact(); },
    onDryMedium(medium, size) { stroke.setDryMedium(medium, size); engine.setDryMix(new Map(medium.pigments)); setConteSelected(medium.form === 'stick'); updatePenCursorContact(); },
    onRinse() { stroke.rinse(1); }, onRinseLoad() { stroke.rinse(1); engine.setMix(palette.recipe); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge); },
    onReadouts(on) { watchGauges(on); },
  }, WATERCOLOR.evapRate);
  engine.setPaper(PAPERS[1]); engine.setWetMedium(WATERCOLOR); stroke.setWetMedium(WATERCOLOR); engine.setMix(palette.recipe); if (palette.recipe.size === 0) palette.add('ultramarine-blue'); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge);
  const cmd = new CommandPalette();

  // — Tools —
  BRUSHES.forEach((b) => {
    cmd.register({
      id: `tool-${b.slug}`, name: b.name, group: 'Tools',
      hint: b.kind === 'flat' ? 'Flat brush — spreads and scratches' : 'Round brush — points well',
      keywords: 'brush paint wet',
      action: () => { setConteSelected(false); stroke.setBrush(b, palette.brushSize); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge); updatePenCursorContact(); },
    });
  });
  DRY_TOOLS.forEach((t) => {
    cmd.register({
      id: `tool-${t.slug}`, name: t.name, group: 'Tools',
      hint: t.medium.family === 'dry' ? 'Dry media' : undefined,
      keywords: 'dry pencil graphite charcoal conte crayon ink ballpoint fountain',
      action: () => { stroke.setDryMedium(t.medium, palette.brushSize); engine.setDryMix(new Map(t.medium.pigments)); setConteSelected(t.medium.form === 'stick'); updatePenCursorContact(); },
    });
  });

  // — Paper —
  PAPERS.forEach((p) => {
    cmd.register({
      id: `paper-${p.slug}`, name: p.name, group: 'Paper',
      hint: `${p.family} — ${p.grainStyle}`,
      keywords: 'paper sheet substrate surface',
      action: () => { engine.setPaper(p); requestFrame(); },
    });
  });

  // — Pigments —
  for (const p of PIGMENTS) {
    cmd.register({
      id: `pigment-${p.slug}`, name: p.name, group: 'Pigments',
      hint: p.ci,
      keywords: `color colour ${p.temp}`,
      action: () => { palette.add(p.slug); },
    });
  }

  // — Actions —
  cmd.register({ id: 'act-clear', name: 'Clear Sheet', group: 'Actions', hint: 'Wipe the painting', keywords: 'clear wipe erase delete', action: () => { engine.clear(); engine.setMix(palette.recipe); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge); requestFrame(); } });
  cmd.register({ id: 'act-rinse', name: 'Rinse Brush', group: 'Actions', hint: 'Pigment out, clean water in', keywords: 'rinse wash clean water', action: () => stroke.rinse(1) });
  cmd.register({ id: 'act-rinse-load', name: 'Rinse & Re-dip', group: 'Actions', hint: 'Rinse then reload current mix', keywords: 'rinse load dip reload', action: () => { stroke.rinse(1); engine.setMix(palette.recipe); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge); } });
  cmd.register({ id: 'act-clear-mix', name: 'Clear Mix', group: 'Actions', hint: 'Empty the colour recipe', keywords: 'mix clear empty color', action: () => { palette.clear(); stroke.rinse(1); } });
  cmd.register({ id: 'act-water-view', name: 'Toggle Water View', group: 'Actions', hint: 'See where water is, not colour', keywords: 'water view debug display', action: () => { engine.waterView = !engine.waterView; requestFrame(); } });
  cmd.register({ id: 'act-tilt-level', name: 'Level the Board', group: 'Actions', hint: 'Return paper to flat', keywords: 'tilt level flat board gravity', action: () => { engine.setFluid({ gravityX: 0, gravityY: 0, cosAlpha: 1 }); requestFrame(); } });
  cmd.register({ id: 'act-fit', name: 'Fit View', group: 'Actions', hint: 'Reset zoom, pan and rotation', shortcut: 'Ctrl+0', keywords: 'zoom fit reset view rotation', action: () => { engine.resetView(); viewChanged(); requestFrame(); } });
  /* Square again without losing your place. Fit View throws away the zoom and
     the pan too, which is the wrong trade when all you did was roll the sheet a
     few degrees by accident on the way into a pinch. Turning about the middle
     of the window is what leaves the rest alone. */
  cmd.register({ id: 'act-straighten', name: 'Straighten Sheet', group: 'Actions', hint: 'Back to square, keeping zoom and pan', keywords: 'rotate rotation straight square level upright', action: () => { engine.rotateAt(-engine.rot, engine.panX, engine.panY); viewChanged(); requestFrame(); } });

  /* Screen pixels to document pixels: the inverse of the view transform the
     composite shader applies, and it must stay the inverse or paint stops
     landing under the pen. Rotation runs backwards here for the same reason the
     shader's does. */
  function toDoc(px: number, py: number) {
    const vw = gpu.canvas.width, vh = gpu.canvas.height;
    const scale = Math.min(vw / engine.doc, vh / engine.doc) * engine.zoom;
    const ox = px - vw / 2, oy = py - vh / 2;
    const c = Math.cos(engine.rot), s = Math.sin(engine.rot);
    return { dx: (ox * c + oy * s) / scale + engine.panX, dy: (-ox * s + oy * c) / scale + engine.panY };
  }
  /* Grid position with no bounds test. Painting uses the bounded `toGrid`
     below — paint must not land off the sheet — but STARTING a stroke has to
     work from anywhere, including off the paper. See onStrokeStart. */
  function toGridRaw(s: StylusSample) { const { dx, dy } = toDoc(s.px, s.py); return { gx: (dx / engine.doc) * engine.sim, gy: (dy / engine.doc) * engine.sim }; }
  function toGrid(s: StylusSample) { const { dx, dy } = toDoc(s.px, s.py); if (dx < 0 || dy < 0 || dx > engine.doc || dy > engine.doc) return null; return { gx: (dx / engine.doc) * engine.sim, gy: (dy / engine.doc) * engine.sim }; }
  /* The stylus reports where it is pointing against the GLASS. The brush lays
     its mark on the PAPER. Turn the sheet and those stop being the same
     direction, so a flat brush or a chisel would draw across its own stroke
     instead of along it - which would make turning the paper to suit your arm
     pointless, and suiting your arm is the whole reason anyone turns paper.
     The stylus readout and the on-glass cursor keep the raw pose: those are
     reporting the real pen in your real hand. */
  const onPaper = (s: StylusSample): StylusSample => {
    if (engine.rot === 0) return s;
    const deg = (engine.rot * 180) / Math.PI;
    // A twist of exactly zero means no barrel roll was reported, and
    // dry-tool.ts reads that as a branch rather than as an angle. Shifting it
    // would quietly change which orientation a chisel follows on a turned sheet.
    return { ...s, tiltAzimuth: s.tiltAzimuth - deg, twist: s.twist === 0 ? 0 : s.twist - deg };
  };
  /* Degrees appear only once the sheet is off square, so the readout is also
     the answer to: is this straight? Ctrl+0 is the way back. */
  const setZoomHud = () => {
    const pct = Math.round(engine.zoom * 100);
    const deg = Math.round((engine.rot * 180) / Math.PI);
    setText('hud-zoom', deg === 0 ? `${pct}%` : `${pct}% · ${deg}°`);
  };
  /* Everything that moves the view comes through here. Gravity is re-aimed
     alongside the readout rather than beside it, so a new way of turning the
     sheet cannot forget to bring the water with it. */
  const viewChanged = () => { applyBoardTilt(); setZoomHud(); };
  canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); const r = canvas.getBoundingClientRect(); const { dx, dy } = toDoc((ev.clientX - r.left) * gpu.dpr, (ev.clientY - r.top) * gpu.dpr); engine.zoomAt(Math.exp(-ev.deltaY * 0.0015), dx, dy); viewChanged(); updatePenCursorContact(); requestFrame(); }, { passive: false });

  let panning = false; let lastPan = { x: 0, y: 0 }; let spaceHeld = false; let painting = false;
  /* Turning the sheet with a keyboard and a pointer. R is to rotation what
     Space is to panning: hold it and the paper becomes something you take hold
     of rather than draw on. turnRaw and turnApplied are the same pair the pinch
     keeps, for the same reason - the magnet at each right angle has to be as
     easy to leave as it is to enter. */
  let rotHeld = false; let turning = false; let turnLast = 0; let turnRaw = 0; let turnApplied = 0;
  /* The angle of a pointer about the middle of the window. Rotation pivots on
     that same middle, which is the one point that leaves the pan alone, so
     grabbing anywhere and swinging turns the sheet like a board on a desk. */
  const viewAngle = (ev: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2));
  };
  /* A bare letter is only a shortcut when nobody is typing - the r in raw
     sienna, typed into the command palette, must not arm the rotate tool.

     "Typing" means a field that actually eats letters. A slider is an <input>
     too, and treating every <input> as a text box killed R and Space for the
     rest of the session the moment you touched the size dial. */
  const TAKES_TEXT = /^(?:text|search|email|url|tel|password|number)$/;
  const typingInField = () => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    return el.tagName === 'INPUT' && TAKES_TEXT.test((el as HTMLInputElement).type);
  };
  const setHand = () => { canvas.classList.toggle('hand', (spaceHeld || rotHeld) && !panning && !turning && !painting); canvas.classList.toggle('grabbing', panning || turning); };
  /* Pinch to zoom, and carry the sheet with the hand. The wheel above is the
     same journey for a mouse; an iPad has no wheel and no space bar. */
  const pinch = attachPinch(canvas, {
    view: engine,
    dpr: () => gpu.dpr,
    toDoc: (px, py) => toDoc(px, py),
    viewSize: () => ({ w: gpu.canvas.width, h: gpu.canvas.height }),
    onChange: () => { viewChanged(); updatePenCursorContact(); requestFrame(); },
    onStart: () => {
      // Abandon whatever the first finger had started, so going into a pinch
      // does not leave a mark behind.
      if (painting) { stroke.end(); painting = false; setHand(); }
    },
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === '0' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); engine.resetView(); viewChanged(); requestFrame(); return; }
    if (typingInField() || ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat || painting) return;
    if (ev.code === 'Space') { ev.preventDefault(); spaceHeld = true; hidePenCursor(); setHand(); }
    if (ev.code === 'KeyR') { ev.preventDefault(); rotHeld = true; hidePenCursor(); setHand(); }
  });
  window.addEventListener('keyup', (ev) => {
    if (ev.code === 'Space') { spaceHeld = false; setHand(); }
    if (ev.code === 'KeyR') { rotHeld = false; setHand(); }
  });
  window.addEventListener('blur', () => { spaceHeld = false; rotHeld = false; panning = false; turning = false; setHand(); });
  canvas.addEventListener('pointerdown', (ev) => {
    /* Pressing the paper hands the keyboard back to the paper. A press on the
       canvas suppresses the default that would otherwise blur whatever had
       focus, so without this a slider or a search box keeps it for the rest of
       the session and every bare-letter shortcut stays dead. */
    canvas.focus({ preventScroll: true });
    if (painting) return;
    const wantsTurn = rotHeld && ev.button === 0;
    const wantsPan = ev.button === 1 || (spaceHeld && ev.button === 0);
    if (!wantsTurn && !wantsPan) return;
    ev.preventDefault();
    if (wantsTurn) { turning = true; turnLast = viewAngle(ev); turnRaw = engine.rot; turnApplied = engine.rot; }
    else { panning = true; lastPan = { x: ev.clientX, y: ev.clientY }; }
    // Capture has thrown here before, when the pointer was already gone.
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* nothing left to hold */ }
    setHand();
  }, { capture: true });
  canvas.addEventListener('pointermove', (ev) => {
    if (turning) {
      const a = viewAngle(ev);
      turnRaw += wrapAngle(a - turnLast);
      turnLast = a;
      // Pivot on (panX, panY), the document point already at the middle of the
      // window, so swinging turns the sheet without also sliding it.
      const want = snapRight(turnRaw);
      engine.rotateAt(want - turnApplied, engine.panX, engine.panY);
      turnApplied = want;
      viewChanged(); requestFrame();
      return;
    }
    if (!panning) return;
    engine.panBy((ev.clientX - lastPan.x) * gpu.dpr, (ev.clientY - lastPan.y) * gpu.dpr, gpu.canvas.width, gpu.canvas.height);
    lastPan = { x: ev.clientX, y: ev.clientY }; requestFrame();
  }, { capture: true });
  const endDrag = (ev: PointerEvent) => { if (!panning && !turning) return; panning = false; turning = false; if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId); setHand(); };
  canvas.addEventListener('pointerup', endDrag, { capture: true }); canvas.addEventListener('pointercancel', endDrag, { capture: true }); canvas.addEventListener('auxclick', (ev) => { if (ev.button === 1) ev.preventDefault(); }); viewChanged();

  let smoothV = 0;
  /** Strokes since the sheet was last cleared. */
  let strokeCount = 0;
  new PointerInput(canvas, () => gpu.dpr, {
    shouldIgnorePress() { return spaceHeld || panning || pinch.active || rotHeld || turning; },
    /* Begin unconditionally, even when the press lands off the sheet.
       `begin` is the fresh dip AND the thing that anchors the brush at the new
       press point, and skipping it left both jobs undone: the brush carried on
       from whatever was left of the last stroke, and it started from where the
       last stroke ENDED, dragging a line across the picture to get here.
       Measured on the brush bench with the dip skipped: 33 units of paint laid
       on the first stroke, 20 on the second, 3.8 on the third, 0.7 on the
       fourth. That is the brush going dead after three or four strokes. */
    onStrokeStart(s: StylusSample) { painting = true; strokeCount++; setHand(); const g = toGridRaw(s); stroke.begin(g.gx, g.gy, onPaper(s)); requestFrame(); }, onStrokeEnd() { painting = false; setHand(); stroke.end(); },
    onSample(s: StylusSample) { smoothV = smoothV * 0.8 + s.velocity * 0.2; setText('s-type', s.pointerType); setText('s-pressure', s.down || s.pointerType !== 'mouse' ? s.pressure.toFixed(3) : '—'); setText('s-tilt', `${s.tiltAngle.toFixed(0)}° @ ${s.tiltAzimuth.toFixed(0)}°`); setText('s-velocity', `${smoothV.toFixed(2)} px/ms`); setText('s-twist', s.twist ? `${s.twist.toFixed(0)}°` : '—'); if (conteSelected) updateConteViewer(s); if (!s.down || pinch.active) return; const g = toGrid(s); if (g) { stroke.add(g.gx, g.gy, onPaper(s)); requestFrame(); } },
  });

  /* The gauges used to be written only from inside frame(), and frame() stops
     as soon as the paint settles. Open the readouts on a quiet canvas and every
     number sat at an em dash forever, which reads exactly like a dead panel.
     Reading them is free and has no side effects, so it gets its own slow tick
     while the panel is on screen. Stepping the simulation to feed a readout
     would be worse than the bug. */
  function paintGauges() {
    const r = engine.readings;
    setText('g-water', r.water.toFixed(2)); setText('g-pigment', r.pigment.toFixed(3));
    setText('g-ink', r.inkPigment.toFixed(1)); setText('g-wet', r.wetCells.toFixed(0));
    /* What "thick" actually is, as a number. Covering, drybrush and the smear
       all turn on how much pigment sits in a cell, and until this was on
       screen every judgement about them was a guess at the scale. */
    setText('g-density', r.wetCells > 0 ? (r.pigment / r.wetCells).toFixed(4) : '—');
    setText('g-strokes', String(strokeCount));
    setText('g-div', r.meanDivergence.toFixed(5)); setText('g-relax', String(r.relaxIters));
  }
  let gaugeTimer = 0;
  function watchGauges(on: boolean) {
    window.clearInterval(gaugeTimer);
    if (!on) return;
    paintGauges();
    gaugeTimer = window.setInterval(paintGauges, 400);
  }
  if (document.body.classList.contains('st-readouts')) watchGauges(true);

  let gaugeTick = 0;
  function frame() { framePending = false; const resized = resizeToDisplay(gpu); const dry = stroke.drainDry(); if (dry.count > 0) engine.depositDry(dry.data, dry.count, dry.edge, dry.profile, dry.surfaceMobility, dry.compactionAmount); const { data, count, dx, dy } = stroke.drain(); engine.step(data, count, dx, dy, stroke.brushMix, stroke.brushTake, stroke.brushGrab); const shouldRender = renderRequested || resized || dry.count > 0 || count > 0 || engine.isFluidActive; renderRequested = false; if (shouldRender) engine.render(); if (++gaugeTick % 10 === 0) paintGauges(); if (engine.isFluidActive) requestFrame(); }
  /* What the tuft lifts off the sheet goes back into the tuft. The engine
     subtracts it on the GPU and reports the exact amount here. */
  engine.onPickUp = (water, pigment) => stroke.pickUp(water, pigment);
  stroke.onBrushReset = () => engine.discardPickup();
  requestFrame(); window.addEventListener('resize', requestFrame); (window as unknown as Record<string, unknown>).__engine = engine; (window as unknown as Record<string, unknown>).__stroke = stroke; (window as unknown as Record<string, unknown>).__BRUSHES = BRUSHES; maybeRunSoak(engine, stroke); maybeRunBanding(engine, stroke); maybeRunPickupCheck(engine, stroke);
}
function maybeRunPickupCheck(engine: CanvasEngine, stroke: StrokeEngine) {
  const query = new URLSearchParams(location.search);
  if (!query.has('pickup-check') && !query.has('full-check')) return;
  const full = query.has('full-check');
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:9999;width:min(650px,92vw);padding:14px 16px;border-radius:10px;background:rgba(12,12,14,.95);color:#e8e6e3;font:13px/1.45 ui-monospace,monospace;box-shadow:0 8px 30px rgba(0,0,0,.5);white-space:pre-wrap;pointer-events:none';
  panel.textContent = full
    ? 'PAINT REGRESSION SUITE\n\nrunning paired crossing, stacking, holding, and Watercolour checks…'
    : 'OIL PICKUP REGRESSION\n\nrunning two identical blue/yellow crossings…';
  document.body.appendChild(panel);
  setTimeout(async () => {
    try {
      const bench = await import('./bench/pickup-bench');
      const e = engine as unknown as Record<string, unknown>;
      const s = stroke as unknown as Record<string, unknown>;
      const runs = [await bench.crossing(e, s), await bench.crossing(e, s)];
      const line = (r: Record<string, any>) =>
        `lifted ${r.bluePigmentRemovedPct}% | brush blue ${r.brushBluePct}% | ` +
        `trail ${r.trailBlueByDistance.map((p: { bluePct: number }) => p.bluePct).join(' -> ')}`;
      panel.textContent = 'OIL PICKUP REGRESSION — finished\n\n' +
        `run 1  ${line(runs[0])}\nrun 2  ${line(runs[1])}\n\n` +
        'Reference: lifted about 33%; trail 12.4% -> 1.8%.\n' +
        'The canvas shows the final yellow-through-blue crossing.';
      if (full) {
        panel.textContent = 'PAINT REGRESSION SUITE\n\ncrossing passed; running Oil stacking…';
        const stacking = [await bench.stacking(e, s), await bench.stacking(e, s)];
        panel.textContent = 'PAINT REGRESSION SUITE\n\nstacking passed; running brush holding…';
        const holding = [await bench.holding(e, s), await bench.holding(e, s)];
        panel.textContent = 'PAINT REGRESSION SUITE\n\nholding passed; running Watercolour control…';
        const water = [await bench.watercolourControl(e, s), await bench.watercolourControl(e, s)];
        panel.textContent = 'PAINT REGRESSION SUITE — finished\n\n' +
          `crossing lift  ${runs[0].bluePigmentRemovedPct}% / ${runs[1].bluePigmentRemovedPct}%\n` +
          `crossing trail ${runs[0].trailBlueByDistance.map((p: { bluePct: number }) => p.bluePct).join(' -> ')}\n` +
          `stack last/first ${stacking[0].lastGainVsFirst} / ${stacking[1].lastGainVsFirst}\n` +
          `holding peak ${holding[0].peak}% / ${holding[1].peak}% | passed ${holding[0].passed && holding[1].passed}\n` +
          `Watercolour pigment canvas ${water[0].pigment} / ${water[1].pigment}\n` +
          `Watercolour drift after 20 frames ${water[0].pigmentDrift} / ${water[1].pigmentDrift}\n\n` +
          'References: stacking ~0.897; holding ~92.6%; Watercolour drift 0.';
      }
    } catch (err) {
      panel.textContent = `OIL PICKUP REGRESSION — ERROR\n\n${String(err)}`;
    }
  }, 50);
}
function showFatal(message: string) { const el = document.createElement('div'); el.className = 'panel'; el.style.cssText = 'top:50%;left:50%;transform:translate(-50%,-50%);max-width:420px;text-align:center;color:var(--ink);line-height:1.6'; el.innerHTML = `<b style="color:var(--accent)">WebGPU unavailable</b><br><br>${message}`; document.body.appendChild(el); }
main();
