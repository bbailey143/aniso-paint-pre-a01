/*
 * What the UI knows, kept out of the components.
 *
 * The declarative layers — controls.ts, dock-tools.ts, media.ts,
 * tool-defaults.ts — carry over from the hand-written UI untouched. They were
 * never about rendering: they say what dials exist, which tools they belong to,
 * and what a medium reaches for. Only the drawing changed.
 *
 * React subscribes to this through useSyncExternalStore. `main.ts` reads the
 * same fields it always did, so the engine side has no idea any of this moved.
 */

import type { BrushDef } from '../../brush/types';
import type { Recipe } from '../../color/km';
import { WATERCOLOR } from '../../media/library';
import type { DryMedium, WetMedium } from '../../media/types';
import { PAPERS } from '../../substrate/papers';
import type { Paper } from '../../substrate/papers';
import { RAIL_CONTROLS, type ToolContext } from '../controls';
import { collectionOf, wetCollection, type MediumCollection } from '../media';
import { defaultBrushFor, defaultPaperFor, paperSuits } from '../tool-defaults';
import { BRUSH_BY_SLUG } from '../../brush/library';

export interface StudioEvents {
  onMixChange?(hex: string | null, recipe: Recipe, loading: number): void;
  onPaperChange?(paper: Paper): void;
  onEvapChange?(evapRate: number): void;
  onWaterChange?(waterCharge: number): void;
  onTiltChange?(gravityX: number, gravityY: number, cosAlpha: number): void;
  onClear?(): void;
  onWaterView?(on: boolean): void;
  onRinse?(): void;
  onRinseLoad?(): void;
  onBrushChange?(def: BrushDef, size: number): void;
  onDryMedium?(medium: DryMedium, size: number): void;
  /** How stiff the paint is: the push it takes before it moves at all. */
  onYieldChange?(yieldStress: number): void;
  /** How hard the brush shoves paint that is already down. */
  onSmearChange?(strength: number): void;
  /** How completely the paint hides the sheet. */
  onCoverChange?(cover: number): void;
  /** How far the paint stands off the sheet. */
  onReliefChange?(relief: number): void;
  /** How wet the surface looks, 0 matte .. 1 wet. */
  onGlossChange?(gloss: number): void;
  /** How bright the glint on a ridge is. */
  onSheenChange?(sheen: number): void;
  /** How broad that glint is, 0 tight .. 1 broad. */
  onSheenWidthChange?(width: number): void;
  /** How much the tuft holds, as a multiple of the brush's own row. */
  onCapacityChange?(scale: number): void;
  /** How fast it gives that load up. */
  onFlowChange?(scale: number): void;
  /** A different wet material is in the brush. The whole row goes to the
   *  solver — viscosity, yield stress, drying, the lot. */
  onWetMedium?(medium: WetMedium): void;
  onReadouts?(on: boolean): void;
}

export type SheetName = 'medium' | 'brush' | 'colour' | 'paper' | 'drying' | null;

export class StudioStore {
  readonly recipe: Recipe = new Map();
  collection: MediumCollection = wetCollection();
  brush: BrushDef = wetCollection().brushes[0];
  activeDry: DryMedium | null = null;
  paper: Paper = PAPERS[1];
  values = new Map<string, number>(RAIL_CONTROLS.map((c) => [c.id, c.initial]));
  /* Starts wherever the opening material sits. Oil's own rate is four orders
     of magnitude below watercolour's, so anchoring the dial on a constant made
     it useless the moment a second wet material existed. */
  evapRate = this.wetMedium.evapRate;
  sheet: SheetName = null;
  mixing = false;
  readouts = false;
  tiltOpen = false;
  /** The Paint Properties drawer. */
  surfaceOpen = false;
  /**
   * How far each paint property is allowed to travel, low to high.
   *
   * A macro dial will sweep between these once it is wired back up, so these
   * ARE the tuning. Nothing reads them yet — the macros are parked — and that
   * is said out loud in the drawer rather than left for someone to discover.
   */
  ranges = new Map<string, [number, number]>();

  private listeners = new Set<() => void>();
  private version = 0;

  constructor(readonly events: StudioEvents) {}

