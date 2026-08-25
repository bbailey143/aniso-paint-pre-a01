// Pen tablet input via the Pointer Events API (D11).
//
// Gives pressure, tiltX/tiltY, and twist (barrel roll) where the hardware and
// browser expose them. Velocity is derived from position/time deltas. Coalesced
// events (getCoalescedEvents) recover the high-frequency samples the browser
// batched into one frame — essential feedstock for the stroke resampler (Card 6:
// never move more than one cell per step, or strokes bead into dots).

export interface StylusSample {
  /** Position in CSS pixels relative to the canvas top-left. */
  x: number;
  y: number;
  /** Position in device pixels (CSS × dpr) — canvas/texture space. */
  px: number;
  py: number;
  /** 0..1. Pens give real values; mouse reports 0.5 while a button is down. */
  pressure: number;
  /** Degrees, -90..90, as reported. */
  tiltX: number;
  tiltY: number;
  /** Derived tilt magnitude from vertical, 0 (upright) .. ~90 (flat), degrees. */
  tiltAngle: number;
  /** Derived azimuth of the tilt direction, degrees 0..360 (0 = +x). */
  tiltAzimuth: number;
  /** Barrel roll, degrees 0..359, where supported (else 0). */
  twist: number;
  /** Speed in device px per ms (0 for the first sample of a stroke). */
  velocity: number;
  /** Milliseconds since the previous sample in this stroke. */
  dt: number;
  /** High-resolution event timestamp (ms). */
  time: number;
  pointerType: string;
  /** True while the tip/button is down (a stroke is in progress). */
  down: boolean;
}

export interface PointerCallbacks {
  onStrokeStart?(s: StylusSample): void;
  onStrokeMove?(s: StylusSample): void;
  onStrokeEnd?(s: StylusSample): void;
  /** Every sample including hover (down=false), after per-sample derivation. */
  onSample?(s: StylusSample): void;
  /** Pointer left the painting surface while not captured in a stroke. */
  onPointerLeave?(pointerType: string): void;
  /**
   * Asked before a stroke is allowed to begin. Return true and the press is
   * ignored entirely — no stroke starts, so nothing can be laid down.
   *
   * This exists so navigating the sheet cannot paint on it: space-drag panning
   * and a middle-button drag both put a press on the canvas that must not
   * become a mark. Checked only on the way DOWN. A stroke already in progress
   * is never interrupted, which is how every drawing app behaves and stops a
   * mistimed keypress from tearing a line in half.
   */
  shouldIgnorePress?(e: PointerEvent): boolean;
}

export class PointerInput {
  private canvas: HTMLCanvasElement;
  private cb: PointerCallbacks;
  private dprGetter: () => number;
  private activeId: number | null = null;
  private prev: { px: number; py: number; time: number } | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    dprGetter: () => number,
    cb: PointerCallbacks,
  ) {
    this.canvas = canvas;
    this.cb = cb;
    this.dprGetter = dprGetter;
    canvas.addEventListener('pointerdown', this.onDown, { passive: false });
    canvas.addEventListener('pointermove', this.onMove, { passive: false });
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    /* Backstop: a stroke ends when the pointer lifts, wherever it lifts.
       Capture normally routes the release back here, but a capture that was
       never acquired or was lost leaves the release landing on whatever is
       under the hand — a HUD window, the rail, the dock — and the canvas never
       hears it. The stroke then never ends. Bubble phase, so for a release
       that IS on the canvas the listener above still runs first and this one
       finds nothing left to do. */
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('pointerleave', this.onLeave);
    // Block the browser's default touch/scroll gestures over the canvas.
    canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  }

  private toSample(e: PointerEvent, down: boolean): StylusSample {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this.dprGetter();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = x * dpr;
    const py = y * dpr;
    const time = e.timeStamp;

    const tiltX = e.tiltX ?? 0;
    const tiltY = e.tiltY ?? 0;
    // Compose the two tilt components into a magnitude-from-vertical and azimuth.
    const tx = Math.tan((tiltX * Math.PI) / 180);
    const ty = Math.tan((tiltY * Math.PI) / 180);
    const tiltAngle = (Math.atan(Math.hypot(tx, ty)) * 180) / Math.PI;
    let tiltAzimuth = (Math.atan2(ty, tx) * 180) / Math.PI;
    if (tiltAzimuth < 0) tiltAzimuth += 360;

    let velocity = 0;
    let dt = 0;
    if (this.prev) {
      dt = Math.max(time - this.prev.time, 0.0001);
      velocity = Math.hypot(px - this.prev.px, py - this.prev.py) / dt;
    }

    return {
      x, y, px, py,
      pressure: e.pressure,
      tiltX, tiltY, tiltAngle, tiltAzimuth,
      twist: e.twist ?? 0,
      velocity, dt, time,
      pointerType: e.pointerType,
      down,
    };
  }

  private emit(s: StylusSample) {
    this.cb.onSample?.(s);
    this.prev = { px: s.px, py: s.py, time: s.time };
  }

  private onDown = (e: PointerEvent) => {
    if (this.activeId !== null) return;
    // Only the primary button paints. A middle-drag is panning and a right-click
    // is a menu; neither should leave paint on the sheet.
    if (e.button !== 0) return;
    if (this.cb.shouldIgnorePress?.(e)) return;
    e.preventDefault();
    this.activeId = e.pointerId;
    // A pointer can be gone before this runs - a pen lifted clear of the
    // tablet, a touch the browser cancelled. Capture is a convenience, not a
    // precondition, so failing to get it must not stop the stroke.
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* already gone */ }
    this.prev = null;
    const s = this.toSample(e, true);
    this.cb.onStrokeStart?.(s);
    this.emit(s);
  };

  private onMove = (e: PointerEvent) => {
    const down = e.pointerId === this.activeId;
    e.preventDefault();
    // Coalesced events give every sample the browser batched into this frame.
    const events = typeof e.getCoalescedEvents === 'function'
      ? e.getCoalescedEvents()
      : [e];
    const batch = events.length ? events : [e];
    for (const ev of batch) {
      const s = this.toSample(ev, down);
      if (down) this.cb.onStrokeMove?.(s);
      this.emit(s);
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.activeId) return;
    e.preventDefault?.();
    const s = this.toSample(e, false);
    this.cb.onStrokeEnd?.(s);
    this.emit(s);
    // Clear the stroke BEFORE letting go of the pointer. Releasing capture for
    // a pointer that has already left throws, and when that throw landed here
    // it skipped these two lines - leaving activeId set, so `onDown` refused
    // every stroke afterwards and the canvas went dead for the session.
    this.activeId = null;
    this.prev = null;
    try { this.canvas.releasePointerCapture?.(e.pointerId); } catch { /* already gone */ }
  };

  private onLeave = (e: PointerEvent) => {
    if (e.pointerId === this.activeId) return; // captured strokes keep going
    this.prev = null;
    this.cb.onPointerLeave?.(e.pointerType);
  };
}
