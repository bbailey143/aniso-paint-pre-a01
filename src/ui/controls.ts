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

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/* THE TWO MACROS, WRITTEN OUT ONCE.
 *
 * Every number below is CHOSEN [UNVERIFIED]. They come from reading a set of
 * impasto photographs the artist sent, not from measuring them - the images
 * were pasted into a conversation and never reached a file, so nothing could
 * be run over their pixels. What the reading gives is the SHAPE: which
 * quantities travel together and which do not. The constants themselves are a
 * first guess, and the dials exist so they can be found by eye.
 *
 * Anchored on what oil already does, so the macros open sitting exactly where
 * the material rows put them: oil's relief of 26 inverts to a depth of 0.69,
 * and 0.69 maps back to 26.
 */
export const reliefFor = (d: number) => 40 * Math.pow(clamp01(d), 1.15);
export const depthFromRelief = (r: number) => Math.pow(clamp01(r / 40), 1 / 1.15);
/** Thicker paint ploughs harder through what is already down. */
export const smearFor = (d: number) => 0.40 + 1.40 * clamp01(d);
/** Matte is a rough surface and scatters broadly; gloss narrows it to a point. */
export const widthFor = (g: number) => 0.92 - 0.62 * clamp01(g);
/** Shine needs something to shine off, so this takes both. */
export const sheenFor = (g: number, d: number) =>
  clamp01(g) * (0.25 + 0.95 * clamp01(d));

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

  /**
   * A MACRO dial: moving it rewrites these other dials.
   *
   * Returns whatever it wants to set, by id. `get` reads the current value of
   * any other dial, which is how a term depending on two macros at once (Sheen
   * needs both depth and gloss) stays right whichever one was moved.
   *
   * A macro writes; it never locks. Move one of the dials underneath by hand
   * afterwards and it stays where it is put, until a macro is moved again.
   */
  writes?(v: number, get: (id: string) => number): Record<string, number>;

  /**
   * A dial that stands over a group of others.
   *
   * Kept separate from `writes` on purpose: a macro can be PARKED — still shown,
   * still the head of its group, but driving nothing — which is where both of
   * them are while the artist tunes the parts by hand. Without the split,
   * unwiring one would also make it vanish from the strip.
   */
  macro?: boolean;

  /**
   * The macro dials this one serves, if any.
   *
   * Grouping lives here rather than in the panel that draws it, so a new macro
   * arrives with its own group and nothing in the UI has to be told. Sheen
   * names both, because it genuinely answers to both: how bright a glint is
   * depends on how shiny the surface is AND on there being a ridge to catch it.
   * It is one dial shown twice, not two.
   */
  under?: string[];
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
    under: ['impasto'],
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
    under: ['impasto'],
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
    /* HOW THICK THE PAINT SITS.
     *
     * A macro over Relief and Smear. Rebelle carries two dials for oil -
     * Impasto Depth and Glossiness - and the artist's judgement on 2026-08-25
     * was that this is the right shape, with the five underneath as the
     * detail. Agreed, and the reference set he sent is the reason it is TWO
     * dials and not one.
     *
     * [READ, NOT MEASURED - the references were pasted into a conversation and
     * could not be put through any instrument, so this is careful looking.]
     * Across nineteen photographs of real impasto, thickness and shine do not
     * travel together: the heaviest slabs in the set are among the mattest,
     * while the wettest, most specular one is not especially thick. If they
     * were one axis every thick painting would gleam, and they do not. That is
     * the whole argument for two dials.
     *
     * What DOES travel with thickness is how much the brush ploughs colour
     * into what is already there. In the thin scumbles the strokes sit over
     * each other without mixing; in the heavy ones the colours are visibly
     * dragged through one another. So Smear rides here.
     */
    id: 'impasto',
    label: 'Impasto Depth',
    belongsTo: 'paint',
    macro: true,
    min: 0,
    max: 1,
    initial: 0,
    // Starts wherever the material's own rows already sit, so opening a
    // medium changes nothing until this is actually moved.
    initialFor: (t) => depthFromRelief(t.wet?.relief ?? 0),
    format: (v) => (v <= 0.02 ? 'flat' : v.toFixed(2)),
    appliesTo: (t) => (t.wet?.relief ?? 0) > 0,
    /* PARKED 2026-08-25, at the artist's request: "let's temporarily unwire
       them until things are tuned correctly". It still shows, and it is still
       the head of its group; it just does not write anything yet. The mapping
       it used is `reliefFor` / `smearFor` / `sheenFor` above, and the ranges
       set in the Paint Properties drawer are what it will sweep between when
       it comes back. */
    drives: 'Nothing yet - parked while the parts underneath are tuned by hand.',
  },
  {
    /* HOW MUCH IT SHINES.
     *
     * The other macro. Gloss is how wet the surface reads; Sheen Width is how
     * broad the glint on a ridge is; and the two move together in the
     * references, because they are two consequences of one thing - how smooth
     * the surface is at a scale far below a brush hair.
     *
     * [READ, NOT MEASURED] In the matte examples the light on a ridge is broad
     * and soft, the whole crest lit at once. In the glossy ones it narrows to
     * hot spots, and in the wettest to hard little points. So the width tracks
     * the shine and NOT the thickness.
     *
     * Sheen amount needs both, and the reference set shows why: the smooth
     * portrait in it is glossy paint with almost no specular anywhere, because
     * there is no ridge standing up to catch anything. Shine with nothing to
     * shine off is nothing.
     */
    id: 'glossiness',
    label: 'Glossiness',
    belongsTo: 'paint',
    macro: true,
    min: 0,
    max: 1,
    initial: 0,
    initialFor: (t) => 1 - (t.wet?.kInstrument ?? 1),
    format: (v) => (v <= 0.02 ? 'matte' : v >= 0.98 ? 'wet' : v.toFixed(2)),
    appliesTo: () => true,
    // PARKED with the other one - see the note above.
    drives: 'Nothing yet - parked while the parts underneath are tuned by hand.',
  },
  {
    /* HOW WET THE SURFACE LOOKS.
       Not how shiny the highlight is - that is Sheen below. This is whether the
       surface reads as a wet film at all: deep and saturated at the top of the
       range, chalky and dry at the bottom. It is the same control that makes a
       watercolour wash darken while it is wet and lift as it dries. */
    id: 'gloss',
    label: 'Gloss',
    belongsTo: 'paint',
    under: ['glossiness'],
    min: 0,
    max: 1,
    initial: 0,
    // Material rows are written 0 glossy .. 1 matte; the dial reads the way a
    // painter would say it, so it is turned over here rather than in the head.
    initialFor: (t) => 1 - (t.wet?.kInstrument ?? 1),
    format: (v) => (v <= 0.02 ? 'matte' : v >= 0.98 ? 'wet' : v.toFixed(2)),
    // Every material has a surface, so every material answers this.
    appliesTo: () => true,
    drives: 'CanvasEngine.setGloss -> Comp.kInstrument, the Saunderson gloss term.',
  },
  {
    /* THE GLINT ON A RIDGE OF PAINT.
       Thick paint catches a highlight along the crest of a brush ridge, and in
       a photograph of a painting that highlight is most of how the eye reads
       thickness. Rides on Relief: a material with no body has no ridge to
       catch anything, and this is zero for it however it is set. */
    id: 'sheen',
    label: 'Sheen',
    belongsTo: 'paint',
    under: ['impasto', 'glossiness'],
    min: 0,
    max: 1.5,
    initial: 0.55,
    format: (v) => (v <= 0.01 ? 'none' : v.toFixed(2)),
    appliesTo: (t) => (t.wet?.relief ?? 0) > 0,
    drives: 'CanvasEngine.setSheen -> Comp.sheenStrength in composite.wgsl.',
  },
  {
    /* HOW BROAD THAT GLINT IS.
       [ARTIST REPORT 2026-08-24] "it shines like jelly and looks like plastic."
       This is the plastic half. The highlight was a hard, small hot spot, which
       is what a polished plane gives. A paint surface is not a polished plane -
       up close it is full of hair furrows scattering the light - so its
       highlight is broad and soft. Wide reads as oil; narrow reads as varnish. */
    id: 'sheenWidth',
    label: 'Sheen Width',
    belongsTo: 'paint',
    under: ['glossiness'],
    min: 0,
    max: 1,
    // Reproduces the tightness that used to be hard-coded, so an untouched
    // dial changes nothing at all.
    initial: 0.632,
    format: (v) => (v <= 0.05 ? 'tight' : v >= 0.95 ? 'broad' : v.toFixed(2)),
    appliesTo: (t) => (t.wet?.relief ?? 0) > 0,
    drives: 'CanvasEngine.setSheenWidth -> Comp.sheenWidth, the highlight exponent.',
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
/**
 * The paint dials as GROUPS: each macro with the dials it drives beneath it.
 *
 * A dial that answers to no macro comes back in `loose`, so nothing can be
 * added to the library and quietly fail to appear anywhere.
 */
export function dialGroups(tool: ToolContext): {
  groups: { macro: RailControl; under: RailControl[] }[];
  loose: RailControl[];
} {
  const paint = controlsFor(tool, 'paint');
  const macros = paint.filter((c) => c.macro);
  const groups = macros.map((macro) => ({
    macro,
    under: paint.filter((c) => c.under?.includes(macro.id)),
  }));
  const claimed = new Set(groups.flatMap((g) => [g.macro.id, ...g.under.map((c) => c.id)]));
  return { groups, loose: paint.filter((c) => !claimed.has(c.id)) };
}

export const controlsFor = (tool: ToolContext, where?: RailControl['belongsTo']): RailControl[] =>
  RAIL_CONTROLS.filter((c) => c.appliesTo(tool) && (where === undefined || c.belongsTo === where));

/** What to write on a dial for the tool in hand. */
export const labelOf = (control: RailControl, tool: ToolContext): string =>
  control.labelFor?.(tool) ?? control.label;
