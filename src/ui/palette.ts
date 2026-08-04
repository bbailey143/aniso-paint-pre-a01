import { recipeToHex, type Recipe } from '../color/km';
import { WATERCOLOR } from '../media/library';
import { SettingsCard } from './settings-card';
import { PigmentTray } from './pigment-tray';
import { SurfaceControls } from './surface-controls';
import { ToolRack } from './tool-rack';
import type { PaletteEvents } from './types';

export class Palette {
  private readonly root: HTMLElement;
  private readonly pigments: PigmentTray;
  private readonly tools: ToolRack;
  private readonly controls: SurfaceControls;
  readonly settings = new SettingsCard();

  constructor(mount: HTMLElement, events: PaletteEvents = {}, initialEvapRate = WATERCOLOR.evapRate) {
    this.root = document.createElement('div');
    this.root.id = 'palette';
    this.root.className = 'panel';
    this.root.innerHTML = this.template();
    mount.appendChild(this.root);

    this.pigments = new PigmentTray(this.root, {
      onChange: (hex, recipe) => events.onMixChange?.(hex, recipe, this.loading),
    });
    this.tools = new ToolRack(this.root, {
      onBrushChange: (brush, size) => events.onBrushChange?.(brush, size),
      onDryMedium: (medium, size) => events.onDryMedium?.(medium, size),
      onPaperChange: (paper) => events.onPaperChange?.(paper),
    }, this.settings);
    this.controls = new SurfaceControls(this.root, {
      onLoadingChange: (loading) => events.onMixChange?.(recipeToHex(this.recipe), this.recipe, loading),
      onEvapChange: (rate) => events.onEvapChange?.(rate),
      onWaterChange: (charge) => events.onWaterChange?.(charge),
      onTiltChange: (x, y, cosAlpha) => events.onTiltChange?.(x, y, cosAlpha),
      onClear: () => events.onClear?.(),
      onWaterView: (on) => events.onWaterView?.(on),
      onRinse: () => events.onRinse?.(),
      onRinseLoad: () => events.onRinseLoad?.(),
    }, initialEvapRate);
    this.pigments.refresh();
  }

  get recipe(): Recipe { return this.pigments.recipe; }
  get loading() { return this.controls.loading; }
  get waterCharge() { return this.controls.waterCharge; }
  get brush() { return this.tools.brush; }
  get brushSize() { return this.tools.brushSize; }
  add(slug: string, parts = 1) { this.pigments.add(slug, parts); }
  clear() { this.pigments.clear(); }

  private template() {
    return `
      <div class="pal-head"><span class="hud-title">pigments</span><button id="mix-clear" class="pal-btn" title="clear mix">clear</button></div>
      <div id="wells" class="wells"></div>
      <div class="mix"><div class="mix-swatches"><div class="mix-col"><div id="mix-km" class="swatch big" title="Kubelka-Munk (real pigment)"></div><span class="mix-cap">Kubelka-Munk</span></div><div class="mix-col"><div id="mix-rgb" class="swatch big muted" title="naive RGB average (wrong)"></div><span class="mix-cap">naive RGB</span></div></div><div id="mix-hex" class="mix-hex">—</div><div class="jar"><button id="rinse" class="pal-btn jar-btn" title="Rinse the brush"> <span class="jar-ico">◌</span> rinse</button><button id="rinse-load" class="pal-btn jar-btn accent" title="Rinse, then re-dip"> <span class="jar-ico">◍</span> rinse / load</button></div><div id="recipe" class="recipe"></div></div>
      <div class="surface"><div class="pal-sub">brush</div><div id="brushes" class="papers"></div><div class="pal-sub">dry media</div><div id="dry-tools" class="papers six"></div><p class="medium-hint">press and hold a tool or paper for settings</p><label class="loading-row"><span>size</span><input id="brush-size" type="range" min="0.15" max="2.4" step="0.025" value="1" /></label><div class="pal-sub">paper</div><div id="papers" class="papers"></div><label class="loading-row"><span>load</span><input id="loading" type="range" min="0.02" max="1" step="0.02" /></label><label class="loading-row wet-only" title="Add clean water without removing pigment"><span>water</span><input id="water-charge" type="range" min="0" max="1" step="0.01" /></label><label class="loading-row"><span title="Evaporation speed">drying</span><input id="evap" type="range" min="0" max="0.004" step="0.0001" /></label><section class="tilt-control" aria-label="paper tilt"><div class="tilt-head"><span>tilt</span><button id="tilt-level" class="pal-btn" title="Return the paper to level">level</button></div><div id="tilt-pad" class="tilt-pad" role="application" aria-label="Drag the blue puck toward the downhill direction"><span id="tilt-puck" class="tilt-puck"></span></div><p class="tilt-hint">drag toward downhill</p></section><label class="loading-row" title="Show where the water is"><span>water view</span><input id="water-view" type="checkbox" /></label><button id="wash-clear" class="pal-btn">clear sheet</button></div>`;
  }
}
