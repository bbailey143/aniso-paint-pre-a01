// aniso-paint — app entry.
import { initGpu, resizeToDisplay, describeAdapter, WebGpuUnavailable, type Gpu } from './engine/gpu';
import { PointerInput, type StylusSample } from './input/pointer';
import { StrokeEngine } from './input/stroke';
import { Palette } from './ui/palette';
import { WindowManager } from './ui/window-manager';
import { CanvasEngine } from './engine/canvas';
import { PAPERS } from './substrate/papers';
import { BRUSHES } from './brush/library';
import { WATERCOLOR } from './media/library';

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

  let waterCharge = 0; let framePending = false; let renderRequested = true;
  const requestFrame = () => { renderRequested = true; if (!framePending) { framePending = true; requestAnimationFrame(frame); } };
  const palette = new Palette(document.body, {
    onMixChange(_hex, recipe, loading) { engine.setMix(recipe); stroke.charge(engine.mixWeights, loading, waterCharge); },
    onPaperChange(paper) { engine.setPaper(paper); requestFrame(); }, onEvapChange(evapRate) { engine.setFluid({ evapRate }); },
    onWaterChange(nextWaterCharge) { waterCharge = nextWaterCharge; stroke.charge(engine.mixWeights, palette.loading, waterCharge); },
    onTiltChange(gravityX, gravityY, cosAlpha) { engine.setFluid({ gravityX, gravityY, cosAlpha }); },
    onClear() { engine.clear(); engine.setMix(palette.recipe); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge); requestFrame(); },
    onWaterView(on) { engine.waterView = on; requestFrame(); },
    onBrushChange(def, size) { setConteSelected(false); stroke.setBrush(def, size); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge); updatePenCursorContact(); },
    onDryMedium(medium, size) { stroke.setDryMedium(medium, size); engine.setDryMix(new Map(medium.pigments)); setConteSelected(medium.slug === 'conte-crayon'); updatePenCursorContact(); },
    onRinse() { stroke.rinse(1); }, onRinseLoad() { stroke.rinse(1); engine.setMix(palette.recipe); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge); },
  }, WATERCOLOR.evapRate);
  engine.setPaper(PAPERS[1]); engine.setWetMedium(WATERCOLOR); engine.setMix(palette.recipe); if (palette.recipe.size === 0) palette.add('ultramarine-blue'); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge);
  new WindowManager();

  function toDoc(px: number, py: number) { const vw = gpu.canvas.width, vh = gpu.canvas.height; const scale = Math.min(vw / engine.doc, vh / engine.doc) * engine.zoom; return { dx: (px - vw / 2) / scale + engine.panX, dy: (py - vh / 2) / scale + engine.panY }; }
  function toGrid(s: StylusSample) { const { dx, dy } = toDoc(s.px, s.py); if (dx < 0 || dy < 0 || dx > engine.doc || dy > engine.doc) return null; return { gx: (dx / engine.doc) * engine.sim, gy: (dy / engine.doc) * engine.sim }; }
  const setZoomHud = () => setText('hud-zoom', `${Math.round(engine.zoom * 100)}%`);
  canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); const r = canvas.getBoundingClientRect(); const { dx, dy } = toDoc((ev.clientX - r.left) * gpu.dpr, (ev.clientY - r.top) * gpu.dpr); engine.zoomAt(Math.exp(-ev.deltaY * 0.0015), dx, dy); setZoomHud(); updatePenCursorContact(); requestFrame(); }, { passive: false });

  let panning = false; let lastPan = { x: 0, y: 0 }; let spaceHeld = false; let painting = false;
  const setHand = () => { canvas.classList.toggle('hand', spaceHeld && !panning && !painting); canvas.classList.toggle('grabbing', panning); };
  window.addEventListener('keydown', (ev) => { if (ev.code === 'Space' && !ev.repeat && !painting) { ev.preventDefault(); spaceHeld = true; hidePenCursor(); setHand(); } if (ev.key === '0' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); engine.resetView(); setZoomHud(); requestFrame(); } });
  window.addEventListener('keyup', (ev) => { if (ev.code === 'Space') { spaceHeld = false; setHand(); } }); window.addEventListener('blur', () => { spaceHeld = false; panning = false; setHand(); });
  canvas.addEventListener('pointerdown', (ev) => { const wantsPan = ev.button === 1 || (spaceHeld && ev.button === 0); if (!wantsPan || painting) return; ev.preventDefault(); panning = true; lastPan = { x: ev.clientX, y: ev.clientY }; canvas.setPointerCapture(ev.pointerId); setHand(); }, { capture: true });
  canvas.addEventListener('pointermove', (ev) => { if (!panning) return; engine.panBy((ev.clientX - lastPan.x) * gpu.dpr, (ev.clientY - lastPan.y) * gpu.dpr, gpu.canvas.width, gpu.canvas.height); lastPan = { x: ev.clientX, y: ev.clientY }; requestFrame(); }, { capture: true });
  const endPan = (ev: PointerEvent) => { if (!panning) return; panning = false; if (canvas.hasPointerCapture(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId); setHand(); };
  canvas.addEventListener('pointerup', endPan, { capture: true }); canvas.addEventListener('pointercancel', endPan, { capture: true }); canvas.addEventListener('auxclick', (ev) => { if (ev.button === 1) ev.preventDefault(); }); setZoomHud();

  let smoothV = 0;
  new PointerInput(canvas, () => gpu.dpr, {
    shouldIgnorePress() { return spaceHeld || panning; },
    onStrokeStart(s: StylusSample) { painting = true; setHand(); const g = toGrid(s); if (g) { stroke.begin(g.gx, g.gy, s); requestFrame(); } }, onStrokeEnd() { painting = false; setHand(); stroke.end(); },
    onSample(s: StylusSample) { smoothV = smoothV * 0.8 + s.velocity * 0.2; setText('s-type', s.pointerType); setText('s-pressure', s.down || s.pointerType !== 'mouse' ? s.pressure.toFixed(3) : '—'); setText('s-tilt', `${s.tiltAngle.toFixed(0)}° @ ${s.tiltAzimuth.toFixed(0)}°`); setText('s-velocity', `${smoothV.toFixed(2)} px/ms`); setText('s-twist', s.twist ? `${s.twist.toFixed(0)}°` : '—'); if (conteSelected) updateConteViewer(s); if (!s.down) return; const g = toGrid(s); if (g) { stroke.add(g.gx, g.gy, s); requestFrame(); } },
  });

  let gaugeTick = 0;
  function frame() { framePending = false; const resized = resizeToDisplay(gpu); const dry = stroke.drainDry(); if (dry.count > 0) engine.depositDry(dry.data, dry.count, dry.edge, dry.profile, dry.surfaceMobility, dry.compactionAmount); const { data, count } = stroke.drain(); engine.step(data, count); const shouldRender = renderRequested || resized || dry.count > 0 || count > 0 || engine.isFluidActive; renderRequested = false; if (shouldRender) engine.render(); if (++gaugeTick % 10 === 0) { const r = engine.readings; setText('g-water', r.water.toFixed(2)); setText('g-pigment', r.pigment.toFixed(3)); setText('g-ink', r.inkPigment.toFixed(1)); setText('g-wet', r.wetCells.toFixed(0)); setText('g-div', r.meanDivergence.toFixed(5)); setText('g-relax', String(r.relaxIters)); } if (engine.isFluidActive) requestFrame(); }
  requestFrame(); window.addEventListener('resize', requestFrame); (window as unknown as Record<string, unknown>).__engine = engine; (window as unknown as Record<string, unknown>).__stroke = stroke; (window as unknown as Record<string, unknown>).__BRUSHES = BRUSHES;
}
function showFatal(message: string) { const el = document.createElement('div'); el.className = 'panel'; el.style.cssText = 'top:50%;left:50%;transform:translate(-50%,-50%);max-width:420px;text-align:center;color:var(--ink);line-height:1.6'; el.innerHTML = `<b style="color:var(--accent)">WebGPU unavailable</b><br><br>${message}`; document.body.appendChild(el); }
main();
