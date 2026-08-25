/*
 * What dials exist, and where each one belongs.
 *
 * The rail used to be three hard-coded sliders, which was wrong the moment a
 * dry tool was picked: Solvent and Load mean nothing to a pencil, and Opacity
 * means nothing to a loaded brush. Special-casing that in the rail would have
 * put a growing pile of `if (dry)` in the one place that should not care.
 *
 * So the dependency is inverted. **A control says for itself which tools it
 * belongs to**, through `appliesTo`. The rail asks each control whether it is
 * wanted, draws the ones that say yes, and knows nothing about pencils or
 * brushes. Adding a dial is adding an entry here.
 *
 * Two rules for anything added to this file:
 *
 *   1. It must drive something real. A dial wired to nothing is worse than a
 *      missing dial, because it looks like it works. If the engine has no
 *      parameter for what you want, the honest move is to say so rather than
 *      to add a knob and hope.
 *
 *   2. `appliesTo` describes the tool by what it IS, never by its name. No
 *      `slug === 'conte-crayon'`. Ask about family, or kind, or a property the
 *      tool actually carries.
 */

import type { BrushDef } from '../brush/types';
import type { DryMedium, WetMedium } from '../media/types';

/** The tool currently in hand, as much as a control needs to know about it. */
export interface ToolContext {
  family: 'wet' | 'dry';
  brush?: BrushDef;
  medium?: DryMedium;
  /** The wet material on the brush, when there is one. Carries openTime. */
  wet?: WetMedium;
}

