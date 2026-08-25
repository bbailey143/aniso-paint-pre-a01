/*
 * What a tool reaches for.
 *
 * Picking up a pencil on cold-press watercolour paper is not what anyone wants,
 * and neither is a loaded sable on a pastel sheet. So a tool carries the paper
 * it belongs on — and, later, the medium and the brush it belongs with.
 *
 * Written as declarations for the same reason as `controls.ts`: the picker must
 * not grow a list of which tool wants what. It asks; this answers.
 *
 * **This file is the seam the Brush Studio will write through.** When a brush
 * can be built by hand, the thing it saves is an entry of this shape — a
 * default paper, a default medium, a default size — rather than a new branch
 * somewhere in the UI. Keep it data.
 *
 * Rules, the same two as controls.ts:
 *
 *   1. Describe a tool by what it IS, never by its name. `family === 'dry'`,
 *      not `slug === 'conte-crayon'`.
 *   2. Name the paper by slug, and let the resolver fail softly. A default that
 *      points at a sheet nobody shipped should be ignored, not throw.
 */

import { PAPERS } from '../substrate/papers';
import type { Paper } from '../substrate/papers';
import type { ToolContext } from './controls';

export interface ToolDefaults {
  /** Which tools this applies to. */
  appliesTo(tool: ToolContext): boolean;
  /** Slug of the sheet this tool belongs on. */
  paper?: string;
  /** Slug of the head this material is normally moved with. */
  brush?: string;
  /** Why, in one line, for whoever reads this next. */
  why: string;
}

export const TOOL_DEFAULTS: ToolDefaults[] = [
  // Most specific first: the scan takes the first entry that claims a tool, so
  // oil has to be asked about before "anything wet" answers for it.
  {
    appliesTo: (t) => t.wet?.solvent === 'oil',
    paper: 'canvas-duck',
    brush: 'flat-hog',
    why: 'Oil goes on a primed ground, not on paper — a sized canvas takes nothing into itself. Cotton duck is the ordinary one, and a hog bristle is what shifts paint that stiff.',
  },
  {
    appliesTo: (t) => t.family === 'wet',
    paper: 'cold-press',
    brush: 'round-sable',
    why: 'A loaded brush wants a sheet that will hold water. Cold press is the middle of the three and the one most washes are painted on.',
  },
  {
    appliesTo: (t) => t.family === 'dry',
    paper: 'pastel-ivory',
    why: 'Pencil, charcoal and conte want a felted tooth to scrape against. Ivory is the warm near-white of the pastel set.',
  },
];

const bySlug = new Map(PAPERS.map((p) => [p.slug, p]));

/** The sheet this tool belongs on, or null if nothing has an opinion. */
export function defaultPaperFor(tool: ToolContext): Paper | null {
  for (const entry of TOOL_DEFAULTS) {
    if (!entry.appliesTo(tool) || !entry.paper) continue;
    const paper = bySlug.get(entry.paper);
    if (paper) return paper;   // a default naming a sheet nobody shipped is ignored
  }
  return null;
}

/**
 * Whether the sheet in front of you suits the tool you just picked up.
 *
 * This is what stops the defaults being annoying. Switching from a sable to a
 * pencil moves you off watercolour paper, because a pencil on cold press is
 * wrong. Switching from one pencil to another leaves your chosen pastel sheet
 * alone, because it was already right — a default should not overrule a
 * decision you made on purpose.
 */
export function paperSuits(paper: Paper, tool: ToolContext): boolean {
  // The flat reference suits everything, which also means picking up a
  // different tool does not quietly move you off it. Being able to change one
  // thing and hold the surface still is the entire use of it.
  if (paper.grainKind === 'smooth') return true;
  if (tool.family === 'dry') return paper.grainKind === 'pastel';
  return paper.grainKind === (tool.wet?.solvent === 'oil' ? 'canvas' : 'watercolor');
}

/** The head this material is normally moved with, or null if nothing says. */
export function defaultBrushFor(tool: ToolContext): string | null {
  for (const entry of TOOL_DEFAULTS) {
    if (entry.appliesTo(tool) && entry.brush) return entry.brush;
  }
  return null;
}
