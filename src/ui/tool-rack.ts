import { PAPERS, type Paper } from '../substrate/papers';
import { BRUSHES } from '../brush/library';
import type { BrushDef } from '../brush/types';
import { DRY_TOOLS } from '../media/library';
import type { DryMedium, GranularDry, InkMedium } from '../media/types';
import { SettingsCard } from './settings-card';
import type { SettingsGroup } from './types';

export interface ToolRackEvents {
  onBrushChange?(brush: BrushDef, size: number): void;
  onDryMedium?(medium: DryMedium, size: number): void;
  onPaperChange?(paper: Paper): void;
}

export class ToolRack {
  brush: BrushDef = BRUSHES[0];
  brushSize = 1;
  private readonly root: HTMLElement;
  private readonly events: ToolRackEvents;
  private readonly settings: SettingsCard;
  private readonly brushes: HTMLElement;
  private readonly dries: HTMLElement;

  constructor(root: HTMLElement, events: ToolRackEvents, settings: SettingsCard) {
    this.root = root;
    this.events = events;
    this.settings = settings;
    this.brushes = root.querySelector('#brushes')!;
    this.dries = root.querySelector('#dry-tools')!;
    this.build();
  }

  isDrySelected() { return Boolean(this.dries.querySelector('.paper.on')); }

  private clearSelection() {
    this.brushes.querySelectorAll('.paper').forEach((el) => el.classList.remove('on'));
    this.dries.querySelectorAll('.paper').forEach((el) => el.classList.remove('on'));
  }

  private build() {
    BRUSHES.forEach((brush, index) => {
      const el = document.createElement('button');
      el.className = `pal-btn paper${index === 0 ? ' on' : ''}`;
      el.textContent = brush.name.replace(' Sable', '');
      const consumeHold = this.settings.installPressAndHold(el, () => this.showBrushInfo(brush, el));
      el.title = `${brush.name} · ${brush.kind === 'flat' ? 'two spines' : 'one centreline'}`;
      el.addEventListener('click', (event) => {
        if (consumeHold(event)) return;
        this.clearSelection();
        el.classList.add('on');
        this.brush = brush;
        this.root.classList.remove('dry-mode');
        this.events.onBrushChange?.(brush, this.brushSize);
      });
      this.brushes.appendChild(el);
    });

    DRY_TOOLS.forEach((tool) => {
      const el = document.createElement('button');
      el.className = 'pal-btn paper';
      el.textContent = tool.name;
      const consumeHold = this.settings.installPressAndHold(el, () => this.showMediumInfo(tool.medium, el));
      el.title = tool.medium.kind === 'ink'
        ? 'Ballpoint · rides peaks and skips valleys'
        : `Graphite ${tool.name} · ${tool.medium.hardness > 0 ? 'hard tooth contact' : 'soft valley fill'}`;
      el.addEventListener('click', (event) => {
        if (consumeHold(event)) return;
        this.clearSelection();
        el.classList.add('on');
        this.root.classList.add('dry-mode');
        this.events.onDryMedium?.(tool.medium, this.brushSize);
      });
      this.dries.appendChild(el);
    });

    const size = this.root.querySelector('#brush-size') as HTMLInputElement;
    size.value = String(this.brushSize);
    size.addEventListener('input', () => {
      this.brushSize = parseFloat(size.value);
      const dry = this.dries.querySelector('.paper.on');
      if (dry) {
        const tool = DRY_TOOLS[Array.from(this.dries.children).indexOf(dry)];
        this.events.onDryMedium?.(tool.medium, this.brushSize);
      } else this.events.onBrushChange?.(this.brush, this.brushSize);
    });

    const papers = this.root.querySelector('#papers')!;
    PAPERS.forEach((paper, index) => {
      const el = document.createElement('button');
      el.className = `pal-btn paper${index === 1 ? ' on' : ''}`;
      el.textContent = paper.name;
      const consumeHold = this.settings.installPressAndHold(el, () => this.showPaperInfo(paper, el));
      el.addEventListener('click', (event) => {
        if (consumeHold(event)) return;
        papers.querySelectorAll('.paper').forEach((item) => item.classList.remove('on'));
        el.classList.add('on');
        this.events.onPaperChange?.(paper);
      });
      papers.appendChild(el);
    });
  }