export interface RailControl {
  /** Stable key. Values are remembered per id across tool changes. */
  id: string;
  label: string;
  /**
   * The name this dial goes by for the tool in hand, when one name will not do.
   * Same rule as `appliesTo`: ask what the material is, never what it is called.
   */
  labelFor?(tool: ToolContext): string;
  /**
   * Where this dial sits for the tool just picked up, when the material owns
   * that answer rather than the dial. Same idea as `labelFor`: some questions
   * only the material can answer, and a single constant is then a lie for
   * every material but one.
   */
  initialFor?(tool: ToolContext): number;
  min: number;
  max: number;
  /** Where it sits before anyone touches it. */
  initial: number;
  format(value: number): string;
  /**
   * Which of the two things this dial is about: the TOOL in your hand, or the
   * MATERIAL on it.
   *
   * They are different questions and they were sharing one strip. How big the
   * brush is has nothing to do with how stiff the paint is, and reading them in
   * one column meant reading down a list of unrelated things every time.
   *
   * Not a special case for oil. Every painting material has properties of its
   * own — how thinned it is, how opaque, how much of it is on the brush — and
   * every one of them belongs with the paint rather than with the tool. A dry
   * stick answers the same way: its opacity is the material, its size is the
   * tool. Nothing here asks what the medium is called.
   */
  belongsTo: 'tool' | 'paint';
  /** Does this dial mean anything for the tool in hand? */
  appliesTo(tool: ToolContext): boolean;
  /** One line on what it drives, for whoever reads this next. */
  drives: string;
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

export const RAIL_CONTROLS: RailControl[] = [
  {
    id: 'size',
    label: 'Size',
    belongsTo: 'tool',
    min: 0.25,
    max: 4,
    initial: 1,
    format: (v) => `${v.toFixed(2)}×`,
    appliesTo: () => true,
    drives: 'Tuft or tip scale. Every tool has a size.',
  },
  {
    /* How much the tuft holds — a property of the BRUSH, so it sits with Size
       on the left rather than with the paint. Load says how full it is; this
       says how big it is, and no amount of Load answers "runs out too soon". */
    id: 'capacity',
    label: 'Capacity',
    belongsTo: 'tool',
    min: 0.25,
    max: 5,
    initial: 1,
    format: (v) => `${v.toFixed(2)}×`,
    // A tuft has a reservoir; a stick of graphite does not run out mid-line.
    appliesTo: (t) => t.family === 'wet',
    drives: 'Reservoir.setScale — the belly/tip capacity profile, multiplied.',
  },
  {
    /* How fast the brush gives its load up. Capacity says how much paint one
       dip has; this says how far it goes, and they are genuinely different
       questions — see Reservoir.setFlow for the measurement that separates
       them. Lower means the same load is spread over more canvas. */
    id: 'flow',
    label: 'Flow',
    belongsTo: 'tool',
    min: 0.1,
    max: 3,
    initial: 1,
    format: (v) => `${v.toFixed(2)}×`,
    appliesTo: (t) => t.family === 'wet',
    drives: 'Reservoir.setFlow — downRate, the share of the load given up per cell travelled.',
  },
  {
    /* Solvent, for everything. Water is what watercolour happens to be thinned
       with; turpentine is what oil is thinned with; the DIAL is neither. It
       carries vehicle with no pigment in it, and that is one idea with one
       name. Calling it Water made the word wrong for half the library. */
    id: 'water',
    label: 'Solvent',
    belongsTo: 'paint',
    min: 0,
    max: 1,
    initial: 0,
    format: percent,
    appliesTo: (t) => t.family === 'wet',
    drives:
      'Reservoir.charge() waterCharge — clean solvent with no pigment in it. ' +
      'Load carries solvent and pigment together; this carries solvent alone.',
  },
  {
    /* The one number that decides whether paint holds a brushmark or levels
       itself out like water. It is [UNVERIFIED] in the material row, and the
       row said it was the first thing to turn when oil feels wrong — so here
       it is, on the rail, rather than in a file. */
    id: 'body',
    label: 'Body',
    belongsTo: 'paint',
    min: 0,
    // Past the tuned oil value, not up to it — the dial has to be able to say
    // "stiffer than this" or it cannot answer the question it exists for.
    max: 0.8,
    initial: 0,
    initialFor: (t) => t.wet?.yieldStress ?? 0,
    format: (v) => (v <= 0 ? 'runs freely' : v.toFixed(3)),
    // Not `solvent === 'oil'`. A material either has a yield stress or it does
    // not, and the day a heavy-bodied gouache arrives it gets this dial without
    // anyone remembering to add it.
    appliesTo: (t) => (t.wet?.yieldStress ?? 0) > 0,
    drives:
      'FluidParams.yieldStress — the push a face must feel before the paint ' +
      'moves at all. Low and it slumps and levels; high and the brush can ' +
      'barely shove it. Zero is water.',
  },
  {
    /* How hard the brush shoves the paint that is already down. 1x is a normal
       drag now that the rate underneath it means something — before, anything
       above about 0.7 was clipped to the same conveyor-belt maximum, so the
       dial had almost no range to speak of. */
    id: 'smear',
    label: 'Smear',
    belongsTo: 'paint',
    min: 0,
    max: 4,
    initial: 0,
    initialFor: () => 1.0,
    format: (v) => (v <= 0 ? 'none' : `${v.toFixed(2)}×`),
    appliesTo: (t) => (t.wet?.yieldStress ?? 0) > 0,
    drives:
      'Ctl.smear in deposit.wgsl — the share of the paint under the hairs that ' +
      'is lifted and pushed along the stroke. Colour rides with it.',
  },
  {
    /* How far the paint stands off the sheet. This is what makes an impasto
       ridge catch the light instead of lying flat like a stain. */
    id: 'relief',
    label: 'Relief',
    belongsTo: 'paint',
    min: 0,
    max: 40,
    initial: 0,
    initialFor: (t) => t.wet?.relief ?? 0,
    format: (v) => (v <= 0 ? 'flat' : v.toFixed(1)),
    // A material either stands off the sheet or it does not. Watercolour is a
    // stain and reads 0; anything with body gets the dial by saying so.
    appliesTo: (t) => (t.wet?.relief ?? 0) > 0,
    drives: 'Comp.paintRelief in composite.wgsl — the paint film lights as its own surface.',
  },
  {
    /* How completely the paint hides the ground. Two loaded strokes should end
       the canvas; if they do not, this is the number, and it is quicker to
       find on a slider than through me. */
    id: 'cover',
    label: 'Cover',
    belongsTo: 'paint',
    min: 0,
    max: 8,
    initial: 0,
    initialFor: (t) => t.wet?.hidesGround ?? 0,
    format: (v) => (v <= 0 ? 'stains' : `${v.toFixed(2)}×`),
    appliesTo: (t) => (t.wet?.hidesGround ?? 0) > 0,
    drives: 'Comp.hidesGround in composite.wgsl — how fast the sheet stops showing through.',
  },
  {
    id: 'load',
    label: 'Load',
    belongsTo: 'paint',
    min: 0,
    max: 1,
    initial: 0.6,
    format: percent,
    appliesTo: (t) => t.family === 'wet',
    drives: 'Reservoir.charge() load — how much of the mix is on the hair.',
  },
  {
    id: 'opacity',
    belongsTo: 'paint',
    label: 'Opacity',
    min: 0.08,
    max: 1,
    initial: 1,
    format: percent,
    appliesTo: (t) => t.family === 'dry',
    drives:
      'Scales DryMedium.deposition — the pigment laid at the centreline at ' +
      'full pressure. A softer or harder touch of the same stick, rather than ' +
      'an alpha channel painted over the top.',
  },
];

/** The controls a given tool should show, in rail order. */
/** The dials for this tool, optionally only the ones from one of the two
 *  groups. Omit `where` and you get everything, which is what the command
 *  palette and any future inspector should ask for. */
export const controlsFor = (tool: ToolContext, where?: RailControl['belongsTo']): RailControl[] =>
  RAIL_CONTROLS.filter((c) => c.appliesTo(tool) && (where === undefined || c.belongsTo === where));

/** What to write on a dial for the tool in hand. */
export const labelOf = (control: RailControl, tool: ToolContext): string =>
  control.labelFor?.(tool) ?? control.label;
