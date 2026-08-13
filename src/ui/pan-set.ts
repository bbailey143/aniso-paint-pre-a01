// The pan set: a floating watercolour box, modelled on a real hinged palette.
//
// The working loop is the one a painter already has:
//
//   1. Click a pan to dip the brush. Click again to pick up more of it — the
//      count is how much paint you are carrying, and clicking a second pigment
//      stacks it into the same load.
//   2. Smear the brush across the wetted slab on the right. Pigment comes off
//      the brush and onto the slab, and the stroke drags whatever is already
//      there along with it.
//   3. Dip for the next colour and work it into the same area. They mix where
//      they meet, through water, the way paint does. Five pigments is the cap —
//      past that it is mud, not a colour.
//   4. Use the picker to lift a specific colour back out of the mix.
//
// A dip is fresh once paint has been spent on the slab, so picking up colour
// two does not silently carry colour one along with it. Until you spend it,
// repeated clicks stack — which is the by-parts mixing the bottom flap shows.

import { PIGMENTS } from '../color/pigment-palette';
import { tintHex, type Recipe } from '../color/km';
import { MAX_SLOTS, MixingSlab, mixingSlabPreviewHex } from './mixing-slab';

export interface PanSetEvents {
  /** A pan was clicked. `fresh` means start a new load rather than stack. */
  onPickPigment?(slug: string, fresh: boolean): void;
  /** A colour was lifted off the slab — the brush now carries exactly this. */
  onLoadRecipe?(recipe: Recipe): void;
  /** A recipe chip was clicked — take one part back out. */
  onRemovePart?(slug: string): void;
  /** Empty the brush's recipe. */
  onClearMix?(): void;
  /** Rinse the brush: pigment out, clean water in. The sheet is untouched. */
  onRinse?(): void;
  /** Rinse, then re-dip in the current mix. */
  onRinseLoad?(): void;
}

const PAN_COLUMNS = 4;
const PAN_ROWS = 4;
const STORAGE_KEY = 'aniso-paint.pan-set.position';
/** [UNVERIFIED] A freshly made ceramic puddle keeps moving briefly after the
 * brush lifts. It is palette-only behaviour; it never affects the document's
 * watercolour simulation. */
const CERAMIC_FLOW_WINDOW_MS = 600;
/** [UNVERIFIED] Five hand-feel wetness stops for the palette's ceramic
 * surface. These only tune slab mobility; they never reach the paper engine. */
const CERAMIC_WATER_LEVELS = [1, 0.8, 0.6, 0.4, 0.2] as const;
const CERAMIC_WATER_LABELS = [
  'Fully wet ceramic slab',
  'Generously wet ceramic slab',
  'Moderately wet ceramic slab',
  'Lightly wet ceramic slab',
  'Lightest ceramic water preload',
] as const;

export class PanSet {
  private root: HTMLElement;
  private events: PanSetEvents;
  private slabCanvas!: HTMLCanvasElement;
  private loupeCanvas!: HTMLCanvasElement;
  private loupeCtx!: CanvasRenderingContext2D;
  private slab!: MixingSlab;
  private pickBtn!: HTMLButtonElement;
  private drawer!: HTMLElement;
  private drawerToggle!: HTMLButtonElement;
  private currentSwatch!: HTMLElement;
  private currentHex!: HTMLElement;
  private chipRow!: HTMLElement;
  private hint!: HTMLElement;
  private waterDots: HTMLButtonElement[] = [];
  private savedPanWells = new Map<number, HTMLElement>();
  /** The visible brush swatch is a KM recipe, never a copied screen colour. */
  private currentRecipe: Recipe = new Map();
  /** Saved palette wells retain the recipe that made their swatch. */
  private savedPanRecipes = new Map<number, Recipe>();

  /** True once the slab has taken paint off the brush, so the next dip starts
   *  clean instead of stacking onto a load that is already on the slab. */
  private spent = false;
  private chargedLoad = 0;
  private picking = false;
  private drawerOpen = false;
  private strokePointer: number | null = null;
  private ceramicFlowUntil = 0;
  private ceramicFlowFrame: number | null = null;

