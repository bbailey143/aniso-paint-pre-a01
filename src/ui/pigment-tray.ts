import { PIGMENTS } from '../color/pigments';
import { recipeToHex, recipeToNaiveRGBHex, tintHex, type Recipe } from '../color/km';

export interface PigmentTrayEvents {
  onChange?(hex: string | null, recipe: Recipe): void;
}

export class PigmentTray {
  readonly recipe: Recipe = new Map();
  private readonly root: HTMLElement;
  private readonly mixSwatch: HTMLElement;
  private readonly rgbSwatch: HTMLElement;
  private readonly mixHexLabel: HTMLElement;
  private readonly recipeRow: HTMLElement;
  private readonly events: PigmentTrayEvents;

  constructor(root: HTMLElement, events: PigmentTrayEvents = {}) {
    this.root = root;
    this.events = events;
    this.mixSwatch = root.querySelector('#mix-km')!;
    this.rgbSwatch = root.querySelector('#mix-rgb')!;
    this.mixHexLabel = root.querySelector('#mix-hex')!;
    this.recipeRow = root.querySelector('#recipe')!;
    this.buildWells();
    root.querySelector('#mix-clear')!.addEventListener('click', () => this.clear());
  }

  add(slug: string, parts = 1) {
    this.recipe.set(slug, (this.recipe.get(slug) ?? 0) + parts);
    this.refresh();
  }

  remove(slug: string) {
    const next = (this.recipe.get(slug) ?? 0) - 1;
    if (next <= 0) this.recipe.delete(slug);
    else this.recipe.set(slug, next);
    this.refresh();
  }

  clear() {
    this.recipe.clear();
    this.refresh();
  }

  refresh() {
    const km = recipeToHex(this.recipe);
    const rgb = recipeToNaiveRGBHex(this.recipe);
    this.mixSwatch.style.background = km ?? 'transparent';
    this.rgbSwatch.style.background = rgb ?? 'transparent';
    this.mixHexLabel.textContent = km ?? 'add pigments to mix';
    this.recipeRow.replaceChildren();
    for (const [slug, parts] of this.recipe) {
      const pigment = PIGMENTS.find((item) => item.slug === slug);
      if (!pigment) continue;
      const chip = document.createElement('button');
      chip.className = 'chip';
      const dot = tintHex(slug, 0.35) ?? pigment.hex;
      const swatch = document.createElement('i');
      swatch.style.background = dot;
      chip.append(swatch, document.createTextNode(`${pigment.name}${parts > 1 ? ` ×${parts}` : ''}`));
      chip.title = `remove one part of ${pigment.name}`;
      chip.addEventListener('click', () => this.remove(slug));
      this.recipeRow.appendChild(chip);
    }
    this.events.onChange?.(km, this.recipe);
  }

  private buildWells() {
    const wells = this.root.querySelector('#wells')!;
    for (const pigment of PIGMENTS) {
      const well = document.createElement('button');
      well.className = 'well';
      const tint = tintHex(pigment.slug, 0.25) ?? pigment.hex;
      well.style.background = `linear-gradient(135deg, ${pigment.hex} 0%, ${pigment.hex} 42%, ${tint} 100%)`;
      well.title = `${pigment.name} (${pigment.ci}) — ${pigment.temp}`;
      well.setAttribute('aria-label', pigment.name);
      well.addEventListener('click', () => this.add(pigment.slug));
      wells.appendChild(well);
    }
  }
}
