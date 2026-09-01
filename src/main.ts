// aniso-paint — app entry.
import { initGpu, resizeToDisplay, describeAdapter, WebGpuUnavailable, type Gpu } from './engine/gpu';
import { maybeRunSoak } from './soak';
import { DryOutOverlay } from './ui/dryout-overlay';
import { maybeRunBanding } from './bench/banding-bench';
import { maybeRunFishScale } from './bench/fish-scale-bench';
import { esc, ok, warn, verdict, headline } from './bench/panel';
import { PointerInput, type StylusSample } from './input/pointer';
import { attachPinch } from './input/pinch';
import { wrapAngle, snapRight } from './input/angle';
import { StrokeEngine } from './input/stroke';
import { Studio as Palette } from './ui/studio';
import { CommandPalette } from './ui/command-palette';
import { CanvasEngine } from './engine/canvas';
import { PAPERS } from './substrate/papers';
import { BRUSHES } from './brush/library';
import { DEFAULT_FLUID } from './engine/fluid';
import { AutoReload } from './input/auto-reload';
import { WATERCOLOR, DRY_TOOLS, WET_MEDIA } from './media/library';
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
  /* The artist's own Smear dial, remembered so smudge mode can borrow the
     setting and hand it back rather than overwriting it. */
  let paintingSmear = DEFAULT_FLUID.smearStrength;
  const palette = new Palette(document.body, {
    onMixChange(_hex, recipe, loading) { engine.setMix(recipe); stroke.charge(engine.mixWeights, loading, waterCharge); },
    onPaperChange(paper) { engine.setPaper(paper); requestFrame(); }, onEvapChange(evapRate) { engine.setFluid({ evapRate }); },
    /* One call, the whole row: viscosity, drag, yield stress, drying, the rim
       controls. The engine reads a material; it does not know their names. */
    onWetMedium(medium) { engine.setWetMedium(medium); stroke.setWetMedium(medium); autoReload.setEnabled(medium.slug === 'oil'); requestFrame(); },
    onAutoReload(seconds) { autoReload.setSeconds(seconds); showMode(); },
    onYieldChange(yieldStress) { engine.setFluid({ yieldStress }); },
    onSmearChange(smearStrength) { paintingSmear = smearStrength; if (autoReload.mode !== 'smudge') engine.setFluid({ smearStrength }); },
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
    onClear() { strokeCount = 0; engine.clear(); stroke.clearDryMarks(); engine.setMix(palette.recipe); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge); requestFrame(); },
    onWaterView(on) { engine.waterView = on; requestFrame(); },
    onOilBehaviours(flags) { engine.setOilBehaviours(flags); requestFrame(); },
    onBrushChange(def, size) { setConteSelected(false); stroke.setBrush(def, size); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge); updatePenCursorContact(); },
    onDryMedium(medium, size) { stroke.setDryMedium(medium, size); engine.setDryMix(new Map(medium.pigments)); setConteSelected(medium.form === 'stick'); updatePenCursorContact(); },
    onRinse() { stroke.rinse(1); }, onRinseLoad() { stroke.rinse(1); engine.setMix(palette.recipe); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge); },
    onReadouts(on) { watchGauges(on); },
  }, WATERCOLOR.evapRate);
  engine.setPaper(PAPERS[1]); engine.setWetMedium(WATERCOLOR); stroke.setWetMedium(WATERCOLOR); engine.setMix(palette.recipe); if (palette.recipe.size === 0) palette.add('ultramarine-blue'); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge);
  /* EXPERIMENTAL, oil only (docs/20 §16). Lift the pen for the set time and the
     brush empties into a smudging tool; lift again and the load comes back. The
     brush is emptied with `rinse(0)`, which also clears the mix — so `begin()`'s
     automatic re-dip at the start of the next stroke re-dips into nothing and
     the mode survives, rather than being undone by the very next stroke. */
  const autoReload = new AutoReload();
  const modeBadge = document.createElement('div');
  modeBadge.className = 'mode-badge';
  modeBadge.hidden = true;
  document.body.appendChild(modeBadge);
  const showMode = () => {
    modeBadge.hidden = !autoReload.active;
    modeBadge.textContent = autoReload.mode === 'smudge' ? 'Smudge' : 'Paint';
    modeBadge.classList.toggle('smudge', autoReload.mode === 'smudge');
  };
  /* MEASURED, docs/20 §16e. The shove saturates: smearStrength 1 drags paint
     0.53 cells per pass, 16 drags 0.99, and 64 is no better than 16 because
     `fraction` is pinned at its 0.9 ceiling. So 16 IS the mechanism's ceiling
     and there is no point going higher. Applied only while smudging, and the
     medium's own row is restored on the way back, so a loaded brush paints
     exactly as it did. */
  const SMUDGE_SMEAR = 16;
  autoReload.onFlip = (mode) => {
    if (mode === 'smudge') {
      engine.setFluid({ smearStrength: SMUDGE_SMEAR });
    } else {
      engine.setFluid({ smearStrength: paintingSmear });
    }
    /* `rinse(0)` empties the tuft but is NOT enough on its own: `stroke.begin()`
       re-dips at the start of every stroke, so the very next stroke refilled the
       brush with clear medium and laid 248 of film with no colour in it. The
       loading has to go to zero as well, because that is what `begin()` re-dips
       WITH. Charging an empty mix at zero loading does both. */
    stroke.setSmudging(mode === 'smudge');
    if (mode === 'smudge') stroke.charge(new Float32Array(8), 0, 0);
    else stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge);
    showMode();
    requestFrame();
  };

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
  cmd.register({ id: 'act-clear', name: 'Clear Sheet', group: 'Actions', hint: 'Wipe the painting', keywords: 'clear wipe erase delete', action: () => { engine.clear(); stroke.clearDryMarks(); engine.setMix(palette.recipe); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge); requestFrame(); } });
  cmd.register({ id: 'act-rinse', name: 'Rinse Brush', group: 'Actions', hint: 'Pigment out, clean water in', keywords: 'rinse wash clean water', action: () => stroke.rinse(1) });
  cmd.register({ id: 'act-rinse-load', name: 'Rinse & Re-dip', group: 'Actions', hint: 'Rinse then reload current mix', keywords: 'rinse load dip reload', action: () => { stroke.rinse(1); engine.setMix(palette.recipe); stroke.charge(engine.mixWeights, palette.loading, palette.waterCharge); } });
  cmd.register({ id: 'act-clear-mix', name: 'Clear Mix', group: 'Actions', hint: 'Empty the colour recipe', keywords: 'mix clear empty color', action: () => { palette.clear(); stroke.rinse(1); } });
  /* Dry-out marks. See src/ui/dryout-overlay.ts for what the rungs mean and
     why there is a ladder rather than the single line that was asked for. */
  const dryOut = new DryOutOverlay();
  cmd.register({ id: 'act-dryout', name: 'Toggle Dry-Out Marks', group: 'Actions', hint: 'Red lines where the brush ran low on paint', keywords: 'dry out empty reservoir paint runs out marks debug brush load', action: () => { dryOut.toggle(); requestFrame(); } });
  cmd.register({ id: 'act-dryout-clear', name: 'Clear Dry-Out Marks', group: 'Actions', hint: 'Forget the red lines, keep the painting', keywords: 'dry out marks clear forget reset', action: () => { stroke.clearDryMarks(); requestFrame(); } });
  cmd.register({ id: 'act-water-view', name: 'Toggle Water View', group: 'Actions', hint: 'See where water is, not colour', keywords: 'water view debug display', action: () => { engine.waterView = !engine.waterView; requestFrame(); } });
  /* Topographic contours over the paint. The steps are a ladder rather than a
     slider because the useful ones span two orders of magnitude — 0.002 reads a
     watercolour glaze, 0.05 reads four stacked oil passes — and hunting for that
     on a linear dial is worse than stepping through it. */
  const CONTOUR_STEPS = [0.05, 0.02, 0.01, 0.005, 0.002];
  cmd.register({ id: 'act-contours', name: 'Toggle Paint Contours', group: 'Actions', hint: 'Topographic lines over the paint height', keywords: 'contour topographic relief height debug oil impasto', action: () => { engine.setContourStep(engine.contourStep > 0 ? 0 : CONTOUR_STEPS[1]); requestFrame(); } });
  /* The terrain view brings its own contours on, because elevation colour with
     no lines reads as a heat map rather than a map. Turning it off puts the
     picture back exactly as it was. */
  cmd.register({ id: 'act-terrain', name: 'Toggle Terrain View', group: 'Actions', hint: 'Read the paint as a landscape: elevation colour, hillshade, contours', keywords: 'terrain topographic elevation hillshade height map debug oil impasto', action: () => {
    engine.heightView = !engine.heightView;
    engine.setContourStep(engine.heightView ? CONTOUR_STEPS[1] : 0);
    requestFrame();
  } });
  const CEILINGS = [0.60, 0.30, 0.15, 0.08, 0.04];
  cmd.register({ id: 'act-terrain-ceiling-down', name: 'Terrain: Lower the Ceiling', group: 'Actions', hint: 'Spread the colour ramp over thinner paint', keywords: 'terrain ceiling elevation range colour ramp', action: () => {
    const i = CEILINGS.findIndex((s) => Math.abs(s - engine.heightCeiling) < 1e-9);
    engine.setHeightCeiling(CEILINGS[Math.min(CEILINGS.length - 1, (i < 0 ? 1 : i) + 1)]);
    requestFrame();
  } });
  cmd.register({ id: 'act-terrain-ceiling-up', name: 'Terrain: Raise the Ceiling', group: 'Actions', hint: 'Spread the colour ramp over thicker paint', keywords: 'terrain ceiling elevation range colour ramp', action: () => {
    const i = CEILINGS.findIndex((s) => Math.abs(s - engine.heightCeiling) < 1e-9);
    engine.setHeightCeiling(CEILINGS[Math.max(0, (i < 0 ? 1 : i) - 1)]);
    requestFrame();
  } });
  cmd.register({ id: 'act-contours-finer', name: 'Paint Contours: Finer', group: 'Actions', hint: 'Closer spacing between height lines', keywords: 'contour topographic finer closer height', action: () => {
    const i = CONTOUR_STEPS.findIndex((s) => Math.abs(s - engine.contourStep) < 1e-9);
    engine.setContourStep(CONTOUR_STEPS[Math.min(CONTOUR_STEPS.length - 1, (i < 0 ? 0 : i) + 1)]);
    requestFrame();
  } });
  cmd.register({ id: 'act-contours-coarser', name: 'Paint Contours: Coarser', group: 'Actions', hint: 'Wider spacing between height lines', keywords: 'contour topographic coarser wider height', action: () => {
    const i = CONTOUR_STEPS.findIndex((s) => Math.abs(s - engine.contourStep) < 1e-9);
    engine.setContourStep(CONTOUR_STEPS[Math.max(0, (i < 0 ? 1 : i) - 1)]);
    requestFrame();
  } });
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
    onStrokeStart(s: StylusSample) { painting = true; strokeCount++; setHand(); autoReload.penDown(); const g = toGridRaw(s); stroke.begin(g.gx, g.gy, onPaper(s)); requestFrame(); }, onStrokeEnd() { painting = false; setHand(); stroke.end(); autoReload.penUp(); },
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
  function frame() { framePending = false; const resized = resizeToDisplay(gpu); const dry = stroke.drainDry(); if (dry.count > 0) engine.depositDry(dry.data, dry.count, dry.edge, dry.profile, dry.surfaceMobility, dry.compactionAmount); const { data, count, dx, dy } = stroke.drain(); /* Smudging: the tuft keeps its whole grab but is given no room, so `deposit.wgsl` sends all of it down the SHOVE route instead of the drink one — which is what an already-full brush does, and what pushing paint about is. An empty brush left to itself would do the opposite and drink the picture up. */ const take = autoReload.mode === 'smudge' ? 0 : stroke.brushTake; engine.step(data, count, dx, dy, stroke.brushMix, take, stroke.brushGrab); const shouldRender = renderRequested || resized || dry.count > 0 || count > 0 || engine.isFluidActive; renderRequested = false; if (shouldRender) engine.render(); dryOut.draw(stroke.dryMarks, engine, gpu.canvas.width, gpu.canvas.height); if (++gaugeTick % 10 === 0) paintGauges(); if (engine.isFluidActive) requestFrame(); }
  /* What the tuft lifts off the sheet goes back into the tuft. The engine
     subtracts it on the GPU and reports the exact amount here. */
  engine.onPickUp = (water, pigment) => stroke.pickUp(water, pigment);
  stroke.onBrushReset = () => engine.discardPickup();
  requestFrame(); window.addEventListener('resize', requestFrame); (window as unknown as Record<string, unknown>).__engine = engine; (window as unknown as Record<string, unknown>).__stroke = stroke; (window as unknown as Record<string, unknown>).__dryOut = dryOut; (window as unknown as Record<string, unknown>).__BRUSHES = BRUSHES; (window as unknown as Record<string, unknown>).__MEDIA = WET_MEDIA; (window as unknown as Record<string, unknown>).__autoReload = autoReload; maybeRunSoak(engine, stroke); maybeRunBanding(engine, stroke); maybeRunFishScale(engine, stroke); maybeRunPickupCheck(engine, stroke);
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
      /* A pair that agrees is the only claim this suite can make on its own:
         "run it twice before believing it" is the house rule, and a row that
         reproduced is a row that passed. Green says reproduced; amber says the
         two identical runs disagreed, which has bitten this bench before and is
         worth seeing before the numbers are read. Crossing and stacking have
         only STALE reference figures beside them (measured 44.9% against a
         "~33%" written before the docs/17 pickup rework, on both the current
         shaders and their baseline), so they get no pass/fail verdict of their
         own - inventing one would paint a false red. */
      const pair = (a: unknown, b: unknown, text: string) =>
        (String(a) === String(b) ? ok : warn)(text);
      panel.innerHTML = headline('pass', 'OIL PICKUP REGRESSION — finished') + '\n\n' +
        pair(line(runs[0]), line(runs[1]), `run 1  ${line(runs[0])}\nrun 2  ${line(runs[1])}`) + '\n\n' +
        esc('Reference: lifted about 33%; trail 12.4% -> 1.8%.\n' +
            'The canvas shows the final yellow-through-blue crossing.');
      if (full) {
        panel.innerHTML = esc('PAINT REGRESSION SUITE\n\ncrossing done; running Oil stacking…');
        const stacking = [await bench.stacking(e, s), await bench.stacking(e, s)];
        panel.innerHTML = esc('PAINT REGRESSION SUITE\n\nstacking done; running brush holding…');
        const holding = [await bench.holding(e, s), await bench.holding(e, s)];
        panel.innerHTML = esc('PAINT REGRESSION SUITE\n\nholding done; running Watercolour control…');
        const water = [await bench.watercolourControl(e, s), await bench.watercolourControl(e, s)];
        const held = holding[0].passed && holding[1].passed;
        const trail = (r: Record<string, any>) =>
          r.trailBlueByDistance.map((p: { bluePct: number }) => p.bluePct).join(' -> ');
        // Drift is the one figure with a live criterion rather than a stale
        // reference: the sheet must not invent or lose pigment while it sits.
        const noDrift = Number(water[0].pigmentDrift) === 0 && Number(water[1].pigmentDrift) === 0;
        panel.innerHTML =
          headline(held && noDrift ? 'pass' : 'fail', 'PAINT REGRESSION SUITE — finished') + '\n\n' +
          pair(runs[0].bluePigmentRemovedPct, runs[1].bluePigmentRemovedPct,
            `crossing lift  ${runs[0].bluePigmentRemovedPct}% / ${runs[1].bluePigmentRemovedPct}%`) + '\n' +
          pair(trail(runs[0]), trail(runs[1]), `crossing trail ${trail(runs[0])}`) + '\n' +
          pair(stacking[0].lastGainVsFirst, stacking[1].lastGainVsFirst,
            `stack last/first ${stacking[0].lastGainVsFirst} / ${stacking[1].lastGainVsFirst}`) + '\n' +
          verdict(held, `holding peak ${holding[0].peak}% / ${holding[1].peak}% | passed ${held}`) + '\n' +
          pair(water[0].pigment, water[1].pigment,
            `Watercolour pigment canvas ${water[0].pigment} / ${water[1].pigment}`) + '\n' +
          verdict(noDrift,
            `Watercolour drift after 20 frames ${water[0].pigmentDrift} / ${water[1].pigmentDrift}`) + '\n\n' +
          esc('References: stacking ~0.897; holding ~92.6%; Watercolour drift 0.\n') +
          esc('Green = met its stated criterion, or reproduced across the pair.');
      }
    } catch (err) {
      panel.innerHTML = headline('fail', 'OIL PICKUP REGRESSION — ERROR') + '\n\n' + esc(String(err));
    }
  }, 50);
}
function showFatal(message: string) { const el = document.createElement('div'); el.className = 'panel'; el.style.cssText = 'top:50%;left:50%;transform:translate(-50%,-50%);max-width:420px;text-align:center;color:var(--ink);line-height:1.6'; el.innerHTML = `<b style="color:var(--accent)">WebGPU unavailable</b><br><br>${message}`; document.body.appendChild(el); }
main();
