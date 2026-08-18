// Where the artist's own paints live.
//
// Step 2 of the medium studio: a medium the artist made has to be a real paint
// in the app, not a session-long experiment. This keeps them in the browser's
// own storage so they survive a reload, and hands the app one list containing
// the paints that shipped and the paints the artist built.
//
// A stored row SHADOWS a built-in with the same slug. That is what lets
// watercolour itself be adjusted and kept: the shipped row is never edited, it
// is simply covered over, and deleting the artist's version uncovers it again.
// Nothing is ever lost.

import type { WetMedium } from '../media/types';
import { WATERCOLOR } from '../media/library';
import { PRESETS, STARTING_POINTS } from './medium-presets';

const KEY = 'aniso-paint.media.v1';

/**
 * The paints that ship. Watercolour is the measured one; the other three are
 * starting points to pull apart — see medium-presets.ts for what is evidence
 * and what is reasoning in each.
 */
export const BUILT_IN: WetMedium[] = [WATERCOLOR, ...PRESETS];

/** True for a shipped skeleton rather than a calibrated material. */
export function isStartingPoint(slug: string): boolean {
  return STARTING_POINTS.includes(slug);
}

export function isBuiltIn(slug: string): boolean {
  return BUILT_IN.some((m) => m.slug === slug);
}

function readAll(): Record<string, WetMedium> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, WetMedium> = {};
    for (const [slug, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue;
      // Layer over the shipped row rather than trusting the stored one whole.
      // A paint saved before a new setting existed still gets a value for it,
      // and a corrupted or hand-edited entry cannot leave a field undefined and
      // put NaN into the solver.
      const base = BUILT_IN.find((m) => m.slug === slug) ?? WATERCOLOR;
      const merged = { ...base, ...(value as Partial<WetMedium>) } as WetMedium;
      merged.physics = { ...base.physics, ...((value as WetMedium).physics ?? {}) };
      merged.slug = slug;
      if (typeof merged.name !== 'string' || !merged.name) merged.name = slug;
      out[slug] = merged;
    }
    return out;
  } catch {
    // Storage can be unavailable or hold something we cannot read. Losing the
    // artist's paints is bad; refusing to start the app is worse.
    return {};
  }
}

function writeAll(all: Record<string, WetMedium>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Private browsing, a full quota. Say nothing here; the studio reports it.
  }
}

/** Everything paintable: shipped paints, with the artist's versions on top. */
export function listMedia(): WetMedium[] {
  const stored = readAll();
  const out: WetMedium[] = BUILT_IN.map((m) => stored[m.slug] ?? m);
  for (const [slug, m] of Object.entries(stored)) {
    if (!isBuiltIn(slug)) out.push(m);
  }
  return out;
}

export function findMedium(slug: string): WetMedium | undefined {
  return listMedia().find((m) => m.slug === slug);
}

/** True once the artist has saved a version of this paint. */
export function isEdited(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(readAll(), slug);
}

export function saveMedium(medium: WetMedium): boolean {
  const all = readAll();
  all[medium.slug] = medium;
  writeAll(all);
  return isEdited(medium.slug);
}

/** Remove the artist's version. A shipped paint reappears underneath it. */
export function forgetMedium(slug: string) {
  const all = readAll();
  delete all[slug];
  writeAll(all);
}

/** A file-safe, unique slug from whatever the artist typed. */
export function slugFor(name: string, taken: string[]): string {
  const base = name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'medium';
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 999; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
