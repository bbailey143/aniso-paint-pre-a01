/*
 * The seam between the engine and the UI.
 *
 * `main.ts` constructs this and reads `loading`, `waterCharge`, `brushSize`,
 * `recipe` and `brush` off it, exactly as it did when the UI was hand-written
 * DOM and exactly as it did before that with the original palette. The engine
 * side has never needed to know what is drawing the controls, and it still
 * does not.
 *
 * Underneath, React renders and react-aria supplies the behaviour. The
 * declarative layers are unchanged — controls.ts, dock-tools.ts, media.ts and
 * tool-defaults.ts were never about rendering.
 */

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { BrushDef } from '../brush/types';
import type { Recipe } from '../color/km';
import type { DryMedium } from '../media/types';
import type { Paper } from '../substrate/papers';
import { App } from './react/App';
import { StudioStore, type StudioEvents } from './react/store';
import './studio.css';
import './hud.css';

export type PaletteEvents = StudioEvents;

export class Studio {
  private store: StudioStore;
  private root: Root;

  constructor(mount: HTMLElement, events: StudioEvents = {}, initialEvapRate?: number) {
    this.store = new StudioStore(events);
    if (initialEvapRate !== undefined) this.store.evapRate = initialEvapRate;

    const host = document.createElement('div');
    host.className = 'st-root';
    mount.appendChild(host);
    this.root = createRoot(host);
    this.root.render(createElement(App, { store: this.store }));
  }

  /* ---------------- what main.ts reads. Names kept from the original. ---- */

  get recipe(): Recipe { return this.store.recipe; }
  get loading(): number { return this.store.loading; }
  get waterCharge(): number { return this.store.waterCharge; }
  get brushSize(): number { return this.store.brushSize; }
  get brush(): BrushDef { return this.store.brush; }
  get activeDry(): DryMedium | null { return this.store.activeDry; }
  get paper(): Paper { return this.store.paper; }

  /** Seed the first colour by slug. */
  add(slug: string) { this.store.add(slug); }
  /** Empty the mix — the command palette offers this alongside a rinse. */
  clear() { this.store.clear(); }

  destroy() { this.root.unmount(); }
}