  private showBrushInfo(brush: BrushDef, anchor: HTMLElement) {
    const n = (value: number) => value.toFixed(2);
    const groups: SettingsGroup[] = [
      { heading: 'Tuft shape', rows: [['shape', brush.kind === 'flat' ? 'flat · two active sides' : 'round · centreline'], ['chain segments', String(brush.segments)], ['tuft length', `${n(brush.length)} cells`], ['width / length', `${n(brush.widthRatio)}×`], ['taper', n(brush.taper)], ['bristle count', String(brush.bristles)]] },
      { heading: 'Handling', rows: [['ferrule spring', n(brush.stiffness)], ['tip softness', n(brush.stiffnessTaper)], ['pressure spread', n(brush.splayFromPressure)], ['base drag', n(brush.friction.mu)], ['preferred glide', n(brush.friction.cEta)], ['direction focus', n(brush.friction.k)], ['shape memory', n(brush.plasticity)]] },
      { heading: 'Paint holding', rows: [['belly capacity', n(brush.reservoir.capacityBelly)], ['tip capacity', n(brush.reservoir.capacityTip)], ['extra water range', n(brush.reservoir.waterOvercharge)], ['lays down', n(brush.reservoir.downRate)], ['picks up', n(brush.reservoir.upRate)]] },
    ];
    this.settings.show(brush.name, 'brush settings', 'Shared working settings. Values without units use the engine’s 0–1 scale.', anchor, groups);
  }

  private showPaperInfo(paper: Paper, anchor: HTMLElement) {
    const n = (value: number) => value.toFixed(2);
    this.settings.show(paper.name, 'paper settings', 'These values define the sheet for every tool. Capillary radius is shown in micrometres.', anchor, [
      { heading: 'Surface', rows: [['tooth depth', n(paper.toothAmp)], ['grain frequency', `${paper.featureFreq} features / sheet`], ['sizing', n(paper.sizing)]] },
      { heading: 'Water in the sheet', rows: [['capillary radius', `${n(paper.rc * 1e6)} µm`], ['minimum holding', n(paper.cMin)], ['maximum holding', n(paper.cMax)]] },
    ]);
  }

  private showMediumInfo(medium: GranularDry | InkMedium, anchor: HTMLElement) {
    const n = (value: number) => value.toFixed(2);
    const groups: SettingsGroup[] = [
      { heading: 'Contact', rows: [['tip shape', medium.contactProfile], ['tip radius', `${n(medium.tipRadius)} cells`], ['base width / length', `${n(medium.contactAspect)}×`], ['side contact begins', `${n(medium.tiltStart)}°`], ['full side length', `${n(medium.tiltAspect)}×`]] },
      { heading: 'Mark on paper', rows: [['paper-tooth gate', n(medium.toothThreshold)], ['speed breakup', n(medium.velocityCoupling)], ['pressure response', n(medium.pressureExp)], ['deposit amount', n(medium.deposition)], ['edge crispness', n(medium.edgeSharpness)]] },
      { heading: 'Material', rows: [['particle size', n(medium.physics.pigmentParticleSize)], ['binder body', n(medium.physics.binderViscosity)], ['material hardness', n(medium.physics.mediumHardness)], ['friction release', n(medium.physics.shearRate)], ['paper hold', n(medium.physics.adhesionStrength)], ['paper compression start', n(medium.physics.compressiveYield)], ['potential sheen', n(medium.physics.specularPotential)], ['fine surface reflection', n(medium.physics.microReflectance)], ['optical density', n(medium.physics.refractiveIndex)]] },
    ];
    if (medium.kind === 'ink') groups.push({ heading: 'Ink delivery', rows: [['delivery', medium.flowMode === 'ball' ? 'rolling ball' : 'wetted fountain nib'], ['flow starvation', n(medium.skipStrength)], ['starvation length', `${n(medium.skipScale)} cells`], ['fine chatter', n(medium.chatter)]] });
    this.settings.show(medium.name, 'material settings', 'Shared working settings. Values without units use the engine’s 0–1 scale.', anchor, groups);
  }
}
