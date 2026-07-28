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
import { DRY_TOOLS } from '../media/library';
import type { DryMedium } from '../media/types';

export interface PaletteEvents {
  /** Fired whenever the active mix or loading changes. */
  onMixChange?(hex: string | null, recipe: Recipe, loading: number): void;
  /** Fired when the paper substrate changes. */
  onPaperChange?(paper: Paper): void;
  /** Fired when the evaporation rate changes. */
  onEvapChange?(evapRate: number): void;
  /** Extra clean water in the wet-brush charge, 0..1. */
  onWaterChange?(waterCharge: number): void;
  /** Normalized downhill direction in canvas space; centre is level. */
  onTiltChange?(gravityX: number, gravityY: number, cosAlpha: number): void;
  /** Fired when the sheet should be wiped. */
  onClear?(): void;
  /** Rinse the brush: pigment out, clean water in. The sheet is untouched. */
  onRinse?(): void;
  /** Rinse, then re-dip in the current mix — back to a known state. */
  onRinseLoad?(): void;
  /** Fired when the brush or its size changes. */
  onBrushChange?(def: BrushDef, size: number): void;
  /** Fired when a dry medium is picked (P7). */
  onDryMedium?(medium: DryMedium, size: number): void;
}

export class Palette {
  readonly recipe: Recipe = new Map();
  loading = 0.6;
  waterCharge = 0;
  brush: BrushDef = BRUSHES[0];
  brushSize = 1.0;
  private root: HTMLElement;
  private mixSwatch!: HTMLElement;
  private rgbSwatch!: HTMLElement;
  private mixHexLabel!: HTMLElement;
  private recipeRow!: HTMLElement;
  private events: PaletteEvents;

  constructor(mount: HTMLElement, events: PaletteEvents = {}, initialEvapRate = 0) {
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
    this.buildSurface(initialEvapRate);
    this.root.querySelector('#mix-clear')!.addEventListener('click', () => this.clear());
    this.refresh();
  }

