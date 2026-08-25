/*
 * Two fingers: pinch, roll and drag, all at once.
 *
 * The zoom itself was already the right kind — `zoomAt` moves the view about a
 * point so the paper stays under your fingers, and the view transform lives in
 * the composite shader, so the sheet is re-rendered at display resolution
 * rather than a bitmap being stretched. That is why it stays sharp all the way
 * in, and why rolling it costs nothing either. What was missing was any way to
 * drive it with a hand: the only inputs were the wheel and a space-drag, which
 * an iPad has neither of.
 *
 * Rules this follows:
 *
 *   Only touch counts. A pen is always drawing, never zooming — resting two
 *   fingers on the glass while working with an Apple Pencil is normal, and it
 *   must not throw the view around.
 *
 *   The second finger cancels the stroke. Landing it a moment after the first
 *   would otherwise leave a stray mark on the way into a pinch.
 *
 *   Zoom, roll and pan happen together. Fingers that spread while they twist
 *   while they travel do all three, because that is what hands do. Each of the
 *   three is defined as "keep the point between the fingers where it is", so
 *   they compose without fighting each other.
 */

import { wrapAngle, snapRight } from './angle';

export interface PinchView {
  zoomAt(factor: number, docX: number, docY: number): void;
  panBy(dxScreen: number, dyScreen: number, viewW: number, viewH: number): void;
  rotateAt(delta: number, docX: number, docY: number): void;
  readonly rot: number;
}

export interface PinchOptions {
  view: PinchView;
  /** Canvas pixels per CSS pixel. */
  dpr(): number;
  /** Canvas-space pixels to document coordinates. */
  toDoc(px: number, py: number): { dx: number; dy: number };
  /** Drawing-buffer size, for panBy. */
  viewSize(): { w: number; h: number };
  /** Redraw, and refresh whatever shows the zoom level. */
  onChange(): void;
  /** A pinch has begun: abandon any stroke in progress. */
  onStart?(): void;
  onEnd?(): void;
}

interface Finger { x: number; y: number }

/**
 * How far the fingers must twist before the sheet starts turning: about eight
 * degrees. Almost no pinch is a pure pinch — closing two fingers rolls them a
 * little every time — and with no threshold at all every zoom would leave the
 * paper slightly askew. Once crossed, the threshold is subtracted rather than
 * discarded, so the sheet picks up from where the twist already is instead of
 * jumping forward by eight degrees the moment it engages.
 */
const ROT_ENGAGE = 0.14;

export function attachPinch(canvas: HTMLElement, o: PinchOptions) {
  const fingers = new Map<number, Finger>();
  let last: { gap: number; cx: number; cy: number; ang: number } | null = null;
  let active = false;

  /* Rotation bookkeeping. `raw` is what the fingers have asked for with no
     snapping applied and `applied` is what the engine was last told, so the
     magnet at each right angle costs the same twist to leave as to enter. */
  let twist = 0;
  let engaged = false;
  let raw = 0;
  let applied = 0;

  const measure = () => {
    const [a, b] = [...fingers.values()];
    return {
      gap: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      ang: Math.atan2(b.y - a.y, b.x - a.x),
    };
  };

  /* Take a fresh reading without moving anything. Needed whenever the pair
     changes: a third finger landing and lifting swaps which two are measured,
     and the angle between them can flip a half turn with nobody having moved. */
  const reseed = () => {
    last = measure();
    twist = 0;
    engaged = false;
    raw = o.view.rot;
    applied = o.view.rot;
  };

  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2) {
      active = true;
      reseed();
      o.onStart?.();
    }
  };

  const move = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size !== 2 || !last) return;
    e.preventDefault();

    const now = measure();
    const rect = canvas.getBoundingClientRect();
    const dpr = o.dpr();
    const { dx, dy } = o.toDoc((now.cx - rect.left) * dpr, (now.cy - rect.top) * dpr);

    // Zoom about the point between the fingers, so whatever is under them stays
    // under them.
    const factor = now.gap / last.gap;
    if (factor !== 1) o.view.zoomAt(factor, dx, dy);

    // Roll about that same point.
    const step = wrapAngle(now.ang - last.ang);
    if (engaged) {
      raw += step;
    } else {
      twist += step;
      if (Math.abs(twist) > ROT_ENGAGE) {
        engaged = true;
        raw += twist - Math.sign(twist) * ROT_ENGAGE;
      }
    }
    if (engaged) {
      const want = snapRight(raw);
      o.view.rotateAt(want - applied, dx, dy);
      applied = want;
    }

    // And carry the sheet along with the hand.
    const { w, h } = o.viewSize();
    o.view.panBy((now.cx - last.cx) * dpr, (now.cy - last.cy) * dpr, w, h);

    last = now;
    o.onChange();
  };

  const up = (e: PointerEvent) => {
    if (!fingers.delete(e.pointerId)) return;
    if (fingers.size === 2) { reseed(); return; }
    if (fingers.size < 2 && active) {
      // Stay suppressed until every finger is off the glass. Lifting one of two
      // and carrying on with the other would otherwise start a stroke from
      // wherever that finger happened to be.
      if (fingers.size === 0) { active = false; o.onEnd?.(); }
      last = null;
    }
  };

  canvas.addEventListener('pointerdown', down, { capture: true, passive: true });
  canvas.addEventListener('pointermove', move, { capture: true, passive: false });
  canvas.addEventListener('pointerup', up, { capture: true, passive: true });
  canvas.addEventListener('pointercancel', up, { capture: true, passive: true });

  return {
    /** True from the moment a second finger lands until the last one lifts. */
    get active() { return active; },
  };
}
