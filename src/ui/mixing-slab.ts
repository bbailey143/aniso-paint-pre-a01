// The mixing slab: a small wet paint field on the palette.
//
// This is not a swatch and not a stack of parts — it is a grid of cells, each
// holding a concentration of every pigment on the slab plus how wet it is. A
// brush smeared across it lays pigment down, drags what is already there along
// the stroke, and lets water carry colour between neighbouring cells. Two
// colours become a third because they end up in the same cells, which is what
// mixing actually is.
//
// The optics are the same Kubelka-Munk chain the canvas uses — the K and S
// curves come straight out of the measured library, and reflectance runs
// through the shared functions in color/km.ts. A cell's hue comes from the
// *ratio* of pigments in it; how much paint is there sets how opaque it looks
// over the white slab. That split is why a thin smear reads pale and a worked
// pile reads solid.

import {
  PIGMENT_BY_SLUG,
  finiteLayerReflectance,
  reflectanceToXYZ,
  recipeToLayerHex,
  WATERCOLOUR_THICKNESS_SCALE,
  xyzToSRGB,
  type Recipe,
} from '../color/km';
import { N_BANDS } from '../color/pigments';

/** Five pigments on the slab. Past that you are making mud, not a colour. */
export const MAX_SLOTS = 5;

/** Target cell size in CSS pixels. The slab is deliberately coarser than the
 * painting canvas: its job is a smooth, watery puddle, not paper texture. */
const CELL_PX = 4;
/** Load spent per unit of pigment laid down. One click of a pan is worth about
 *  a short dab; three is worth a full working smear across the slab. */
const LOAD_PER_DEPOSIT = 1 / 180;
/** How much pigment one step of a smear lays down. */
const DEPOSIT_RATE = 0.10;
/** How strongly a stroke drags existing paint along with it. */
const SMEAR = 0.80;
/** [UNVERIFIED] Surface-only ceramic flow. This is deliberately a stable,
 * conservative exchange between neighbouring puddle cells — no paper sink,
 * stain, settling, or texture gate is involved. */
const DIFFUSE = 0.12;
const DIFFUSE_PASSES = 2;
/** [UNVERIFIED] Extra whole-slab passes while a ceramic puddle is freshly
 * moving. The UI owns the brief flow window; this controls its smoothness. */
const CERAMIC_FLOW_PASSES = 2;
/** Brush footprint radius, in cells. */
const BRUSH_RADIUS = 4.2;

/** The visible colour of one normal fresh dip on the slab. This uses the same
 * finite-layer optics as the canvas, so a selected purple no longer reads as
 * its charcoal opaque masstone. */
export function mixingSlabPreviewHex(recipe: Recipe): string | null {
  return recipeToLayerHex(recipe, DEPOSIT_RATE * WATERCOLOUR_THICKNESS_SCALE);
}

export interface SlabSample {
  recipe: Recipe;
  /** Total pigment in the sampled cell — below ~0.02 there is nothing there. */
  amount: number;
}

export class MixingSlab {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private buffer: HTMLCanvasElement;
  private bufferCtx: CanvasRenderingContext2D;
  private image!: ImageData;

  private gw = 0;
  private gh = 0;
  /** One concentration field per occupied slot. */
  private conc: Float32Array[] = [];
  private slugs: string[] = [];
  private water!: Float32Array;
  /** The ceramic's selected preload. Water remains on the surface; this only
   * changes how readily it carries pigment between neighbouring cells. */
  private waterLevel = 1;
  /** Scratch used by the advection step so a stroke reads a stable snapshot. */
  private scratch: Float32Array[] = [];

  // K and S for each slot, flattened to N_BANDS for a tight inner loop.
  private slotK: Float64Array[] = [];
  private slotS: Float64Array[] = [];
  private cellK = new Float64Array(N_BANDS);
  private cellS = new Float64Array(N_BANDS);

  private brush: Array<{ slot: number; share: number }> = [];
  private load = 0;
  private lastX: number | null = null;
  private lastY: number | null = null;
  /** Redraw bounds in cells, so a smear does not recolour the whole slab. */
  private dirty = { x0: 0, y0: 0, x1: -1, y1: -1 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable for the mixing slab');
    this.ctx = ctx;
    this.buffer = document.createElement('canvas');
    const bufferCtx = this.buffer.getContext('2d');
    if (!bufferCtx) throw new Error('2D context unavailable for the slab buffer');
    this.bufferCtx = bufferCtx;
    this.resize();
  }

  // ---- geometry -----------------------------------------------------------

