import { DRY_TOOLS } from '../media/library';
import type { ToolRack } from './tool-rack';

export interface SurfaceControlEvents {
  onEvapChange?(rate: number): void;
  onWaterChange?(charge: number): void;
  onTiltChange?(x: number, y: number, cosAlpha: number): void;
  onClear?(): void;
  onWaterView?(on: boolean): void;
  onRinse?(): void;
  onRinseLoad?(): void;
}

export class SurfaceControls {
  loading = 0.6;
  waterCharge = 0;
  constructor(private readonly root: HTMLElement, private readonly tools: ToolRack, private readonly events: SurfaceControlEvents, initialEvapRate = 0) {
    this.bind(initialEvapRate);
  }

  private bind(initialEvapRate: number) {
    const size = this.root.querySelector('#brush-size') as HTMLInputElement;
    const loading = this.root.querySelector('#loading') as HTMLInputElement;
    loading.value = String(this.loading);
    loading.addEventListener('input', () => { this.loading = parseFloat(loading.value); });
    const evap = this.root.querySelector('#evap') as HTMLInputElement;
    evap.value = String(initialEvapRate);
    evap.addEventListener('input', () => this.events.onEvapChange?.(parseFloat(evap.value)));
    const water = this.root.querySelector('#water-charge') as HTMLInputElement;
    water.value = String(this.waterCharge);
    water.addEventListener('input', () => { this.waterCharge = parseFloat(water.value); this.events.onWaterChange?.(this.waterCharge); });

    const tiltPad = this.root.querySelector('#tilt-pad') as HTMLElement;
    const puck = this.root.querySelector('#tilt-puck') as HTMLElement;
    const setTilt = (clientX: number, clientY: number) => {
      const rect = tiltPad.getBoundingClientRect();
      const radius = Math.max(1, rect.width / 2 - 10);
      let x = (clientX - (rect.left + rect.width / 2)) / radius;
      let y = (clientY - (rect.top + rect.height / 2)) / radius;
      const length = Math.hypot(x, y);
      if (length > 1) { x /= length; y /= length; }
      puck.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
      this.events.onTiltChange?.(x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y)));
    };
    tiltPad.addEventListener('pointerdown', (event) => { tiltPad.setPointerCapture(event.pointerId); setTilt(event.clientX, event.clientY); });
    tiltPad.addEventListener('pointermove', (event) => { if (tiltPad.hasPointerCapture(event.pointerId)) setTilt(event.clientX, event.clientY); });
    this.root.querySelector('#tilt-level')!.addEventListener('click', () => { puck.style.transform = 'translate(0, 0)'; this.events.onTiltChange?.(0, 0, 1); });
    this.root.querySelector('#wash-clear')!.addEventListener('click', () => this.events.onClear?.());
    const waterView = this.root.querySelector('#water-view') as HTMLInputElement;
    waterView.addEventListener('change', () => this.events.onWaterView?.(waterView.checked));
    const flash = (el: Element) => { el.classList.add('flash'); window.setTimeout(() => el.classList.remove('flash'), 220); };
    const rinse = this.root.querySelector('#rinse')!;
    rinse.addEventListener('click', () => { this.events.onRinse?.(); flash(rinse); });
    const rinseLoad = this.root.querySelector('#rinse-load')!;
    rinseLoad.addEventListener('click', () => { this.events.onRinseLoad?.(); flash(rinseLoad); });
    void size;
    void DRY_TOOLS;
  }
}
