// DRY-OUT MARKS — where the brush ran out of paint, drawn over the picture.
//
// The artist's request, 2026-08-29: "draw a straight red line exactly the size
// and direction of the brush every time the brush runs out of oil", after
// asking how long these brushes hold on to paint — "it seems too long by a
// lot".
//
// He is right, and `node tools/brush-bench.mjs dryout` measures it. One full
// dip dragged straight, against a sheet 1024 cells across:
//
//   flat hog / oil          half strength at 573 cells, 12.8 % still held
//                           after 3000 — three canvas widths
//   round sable / oil       half strength at 567, 13.4 % held after 3000
//   flat hog / watercolour  half strength at 398, 16.8 % held after 3000
//
// A LADDER, NOT ONE LINE, and the reason matters. A tuft gives up a FRACTION of
// what it still holds at every step, so its holding decays towards zero and
// never actually arrives — "runs out" is a threshold somebody has to pick. Pick
// one and on most of these brushes nothing would ever be drawn, which teaches
// nobody anything. So the same line is drawn at each rung as the brush passes
// it: barely there at half full, solid red when it is genuinely out. A single
// stroke then carries its own emptying curve along its path. **If the solid red
// line never appears, that is the answer to the question.**
//
// Nothing here touches paint. This draws on its own transparent canvas above
// the picture and is never composited into it, so a screenshot with the
// overlay on is not a screenshot of the painting.

/** The rungs, fullest first — must match `StrokeEngine.markLevels`. */
const RUNGS: Array<{ level: number; label: string; alpha: number; width: number }> = [
  { level: 0.5, label: 'half full', alpha: 0.22, width: 1 },
  { level: 0.25, label: 'a quarter left', alpha: 0.40, width: 1.5 },
  { level: 0.1, label: 'a tenth left', alpha: 0.62, width: 2 },
  { level: 0.05, label: 'a twentieth left', alpha: 0.80, width: 2.5 },
  { level: 0.01, label: 'OUT OF PAINT', alpha: 1.0, width: 3.5 },
];

type Mark = {
  x: number; y: number; dx: number; dy: number; half: number; level: number;
};

type View = {
  zoom: number; panX: number; panY: number; rot: number;
  doc: number; sim: number;
};

export class DryOutOverlay {
  private el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private legend: HTMLDivElement;
  on = false;

  constructor() {
    this.el = document.createElement('canvas');
    this.el.id = 'dryout-overlay';
    // Sits exactly over #stage, and never takes a pointer event — the brush
    // must keep working normally while this is up.
    this.el.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;'
      + 'display:none;pointer-events:none;z-index:1';
    document.body.appendChild(this.el);
    this.ctx = this.el.getContext('2d')!;

    this.legend = document.createElement('div');
    this.legend.style.cssText = 'position:fixed;left:12px;top:12px;z-index:2;'
      + 'display:none;pointer-events:none;padding:8px 10px;border-radius:8px;'
      + 'background:rgba(12,12,14,.86);color:#e8e6e3;'
      + 'font:11px/1.5 ui-monospace,monospace';
    document.body.appendChild(this.legend);
    this.legend.innerHTML = 'DRY-OUT MARKS — how much the brush still holds<br>'
      + RUNGS.map((r) => `<span style="color:rgba(255,60,60,${Math.max(r.alpha, 0.45)})">`
        + `${'━'.repeat(3)}</span> ${r.label}`).join('<br>');
  }

  toggle(): boolean {
    this.on = !this.on;
    this.el.style.display = this.on ? 'block' : 'none';
    this.legend.style.display = this.on ? 'block' : 'none';
    return this.on;
  }

  /**
   * Redraw. `vw`/`vh` are the WebGPU canvas's own backing-store size in device
   * pixels, so this canvas matches it one pixel to one pixel and the two views
   * cannot drift apart under zoom, pan or a rotated board.
   */
  draw(marks: readonly Mark[], view: View, vw: number, vh: number) {
    if (!this.on) return;
    if (this.el.width !== vw || this.el.height !== vh) {
      this.el.width = vw;
      this.el.height = vh;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, vw, vh);
    if (marks.length === 0) return;

    /* The inverse of main.ts's `toDoc`, and it has to stay the inverse:
     *   dx = ( ox*c + oy*s)/scale + panX
     *   dy = (-ox*s + oy*c)/scale + panY
     * so with u = (dx-panX)*scale and v = (dy-panY)*scale,
     *   ox = u*c - v*s,  oy = u*s + v*c. */
    const scale = Math.min(vw / view.doc, vh / view.doc) * view.zoom;
    const c = Math.cos(view.rot), s = Math.sin(view.rot);
    const g2d = view.doc / Math.max(view.sim, 1);
    const toScreen = (gx: number, gy: number): [number, number] => {
      const u = (gx * g2d - view.panX) * scale;
      const v = (gy * g2d - view.panY) * scale;
      return [u * c - v * s + vw / 2, u * s + v * c + vh / 2];
    };

    ctx.lineCap = 'round';
    for (const m of marks) {
      const rung = RUNGS.find((r) => Math.abs(r.level - m.level) < 1e-9)
        ?? RUNGS[RUNGS.length - 1];
      // "Exactly the size and direction of the brush": the blade's own axis and
      // its own half-width, both straight off `Brush.solve`, in grid cells.
      const [ax, ay] = toScreen(m.x - m.dx * m.half, m.y - m.dy * m.half);
      const [bx, by] = toScreen(m.x + m.dx * m.half, m.y + m.dy * m.half);
      ctx.strokeStyle = `rgba(255,42,42,${rung.alpha})`;
      ctx.lineWidth = rung.width * Math.max(1, scale / 2);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }
}