  /* ------------------------------------------------------- subscription */

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** A counter, so React can tell "something changed" without deep compares. */
  snapshot = (): number => this.version;

  private changed() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /* ------------------------------------------------- what main.ts reads */

  get loading(): number { return this.value('load'); }
  get waterCharge(): number { return this.value('water'); }
  get brushSize(): number { return this.value('size'); }

  value(id: string): number {
    const control = RAIL_CONTROLS.find((c) => c.id === id);
    return this.values.get(id) ?? control?.initial ?? 0;
  }

  /** The wet material in the brush. Watercolour is the fallback for a store
   *  that somehow has no wet collection at all, not a special case. */
  get wetMedium(): WetMedium { return this.collection.wet ?? WATERCOLOR; }

  toolContext(): ToolContext {
    return this.activeDry
      ? { family: 'dry', medium: this.activeDry }
      : { family: 'wet', brush: this.brush, wet: this.wetMedium };
  }

  /* ------------------------------------------------------------ actions */

  setSheet(sheet: SheetName) {
    this.sheet = this.sheet === sheet ? null : sheet;
    this.changed();
  }

  setValue(id: string, v: number) {
    this.values.set(id, v);
    // Moving a macro sweeps everything under it. Moving anything else is just
    // that one dial, and it stays where it is put until a macro moves again.
    if (RAIL_CONTROLS.find((c) => c.id === id)?.macro) this.applyMacros();
    this.pushControls();
    this.changed();
  }

  /**
   * Put every property under a macro where its macro says, between the two ends
   * of its own range.
   *
   * A property under TWO macros is swept by both multiplied together. That is
   * not arithmetic convenience — it is what the artist's own reference set
   * showed: the smooth portrait in it is glossy paint with almost no shine
   * anywhere, because nothing stands up to catch light. Shine needs a surface
   * AND a ridge, so either one at zero means nothing, which is what a product
   * does and an average does not.
   */
  private applyMacros() {
    for (const c of RAIL_CONTROLS) {
      if (!c.under?.length) continue;
      let t = 1;
      for (const id of c.under) {
        const m = RAIL_CONTROLS.find((k) => k.id === id);
        if (!m) continue;
        const span = (m.max - m.min) || 1;
        t *= (this.value(id) - m.min) / span;
      }
      const [lo, hi] = this.range(c.id);
      this.values.set(c.id, lo + (hi - lo) * Math.max(0, Math.min(1, t)));
    }
  }

  setEvap(rate: number) {
    this.evapRate = rate;
    this.events.onEvapChange?.(rate);
    this.changed();
  }

  setPaper(paper: Paper) {
    this.paper = paper;
    this.events.onPaperChange?.(paper);
    this.changed();
  }

  setReadouts(on: boolean) {
    this.readouts = on;
    document.body.classList.toggle('st-readouts', on);
    this.events.onReadouts?.(on);
    this.changed();
  }

  setTiltOpen(on: boolean) { this.tiltOpen = on; this.changed(); }
  setSurfaceOpen(on: boolean) { this.surfaceOpen = on; this.changed(); }

  /** A property's allowed travel. Defaults to the whole of its own scale. */
  range(id: string): [number, number] {
    const found = this.ranges.get(id);
    if (found) return found;
    const c = RAIL_CONTROLS.find((k) => k.id === id);
    return [c?.min ?? 0, c?.max ?? 1];
  }

  setRange(id: string, low: number, high: number) {
    this.ranges.set(id, [Math.min(low, high), Math.max(low, high)]);
    // Narrowing a range moves the property, because where it sits is a position
    // ALONG that range. Without this the number on screen would go on claiming
    // a value its own range no longer allows.
    this.applyMacros();
    this.pushControls();
    this.changed();
  }
  setMixing(on: boolean) { this.mixing = on; this.changed(); }

