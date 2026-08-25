/*
 * The medium comes first.
 *
 * Choosing runs medium → tool → paper, because the medium is what decides the
 * other two. Graphite offers hardnesses and no colour at all; watercolour
 * offers sable heads and the whole pigment library. Pencil is not coloured
 * pencil — for a pencil the only real question is how soft the graphite is.
 *
 * Everything here is derived from the libraries rather than listed. A new
 * medium appears in the picker because it declares a `collection`, not because
 * anyone edited the UI.
 */

import { BRUSHES } from '../brush/library';
import type { BrushDef } from '../brush/types';
import { DRY_MEDIA, WET_MEDIA } from '../media/library';
import type { DryMedium, WetMedium } from '../media/types';
import type { Paper } from '../substrate/papers';

export interface MediumCollection {
  /** 'Watercolour', 'Graphite', 'Charcoal', … */
  name: string;
  family: 'wet' | 'dry';
  /** Dry: the sticks in this family, softest first. Wet: empty. */
  media: DryMedium[];
  /** Wet: the material itself — what the solver is handed when this is picked.
   * Dry: absent, because the stick IS the material. */
  wet?: WetMedium;
  /** Wet: the heads that carry it. Dry: empty — the stick is the tool. */
  brushes: BrushDef[];
  /**
   * Does the artist pick the colour?
   *
   * Read straight off the data, not from a list of names: a medium that
   * declares its own pigments lays those and nothing else, and one that
   * declares none lays whatever is loaded onto it. Watercolour is the only
   * thing in the library with an empty pigment list, which is exactly why it
   * is the only thing with a palette.
   */
  offersColour: boolean;
}

function collect(): MediumCollection[] {
  /* Every wet material gets its own entry, and every one of them offers every
     head in the library. A hog in watercolour is a legitimate if unusual
     choice, and a soft brush is how an oil painter glazes — so the picker
     shows all of them and `tool-defaults.ts` decides which one you are handed
     first. That is a default, not a restriction. */
  const out: MediumCollection[] = WET_MEDIA.map((m) => ({
    name: m.collection,
    family: 'wet' as const,
    media: [],
    wet: m,
    brushes: BRUSHES,
    offersColour: m.pigments.length === 0,
  }));

  const dry = new Map<string, DryMedium[]>();
  for (const medium of DRY_MEDIA) {
    const list = dry.get(medium.collection) ?? [];
    list.push(medium);
    dry.set(medium.collection, list);
  }
  for (const [name, media] of dry) {
    out.push({
      name,
      family: 'dry',
      media,
      brushes: [],
      offersColour: media.every((m) => m.pigments.length === 0),
    });
  }
  return out;
}

export const MEDIUM_COLLECTIONS: MediumCollection[] = collect();

/** The collection a dry medium belongs to. */
export const collectionOf = (medium: DryMedium): MediumCollection | undefined =>
  MEDIUM_COLLECTIONS.find((c) => c.media.some((m) => m.slug === medium.slug));

export const wetCollection = (): MediumCollection =>
  MEDIUM_COLLECTIONS.find((c) => c.family === 'wet') ?? MEDIUM_COLLECTIONS[0];

/** The surface a material belongs on, asked of the material rather than of a
 *  list. Oil is thinned with spirit and sits on a primed ground; anything
 *  water-borne wants a sheet that will take water; a dry stick wants tooth. */
export const surfaceFor = (collection: MediumCollection): Paper['grainKind'] => {
  if (collection.family === 'dry') return 'pastel';
  return collection.wet?.solvent === 'oil' ? 'canvas' : 'watercolor';
};

/**
 * The sheets that suit a medium.
 *
 * Asked of the paper's own grain, not of a list. Watercolour wants a sheet that
 * will hold water; a dry stick wants a felted tooth to scrape against. Some
 * things genuinely work on anything, and that is a bridge for later — for now
 * the picker shows what belongs rather than everything that exists.
 */
export const papersFor = (collection: MediumCollection, papers: Paper[]): Paper[] => {
  const want = surfaceFor(collection);
  /* A surface with no character of its own cannot be the wrong surface for
     anything, so the flat reference is offered to every material. Asked of what
     the sheet IS — a smooth grain — rather than of its name, so a second
     reference surface would be offered on the same terms. */
  return papers.filter((p) => p.grainKind === want || p.grainKind === 'smooth');
};

/** What a collection reaches for when you first pick it up. */
export const firstToolIn = (collection: MediumCollection): DryMedium | BrushDef | undefined =>
  collection.family === 'dry' ? collection.media[0] : collection.brushes[0];
