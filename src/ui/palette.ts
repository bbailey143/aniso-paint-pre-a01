// The studio panel: tools, paper, and the sheet-level controls.
//
// The pigments used to live here too. They now have their own floating box —
// see ui/pan-set.ts — but this class still owns the recipe both of its mixing
// surfaces edit, and is still the only thing that announces a mix change. The
// colour it reports is the real Kubelka-Munk result; the old side-by-side
// "naive RGB average" comparison has been retired.

import { recipeToHex, type Recipe } from '../color/km';
import { PanSet } from './pan-set';
import { Rail } from './rail';
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
  /** The studio's five drawers hang off this. */
  private rail: Rail;
  /** The pigments live in their own floating box now — see ui/pan-set.ts. */
  private panSet: PanSet;
  private events: PaletteEvents;
  private mediumInfo?: HTMLElement;
  private activeDry: DryMedium | null = null;
  private activePaper: Paper = PAPERS[1];

  constructor(mount: HTMLElement, events: PaletteEvents = {}, initialEvapRate = 0) {
    this.events = events;
    // `#palette` is now a bare container, not a panel. Its children are the
    // rail and the drawers, each fixed to the right edge on its own.
    this.root = document.createElement('div');
    this.root.id = 'palette';
    this.root.innerHTML = this.template();
    mount.appendChild(this.root);
    this.rail = new Rail('right', this.root);

    // The pan set is a separate floating window, not a section of this panel.
    // It owns the pans, the mixing slab and the by-parts stack; this palette
    // still owns the recipe those surfaces are editing.
    this.panSet = new PanSet(mount, {
      // A fresh dip replaces the load; otherwise clicks stack, which is the
      // by-parts mixing the bottom flap has always done.
      onPickPigment: (slug, fresh) => {
        if (fresh) this.recipe.clear();
        this.add(slug);
      },
      onLoadRecipe: (recipe) => this.setRecipe(recipe),
      onRemovePart: (slug) => this.remove(slug),
      onClearMix: () => {
        // This is the pigment Clear, not Clear Sheet: leave the painting alone,
        // empty the colour recipe, and give the brush a full clean-water rinse
        // so the very next mark cannot carry the old mix.
        this.clear();
        this.events.onRinse?.();
      },
      // No refresh() on either rinse: refresh re-fires onMixChange, which
      // re-dips the brush, so rinsing and then refreshing would immediately
      // undo the rinse. The palette still holds the mix; only the brush was
      // washed out.
      onRinse: () => this.events.onRinse?.(),
      onRinseLoad: () => this.events.onRinseLoad?.(),
    });

    this.buildSurface(initialEvapRate);
    // Wire the controls first, then re-parent them into drawers.
    this.buildRail();
    this.refresh();
  }

  private buildSurface(initialEvapRate: number) {
    this.buildToolPicker();
    this.buildPaperPicker();
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
        this.setDryMode(false);
        this.events.onBrushChange?.(b, this.brushSize);
      });
      brushes.appendChild(el);
    });

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
        : t.medium.slug === 'conte-crayon'
          ? 'Conte crayon — use a square end, an edge, or Lay Flat for the broad rectangular side; repeated passes rub loose sanguine particles together'
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
        this.setDryMode(true);
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
      if (this.activeDry) {
        this.events.onDryMedium?.(this.activeDry, this.brushSize);
      } else if (dryOn) {
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
    const tiltAngle = this.root.querySelector('#tilt-angle') as HTMLElement;
    const setTilt = (clientX: number, clientY: number) => {
      const rect = tiltPad.getBoundingClientRect();
      const radius = Math.max(1, rect.width / 2 - 10);
      let x = (clientX - (rect.left + rect.width / 2)) / radius;
      let y = (clientY - (rect.top + rect.height / 2)) / radius;
      const length = Math.hypot(x, y);
      if (length > 1) { x /= length; y /= length; }
      tiltPuck.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
      // The puck radius is sin(alpha), so invert it for the artist-facing board
      // angle. Centre is level; the rim is a 90 degree slope.
      const degrees = Math.round(Math.asin(Math.min(1, length)) * 180 / Math.PI);
      tiltAngle.textContent = `tilt: ${degrees}°`;
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
      tiltAngle.textContent = 'tilt: 0°';
      this.events.onTiltChange?.(0, 0, 1);
    });

    this.root.querySelector('#wash-clear')!
      .addEventListener('click', () => this.events.onClear?.());

    const waterView = this.root.querySelector('#water-view') as HTMLInputElement;
    waterView.addEventListener('change', () => {
      this.events.onWaterView?.(waterView.checked);
    });

  }

  /** The shared press-and-hold gesture used by media, brushes, and papers. */
  private buildToolPicker() {
    const host = this.root.querySelector('#tool-picker')!;
    const choices = [
      ...BRUSHES.map((brush) => ({ family: 'Water Media', collection: 'Watercolour Brushes', name: brush.name, brush })),
      ...DRY_TOOLS.map((tool) => {
        const collection = tool.slug.startsWith('graphite-') ? 'Graphite'
          : tool.slug.startsWith('ballpoint-') ? 'Ballpoint'
          : tool.slug === 'fountain-chisel' ? 'Fountain Pen' : 'Drawing Sticks';
        return { family: 'Dry Media', collection, name: tool.name, dry: tool.medium };
      }),
    ];
    const family = document.createElement('select');
    const collection = document.createElement('select');
    const tool = document.createElement('select');
    family.setAttribute('aria-label', 'Tool family');
    collection.setAttribute('aria-label', 'Tool collection');
    tool.setAttribute('aria-label', 'Tool');
    const inspect = document.createElement('button');
    inspect.className = 'pal-btn inspect-btn';
    inspect.type = 'button';
    inspect.textContent = 'Inspect tool';
    host.append(family, collection, tool, inspect);
    const fill = (el: HTMLSelectElement, values: string[], selected?: string) => {
      el.replaceChildren(...values.map((value) => {
        const option = document.createElement('option'); option.value = value; option.textContent = value;
        return option;
      }));
      if (selected && values.includes(selected)) el.value = selected;
    };
    const update = (keep = true) => {
      const families = [...new Set(choices.map((item) => item.family))];
      fill(family, families, keep ? family.value : 'Water Media');
      const collections = [...new Set(choices.filter((item) => item.family === family.value).map((item) => item.collection))];
      fill(collection, collections, keep ? collection.value : 'Watercolour Brushes');
      const available = choices.filter((item) => item.family === family.value && item.collection === collection.value);
      fill(tool, available.map((item) => item.name), keep ? tool.value : 'Round Sable');
      return available.find((item) => item.name === tool.value)!;
    };
    const apply = () => {
      const selected = update();
      if ('brush' in selected) {
        this.activeDry = null;
        this.brush = selected.brush;
        this.setDryMode(false);
        this.events.onBrushChange?.(selected.brush, this.brushSize);
      } else {
        this.activeDry = selected.dry;
        this.setDryMode(true);
        this.events.onDryMedium?.(selected.dry, this.brushSize);
      }
    };
    family.addEventListener('change', () => { update(); apply(); });
    collection.addEventListener('change', () => { update(); apply(); });
    tool.addEventListener('change', apply);
    inspect.addEventListener('click', () => {
      const selected = update();
      if ('brush' in selected) this.showBrushInfo(selected.brush, inspect);
      else this.showMediumInfo(selected.dry, inspect);
    });
    update(false);
  }

  private buildPaperPicker() {
    const host = this.root.querySelector('#paper-picker')!;
    const family = document.createElement('select');
    const collection = document.createElement('select');
    const sheet = document.createElement('select');
    family.setAttribute('aria-label', 'Paper family');
    collection.setAttribute('aria-label', 'Paper collection');
    sheet.setAttribute('aria-label', 'Sheet');
    const summary = document.createElement('div');
    summary.className = 'paper-summary';
    const swatch = document.createElement('i');
    const label = document.createElement('span');
    const inspect = document.createElement('button');
    inspect.className = 'pal-btn inspect-btn'; inspect.type = 'button'; inspect.textContent = 'Inspect paper';
    summary.append(swatch, label, inspect);
    host.append(family, collection, sheet, summary);
    const fill = (el: HTMLSelectElement, values: string[], selected?: string) => {
      el.replaceChildren(...values.map((value) => {
        const option = document.createElement('option'); option.value = value; option.textContent = value;
        return option;
      }));
      if (selected && values.includes(selected)) el.value = selected;
    };
    const update = (keep = true) => {
      fill(family, [...new Set(PAPERS.map((item) => item.family))], keep ? family.value : 'Watercolor');
      fill(collection, [...new Set(PAPERS.filter((item) => item.family === family.value).map((item) => item.collection))], keep ? collection.value : 'Cold Press');
      const available = PAPERS.filter((item) => item.family === family.value && item.collection === collection.value);
      fill(sheet, available.map((item) => item.name), keep ? sheet.value : 'Medium Texture');
      const selected = available.find((item) => item.name === sheet.value)!;
      this.activePaper = selected;
      swatch.style.background = `rgb(${selected.tone.map((value) => Math.round(value * 255)).join(', ')})`;
      label.textContent = `${selected.grainStyle} — ${selected.wetSuitability}`;
      return selected;
    };
    const apply = () => this.events.onPaperChange?.(update());
    family.addEventListener('change', () => { update(); apply(); });
    collection.addEventListener('change', () => { update(); apply(); });
    sheet.addEventListener('change', apply);
    inspect.addEventListener('click', () => this.showPaperInfo(this.activePaper, inspect));
    update(false);
  }

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
    if (medium.kind === 'granular') {
      addGroup('Surface handling', [
        ['surface movement', number(medium.surfaceMobility)],
        ['half-locked at', `${number(medium.compactionAmount)} amount`],
      ]);
    }
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

  /** Each `studio-part` becomes its own drawer on the right rail. They were one
   *  scrolling column until the iPad showed what that costs: a panel the height
   *  of the screen sitting on the painting the whole time it is open. Splitting
   *  them means the thing you opened is the only thing in the way. */
  private template(): string {
    return `
      <section class="studio-part" data-part="tool" data-label="Tool">
        <div id="tool-picker" class="linked-picker" aria-label="Tool picker"></div>
        <div id="legacy-tools" aria-hidden="true">
        <div class="pal-sub">brush</div>
        <div id="brushes" class="papers"></div>
        <div class="pal-sub">dry media</div>
        <div id="dry-tools" class="papers six"></div>
        </div>
        <p class="medium-hint">Choose a family, then a collection and tool. Inspect keeps its card pinned.</p>
        <label class="loading-row">
          <span>size</span>
          <input id="brush-size" type="range" min="0.15" max="2.4" step="0.025" />
        </label>
      </section>

      <section class="studio-part" data-part="paper" data-label="Paper">
        <div id="paper-picker" class="linked-picker" aria-label="Paper picker"></div>
        <div id="legacy-papers" aria-hidden="true">
        <div id="papers" class="papers"></div>
        </div>
      </section>

      <section class="studio-part" data-part="paint" data-label="Paint">
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
      </section>

      <section class="studio-part" data-part="board" data-label="Board">
        <div class="tilt-control" aria-label="paper tilt">
          <div class="tilt-head"><span>tilt</span><button id="tilt-level" class="pal-btn" title="Return the paper to level">level</button></div>
          <div id="tilt-pad" class="tilt-pad" role="application" aria-label="Drag the blue puck toward the downhill direction">
            <span id="tilt-puck" class="tilt-puck"></span>
          </div>
          <p id="tilt-angle" class="tilt-angle">tilt: 0°</p>
          <p class="tilt-hint">drag toward downhill</p>
        </div>
      </section>

      <section class="studio-part" data-part="sheet" data-label="Sheet">
        <label class="loading-row" title="Show where the water is instead of the colour. Deep blue is a lot of standing water, teal is water soaked into the fibres, the yellow line is the wet edge. Display only — it changes nothing about the paint.">
          <span>water view</span>
          <input id="water-view" type="checkbox" />
        </label>
        <!-- There is no Ctrl+0 on an iPad, so getting back to the whole sheet
             needs a control you can actually reach with a finger. -->
        <button id="view-fit" class="pal-btn" title="Show the whole sheet again">fit sheet</button>
        <button id="wash-clear" class="pal-btn">clear sheet</button>
      </section>`;
  }

  /** Move each part onto the right rail. The drawers stay inside `this.root`,
   *  so every `this.root.querySelector('#…')` above still resolves and the
   *  `#palette.dry-mode` dimming rules still reach the controls they dim. */
  private buildRail() {
    const titles: Record<string, string> = {
      tool: 'Tool', paper: 'Paper', paint: 'Paint', board: 'Board', sheet: 'Sheet',
    };
    for (const part of Array.from(this.root.querySelectorAll<HTMLElement>('.studio-part'))) {
      const id = part.dataset.part!;
      this.rail.addPanel({
        id,
        label: part.dataset.label ?? titles[id] ?? id,
        title: titles[id] ?? id,
        body: part,
      });
    }
  }

  /** The paint box is a depicted object rather than chrome, so it is hidden
   *  wholesale rather than folded into a drawer. */
  setPanSetVisible(on: boolean) {
    this.panSet.setVisible(on);
  }

  /** A dry tool in hand makes the wet controls inert. Dim them rather than
   *  remove them, so nothing jumps when the tool changes — and dim the pan set
   *  too, which is a separate window and does not inherit this panel's class. */
  private setDryMode(on: boolean) {
    this.root.classList.toggle('dry-mode', on);
    this.panSet.setDryMode(on);
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

  /** Replace the whole load — this is what lifting a mixture off the slab does.
   *  The parts arrive as puddle volumes rather than whole counts; KM normalises
   *  at mix time, so they are carried through as measured. */
  setRecipe(next: Recipe) {
    this.recipe.clear();
    for (const [slug, parts] of next) {
      if (parts > 0) this.recipe.set(slug, parts);
    }
    this.refresh();
  }

  private refresh() {
    const km = recipeToHex(this.recipe);
    this.panSet.render(this.recipe, km);
    this.events.onMixChange?.(km, this.recipe, this.loading);
  }
}