  constructor(mount: HTMLElement, events: PanSetEvents = {}) {
    this.events = events;
    this.root = document.createElement('div');
    this.root.id = 'pan-set';
    this.root.className = 'pan-set';
    this.root.innerHTML = this.template();
    mount.appendChild(this.root);

    this.slabCanvas = this.root.querySelector<HTMLCanvasElement>('#ps-slab')!;
    this.loupeCanvas = this.root.querySelector<HTMLCanvasElement>('#ps-loupe')!;
    const loupeCtx = this.loupeCanvas.getContext('2d');
    if (!loupeCtx) throw new Error('2D context unavailable for the slab picker loupe');
    this.loupeCtx = loupeCtx;
    this.pickBtn = this.root.querySelector<HTMLButtonElement>('#ps-pick')!;
    this.drawer = this.root.querySelector<HTMLElement>('#ps-drawer')!;
    this.drawerToggle = this.root.querySelector<HTMLButtonElement>('#ps-drawer-toggle')!;
    this.currentSwatch = this.root.querySelector('#ps-current')!;
    this.currentHex = this.root.querySelector('#ps-hex')!;
    this.chipRow = this.root.querySelector('#ps-chips')!;
    this.hint = this.root.querySelector('#ps-hint')!;

    this.slab = new MixingSlab(this.slabCanvas);
    this.initWaterRail();
    this.buildPans();
    this.initSlab();
    this.initDrag();

    this.root.querySelector('#ps-clear')!.addEventListener('click', () => this.events.onClearMix?.());
    this.root.querySelector('#ps-rinse')!.addEventListener('click', () => this.events.onRinse?.());
    this.root.querySelector('#ps-rinse-load')!.addEventListener('click', () => this.events.onRinseLoad?.());
    this.root.querySelector('#ps-wipe')!.addEventListener('click', () => {
      this.slab.wipe();
      this.spent = false;
      this.setHint('slab wiped — five pigments free again');
    });
    this.pickBtn.addEventListener('click', () => this.setPicking(!this.picking));
    this.drawerToggle.addEventListener('click', () => this.setDrawer(!this.drawerOpen));
  }

  private template(): string {
    return `
      <div class="ps-lid" id="ps-lid" title="Drag to move the palette">
        <span class="ps-lid-grid" aria-hidden="true"></span>
        <span class="ps-lid-label">pigments</span>
      </div>
      <div class="ps-body">
        <div class="ps-tray">
          <div id="ps-pans" class="ps-pans"></div>
        </div>
      </div>
      <div class="ps-flap ps-flap-bottom">
        <div class="ps-current-row">
          <div id="ps-current" class="ps-current empty" title="The colour now on the brush"></div>
          <div class="ps-current-meta">
            <span id="ps-hex" class="ps-hex">—</span>
            <span id="ps-hint" class="ps-hint">click a pan to dip, then smear on the slab</span>
          </div>
          <button id="ps-clear" class="ps-btn" title="Empty the brush's recipe">clear</button>
        </div>
        <div class="ps-jar">
          <button id="ps-rinse" class="ps-btn" title="Rinse the brush — pigment out, clean water in. The sheet is untouched.">◌ rinse</button>
          <button id="ps-rinse-load" class="ps-btn" title="Rinse, then re-dip in the current mix — back to a known state.">◍ rinse / load</button>
        </div>
        <div id="ps-chips" class="ps-chips"></div>
      </div>
      <button id="ps-drawer-toggle" class="ps-drawer-toggle" type="button"
              aria-controls="ps-drawer" aria-expanded="false"
              aria-label="Open mixing slab" title="Open mixing slab"></button>
      <div id="ps-drawer" class="ps-drawer" aria-hidden="true">
        <div class="ps-drawer-head">mixing slab</div>
        <div class="ps-drawer-content">
          <div class="ps-drawer-well">
            <canvas id="ps-slab" class="ps-slab" role="application"
                    aria-label="Mixing slab. Dip the brush in a pan, then smear here. Work a second colour into the same area to mix them."></canvas>
            <canvas id="ps-loupe" class="ps-loupe" aria-hidden="true"></canvas>
          </div>
          <div id="ps-water-rail" class="ps-water-rail">
            <div class="ps-water-stops" role="radiogroup" aria-label="Ceramic slab water preload">
              ${CERAMIC_WATER_LEVELS.map((level, index) => `
                <button class="ps-water-dot${index === 0 ? ' selected' : ''}" type="button"
                	role="radio" aria-checked="${index === 0}" data-water-level="${level}"
                        aria-label="${CERAMIC_WATER_LABELS[index]}" title="${CERAMIC_WATER_LABELS[index]}">
                </button>`).join('')}
            </div>
            <span class="ps-rail-divider" aria-hidden="true"></span>
            <button id="ps-wipe" class="ps-rail-action ps-wipe-action" type="button"
                    aria-label="Wipe the mixing area clean" title="Wipe the mixing area clean"><i aria-hidden="true"></i></button>
            <span class="ps-rail-divider" aria-hidden="true"></span>
            <button id="ps-pick" class="ps-rail-action ps-picker-action" type="button" aria-pressed="false"
                    aria-label="Choose a color from the mixing area." title="Choose a color from the mixing area."><i aria-hidden="true"></i></button>
          </div>
        </div>
      </div>`;
  }

