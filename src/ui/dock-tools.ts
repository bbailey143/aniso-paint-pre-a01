/*
 * The things in the dock that are not a choice of material.
 *
 * Drying and tilt are conditions of the room, not properties of the brush, so
 * they do not belong on the left rail with size and load — those are always
 * true of whatever is in your hand, and these are not. They also should not be
 * on screen the whole time.
 *
 * Same shape as `controls.ts` and for the same reason: **a tool says for itself
 * when it belongs**, and the dock draws whatever says yes. Adding one is an
 * entry here.
 *
 * The rule that matters, in the artist's words: "some mediums won't need dry
 * because they already are dry". That is not a list of exceptions to maintain —
 * it is a number the medium already carries. `openTime` is how long a material
 * stays workable, and a pencil's is zero. Ask the material.
 */

import type { ToolContext } from './controls';

export interface DockTool {
  id: 'drying' | 'tilt';
  label: string;
  /** Key into the icon table in studio.ts. */
  icon: string;
  /** Whether this means anything for the medium in hand. */
  appliesTo(tool: ToolContext): boolean;
  /** One line on why, for whoever reads this next. */
  why: string;
}

export const DOCK_TOOLS: DockTool[] = [
  {
    id: 'drying',
    label: 'Drying',
    icon: 'drying',
    // Not `family === 'wet'`. A material that can dry is one with an open time,
    // and reading that number means an oil with a two-day open time gets this
    // control the day it arrives, without anyone remembering to add it.
    appliesTo: (t) => openTimeOf(t) > 0,
    why: 'How long the sheet stays workable. Meaningless to something already dry.',
  },
  {
    id: 'tilt',
    label: 'Tilt',
    icon: 'tilt',
    // Gravity applies to everything. A pencil does not run downhill, but the
    // board it is on can still be propped up, and nothing here should decide
    // that on the artist's behalf.
    appliesTo: () => true,
    why: 'Which way is downhill. Always available.',
  },
];

/** How long the material in hand stays workable, in whatever units it uses. */
export function openTimeOf(tool: ToolContext): number {
  const medium = tool.wet ?? tool.medium;
  return medium ? (medium.openTime ?? 0) : 0;
}

export const dockToolsFor = (tool: ToolContext): DockTool[] =>
  DOCK_TOOLS.filter((d) => d.appliesTo(tool));
