// A draggable response curve.
//
// Studios are full of relationships that are not single numbers: how pressure
// becomes width, how tilt becomes spread, how speed becomes breakup. Those are
// curves, and an artist should be able to grab one and bend it rather than type
// a coefficient and guess.
//
// Deliberately not a bezier editor with handles. Handles are a drawing-tool
// idiom and they invite fiddling with the handle rather than the shape. These
// are points ON the curve, and the LINE ITSELF is the target:
//
//   * Grab the line anywhere and bend it. A point appears where you took hold,
//     already following your finger, so there is no separate "add" step.
//   * Grab an existing point and move it.
//   * Drag a point clear off the top or bottom to throw it away. The curve
//     redraws without it while you are still holding it, so you can see what
//     you are about to get before you commit to it.
//
// The two ends are pinned and cannot be removed. A response curve with no value
// at no-pressure is not a curve, it is a hole.
//
// The curve is normalised 0..1 in both axes. What the axes MEAN belongs to the
// studio that mounts it — this knows nothing about pressure or paint.

export interface CurvePoint { x: number; y: number }

export interface CurveOptions {
  /** Starting shape. First and last x are pinned to the ends. */
  points?: CurvePoint[];
  /** Fired on every drag, and once on release with `final` true. */
  onChange?(points: CurvePoint[], final: boolean): void;
}

/** How near the line counts as grabbing it, in CSS pixels. Generous: this is
 *  aimed at with a fingertip, not a mouse. */
const GRAB_PX = 22;
/** Dragged this far past the top or bottom edge, a point is being thrown away,
 *  as a fraction of the box height. Far enough that it cannot happen while
 *  someone is simply pushing a value hard against its limit. */
const DISCARD_MARGIN = 0.22;
/** Interior points keep this much room either side, so the curve can never fold
 *  back on itself and a new point can never land exactly on an old one. */
const MIN_GAP = 0.02;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Sample a set of points. Free-standing so the drag can preview the shape a
 *  discard would leave without disturbing the live set. */
function sample(points: CurvePoint[], x: number): number {
  const t = clamp01(x);
  for (let i = 0; i < points.length - 1; i++) {
    if (t >= points[i].x && t <= points[i + 1].x) {
      const span = Math.max(1e-6, points[i + 1].x - points[i].x);
      const u = (t - points[i].x) / span;
      // Smoothstep between neighbours: continuous slope at the joins without
      // the overshoot a spline would give, which on a response curve would mean
      // a value the artist never asked for.
      return points[i].y + (points[i + 1].y - points[i].y) * (u * u * (3 - 2 * u));
    }
  }
  return points[points.length - 1].y;
}

export class ResponseCurve {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private points: CurvePoint[];
  private dragging = -1;
  /** True while the held point is outside the box and would be discarded. */
  private discarding = false;
  private opts: CurveOptions;
  private ro?: ResizeObserver;

  constructor(mount: HTMLElement, opts: CurveOptions = {}) {
    this.opts = opts;
    this.points = (opts.points ?? [
      { x: 0, y: 0 }, { x: 0.33, y: 0.33 }, { x: 0.66, y: 0.66 }, { x: 1, y: 1 },
    ]).map((p) => ({ ...p }));

    this.canvas = document.createElement('canvas');
    mount.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    // Redraw on resize: the studio splits its layout at 900px, so this element
    // genuinely changes size in use rather than only at startup.
    if ('ResizeObserver' in window) {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(mount);
    }
    this.resize();

    mount.addEventListener('pointerdown', this.onDown);
    mount.addEventListener('pointermove', this.onMove);
    mount.addEventListener('pointerup', this.onUp);
    mount.addEventListener('pointercancel', this.onUp);
  }

  /**
   * The curve as it currently READS — which, while a point is held out for
   * discard, is the curve without it. What is drawn and what is sampled have
   * to be the same thing, or a studio live-previewing a material would show a
   * mark that does not match the line the artist is looking at.
   */
  private active(): CurvePoint[] {
    return this.discarding ? this.points.filter((_, i) => i !== this.dragging) : this.points;
  }

  /** Sample the curve. This is what a studio feeds into a material row. */
  valueAt(x: number): number { return sample(this.active(), x); }

  get value(): CurvePoint[] { return this.active().map((p) => ({ ...p })); }

  set value(next: CurvePoint[]) {
    this.points = next.map((p) => ({ ...p }));
    this.draw();
  }

  destroy() { this.ro?.disconnect(); this.canvas.remove(); }

  private resize() {
    const rect = this.canvas.parentElement!.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.draw();
  }