  /** Five quiet ceramic marks, not a document-water control. The top preserves
   * today's freely flowing slab; lower marks only calm its surface movement. */
  private initWaterRail() {
    this.waterDots = Array.from(this.root.querySelectorAll<HTMLButtonElement>('.ps-water-dot'));
    for (const dot of this.waterDots) {
      dot.addEventListener('click', () => {
        const level = Number(dot.dataset.waterLevel);
        if (!Number.isFinite(level)) return;
        this.setWaterPreload(level, true);
      });
    }
    this.setWaterPreload(CERAMIC_WATER_LEVELS[0], false);
  }

  private setWaterPreload(level: number, announce: boolean) {
    this.slab.setWaterLevel(level);
    this.updateWaterDots(level);
    if (announce) {
      this.setHint(level === CERAMIC_WATER_LEVELS[0]
        ? 'ceramic set fully wet â€” colour moves freely'
        : 'ceramic water preload changed â€” pigment stays on the slab');
    }
  }

  private updateWaterDots(level: number) {
    const selectedIndex = this.waterDots.findIndex((dot) => Number(dot.dataset.waterLevel) === level);
    for (const [index, dot] of this.waterDots.entries()) {
      const selected = Number(dot.dataset.waterLevel) === level;
      dot.classList.toggle('selected', selected);
      // The meter grows upward from its low-water base: a chosen stop and all
      // lower stops read as filled, while selection remains a real radio.
      dot.classList.toggle('filled', selectedIndex >= 0 && index >= selectedIndex);
      dot.setAttribute('aria-checked', String(selected));
    }
  }

  // ---- pans ---------------------------------------------------------------

  private buildPans() {
    const pans = this.root.querySelector('#ps-pans')!;
    for (let i = 0; i < PAN_COLUMNS * PAN_ROWS; i++) {
      const pigment = PIGMENTS[i];
      const well = document.createElement('div');
      well.className = 'ps-pan';
      if (!pigment) {
        well.classList.add('empty');
        this.savedPanWells.set(i, well);
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'ps-pan-add';
        add.title = 'Save the current colour in this pan';
        add.setAttribute('aria-label', 'Save the current colour in this empty pan');
        add.textContent = '+';
        add.addEventListener('click', () => this.saveCurrentColour(i));
        well.appendChild(add);
        pans.appendChild(well);
        continue;
      }
      const cake = document.createElement('button');
      cake.className = 'ps-cake';
      // Masstone grading to a 25% tint, so a dark staining blue still reads as
      // the hue a painter would recognise looking into the pan.
      const tint = tintHex(pigment.slug, 0.25) ?? pigment.hex;
      cake.style.background = `linear-gradient(150deg, ${pigment.hex} 0%, ${pigment.hex} 46%, ${tint} 100%)`;
      cake.title = `${pigment.name} (${pigment.ci}) — click to dip, click again for more`;
      cake.setAttribute('aria-label', pigment.name);
      cake.addEventListener('click', () => this.dip(pigment.slug, pigment.name));
      well.appendChild(cake);
      pans.appendChild(well);
    }
  }

