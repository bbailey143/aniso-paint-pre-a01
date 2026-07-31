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
import type { DryMedium, GranularDry, InkMedium } from '../media/types';

type SettingsGroup = { heading: string; rows: Array<[string, string]> };

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
  /** Debug water display on/off. Changes what is drawn, never what is simulated. */
  onWaterView?(on: boolean): void;
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
  private mediumInfo?: HTMLElement;
  private sizeInput!: HTMLInputElement;

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
      const consumeBrushHold = this.installSettingsHold(el, () => this.showBrushInfo(b, el));
      el.title = `${b.name} — ${b.kind === 'flat' ? 'two spines (spreads, scratches)' : 'one spine (points)'}`;
      el.addEventListener('click', (event) => {
        if (consumeBrushHold(event)) return;
        clearAll();
        el.classList.add('on');
        this.brush = b;
        this.root.classList.remove('dry-mode');
        this.events.onBrushChange?.(b, this.brushSize);
      });
      brushes.appendChild(el);
    });

    const openStudioBtn = this.root.querySelector('#open-brush-studio');
    if (openStudioBtn) {
      openStudioBtn.addEventListener('click', () => this.openBrushStudio());
    }

    DRY_TOOLS.forEach((t) => {
      const el = document.createElement('button');
      el.className = 'pal-btn paper';
      el.textContent = t.name;
      let holdTimer: number | undefined;
      let blockClickUntil = 0;
      const cancelHold = () => {
        if (holdTimer !== undefined) {
          window.clearTimeout(holdTimer);
          holdTimer = undefined;
        }
      };
      el.addEventListener('pointerdown', (event) => {
        if (!event.isPrimary || event.button !== 0) return;
        cancelHold();
        holdTimer = window.setTimeout(() => {
          holdTimer = undefined;
          // Releasing a pen or finger can still make a click. Ignore only that
          // release, not the painter's next normal tool selection.
          blockClickUntil = performance.now() + 1800;
          this.showMediumInfo(t.medium, el);
        }, 550);
      });
      el.addEventListener('pointerup', cancelHold);
      el.addEventListener('pointercancel', cancelHold);
      el.addEventListener('pointerleave', cancelHold);
      el.addEventListener('contextmenu', (event) => event.preventDefault());
      el.title = t.medium.kind === 'ink'
        ? 'Ballpoint — rides the peaks and skips the valleys; the ball starves and recovers as it rolls'
        : `Graphite ${t.name} — ${t.medium.hardness > 0
            ? 'hard: lays little, catches only the peaks of the tooth'
            : 'soft: lays heavily and fills the valleys'}`;
      el.addEventListener('click', (event) => {
        if (performance.now() < blockClickUntil) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        clearAll();
        el.classList.add('on');
        this.root.classList.add('dry-mode');
        this.events.onDryMedium?.(t.medium, this.brushSize);
      });
      dries.appendChild(el);
    });
    const sizeEl = this.root.querySelector('#brush-size') as HTMLInputElement;
    this.sizeInput = sizeEl;
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
      const consumePaperHold = this.installSettingsHold(b, () => this.showPaperInfo(p, b));
      b.addEventListener('click', (event) => {
        if (consumePaperHold(event)) return;
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

    const waterView = this.root.querySelector('#water-view') as HTMLInputElement;
    waterView.addEventListener('change', () => {
      this.events.onWaterView?.(waterView.checked);
    });

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

  /** The shared press-and-hold gesture used by media, brushes, and papers. */
  private installSettingsHold(el: HTMLElement, open: () => void) {
    let holdTimer: number | undefined;
    let blockClickUntil = 0;
    const cancelHold = () => {
      if (holdTimer !== undefined) {
        window.clearTimeout(holdTimer);
        holdTimer = undefined;
      }
    };
    el.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      cancelHold();
      holdTimer = window.setTimeout(() => {
        holdTimer = undefined;
        // Keep the report pinned through browsers that delay the release click.
        blockClickUntil = performance.now() + 1800;
        open();
      }, 550);
    });
    el.addEventListener('pointerup', cancelHold);
    el.addEventListener('pointercancel', cancelHold);
    el.addEventListener('pointerleave', cancelHold);
    el.addEventListener('contextmenu', (event) => event.preventDefault());
    return (event: MouseEvent) => {
      if (performance.now() >= blockClickUntil) return false;
      event.preventDefault();
      event.stopPropagation();
      return true;
    };
  }

  /** A reusable, pinned report card. Only its own X closes it. */
  private showSettingsCard(
    titleText: string, subtitleText: string, noteText: string,
    anchor: HTMLElement, groups: SettingsGroup[],
  ) {
    this.closeMediumInfo();
    const card = document.createElement('aside');
    card.className = 'medium-info panel';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', `${titleText} settings`);

    const head = document.createElement('div');
    head.className = 'medium-info-head';
    const title = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'hud-title';
    name.textContent = titleText;
    const subtitle = document.createElement('span');
    subtitle.className = 'medium-info-sub';
    subtitle.textContent = subtitleText;
    title.append(name, subtitle);
    const close = document.createElement('button');
    close.className = 'medium-info-close';
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close settings';
    close.setAttribute('aria-label', 'Close settings');
    close.addEventListener('click', () => this.closeMediumInfo());
    head.append(title, close);
    card.appendChild(head);

    const note = document.createElement('p');
    note.className = 'medium-info-note';
    note.textContent = noteText;
    card.appendChild(note);
    for (const { heading, rows } of groups) {
      const group = document.createElement('section');
      group.className = 'medium-info-group';
      const label = document.createElement('h3');
      label.textContent = heading;
      group.appendChild(label);
      for (const [setting, value] of rows) {
        const row = document.createElement('div');
        row.className = 'medium-info-row';
        const settingLabel = document.createElement('span');
        settingLabel.textContent = setting;
        const settingValue = document.createElement('b');
        settingValue.textContent = value;
        row.append(settingLabel, settingValue);
        group.appendChild(row);
      }
      card.appendChild(group);
    }

    document.body.appendChild(card);
    const rect = anchor.getBoundingClientRect();
    const width = 286;
    card.style.left = `${Math.max(12, Math.min(window.innerWidth - width - 12, rect.left - width - 10))}px`;
    card.style.top = `${Math.max(12, Math.min(window.innerHeight - 120, rect.top))}px`;
    this.mediumInfo = card;
  }

  private showBrushInfo(brush: BrushDef, anchor: HTMLElement) {
    const number = (value: number) => value.toFixed(2);
    this.showSettingsCard(
      brush.name, 'brush settings',
      'Shared working settings. Values without units use this engine’s 0–1 scale.',
      anchor,
      [
        { heading: 'Tuft shape', rows: [
          ['shape', brush.kind === 'flat' ? 'flat — two active sides' : 'round — one active centreline'],
          ['chain segments', String(brush.segments)],
          ['tuft length', `${number(brush.length)} cells`],
          ['width / length', `${number(brush.widthRatio)}×`],
          ['taper', number(brush.taper)],
          ['bristle count', String(brush.bristles)],
        ] },
        { heading: 'Handling', rows: [
          ['ferrule spring', number(brush.stiffness)],
          ['tip softness', number(brush.stiffnessTaper)],
          ['pressure spread', number(brush.splayFromPressure)],
          ['base drag', number(brush.friction.mu)],
          ['preferred-stroke glide', number(brush.friction.cEta)],
          ['direction focus', number(brush.friction.k)],
          ['shape memory', number(brush.plasticity)],
        ] },
        { heading: 'Paint holding', rows: [
          ['belly capacity', number(brush.reservoir.capacityBelly)],
          ['tip capacity', number(brush.reservoir.capacityTip)],
          ['extra water range', number(brush.reservoir.waterOvercharge)],
          ['lays down', number(brush.reservoir.downRate)],
          ['picks up', number(brush.reservoir.upRate)],
        ] },
      ],
    );
  }

  private showPaperInfo(paper: Paper, anchor: HTMLElement) {
    const number = (value: number) => value.toFixed(2);
    this.showSettingsCard(
      paper.name, 'paper settings',
      'These values define the sheet for every tool. Capillary radius is shown in micrometres.',
      anchor,
      [
        { heading: 'Surface', rows: [
          ['tooth depth', number(paper.toothAmp)],
          ['grain frequency', `${paper.featureFreq} features / sheet`],
          ['sizing', number(paper.sizing)],
        ] },
        { heading: 'Water in the sheet', rows: [
          ['capillary radius', `${number(paper.rc * 1e6)} µm`],
          ['minimum holding', number(paper.cMin)],
          ['maximum holding', number(paper.cMax)],
        ] },
      ],
    );
  }

  /** A temporary, read-only report for one shared dry-medium row. */
  private showMediumInfo(medium: GranularDry | InkMedium, anchor: HTMLElement) {
    this.closeMediumInfo();

    const card = document.createElement('aside');
    card.className = 'medium-info panel';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', `${medium.name} material settings`);

    const head = document.createElement('div');
    head.className = 'medium-info-head';
    const title = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'hud-title';
    name.textContent = medium.name;
    const subtitle = document.createElement('span');
    subtitle.className = 'medium-info-sub';
    subtitle.textContent = 'material settings';
    title.append(name, subtitle);
    const close = document.createElement('button');
    close.className = 'medium-info-close';
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close material settings';
    close.setAttribute('aria-label', 'Close material settings');
    close.addEventListener('click', () => this.closeMediumInfo());
    head.append(title, close);
    card.appendChild(head);

    const note = document.createElement('p');
    note.className = 'medium-info-note';
    note.textContent = 'Shared working settings. Values without units use this engine’s 0–1 scale.';
    card.appendChild(note);

    const number = (value: number) => value.toFixed(2);
    const addGroup = (heading: string, rows: Array<[string, string]>) => {
      const group = document.createElement('section');
      group.className = 'medium-info-group';
      const label = document.createElement('h3');
      label.textContent = heading;
      group.appendChild(label);
      for (const [setting, value] of rows) {
        const row = document.createElement('div');
        row.className = 'medium-info-row';
        const settingLabel = document.createElement('span');
        settingLabel.textContent = setting;
        const settingValue = document.createElement('b');
        settingValue.textContent = value;
        row.append(settingLabel, settingValue);
        group.appendChild(row);
      }
      card.appendChild(group);
    };

    addGroup('Contact', [
      ['tip shape', medium.contactProfile],
      ['tip radius', `${number(medium.tipRadius)} cells`],
      ['base width / length', `${number(medium.contactAspect)}×`],
      ['side contact begins', `${number(medium.tiltStart)}°`],
      ['full side length', `${number(medium.tiltAspect)}×`],
    ]);
    addGroup('Mark on paper', [
      ['paper-tooth gate', number(medium.toothThreshold)],
      ['speed breakup', number(medium.velocityCoupling)],
      ['pressure response', number(medium.pressureExp)],
      ['deposit amount', number(medium.deposition)],
      ['edge crispness', number(medium.edgeSharpness)],
    ]);
    addGroup('Material', [
      ['particle size', number(medium.physics.pigmentParticleSize)],
      ['binder body', number(medium.physics.binderViscosity)],
      ['material hardness', number(medium.physics.mediumHardness)],
      ['friction release', number(medium.physics.shearRate)],
      ['paper hold', number(medium.physics.adhesionStrength)],
      ['paper compression start', number(medium.physics.compressiveYield)],
      ['potential sheen', number(medium.physics.specularPotential)],
      ['fine surface reflection', number(medium.physics.microReflectance)],
      ['optical density', number(medium.physics.refractiveIndex)],
    ]);
    if (medium.kind === 'ink') {
      addGroup('Ink delivery', [
        ['delivery', medium.flowMode === 'ball' ? 'rolling ball' : 'wetted fountain nib'],
        ['flow starvation', number(medium.skipStrength)],
        ['starvation length', `${number(medium.skipScale)} cells`],
        ['fine chatter', number(medium.chatter)],
      ]);
    }

    document.body.appendChild(card);
    const rect = anchor.getBoundingClientRect();
    const width = 286;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left - width - 10));
    const top = Math.max(12, Math.min(window.innerHeight - 120, rect.top));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    this.mediumInfo = card;
  }

  private closeMediumInfo() {
    this.mediumInfo?.remove();
    this.mediumInfo = undefined;
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
        <button id="open-brush-studio" class="pal-btn paper brush-studio-link" title="Open 3D Brush Viewer Studio in its own window">3D BRUSH VIEWER STUDIO ↗</button>
        <div class="pal-sub">dry media</div>
        <div id="dry-tools" class="papers six"></div>
        <p class="medium-hint">press and hold a tool or paper for settings</p>
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
        <label class="loading-row wet-only" title="Add clean water without removing pigment. Use rinse for a clean-water-only brush.">
          <span>water</span>
          <input id="water-charge" type="range" min="0" max="1" step="0.01" />
        </label>
        <label class="loading-row">
          <span title="Evaporation speed">drying</span>
          <input id="evap" type="range" min="0" max="0.004" step="0.0001" />
        </label>
        <section class="tilt-control" aria-label="paper tilt">
          <div class="tilt-head"><span>tilt</span><button id="tilt-level" class="pal-btn" title="Return the paper to level">level</button></div>
          <div id="tilt-pad" class="tilt-pad" role="application" aria-label="Drag the blue puck toward the downhill direction">
            <span id="tilt-puck" class="tilt-puck"></span>
          </div>
          <p class="tilt-hint">drag toward downhill</p>
        </section>
        <label class="loading-row" title="Show where the water is instead of the colour. Deep blue is a lot of standing water, teal is water soaked into the fibres, the yellow line is the wet edge. Display only — it changes nothing about the paint.">
          <span>water view</span>
          <input id="water-view" type="checkbox" />
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

  /**
   * Step the tool size one notch, as `[` and `]` do in every other painting
   * app. `dir` is -1 to shrink, +1 to grow.
   *
   * Deliberately drives the slider and re-fires its `input` event rather than
   * setting `brushSize` directly: that handler already routes the new size to
   * whichever tool is in hand — resizing a pencil must not silently put the
   * brush back — and duplicating that branch here is how the two would drift.
   *
   * The step is multiplicative, because size reads perceptually rather than
   * linearly: +12% is one notch whether you are at 0.2 or at 2.0. It is then
   * snapped to the slider's own `step` so the control and the value never
   * disagree, and forced to move at least one notch in case rounding eats it.
   */
  nudgeSize(dir: -1 | 1) {
    const el = this.sizeInput;
    if (!el) return;
    const min = parseFloat(el.min), max = parseFloat(el.max), step = parseFloat(el.step);
    const cur = parseFloat(el.value);

    const snap = (v: number) => Math.round(v / step) * step;
    let next = snap(cur * (dir > 0 ? 1.12 : 1 / 1.12));
    if (next === cur) next = snap(cur + dir * step);
    next = Math.min(max, Math.max(min, next));
    // Rounding can leave 0.30000000000000004; the slider shows the raw string.
    next = parseFloat(next.toFixed(4));
    if (next === cur) return;

    el.value = String(next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
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

  public openBrushStudio() {
    try {
      localStorage.setItem('aniso_active_brush', JSON.stringify(this.brush));
    } catch (_) {}

    const popoutUrl = `brush-studio.html?brush=${encodeURIComponent(this.brush.slug)}`;
    const popoutWin = window.open(popoutUrl, 'BrushStudio', 'width=1280,height=820,menubar=no,toolbar=no,location=no');

    if (!popoutWin || popoutWin.closed || typeof popoutWin.closed === 'undefined') {
      this.openFloatingStudioModal();
    } else {
      popoutWin.focus();
    }
  }

  private openFloatingStudioModal() {
    const existing = document.querySelector('.studio-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'studio-modal-overlay';
    const content = document.createElement('div');
    content.className = 'studio-modal-content';
    overlay.appendChild(content);
    document.body.appendChild(overlay);

    import('./studio').then(({ BrushViewerStudio }) => {
      const studio = new BrushViewerStudio(content, {
        brush: this.brush,
        onBrushUpdate: (updated) => {
          this.brush = updated;
          this.events.onBrushChange?.(updated, this.brushSize);
        },
        onClose: () => {
          studio.destroy();
          overlay.remove();
        },
      });
    });
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
