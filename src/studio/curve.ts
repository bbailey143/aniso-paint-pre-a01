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
//   * Double-tap a point to remove it.
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
/** Two taps closer together than this on the same point removes it. */
const DOUBLE_TAP_MS = 320;
/** Movement past this many pixels makes an interaction a drag, not a tap, so
 *  adjusting a point and grabbing it again cannot delete it by accident. */
const TAP_SLOP_PX = 4;
/** Interior points keep this much room either side, so the curve can never fold
 *  back on itself and a new point can never land exactly on an old one. */
const MIN_GAP = 0.02;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Tangents for a monotone cubic (Fritsch-Carlson).
 *
 * The obvious smooth interpolations are both wrong here. A smoothstep between
 * each neighbouring pair flattens the slope at EVERY point, which is what gives
 * a lumpy, stepped-looking line. Catmull-Rom is properly smooth but overshoots:
 * it will swing above or below the points on its way between them, and on a
 * response curve an overshoot is a value the artist never asked for — a brush
 * that gets wider than full pressure ever requested.
 *
 * Monotone cubic is the one that does both. It passes through every point with
 * a continuous slope, so it reads as auto-smoothed, and it provably cannot
 * overshoot between two points.
 */
function tangents(p: CurvePoint[]): number[] {
  const n = p.length;
  if (n < 2) return [0];
  const secant: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    secant.push((p[i + 1].y - p[i].y) / Math.max(1e-6, p[i + 1].x - p[i].x));
  }
  const m: number[] = new Array(n);
  m[0] = secant[0];
  m[n - 1] = secant[n - 2];
  for (let i = 1; i < n - 1; i++) {
    // A turning point stays a turning point: flat here, or the curve bulges
    // past the peak the artist placed.
    m[i] = secant[i - 1] * secant[i] <= 0 ? 0 : (secant[i - 1] + secant[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (secant[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / secant[i];
    const b = m[i + 1] / secant[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * secant[i];
      m[i + 1] = t * b * secant[i];
    }
  }
  return m;
}

/** Cubic Hermite through the points, using those tangents. */
function sampleSpline(p: CurvePoint[], m: number[], x: number): number {
  const n = p.length;
  if (n === 0) return 0;
  if (n === 1) return p[0].y;
  const t = clamp01(x);
  if (t <= p[0].x) return clamp01(p[0].y);
  if (t >= p[n - 1].x) return clamp01(p[n - 1].y);
  let k = 0;
  while (k < n - 2 && t > p[k + 1].x) k++;
  const h = Math.max(1e-6, p[k + 1].x - p[k].x);
  const s = (t - p[k].x) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  const y =
    (2 * s3 - 3 * s2 + 1) * p[k].y +
    (s3 - 2 * s2 + s) * h * m[k] +
    (-2 * s3 + 3 * s2) * p[k + 1].y +
    (s3 - s2) * h * m[k + 1];
  // Monotone cubic cannot overshoot between two points, so this only ever
  // guards against a caller handing in points outside the range.
  return clamp01(y);
}

export class ResponseCurve {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private points: CurvePoint[];
  private dragging = -1;
  private opts: CurveOptions;
  private ro?: ResizeObserver;
  /** Double-tap bookkeeping. The POINT is remembered rather than its index,
   *  because inserting or removing shifts every index after it. */
  private lastTapPoint: CurvePoint | null = null;
  private lastTapEnd = 0;
  private movedPx = 0;
  private downAt = { x: 0, y: 0 };

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
    // A double-tap on a touch screen otherwise zooms the page.
    mount.addEventListener('dblclick', (e) => e.preventDefault());
  }

  /** Sample the curve. This is what a studio feeds into a material row. */
  valueAt(x: number): number { return sampleSpline(this.points, tangents(this.points), x); }

  get value(): CurvePoint[] { return this.points.map((p) => ({ ...p })); }

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

  private toLocal(ev: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) / Math.max(1, r.width),
      y: 1 - (ev.clientY - r.top) / Math.max(1, r.height),
      w: r.width,
      h: r.height,
    };
  }

  /** Nearest point within reach, measured in pixels — the box is not square,
   *  so doing this in curve units makes the target an ellipse and the line
   *  harder to hit from above than from the side. */
  private pointNear(x: number, y: number, w: number, h: number) {
    let hit = -1;
    let best = GRAB_PX;
    this.points.forEach((p, i) => {
      const d = Math.hypot((p.x - x) * w, (p.y - y) * h);
      if (d < best) { best = d; hit = i; }
    });
    return hit;
  }

  private onDown = (ev: PointerEvent) => {
    ev.preventDefault();
    const { x, y, w, h } = this.toLocal(ev);
    this.movedPx = 0;
    this.downAt = { x: ev.clientX, y: ev.clientY };

    // An existing point wins over the line, so grabbing a point you can see
    // never silently spawns a second one on top of it.
    let hit = this.pointNear(x, y, w, h);

    if (hit >= 0) {
      const interior = hit > 0 && hit < this.points.length - 1;
      // Double-tap removes. It must be two TAPS on the SAME point: firing on
      // timing alone would mean nudging a point and grabbing it again — an
      // ordinary thing to do — silently deleted it.
      if (interior
        && this.points[hit] === this.lastTapPoint
        && ev.timeStamp - this.lastTapEnd < DOUBLE_TAP_MS) {
        this.points.splice(hit, 1);
        this.lastTapPoint = null;
        this.dragging = -1;
        this.draw();
        this.opts.onChange?.(this.value, true);
        return;
      }
    } else {
      // Not on a point — is it on the line? Compare against the curve's own
      // height at this x, in pixels, so the target is the same thickness
      // wherever the curve happens to be steep.
      if (Math.abs(this.valueAt(clamp01(x)) - y) * h > GRAB_PX) return;
      if (x <= MIN_GAP || x >= 1 - MIN_GAP) return;   // the ends are already there

      // Take hold of the line by putting a point exactly where it already is,
      // so the curve does not jump the moment it is touched.
      let at = this.points.findIndex((p) => p.x > x);
      if (at < 0) at = this.points.length - 1;
      const left = this.points[at - 1];
      const right = this.points[at];
      if (x - left.x < MIN_GAP || right.x - x < MIN_GAP) return;
      this.points.splice(at, 0, { x, y: this.valueAt(clamp01(x)) });
      hit = at;
    }

    this.dragging = hit;
    try { this.canvas.parentElement!.setPointerCapture(ev.pointerId); } catch { /* keep dragging */ }
    this.draw();
  };

  private onMove = (ev: PointerEvent) => {
    if (this.dragging < 0) return;
    ev.preventDefault();
    this.movedPx = Math.max(
      this.movedPx,
      Math.hypot(ev.clientX - this.downAt.x, ev.clientY - this.downAt.y),
    );
    const { x, y } = this.toLocal(ev);
    const i = this.dragging;
    const p = this.points[i];
    p.y = clamp01(y);
    // The ends stay at the ends, and interior points keep their order, so the
    // curve can never fold back on itself.
    if (i > 0 && i < this.points.length - 1) {
      p.x = Math.min(this.points[i + 1].x - MIN_GAP, Math.max(this.points[i - 1].x + MIN_GAP, x));
    }
    this.draw();
    this.opts.onChange?.(this.value, false);
  };

  private onUp = (ev: PointerEvent) => {
    if (this.dragging < 0) return;
    const held = this.points[this.dragging];
    this.dragging = -1;
    // Only a genuine tap arms the double-tap. A drag does not.
    this.lastTapPoint = this.movedPx <= TAP_SLOP_PX ? held : null;
    this.lastTapEnd = ev.timeStamp;
    try { this.canvas.parentElement!.releasePointerCapture(ev.pointerId); } catch { /* already gone */ }
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

    // Sampled rather than approximated, so what is drawn is exactly what
    // `valueAt` returns. Tangents once for the whole line, not per sample.
    const m = tangents(this.points);
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1.5, w / 320);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const steps = 160;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = t * w;
      const py = h - sampleSpline(this.points, m, t) * h;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    const r = Math.max(3, w / 120);
    this.points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x * w, h - p.y * h, r, 0, Math.PI * 2);
      ctx.fillStyle = i === this.dragging ? line : dot;
      ctx.fill();
    });
  }
}