  resize(): boolean {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const gw = Math.max(8, Math.round(rect.width / CELL_PX));
    const gh = Math.max(8, Math.round(rect.height / CELL_PX));
    if (gw === this.gw && gh === this.gh) {
      this.syncCanvasSize(rect);
      return false;
    }
    this.gw = gw;
    this.gh = gh;
    const n = gw * gh;
    this.conc = this.slugs.map(() => new Float32Array(n));
    this.scratch = this.slugs.map(() => new Float32Array(n));
    this.water = new Float32Array(n).fill(this.waterLevel);
    this.buffer.width = gw;
    this.buffer.height = gh;
    this.image = this.bufferCtx.createImageData(gw, gh);
    this.syncCanvasSize(rect);
    this.markAll();
    this.render();
    return true;
  }

  private syncCanvasSize(rect: DOMRect) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.markAll();
    }
  }

  /** Slab-local CSS pixels to cell coordinates. */
  private toCell(x: number, y: number): { cx: number; cy: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      cx: (x / Math.max(1, rect.width)) * this.gw,
      cy: (y / Math.max(1, rect.height)) * this.gh,
    };
  }

  /** Draw a magnified view of the actual slab pixels under the picker ring.
   * The loupe is view-only: picking still reads this same pigment field. */
  drawLoupe(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const scale = this.canvas.width / rect.width;
    const sourceRadius = radius * 0.38 * scale;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.canvas,
      x * scale - sourceRadius, y * scale - sourceRadius,
      sourceRadius * 2, sourceRadius * 2,
      x - radius, y - radius, radius * 2, radius * 2,
    );
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(64, 61, 53, 0.92)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 2.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(250, 248, 242, 0.94)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(64, 61, 53, 0.92)';
    ctx.stroke();
    ctx.restore();
  }

  // ---- slots --------------------------------------------------------------

  get pigmentCount(): number {
    return this.slugs.length;
  }

  /** Index for a pigment, adding it to the slab if there is room. -1 when the
   *  slab is already carrying its five. */
  private slotFor(slug: string): number {
    const existing = this.slugs.indexOf(slug);
    if (existing >= 0) return existing;
    if (this.slugs.length >= MAX_SLOTS) return -1;
    const pigment = PIGMENT_BY_SLUG.get(slug);
    if (!pigment) return -1;
    this.slugs.push(slug);
    this.conc.push(new Float32Array(this.gw * this.gh));
    this.scratch.push(new Float32Array(this.gw * this.gh));
    this.slotK.push(Float64Array.from(pigment.K));
    this.slotS.push(Float64Array.from(pigment.S));
    return this.slugs.length - 1;
  }

  /**
   * Charge the brush. `load` is how much pigment it can lay down before it runs
   * out — the palette passes the number of parts picked up off the pans, so
   * three clicks really does put down three times the paint.
   *
   * Returns false when the mix would need a sixth pigment on the slab.
   */
  setBrush(recipe: Recipe, load: number): boolean {
    let total = 0;
    for (const parts of recipe.values()) total += Math.max(0, parts);
    if (total <= 0) {
      this.brush = [];
      this.load = 0;
      return true;
    }
    const next: Array<{ slot: number; share: number }> = [];
    for (const [slug, parts] of recipe) {
      if (parts <= 0) continue;
      const slot = this.slotFor(slug);
      if (slot < 0) return false;
      next.push({ slot, share: parts / total });
    }
    this.brush = next;
    this.load = load;
    return true;
  }

  get remainingLoad(): number {
    return this.load;
  }

  // ---- the stroke ---------------------------------------------------------

  beginStroke(x: number, y: number) {
    this.lastX = null;
    this.lastY = null;
    this.smearTo(x, y);
  }

  endStroke() {
    this.lastX = null;
    this.lastY = null;
  }

  /**
   * Work the brush from the last point to this one. Every step lays pigment
   * down, drags what is already there along the direction of travel, then lets
   * water bleed the result into its neighbours.
   */
  smearTo(x: number, y: number) {
    const { cx, cy } = this.toCell(x, y);
    let fromX = this.lastX ?? cx;
    let fromY = this.lastY ?? cy;
    const dx = cx - fromX;
    const dy = cy - fromY;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance));
    let dirX = 0;
    let dirY = 0;
    if (distance > 0.001) {
      dirX = dx / distance;
      dirY = dy / distance;
    }

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      this.workAt(fromX + dx * t, fromY + dy * t, dirX, dirY);
    }
    this.lastX = cx;
    this.lastY = cy;
    this.render();
  }

  private workAt(cx: number, cy: number, dirX: number, dirY: number) {
    const r = BRUSH_RADIUS;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.gw - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.gh - 1, Math.ceil(cy + r));
    if (x1 < x0 || y1 < y0) return;

    // Snapshot the working area so the drag reads a stable field.
    const moving = dirX !== 0 || dirY !== 0;
    if (moving) {
      for (let s = 0; s < this.conc.length; s++) {
        const src = this.conc[s];
        const dst = this.scratch[s];
        for (let y = y0; y <= y1; y++) {
          const row = y * this.gw;
          for (let x = x0; x <= x1; x++) dst[row + x] = src[row + x];
        }
      }
    }

    const canDeposit = this.load > 0 && this.brush.length > 0;
    let deposited = 0;

    for (let y = y0; y <= y1; y++) {
      const row = y * this.gw;
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > r) continue;
        const i = row + x;
        // Soft round footprint — a brush does not have a hard edge.
        const falloff = Math.pow(1 - d / r, 1.5);
        const wet = this.water[i];

        // 1. Drag what is already here along the stroke. Sampling from behind
        //    the tip is a semi-Lagrangian step: stable at any stroke speed.
        if (moving) {
          const amount = SMEAR * falloff * (0.35 + 0.65 * wet);
          const backX = Math.min(this.gw - 1, Math.max(0, x - dirX * 1.6));
          const backY = Math.min(this.gh - 1, Math.max(0, y - dirY * 1.6));
          const bi = Math.round(backY) * this.gw + Math.round(backX);
          for (let s = 0; s < this.conc.length; s++) {
            const field = this.conc[s];
            const snapshot = this.scratch[s];
            field[i] = snapshot[i] * (1 - amount) + snapshot[bi] * amount;
          }
        }

        // 2. Lay new pigment down, while the brush still has some.
        if (canDeposit) {
          const give = DEPOSIT_RATE * falloff;
          for (const { slot, share } of this.brush) {
            this.conc[slot][i] += give * share;
          }
          deposited += give;
        }

        // 3. Ceramic is non-absorbent: water stays on the mixing surface. It
        // can carry pigment, but it cannot soak into or stain the slab.
        this.water[i] = wet;
      }
    }

    if (deposited > 0) this.load = Math.max(0, this.load - deposited * LOAD_PER_DEPOSIT);
    this.diffuse(x0, y0, x1, y1);
    this.markDirty(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  /** Water carries pigment freely across ceramic. Exchange each edge once,
   * rather than averaging cells in place, so every pass conserves pigment:
   * what leaves one puddle cell arrives in its neighbour. */
  private diffuse(x0: number, y0: number, x1: number, y1: number, passes = DIFFUSE_PASSES) {
    const loX = Math.max(0, x0);
    const loY = Math.max(0, y0);
    const hiX = Math.min(this.gw - 1, x1);
    const hiY = Math.min(this.gh - 1, y1);
    if (hiX < loX || hiY < loY) return;
    for (let pass = 0; pass < passes; pass++) {
      for (let s = 0; s < this.conc.length; s++) {
        const field = this.conc[s];
        const snapshot = this.scratch[s];
        snapshot.set(field);
        field.set(snapshot);
        for (let y = loY; y <= hiY; y++) {
          const row = y * this.gw;
          for (let x = loX; x <= hiX; x++) {
            const i = row + x;
            if (x < hiX) {
              const right = i + 1;
              const wetness = Math.min(this.water[i], this.water[right]);
              const moved = (snapshot[i] - snapshot[right]) * DIFFUSE * wetness;
              field[i] -= moved;
              field[right] += moved;
            }
            if (y < hiY) {
              const below = i + this.gw;
              const wetness = Math.min(this.water[i], this.water[below]);
              const moved = (snapshot[i] - snapshot[below]) * DIFFUSE * wetness;
              field[i] -= moved;
              field[below] += moved;
            }
          }
        }
      }
    }
  }

  /** One moment of free, non-absorbent ceramic flow. Called by the palette
   * while a fresh puddle is still moving after the brush has lifted. */
  flow() {
    if (this.slugs.length === 0 || this.gw === 0) return;
    this.diffuse(0, 0, this.gw - 1, this.gh - 1, CERAMIC_FLOW_PASSES);
    this.markAll();
    this.render();
  }

  // ---- picking colour back off the slab -----------------------------------

  /** What is in the cell under this point, as a recipe the brush can carry. */
  sample(x: number, y: number): SlabSample | null {
    const { cx, cy } = this.toCell(x, y);
    const gx = Math.min(this.gw - 1, Math.max(0, Math.floor(cx)));
    const gy = Math.min(this.gh - 1, Math.max(0, Math.floor(cy)));
    // Average a small disc so a picked colour is the mix you can see, not the
    // one cell your finger happened to land on.
    const r = 1;
    const recipe: Recipe = new Map();
    let amount = 0;
    for (let s = 0; s < this.conc.length; s++) {
      let sum = 0;
      let n = 0;
      for (let y2 = gy - r; y2 <= gy + r; y2++) {
        if (y2 < 0 || y2 >= this.gh) continue;
        for (let x2 = gx - r; x2 <= gx + r; x2++) {
          if (x2 < 0 || x2 >= this.gw) continue;
          sum += this.conc[s][y2 * this.gw + x2];
          n++;
        }
      }
      const mean = n > 0 ? sum / n : 0;
      if (mean > 0.0005) {
        recipe.set(this.slugs[s], mean);
        amount += mean;
      }
    }
    if (amount < 0.02) return null;
    return { recipe, amount };
  }

  // ---- water and wiping ---------------------------------------------------

  /** Set the ceramic's starting wetness. This is deliberately palette-only:
   * pigment remains on the non-absorbent slab and the document never sees it. */
  setWaterLevel(level: number) {
    this.waterLevel = Math.max(0, Math.min(1, level));
    this.water.fill(this.waterLevel);
    this.markAll();
    this.render();
  }

  /** Fresh water stays entirely on the ceramic. It re-wets the whole surface
   * and lets existing pigment spread; it never deletes pigment by pretending
   * the slab absorbed it. */
  addWater() {
    this.waterLevel = 1;
    this.water.fill(this.waterLevel);
    this.diffuse(0, 0, this.gw - 1, this.gh - 1);
    this.markAll();
    this.render();
  }

  wipe() {
    this.slugs = [];
    this.conc = [];
    this.scratch = [];
    this.slotK = [];
    this.slotS = [];
    this.brush = [];
    this.water.fill(this.waterLevel);
    this.markAll();
    this.render();
  }

  // ---- rendering ----------------------------------------------------------

  private markAll() {
    this.dirty = { x0: 0, y0: 0, x1: this.gw - 1, y1: this.gh - 1 };
  }

  private markDirty(x0: number, y0: number, x1: number, y1: number) {
    if (this.dirty.x1 < this.dirty.x0) {
      this.dirty = { x0, y0, x1, y1 };
      return;
    }
    this.dirty.x0 = Math.min(this.dirty.x0, x0);
    this.dirty.y0 = Math.min(this.dirty.y0, y0);
    this.dirty.x1 = Math.max(this.dirty.x1, x1);
    this.dirty.y1 = Math.max(this.dirty.y1, y1);
  }

  /** Recolour the changed cells and blit. Colour comes from the ratio of
   * pigments in a cell; loading sets a finite KM layer over white ceramic.
   * This mirrors the canvas compositor, so a thin purple wash stays purple
   * rather than becoming the pigment's dark opaque masstone. */
  render() {
    if (this.gw === 0 || this.dirty.x1 < this.dirty.x0) return;
    const x0 = Math.max(0, this.dirty.x0);
    const y0 = Math.max(0, this.dirty.y0);
    const x1 = Math.min(this.gw - 1, this.dirty.x1);
    const y1 = Math.min(this.gh - 1, this.dirty.y1);
    const data = this.image.data;
    const slots = this.conc.length;

    for (let y = y0; y <= y1; y++) {
      const row = y * this.gw;
      for (let x = x0; x <= x1; x++) {
        const i = row + x;
        let total = 0;
        for (let s = 0; s < slots; s++) total += this.conc[s][i];
        const p = i * 4;
        if (total < 0.004) {
          data[p] = 0;
          data[p + 1] = 0;
          data[p + 2] = 0;
          data[p + 3] = 0;
          continue;
        }
        this.cellK.fill(0);
        this.cellS.fill(0);
        for (let s = 0; s < slots; s++) {
          const c = this.conc[s][i] / total; // ratio sets the hue
          if (c <= 0) continue;
          const K = this.slotK[s];
          const S = this.slotS[s];
          for (let b = 0; b < N_BANDS; b++) {
            this.cellK[b] += c * K[b];
            this.cellS[b] += c * S[b];
          }
        }
        const [r, g, b] = xyzToSRGB(
          reflectanceToXYZ(finiteLayerReflectance(
            { K: this.cellK, S: this.cellS },
            total * WATERCOLOUR_THICKNESS_SCALE,
          )),
        );
        data[p] = Math.round(r * 255);
        data[p + 1] = Math.round(g * 255);
        data[p + 2] = Math.round(b * 255);
        data[p + 3] = 255;
      }
    }

    this.bufferCtx.putImageData(this.image, 0, 0);
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    // Smoothed upscale from the solve grid — paint has no pixel edges.
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.drawImage(this.buffer, 0, 0, rect.width, rect.height);
    this.dirty = { x0: 0, y0: 0, x1: -1, y1: -1 };
  }
}