  /** Pointer position in curve space. Deliberately NOT clamped: a drag that
   *  has left the box is how a point gets thrown away, so the raw value has to
   *  survive as far as the caller. */
  private toLocal(ev: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) / Math.max(1, r.width),
      y: 1 - (ev.clientY - r.top) / Math.max(1, r.height),
      w: r.width,
      h: r.height,
    };
  }

  private onDown = (ev: PointerEvent) => {
    ev.preventDefault();
    const { x, y, w, h } = this.toLocal(ev);

    // An existing point wins over the line, so grabbing a point you can see
    // never silently spawns a second one on top of it.
    let hit = -1;
    let best = GRAB_PX;
    this.points.forEach((p, i) => {
      const d = Math.hypot((p.x - x) * w, (p.y - y) * h);
      if (d < best) { best = d; hit = i; }
    });

    if (hit < 0) {
      // Not on a point — is it on the line? Compare against the curve's own
      // height at this x, in pixels, so the target is the same thickness
      // wherever the curve happens to be steep.
      const onCurve = sample(this.points, clamp01(x));
      if (Math.abs(onCurve - y) * h > GRAB_PX) return;
      if (x <= MIN_GAP || x >= 1 - MIN_GAP) return;   // the ends are already there

      // Take hold of the line by putting a point exactly where it already is,
      // so the curve does not jump the moment it is touched.
      let at = this.points.findIndex((p) => p.x > x);
      if (at < 0) at = this.points.length - 1;
      const left = this.points[at - 1];
      const right = this.points[at];
      if (x - left.x < MIN_GAP || right.x - x < MIN_GAP) return;
      this.points.splice(at, 0, { x, y: onCurve });
      hit = at;
    }

    this.dragging = hit;
    this.discarding = false;
    try { this.canvas.parentElement!.setPointerCapture(ev.pointerId); } catch { /* keep dragging */ }
    this.draw();
  };

  private onMove = (ev: PointerEvent) => {
    if (this.dragging < 0) return;
    ev.preventDefault();
    const { x, y } = this.toLocal(ev);
    const i = this.dragging;
    const interior = i > 0 && i < this.points.length - 1;

    // Only interior points can be thrown away, and only once the drag is a
    // clear distance outside the box rather than merely pressed against its
    // edge — otherwise pushing a value to full would start deleting things.
    this.discarding = interior && (y > 1 + DISCARD_MARGIN || y < -DISCARD_MARGIN);

    const p = this.points[i];
    p.y = clamp01(y);
    if (interior) {
      p.x = Math.min(this.points[i + 1].x - MIN_GAP, Math.max(this.points[i - 1].x + MIN_GAP, x));
    }
    this.draw();
    this.opts.onChange?.(this.value, false);
  };

  private onUp = (ev: PointerEvent) => {
    if (this.dragging < 0) return;
    if (this.discarding) this.points.splice(this.dragging, 1);
    this.dragging = -1;
    this.discarding = false;
    try { this.canvas.parentElement!.releasePointerCapture(ev.pointerId); } catch { /* already gone */ }
    this.draw();
    this.opts.onChange?.(this.value, true);
  };

  private draw() {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const css = (name: string, fallback: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    const grid = css('--color-graphite', '#23252a');
    const line = css('--accent-primary', '#e4f222');
    const dot = css('--color-mist', '#d0d6e0');
    const doomed = css('--color-coral-red', '#eb5757');

    ctx.clearRect(0, 0, w, h);

    // Quarter grid. Enough to read a slope against, quiet enough to ignore.
    ctx.strokeStyle = grid;
    ctx.lineWidth = Math.max(1, w / 600);
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
      const gx = (w * i) / 4;
      const gy = (h * i) / 4;
      ctx.moveTo(gx, 0); ctx.lineTo(gx, h);
      ctx.moveTo(0, gy); ctx.lineTo(w, gy);
    }
    ctx.stroke();

    // While a point is being thrown away, draw the shape its absence leaves —
    // seeing the result before letting go is the whole point of the gesture.
    const shown = this.active();

    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1.5, w / 320);
    ctx.beginPath();
    const steps = 96;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = t * w;
      const py = h - sample(shown, t) * h;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    const r = Math.max(3, w / 120);
    this.points.forEach((p, i) => {
      const held = i === this.dragging;
      const going = held && this.discarding;
      ctx.beginPath();
      ctx.arc(p.x * w, h - p.y * h, going ? r * 1.15 : r, 0, Math.PI * 2);
      if (going) {
        // Hollow and coral: about to be gone, and not pretending otherwise.
        ctx.strokeStyle = doomed;
        ctx.lineWidth = Math.max(1.5, w / 340);
        ctx.stroke();
      } else {
        ctx.fillStyle = held ? line : dot;
        ctx.fill();
      }
    });
  }
}