  private buildSurface(initialEvapRate: number) {
    // The tool rack: wet brushes and dry media side by side. They are different
    // engines underneath — a brush solves a tuft and pushes fluid, a pencil
    // scrapes a tip across the tooth — but to the hand they are just tools, so
    // they select the same way.
    const brushes = this.root.querySelector('#brushes')!;
    const dries = this.root.querySelector('#dry-tools')!;
    const clearAll = () => {
      brushes.querySelectorAll('.paper').forEach((e) => e.classList.remove('on'));
      dries.querySelectorAll('.paper').forEach((e) => e.classList.remove('on'));
    };

    BRUSHES.forEach((b, i) => {
      const el = document.createElement('button');
      el.className = 'pal-btn paper' + (i === 0 ? ' on' : '');
      el.textContent = b.name.replace(' Sable', '');
      el.title = `${b.name} — ${b.kind === 'flat' ? 'two spines (spreads, scratches)' : 'one spine (points)'}`;
      el.addEventListener('click', () => {
        clearAll();
        el.classList.add('on');
        this.brush = b;
        this.root.classList.remove('dry-mode');
        this.events.onBrushChange?.(b, this.brushSize);
      });
      brushes.appendChild(el);
    });

    DRY_TOOLS.forEach((t) => {
      const el = document.createElement('button');
      el.className = 'pal-btn paper';
      el.textContent = t.name;
      el.title = t.medium.kind === 'ink'
        ? 'Ballpoint — rides the peaks and skips the valleys; the ball starves and recovers as it rolls'
        : `Graphite ${t.name} — ${t.medium.hardness > 0
            ? 'hard: lays little, catches only the peaks of the tooth'
            : 'soft: lays heavily and fills the valleys'}`;
      el.addEventListener('click', () => {
        clearAll();
        el.classList.add('on');
        this.root.classList.add('dry-mode');
        this.events.onDryMedium?.(t.medium, this.brushSize);
      });
      dries.appendChild(el);
    });
    const sizeEl = this.root.querySelector('#brush-size') as HTMLInputElement;
    sizeEl.value = String(this.brushSize);
    sizeEl.addEventListener('input', () => {
      this.brushSize = parseFloat(sizeEl.value);
      // Size belongs to whichever tool is in hand — resizing a pencil must not
      // silently put the brush back.
      const dryOn = dries.querySelector('.paper.on');
      if (dryOn) {
        const t = DRY_TOOLS[Array.from(dries.children).indexOf(dryOn)];
        this.events.onDryMedium?.(t.medium, this.brushSize);
      } else {
        this.events.onBrushChange?.(this.brush, this.brushSize);
      }
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
    evap.value = String(initialEvapRate);
    evap.addEventListener('input', () => {
      this.events.onEvapChange?.(parseFloat(evap.value));
    });

    const water = this.root.querySelector('#water-charge') as HTMLInputElement;
    water.value = String(this.waterCharge);
    water.addEventListener('input', () => {
      this.waterCharge = parseFloat(water.value);
      this.events.onWaterChange?.(this.waterCharge);
    });

    // A small board-level control: the puck is the downhill direction itself.
    // Screen and canvas coordinates agree here, so down/right on the pad makes
    // water move down/right on the page without a hidden axis flip.
    const tiltPad = this.root.querySelector('#tilt-pad') as HTMLElement;
    const tiltPuck = this.root.querySelector('#tilt-puck') as HTMLElement;
    const setTilt = (clientX: number, clientY: number) => {
      const rect = tiltPad.getBoundingClientRect();
      const radius = Math.max(1, rect.width / 2 - 10);
      let x = (clientX - (rect.left + rect.width / 2)) / radius;
      let y = (clientY - (rect.top + rect.height / 2)) / radius;
      const length = Math.hypot(x, y);
      if (length > 1) { x /= length; y /= length; }
      tiltPuck.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
      // The radial puck distance is sin(alpha), so this is cos(alpha) for the
      // existing capillary pass while x/y remain the normalized gravity vector.
      this.events.onTiltChange?.(x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y)));
    };
    tiltPad.addEventListener('pointerdown', (event) => {
      tiltPad.setPointerCapture(event.pointerId);
      setTilt(event.clientX, event.clientY);
    });
    tiltPad.addEventListener('pointermove', (event) => {
      if (tiltPad.hasPointerCapture(event.pointerId)) setTilt(event.clientX, event.clientY);
    });
    this.root.querySelector('#tilt-level')!.addEventListener('click', () => {
      tiltPuck.style.transform = 'translate(0, 0)';
      this.events.onTiltChange?.(0, 0, 1);
    });

    this.root.querySelector('#wash-clear')!
      .addEventListener('click', () => this.events.onClear?.());

    const flash = (el: Element) => {
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 220);
    };
    // No refresh() here on purpose: refresh re-fires onMixChange, which re-dips
    // the brush — so rinsing and then refreshing would immediately undo the
    // rinse. The palette still holds the mix; only the brush was washed out.
    const rinseBtn = this.root.querySelector('#rinse')!;
    rinseBtn.addEventListener('click', () => {
      this.events.onRinse?.();
      flash(rinseBtn);
    });
    const rinseLoadBtn = this.root.querySelector('#rinse-load')!;
    rinseLoadBtn.addEventListener('click', () => {
      this.events.onRinseLoad?.();
      flash(rinseLoadBtn);
    });
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
        <div class="jar">
          <button id="rinse" class="pal-btn jar-btn" title="Rinse the brush — pigment out, clean water in. The sheet is untouched.">
            <span class="jar-ico">◌</span> rinse
          </button>
          <button id="rinse-load" class="pal-btn jar-btn accent" title="Rinse, then re-dip in the current mix — back to a known state.">
            <span class="jar-ico">◍</span> rinse / load
          </button>
        </div>
        <div id="recipe" class="recipe"></div>
      </div>
      <div class="surface">
        <div class="pal-sub">brush</div>
        <div id="brushes" class="papers"></div>
        <div class="pal-sub">dry media</div>
        <div id="dry-tools" class="papers six"></div>
        <label class="loading-row">
          <span>size</span>
          <input id="brush-size" type="range" min="0.15" max="2.4" step="0.025" />
        </label>
        <div class="pal-sub">paper</div>
        <div id="papers" class="papers"></div>
        <label class="loading-row">
          <span>load</span>
          <input id="loading" type="range" min="0.02" max="1" step="0.02" />
        </label>
        <label class="loading-row wet-only" title="Add clean water to the brush. At 100%, it lays water with no pigment.">
          <span>water</span>
          <input id="water-charge" type="range" min="0" max="1" step="0.01" />
        </label>
        <label class="loading-row">
          <span>dry</span>
          <input id="evap" type="range" min="0" max="0.004" step="0.0001" />
        </label>
        <section class="tilt-control" aria-label="paper tilt">
          <div class="tilt-head"><span>tilt</span><button id="tilt-level" class="pal-btn" title="Return the paper to level">level</button></div>
          <div id="tilt-pad" class="tilt-pad" role="application" aria-label="Drag the blue puck toward the downhill direction">
            <span id="tilt-puck" class="tilt-puck"></span>
          </div>
          <p class="tilt-hint">drag toward downhill</p>
        </section>
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
