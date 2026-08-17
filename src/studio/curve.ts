// A draggable response curve.
//
// Studios are full of relationships that are not single numbers: how pressure
// becomes width, how tilt becomes spread, how speed becomes breakup. Those are
// curves, and an artist should be able to grab one and bend it rather than type
// a coefficient and guess.
//
// Deliberately not a bezier editor with handles. Handles are a drawing-tool
// idiom and they invite fiddling with the handle rather than the shape. These
// are points ON the curve: drag the thing you can see.
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

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class ResponseCurve {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private points: CurvePoint[];
  private dragging = -1;
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

  /** Sample the curve. This is what a studio feeds into a material row. */
  valueAt(x: number): number {
    const t = clamp01(x);
    const p = this.points;
    for (let i = 0; i < p.length - 1; i++) {
      if (t >= p[i].x && t <= p[i + 1].x) {
        const span = Math.max(1e-6, p[i + 1].x - p[i].x);
        const u = (t - p[i].x) / span;
        // Smoothstep between neighbours: continuous slope at the joins without
        // the overshoot a spline would give, which on a response curve would
        // mean a value the artist never asked for.
        return p[i].y + (p[i + 1].y - p[i].y) * (u * u * (3 - 2 * u));
      }
    }
    return p[p.length - 1].y;
  }

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
    return { x: clamp01((ev.clientX - r.left) / r.width), y: clamp01(1 - (ev.clientY - r.top) / r.height) };
  }

  private onDown = (ev: PointerEvent) => {
    ev.preventDefault();
    const { x, y } = this.toLocal(ev);
    let best = -1;
    let bestD = 0.09;                       // generous: this is used with a finger
    this.points.forEach((p, i) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0) return;
    this.dragging = best;
    try { this.canvas.parentElement!.setPointerCapture(ev.pointerId); } catch { /* keep dragging */ }
  };

  private onMove = (ev: PointerEvent) => {
    if (this.dragging < 0) return;
    ev.preventDefault();
    const { x, y } = this.toLocal(ev);
    const i = this.dragging;
    const p = this.points[i];
    p.y = y;
    // The ends stay at the ends — a response curve with no value at zero
    // pressure is not a curve, it is a hole. Interior points keep their order
    // so the curve can never fold back on itself.
    if (i > 0 && i < this.points.length - 1) {
      p.x = Math.min(this.points[i + 1].x - 0.02, Math.max(this.points[i - 1].x + 0.02, x));
    }
    this.draw();
    this.opts.onChange?.(this.value, false);
  };

  private onUp = (ev: PointerEvent) => {
    if (this.dragging < 0) return;
    this.dragging = -1;
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

    // The curve itself, sampled rather than approximated, so what is drawn is
    // exactly what `valueAt` will return.
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(1.5, w / 320);
    ctx.beginPath();
    const steps = 96;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = t * w;
      const py = h - this.valueAt(t) * h;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.fillStyle = dot;
    const r = Math.max(3, w / 120);
    for (const p of this.points) {
      ctx.beginPath();
      ctx.arc(p.x * w, h - p.y * h, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