  /** Empty wells store recipes, so a saved mix remains physically mixable
   * instead of becoming a screen-colour clone. */
  private saveCurrentColour(index: number) {
    if (this.currentRecipe.size === 0) {
      this.setHint('choose a colour first, then save it in an empty pan');
      return;
    }
    const recipe = new Map(this.currentRecipe);
    this.savedPanRecipes.set(index, recipe);
    const well = this.savedPanWells.get(index);
    if (!well) return;
    const cake = document.createElement('button');
    const wetHex = mixingSlabPreviewHex(recipe) ?? '#d8d4ca';
    cake.type = 'button';
    cake.className = 'ps-cake ps-saved-cake';
    cake.style.background = `linear-gradient(150deg, ${wetHex} 0%, ${wetHex} 56%, rgba(255, 255, 255, 0.58) 100%)`;
    cake.title = 'Saved colour — click to load it onto the brush';
    cake.setAttribute('aria-label', 'Saved colour. Click to load it onto the brush');
    cake.addEventListener('click', () => this.loadSavedColour(index));
    well.classList.remove('empty');
    well.classList.add('saved');
    well.replaceChildren(cake);
    this.setHint('saved the current colour in the empty pan');
  }

  private loadSavedColour(index: number) {
    const recipe = this.savedPanRecipes.get(index);
    if (!recipe) return;
    this.spent = false;
    this.events.onLoadRecipe?.(new Map(recipe));
    this.setHint('loaded saved colour onto the brush');
  }

  /** Dip the brush. Once paint has gone onto the slab the next dip is a fresh
   *  one — otherwise colour two would arrive still carrying colour one. */
  private dip(slug: string, name: string) {
    const fresh = this.spent;
    this.spent = false;
    if (this.picking) this.setPicking(false);
    this.events.onPickPigment?.(slug, fresh);
    this.setHint(fresh ? `fresh dip — ${name}` : `picked up ${name}`);
  }

  // ---- the slab -----------------------------------------------------------

