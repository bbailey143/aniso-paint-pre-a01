// The pigment tray + mixing area (P2).
//
// Twelve measured pigments. Click a well to add a part to the current mix; the
// result is computed through the real Kubelka-Munk chain and shown beside the
// "naive RGB average" so the difference is visible — blue + yellow makes green
// under KM and grey/brown under RGB. That contrast is the product thesis.

import { PIGMENTS } from '../color/pigments';
import { recipeToHex, recipeToNaiveRGBHex, tintHex, type Recipe } from '../color/km';
import { PAPERS, type Paper } from '../substrate/papers';
import { BRUSHES } from '../brush/library';
import type { BrushDef } from '../brush/types';

export interface PaletteEvents {
  /** Fired whenever the active mix or loading changes. */
  onMixChange?(hex: string | null, recipe: Recipe, loading: number): void;
  /** Fired when the paper substrate changes. */
  onPaperChange?(paper: Paper): void;
  /** Fired when the evaporation (drying) rate changes. */
  onDryChange?(evapRate: number): void;
  /** Fired when the sheet should be wiped. */
  onClear?(): void;
  /** Fired when the brush or its size changes. */
  onBrushChange?(def: BrushDef, size: number): void;
}

export class Palette {
  readonly recipe: Recipe = new Map();
  loading = 0.6;
  brush: BrushDef = BRUSHES[0];
  brushSize = 1.0;
  private root: HTMLElement;
  private mixSwatch!: HTMLElement;
  private rgbSwatch!: HTMLElement;
  private mixHexLabel!: HTMLElement;
  private recipeRow!: HTMLElement;
  private events: PaletteEvents;

  constructor(mount: HTMLElement, events: PaletteEvents = {}) {
    this.events = events;
    this.root = document.createElement('div');
    this.root.id = 'palette';
    this.root.className = 'panel';
    this.root.innerHTML = this.template();
    mount.appendChild(this.root);

    this.mixSwatch = this.root.querySelector('#mix-km')!;
    this.rgbSwatch = this.root.querySelector('#mix-rgb')!;
    this.mixHexLabel = this.root.querySelector('#mix-hex')!;
    this.recipeRow = this.root.querySelector('#recipe')!;

    this.buildWells();
    this.buildSurface();
    this.root.querySelector('#mix-clear')!.addEventListener('click', () => this.clear());
    this.refresh();
  }

  private buildSurface() {
    // Brush picker + size.
    const brushes = this.root.querySelector('#brushes')!;
    BRUSHES.forEach((b, i) => {
      const el = document.createElement('button');
      el.className = 'pal-btn paper' + (i === 0 ? ' on' : '');
      el.textContent = b.name.replace(' Sable', '');
      el.title = `${b.name} — ${b.kind === 'flat' ? 'two spines (spreads, scratches)' : 'one spine (points)'}`;
      el.addEventListener('click', () => {
        brushes.querySelectorAll('.paper').forEach((e) => e.classList.remove('on'));
        el.classList.add('on');
        this.brush = b;
        this.events.onBrushChange?.(b, this.brushSize);
      });
      brushes.appendChild(el);
    });
    const sizeEl = this.root.querySelector('#brush-size') as HTMLInputElement;
    sizeEl.value = String(this.brushSize);
    sizeEl.addEventListener('input', () => {
      this.brushSize = parseFloat(sizeEl.value);
      this.events.onBrushChange?.(this.brush, this.brushSize);
    });

    const papers = this.root.querySelector('#papers')!;
    PAPERS.forEach((p, i) => {
      const b = document.createElement('button');
      b.className = 'pal-btn paper' + (i === 1 ? ' on' : ''); // cold press default
      b.textContent = p.name;
      b.addEventListener('click', () => {
        papers.querySelectorAll('.paper').forEach((e) => e.classList.remove('on'));
        b.classList.add('on');
        this.events.onPaperChange?.(p);
      });
      papers.appendChild(b);
    });
    const slider = this.root.querySelector('#loading') as HTMLInputElement;
    slider.value = String(this.loading);
    slider.addEventListener('input', () => {
      this.loading = parseFloat(slider.value);
      this.refresh();
    });

    const evap = this.root.querySelector('#evap') as HTMLInputElement;
    evap.value = '0';
    evap.addEventListener('input', () => {
      this.events.onDryChange?.(parseFloat(evap.value));
    });

    this.root.querySelector('#wash-clear')!
      .addEventListener('click', () => this.events.onClear?.());
  }