  pickCollection(c: MediumCollection) {
    const wasWet = this.collection.wet;
    this.collection = c;
    if (c.family === 'dry') {
      this.activeDry = c.media[0] ?? null;
    } else {
      this.activeDry = null;
      /* Hand over the head this material is normally moved with — a hog for
         oil, a sable for a wash. Only when the material actually changes: once
         you are in oil, choosing a different brush is a decision, and picking
         the same material again must not undo it. */
      if (c.wet !== wasWet) {
        const slug = defaultBrushFor({ family: 'wet', brush: this.brush, wet: c.wet });
        this.brush = (slug && BRUSH_BY_SLUG.get(slug)) || c.brushes[0] || this.brush;
      }
    }
    if (c.wet && c.wet !== wasWet) {
      this.evapRate = c.wet.evapRate;
      this.events.onWetMedium?.(c.wet);
      this.reseedControls();
    }
    this.applyToolDefaults();
    this.pushControls();
    this.changed();
  }

  pickBrush(b: BrushDef) {
    this.activeDry = null;
    this.brush = b;
    this.applyToolDefaults();
    this.pushControls();
    this.changed();
  }

  pickDry(m: DryMedium) {
    this.activeDry = m;
    const found = collectionOf(m);
    if (found) this.collection = found;
    this.applyToolDefaults();
    this.pushControls();
    this.changed();
  }

  /**
   * Tapping a pigment picks it. Mixing is opt-in — choosing a second colour
   * must not mean dismantling the first.
   */
  pickPigment(slug: string) {
    if (this.mixing) {
      if (this.recipe.has(slug) && this.recipe.size > 1) this.recipe.delete(slug);
      else this.recipe.set(slug, 1);
      const share = 1 / this.recipe.size;
      for (const k of this.recipe.keys()) this.recipe.set(k, share);
    } else {
      this.recipe.clear();
      this.recipe.set(slug, 1);
    }
    this.pushMix();
    this.changed();
  }

  dropPigment(slug: string) {
    if (this.recipe.size <= 1) return;
    this.recipe.delete(slug);
    const share = 1 / this.recipe.size;
    for (const k of this.recipe.keys()) this.recipe.set(k, share);
    this.pushMix();
    this.changed();
  }

  /** main.ts seeds the first colour by slug. */
  add(slug: string) {
    this.recipe.set(slug, 1);
    const share = 1 / this.recipe.size;
    for (const k of this.recipe.keys()) this.recipe.set(k, share);
    this.pushMix();
    this.changed();
  }

  clear() {
    this.recipe.clear();
    this.pushMix();
    this.changed();
  }

  /** Put the tool on a sheet that suits it, without overruling a real choice. */
  private applyToolDefaults() {
    const tool = this.toolContext();
    if (paperSuits(this.paper, tool)) return;
    const paper = defaultPaperFor(tool);
    if (!paper || paper.slug === this.paper.slug) return;
    this.paper = paper;
    this.events.onPaperChange?.(paper);
  }

  /** The one place that knows how a dial reaches the engine. */
  /* Dials whose home position belongs to the material rather than to the dial.
     Without this, picking up oil would leave Body wherever watercolour left
     it — which is zero, and zero is water. */
  private reseedControls() {
    const tool = this.toolContext();
    for (const c of RAIL_CONTROLS) {
      if (c.initialFor) this.values.set(c.id, c.initialFor(tool));
    }
  }

  pushControls() {
    if (this.activeDry) {
      const opacity = this.value('opacity');
      this.events.onDryMedium?.(
        { ...this.activeDry, deposition: this.activeDry.deposition * opacity },
        this.brushSize,
      );
      return;
    }
    this.events.onWaterChange?.(this.waterCharge);
    this.events.onYieldChange?.(this.value('body'));
    this.events.onSmearChange?.(this.value('smear'));
    this.events.onCoverChange?.(this.value('cover'));
    this.events.onReliefChange?.(this.value('relief'));
    this.events.onGlossChange?.(this.value('gloss'));
    this.events.onSheenChange?.(this.value('sheen'));
    this.events.onSheenWidthChange?.(this.value('sheenWidth'));
    this.events.onBrushChange?.(this.brush, this.brushSize);
    // After the brush, not before: picking one rebuilds the tuft from its row.
    this.events.onCapacityChange?.(this.value('capacity'));
    this.events.onFlowChange?.(this.value('flow'));
    this.pushMix();
  }

  pushMix() {
    // recipeToHex is only needed for display; the engine takes the recipe.
    this.events.onMixChange?.(null, this.recipe, this.loading);
  }
}