  private initSlab() {
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => {
        this.slab.resize();
        this.syncLoupeSize();
      }).observe(this.slabCanvas);
    }

    const local = (event: PointerEvent) => {
      const rect = this.slabCanvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    this.slabCanvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const { x, y } = local(event);
      if (this.picking) {
        this.lift(x, y);
        return;
      }
      this.slabCanvas.setPointerCapture(event.pointerId);
      this.strokePointer = event.pointerId;
      this.slab.beginStroke(x, y);
    });

    this.slabCanvas.addEventListener('pointermove', (event) => {
      const { x, y } = local(event);
      if (this.picking) {
        this.drawLoupe(x, y);
        return;
      }
      if (this.strokePointer !== event.pointerId) return;
      this.slab.smearTo(x, y);
    });
    this.slabCanvas.addEventListener('pointerleave', () => this.hideLoupe());

    const end = (event: PointerEvent) => {
      if (this.strokePointer !== event.pointerId) return;
      this.strokePointer = null;
      this.slab.endStroke();
      // Anything actually laid down means the next dip starts clean.
      if (this.slab.remainingLoad < this.chargedLoad - 0.0001) {
        this.spent = true;
        this.startCeramicFlow();
        this.setHint(this.slab.remainingLoad <= 0
          ? 'brush is out — dip again, or keep smearing to blend'
          : 'smeared — dip the next colour and work it in');
      } else if (this.chargedLoad <= 0) {
        this.setHint('nothing on the brush — click a pan first');
      }
    };
    this.slabCanvas.addEventListener('pointerup', end);
    this.slabCanvas.addEventListener('pointercancel', end);
  }

  private setPicking(on: boolean) {
    this.picking = on;
    this.pickBtn.classList.toggle('on', on);
    this.pickBtn.setAttribute('aria-pressed', String(on));
    this.slabCanvas.classList.toggle('picking', on);
    if (!on) this.hideLoupe();
    if (on) this.setHint('picker on — click the colour you want off the slab');
  }

  /** Keep the transparent overlay in the exact same pixel space as the slab. */
  private syncLoupeSize() {
    const rect = this.slabCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.loupeCanvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.loupeCanvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.loupeCanvas.style.width = `${rect.width}px`;
    this.loupeCanvas.style.height = `${rect.height}px`;
  }

  private drawLoupe(x: number, y: number) {
    this.syncLoupeSize();
    const rect = this.slabCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.loupeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.loupeCtx.clearRect(0, 0, rect.width, rect.height);
    this.slab.drawLoupe(this.loupeCtx, x, y, 24);
    this.loupeCanvas.classList.add('on');
  }

  private hideLoupe() {
    this.loupeCanvas.classList.remove('on');
    const rect = this.slabCanvas.getBoundingClientRect();
    this.loupeCtx.clearRect(0, 0, rect.width, rect.height);
  }

  /** The ceramic slab is a small attached drawer so its mixing area can stay
   * generous without making the main pigment box wider. A native button keeps
   * this usable with a mouse, finger, Enter, and Space. */
  private setDrawer(open: boolean) {
    this.drawerOpen = open;
    this.root.classList.toggle('drawer-open', open);
    this.drawer.setAttribute('aria-hidden', String(!open));
    this.drawerToggle.setAttribute('aria-expanded', String(open));
    this.drawerToggle.setAttribute('aria-label', open ? 'Close mixing slab' : 'Open mixing slab');
    this.drawerToggle.title = open ? 'Close mixing slab' : 'Open mixing slab';
    if (open) {
      requestAnimationFrame(() => {
        this.slab.resize();
        this.keepDrawerInView();
      });
    }
  }

  /** Lift a colour off the slab and put it on the brush. */
  private lift(x: number, y: number) {
    const sample = this.slab.sample(x, y);
    if (!sample) {
      this.setHint('nothing there — click where the paint is');
      return;
    }
    this.spent = false;
    this.events.onLoadRecipe?.(sample.recipe);
    this.setPicking(false);
    this.setHint('lifted that colour onto the brush');
  }

  private setHint(text: string) {
    this.hint.textContent = text;
  }

  /** Let a fresh puddle drift across the non-absorbent ceramic for a brief
   * moment. The actual sheet solver is intentionally untouched. */
  private startCeramicFlow() {
    this.ceramicFlowUntil = performance.now() + CERAMIC_FLOW_WINDOW_MS;
    if (this.ceramicFlowFrame !== null) return;
    const tick = () => {
      this.slab.flow();
      if (performance.now() < this.ceramicFlowUntil) {
        this.ceramicFlowFrame = requestAnimationFrame(tick);
      } else {
        this.ceramicFlowFrame = null;
      }
    };
    this.ceramicFlowFrame = requestAnimationFrame(tick);
  }

  // ---- dragging the whole box --------------------------------------------

  private initDrag() {
    const lid = this.root.querySelector<HTMLElement>('#ps-lid')!;
    let pointerId: number | null = null;
    let grabX = 0;
    let grabY = 0;

    const saved = readPosition();
    if (saved) this.moveTo(saved.left, saved.top);
    else {
      // Bottom-left: out from under the diagnostics panel, clear of the Conte
      // instrument on the right.
      requestAnimationFrame(() => {
        const rect = this.root.getBoundingClientRect();
        this.moveTo(16, Math.max(16, window.innerHeight - rect.height - 16));
      });
    }

    lid.addEventListener('pointerdown', (event) => {
      if ((event.target as HTMLElement).closest('button')) return;
      event.preventDefault();
      pointerId = event.pointerId;
      lid.setPointerCapture(event.pointerId);
      const rect = this.root.getBoundingClientRect();
      grabX = event.clientX - rect.left;
      grabY = event.clientY - rect.top;
      this.root.classList.add('dragging');
    });
    lid.addEventListener('pointermove', (event) => {
      if (pointerId !== event.pointerId) return;
      this.moveTo(event.clientX - grabX, event.clientY - grabY);
      if (this.drawerOpen) this.keepDrawerInView();
    });
    const end = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      this.root.classList.remove('dragging');
      writePosition(this.root.getBoundingClientRect());
    };
    lid.addEventListener('pointerup', end);
    lid.addEventListener('pointercancel', end);

    window.addEventListener('resize', () => {
      const rect = this.root.getBoundingClientRect();
      this.moveTo(rect.left, rect.top);
      if (this.drawerOpen) this.keepDrawerInView();
    });
  }

  /** The drawer is outside the palette's own border box, so account for it
   * when the palette is close to a screen edge. */
  private keepDrawerInView() {
    const rootRect = this.root.getBoundingClientRect();
    const drawerRect = this.drawer.getBoundingClientRect();
    let left = rootRect.left;
    let top = rootRect.top;
    if (drawerRect.right > window.innerWidth) left -= drawerRect.right - window.innerWidth;
    if (drawerRect.left < 0) left += -drawerRect.left;
    if (drawerRect.bottom > window.innerHeight) top -= drawerRect.bottom - window.innerHeight;
    if (drawerRect.top < 0) top += -drawerRect.top;
    this.moveTo(left, top);
  }

  /** Clamp so the box can never be dragged fully off-screen. */
  private moveTo(left: number, top: number) {
    const rect = this.root.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    this.root.style.left = `${Math.min(Math.max(0, left), maxLeft)}px`;
    this.root.style.top = `${Math.min(Math.max(0, top), maxTop)}px`;
  }

  // ---- render -------------------------------------------------------------

  /** A pencil cannot pick up watercolour. Dim the box rather than hide it, so
   *  the painter can still see what is mixed while a dry tool is in hand. */
  setDryMode(on: boolean) {
    this.root.classList.toggle('dry-mode', on);
  }

  /** Take the whole box off the sheet. It is the largest and palest thing in
   *  the view, so it gets a rail switch of its own; the mix it holds survives
   *  being hidden, and the slab drawer is folded away with it so it cannot be
   *  left hanging open off the edge of a hidden box. */
  setVisible(on: boolean) {
    this.root.classList.toggle('box-hidden', !on);
    this.root.setAttribute('aria-hidden', String(!on));
    if (!on && this.drawerOpen) this.setDrawer(false);
  }

  /** Called by the palette whenever the brush's load changes. */
  render(recipe: Recipe, _hex: string | null) {
    this.currentRecipe = new Map([...recipe].filter(([, parts]) => parts > 0));
    const wetHex = mixingSlabPreviewHex(recipe);
    this.currentSwatch.style.background = wetHex ?? 'transparent';
    this.currentSwatch.classList.toggle('empty', !wetHex);
    this.currentHex.textContent = wetHex ? wetHex.toUpperCase() : '—';

    // Charge the slab's brush. The number of parts is how much paint was picked
    // up, so three clicks really does put down three times as much.
    let total = 0;
    let allWhole = true;
    for (const parts of recipe.values()) {
      if (parts <= 0) continue;
      total += parts;
      if (Math.abs(parts - Math.round(parts)) > 0.001) allWhole = false;
    }
    this.chargedLoad = total;
    if (!this.slab.setBrush(recipe, total)) {
      this.chargedLoad = 0;
      this.setHint(`the slab is holding ${MAX_SLOTS} pigments — wipe it to start again`);
    }

    // Whole parts mean the by-parts stack and read as ×N. A colour lifted off
    // the slab arrives in measured amounts, so it reads as a share instead.
    this.chipRow.innerHTML = '';
    for (const [slug, parts] of recipe) {
      if (parts <= 0) continue;
      const pigment = PIGMENTS.find((p) => p.slug === slug);
      if (!pigment) continue;
      const chip = document.createElement('button');
      chip.className = 'ps-chip';
      const dot = tintHex(slug, 0.35) ?? pigment.hex;
      const amount = allWhole
        ? (parts > 1 ? ` ×${Math.round(parts)}` : '')
        : ` ${Math.round((parts / total) * 100)}%`;
      chip.innerHTML = `<i style="background:${dot}"></i>${pigment.name}${amount}`;
      chip.title = `remove one part of ${pigment.name}`;
      chip.addEventListener('click', () => this.events.onRemovePart?.(slug));
      this.chipRow.appendChild(chip);
    }
  }
}

function readPosition(): { left: number; top: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { left?: unknown; top?: unknown };
    if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return null;
    return { left: parsed.left, top: parsed.top };
  } catch {
    return null;
  }
}

function writePosition(rect: DOMRect) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
  } catch {
    // A palette that cannot remember where it was put is still a palette.
  }
}