  private template(): string {
    return `
      <div class="pal-head">
        <span class="hud-title">pigments</span>
        <button id="mix-clear" class="pal-btn" title="clear mix">clear</button>
      </div>
      <div id="wells" class="wells"></div>
      <div class="mix">
        <div class="mix-swatches">
          <div class="mix-col">
            <div id="mix-km" class="swatch big" title="Kubelka-Munk (real pigment)"></div>
            <span class="mix-cap">Kubelka-Munk</span>
          </div>
          <div class="mix-col">
            <div id="mix-rgb" class="swatch big muted" title="naive RGB average (wrong)"></div>
            <span class="mix-cap">naive RGB</span>
          </div>
        </div>
        <div id="mix-hex" class="mix-hex">—</div>
        <div id="recipe" class="recipe"></div>
      </div>
      <div class="surface">
        <div class="pal-sub">brush</div>
        <div id="brushes" class="papers"></div>
        <label class="loading-row">
          <span>size</span>
          <input id="brush-size" type="range" min="0.4" max="2.4" step="0.05" />
        </label>
        <div class="pal-sub">paper</div>
        <div id="papers" class="papers"></div>
        <label class="loading-row">
          <span>load</span>
          <input id="loading" type="range" min="0.02" max="1" step="0.02" />
        </label>
        <label class="loading-row">
          <span>dry</span>
          <input id="evap" type="range" min="0" max="0.004" step="0.0001" />
        </label>
        <button id="wash-clear" class="pal-btn">clear sheet</button>
      </div>`;
  }

  private buildWells() {
    const wells = this.root.querySelector('#wells')!;
    for (const p of PIGMENTS) {
      const el = document.createElement('button');
      el.className = 'well';
      // Swatch-card look: masstone (full strength) grading to a 25% tint, so the
      // pigment's true undertone reads even for dark staining blues/violets.
      const tint = tintHex(p.slug, 0.25) ?? p.hex;
      el.style.background = `linear-gradient(135deg, ${p.hex} 0%, ${p.hex} 42%, ${tint} 100%)`;
      el.title = `${p.name} (${p.ci}) — ${p.temp}`;
      el.setAttribute('aria-label', p.name);
      el.addEventListener('click', () => this.add(p.slug));
      wells.appendChild(el);
    }
  }

  add(slug: string, parts = 1) {
    this.recipe.set(slug, (this.recipe.get(slug) ?? 0) + parts);
    this.refresh();
  }

  remove(slug: string) {
    const n = (this.recipe.get(slug) ?? 0) - 1;
    if (n <= 0) this.recipe.delete(slug);
    else this.recipe.set(slug, n);
    this.refresh();
  }

  clear() {
    this.recipe.clear();
    this.refresh();
  }

  private refresh() {
    const km = recipeToHex(this.recipe);
    const rgb = recipeToNaiveRGBHex(this.recipe);
    this.mixSwatch.style.background = km ?? 'transparent';
    this.rgbSwatch.style.background = rgb ?? 'transparent';
    this.mixHexLabel.textContent = km ? km : 'add pigments to mix';

    // Recipe chips (click to remove one part).
    this.recipeRow.innerHTML = '';
    for (const [slug, parts] of this.recipe) {
      const p = PIGMENTS.find((x) => x.slug === slug)!;
      const chip = document.createElement('button');
      chip.className = 'chip';
      const dot = tintHex(slug, 0.35) ?? p.hex;
      chip.innerHTML = `<i style="background:${dot}"></i>${p.name}${parts > 1 ? ` ×${parts}` : ''}`;
      chip.title = `remove one part of ${p.name}`;
      chip.addEventListener('click', () => this.remove(slug));
      this.recipeRow.appendChild(chip);
    }

    this.events.onMixChange?.(km, this.recipe, this.loading);
  }
}
