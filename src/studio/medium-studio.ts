// The medium studio — step 1: turn a dial, see the paint change.
//
// This is how the artist builds their materials (D13), so it is named the way a
// painter names things and it shows the real mark rather than a picture of one:
// the panel sits down the left and the sheet to its right is the actual canvas
// running the actual engine. Paint on it while the dials are open.
//
// WHAT IS IN HERE AND WHY IT IS NOT EVERYTHING
//
// A wet medium carries about thirty-five settings. Only these reach the paint —
// they are what `CanvasEngine.setWetMedium` actually passes to the fluid solver,
// plus the two it hands the renderer. The rest (body, shrink, open time, pigment
// boost, teflon minimum) are declared on the schema and nothing reads them yet.
//
// They are left out deliberately. A dial that does nothing is worse than no
// dial: the artist turns it, sees no change, and cannot tell whether the setting
// is broken, their eye is, or the paint simply does not work that way. That is
// the plausible-but-wrong failure the fence exists to stop. When those fields
// are wired into the engine they get dials here, and not before.

import type { WetMedium } from '../media/types';
import { Dial } from './dial';
import {
  forgetMedium, isBuiltIn, isEdited, isStartingPoint, listMedia, saveMedium, slugFor,
} from './medium-store';

export interface MediumStudioEvents {
  /** Push the edited medium at the engine. Safe to call on every drag. */
  onApply(medium: WetMedium): void;
  /** Load one test pigment onto the brush. */
  onPickColour(slug: string): void;
  onClearSheet(): void;
  /** A paint was saved, copied or deleted — the app's picker needs rebuilding. */
  onLibraryChanged(selectSlug: string): void;
}

/** One artist-facing control over one engine value. */
interface Field {
  key: keyof WetMedium;
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  unit?: string;
  bipolar?: boolean;
  /** Dial units are the artist's; these convert to and from the engine's.
   *  Several engine values are thousandths and would show as 0.00 on every
   *  dial position, which is not a reading, it is a shrug. */
  toEngine?(v: number): number;
  fromEngine?(v: number): number;
}

interface Group {
  title: string;
  note: string;
  fields: Field[];
}

/** Four measured pigments, spread far enough apart to judge a medium by.
 *  Every one comes from the Berns database the pigment table is built from. */
const TEST_COLOURS: Array<[slug: string, hex: string, name: string]> = [
  ['phthalo-blue-gs', '#12447e', 'Phthalo Blue'],
  ['pyrrole-red', '#c8281e', 'Pyrrole Red'],
  ['hansa-yellow', '#e8b400', 'Hansa Yellow'],
  ['bone-black', '#2a2724', 'Bone Black'],
];

const GROUPS: Group[] = [
  {
    title: 'Body',
    note: 'How stiff the paint is before anything moves it.',
    fields: [
      {
        key: 'viscosity', label: 'thickness', min: 0, max: 1, step: 0.01,
        help: 'How stiff the paint is. Thin paint floods across the sheet and keeps travelling; thick paint stays close to where the brush put it. Watercolour is very thin. This is the first dial to move when building a bodied paint like acrylic or oil.',
      },
    ],
  },
  {
    title: 'How it travels',
    note: 'What happens once it is on the paper and still wet.',
    fields: [
      {
        key: 'drag', label: 'spread resistance', min: 0, max: 0.5, step: 0.005, decimals: 3,
        help: 'How much the paper holds the paint back as it spreads. Low lets a wet wash race outward on its own; high keeps a stroke the shape you laid it.',
      },
      {
        key: 'gravityResponse', label: 'runs downhill', min: 0, max: 0.3, step: 0.005, decimals: 3,
        help: 'How strongly a tilted board makes the paint run. Watercolour answers to gravity readily once the sheet is wet enough; a bodied paint barely notices it. Use the Board drawer to tilt the sheet and see this.',
      },
      {
        key: 'wetLayerDrag', label: 'grip on damp', min: 0, max: 1, step: 0.01,
        help: 'Extra resistance to moving across paper that is already wet. High makes wet-into-wet work feel sluggish and controlled; low lets a second stroke slide over the first.',
      },
    ],
  },
  {
    title: 'Drying',
    note: 'How quickly it leaves, and whether you can bring it back.',
    fields: [
      {
        key: 'evapRate', label: 'drying speed', min: 0, max: 100, step: 1,
        decimals: 0,
        toEngine: (v) => v * 0.00004,
        fromEngine: (v) => v / 0.00004,
        help: 'How fast water leaves the sheet for the air. Higher dries sooner, which shortens how long a wash stays workable. Oil does not dry this way at all — it cures — so an oil medium sets this to nothing.',
      },
      {
        key: 'absorptionCoupling', label: 'soaks in', min: 0, max: 100, step: 1,
        decimals: 0,
        toEngine: (v) => v * 0.00002,
        fromEngine: (v) => v / 0.00002,
        help: 'How readily the paper drinks the paint down into its fibres rather than holding it on the surface. High soaks in fast and kills a wash before it can move; low leaves it sitting on top and workable.',
      },
    ],
  },
  {
    title: 'Edges',
    note: 'Rims, blooms and the dark line round a drying wash — watercolour’s signature, and the thing a bodied paint does not do.',
    fields: [
      {
        key: 'edgeDarkening', label: 'edge darkening', min: 0, max: 0.2, step: 0.002, decimals: 3,
        help: 'Drying at the rim pulls water outward, and pigment rides along with it. This is the gentle version: it darkens an edge by moving the water. Turn it up too far and the water itself starts being driven hard enough to look speckled.',
      },
      {
        key: 'rimMigration', label: 'rim pull', min: 0, max: 1, step: 0.01,
        help: 'Pigment drifting toward a shrinking edge under its own steam, without the water having to race. This is the dial that gives a strong rim while the wash stays calm. Watercolour rings famously; a binder-heavy gouache holds pigment where it lands; oil should be nothing.',
      },
      {
        key: 'rimReach', label: 'rim width', min: 0, max: 6, step: 0.1, decimals: 1, unit: ' cells',
        help: 'How wide a band of paint gets gathered into the rim. Small makes a narrow stranded line; large makes a broad soft shoulder.',
      },
      {
        key: 'edgeEvaporation', label: 'edge dries first', min: 0, max: 4, step: 0.05, decimals: 2,
        help: 'How much faster the rim of a puddle dries than its middle. This is the cause of a coffee-ring, not the ring itself — set it up and the paint makes its own ring. High for watercolour on a thirsty sheet; nothing for oil, which leaves no ring at all.',
      },
    ],
  },
  {
    title: 'How it looks',
    note: 'The surface, and what changes as it dries.',
    fields: [
      {
        key: 'kInstrument', label: 'sheen', min: 0, max: 1, step: 0.01,
        // Stored inverted: the engine's dial is 1 = matte. Showing it that way
        // round would make "more sheen" mean turning the knob down.
        toEngine: (v) => 1 - v,
        fromEngine: (v) => 1 - v,
        help: 'How glossy the dried surface is. None is a chalky matte, like gouache. High is a wet-looking sheen, like an oil or a heavy acrylic. This changes only how light comes off the paint, never how it moves.',
      },
      {
        key: 'valueShift', label: 'wet → dry', min: -0.3, max: 0.3, step: 0.01, bipolar: true,
        help: 'How much the colour changes as it dries. Positive means it looks deeper while wet and lifts lighter as it dries — the watercolour disappointment. Negative means it goes on milky and darkens as it cures, which is what acrylic does. Zero is oil, which dries the colour it was laid.',
      },
    ],
  },
];

export class MediumStudio {
  readonly root: HTMLElement;
  private testbar: HTMLElement;
  private medium: WetMedium;
  /** Where Revert goes back to: the values this paint had when it was opened,
   *  or when it was last saved. Never written by a dial. */
  private shipped: WetMedium;
  private events: MediumStudioEvents;
  private pop: HTMLElement | null = null;
  private swatches: HTMLButtonElement[] = [];
  private status!: HTMLElement;

  constructor(mount: HTMLElement, medium: WetMedium, events: MediumStudioEvents) {
    // A working copy. Editing the library row in place would quietly rewrite
    // the shipped watercolour for the rest of the session.
    this.medium = { ...medium, physics: { ...medium.physics } };
    this.shipped = { ...medium, physics: { ...medium.physics } };
    this.events = events;

    this.root = document.createElement('section');
    this.root.className = 'st-panel';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Medium studio');
    mount.appendChild(this.root);

    this.testbar = document.createElement('div');
    this.testbar.className = 'st-testbar';
    this.testbar.hidden = true;
    mount.appendChild(this.testbar);

    this.build();
    this.buildTestbar();
  }

  setVisible(on: boolean) {
    this.root.hidden = !on;
    this.testbar.hidden = !on;
    if (!on) this.closePop();
  }

  /** The edited row. Step 2 will be able to name and keep this. */
  get value(): WetMedium { return { ...this.medium }; }

  /** Edit a different paint. The dials rebuild around it. */
  setMedium(medium: WetMedium) {
    this.medium = { ...medium, physics: { ...medium.physics } };
    this.shipped = { ...medium, physics: { ...medium.physics } };
    this.root.replaceChildren();
    this.build();
    this.events.onApply(this.medium);
  }

  private build() {
    const head = document.createElement('header');
    head.className = 'st-head';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'st-head-title';
    // The name is the artist's, so it is an editable field rather than a
    // heading. Typing here renames the paint; saving is what keeps it.
    const name = document.createElement('input');
    name.className = 'st-input st-name';
    name.type = 'text';
    name.value = this.medium.name;
    name.setAttribute('aria-label', 'Paint name');
    name.addEventListener('input', () => { this.medium.name = name.value; });
    const sub = document.createElement('span');
    sub.className = 'st-subtitle';
    // Say plainly which of the three a paint is. A starting point is reasoning
    // dressed as a material, and the artist has to know that before trusting
    // how it behaves.
    sub.textContent = isEdited(this.medium.slug)
      ? 'Your paint'
      : isStartingPoint(this.medium.slug)
        ? 'A starting point, not a finished paint — pull it apart and save it as your own'
        : isBuiltIn(this.medium.slug)
          ? 'A paint that came with the app — save to keep your changes'
          : 'Your paint';
    titleWrap.append(name, sub);
    head.appendChild(titleWrap);
    this.root.appendChild(head);

    const bar = document.createElement('div');
    bar.className = 'st-actions';

    const save = document.createElement('button');
    save.className = 'st-btn is-primary';
    save.type = 'button';
    save.textContent = 'Save';
    save.title = 'Keep this paint. It appears in the Paint drawer and survives a reload.';
    save.addEventListener('click', () => this.save());

    const copy = document.createElement('button');
    copy.className = 'st-btn';
    copy.type = 'button';
    copy.textContent = 'Save as new';
    copy.title = 'Keep this as a separate paint, leaving the original alone';
    copy.addEventListener('click', () => this.saveAsNew());

    const revert = document.createElement('button');
    revert.className = 'st-btn is-quiet';
    revert.type = 'button';
    revert.textContent = 'Revert';
    revert.title = 'Put every dial back to where this paint started';
    revert.addEventListener('click', () => this.revertAll());

    bar.append(save, copy, revert);

    // Only the artist's own versions can be removed, and removing one uncovers
    // the shipped paint underneath rather than leaving a gap.
    if (isEdited(this.medium.slug)) {
      const del = document.createElement('button');
      del.className = 'st-btn is-quiet';
      del.type = 'button';
      del.textContent = isBuiltIn(this.medium.slug) ? 'Undo my changes' : 'Delete';
      del.title = isBuiltIn(this.medium.slug)
        ? 'Throw away your saved version and go back to the paint that shipped'
        : 'Delete this paint for good';
      del.addEventListener('click', () => this.remove());
      bar.appendChild(del);
    }

    const status = document.createElement('span');
    status.className = 'st-status';
    bar.appendChild(status);
    this.status = status;

    this.root.appendChild(bar);

    const body = document.createElement('div');
    body.className = 'st-controls';
    this.root.appendChild(body);

    for (const group of GROUPS) {
      const section = document.createElement('section');
      section.className = 'st-section';

      const gh = document.createElement('div');
      gh.className = 'st-section-head';
      const title = document.createElement('span');
      title.className = 'st-section-title';
      title.textContent = group.title;
      const help = document.createElement('button');
      help.className = 'st-help';
      help.type = 'button';
      help.textContent = '?';
      help.setAttribute('aria-label', `What the ${group.title} settings do`);
      help.addEventListener('click', (e) => this.openPop(group, e.currentTarget as HTMLElement));
      gh.append(title, help);

      const note = document.createElement('p');
      note.className = 'st-section-note';
      note.textContent = group.note;

      const card = document.createElement('div');
      card.className = 'st-card';
      const rack = document.createElement('div');
      rack.className = 'st-dials';
      card.appendChild(rack);

      for (const f of group.fields) {
        const shipped = this.display(f, medFrom(this.medium, f.key));
        new Dial(rack, {
          label: f.label,
          min: f.min, max: f.max, step: f.step,
          decimals: f.decimals, unit: f.unit, bipolar: f.bipolar,
          value: shipped, defaultValue: shipped,
          onChange: (v) => this.set(f, v),
        });
      }

      section.append(gh, note, card);
      body.appendChild(section);
    }

    const foot = document.createElement('p');
    foot.className = 'st-section-note';
    foot.textContent =
      'These are the settings that reach the paint today. Body, open time and '
      + 'impasto exist in the schema but nothing reads them yet, so they are not '
      + 'shown — a dial that does nothing would be worse than no dial.';
    body.appendChild(foot);
  }

  private display(f: Field, engineValue: number) {
    return f.fromEngine ? f.fromEngine(engineValue) : engineValue;
  }

  private set(f: Field, shown: number) {
    const engineValue = f.toEngine ? f.toEngine(shown) : shown;
    (this.medium as unknown as Record<string, number>)[f.key as string] = engineValue;
    this.events.onApply(this.medium);
  }

  private say(message: string) {
    this.status.textContent = message;
    window.setTimeout(() => {
      if (this.status.textContent === message) this.status.textContent = '';
    }, 2600);
  }

  private save() {
    const ok = saveMedium(this.medium);
    if (!ok) { this.say('Could not save — storage is unavailable'); return; }
    // What is on the dials becomes the new starting point, so Revert goes back
    // to what was kept rather than to a version that no longer exists.
    this.shipped = { ...this.medium, physics: { ...this.medium.physics } };
    this.root.replaceChildren();
    this.build();
    this.say('Saved');
    this.events.onLibraryChanged(this.medium.slug);
  }

  private saveAsNew() {
    const taken = listMedia().map((m) => m.slug);
    const base = this.medium.name.trim();
    // A copy that keeps the original's name would be indistinguishable from it
    // in the Paint drawer, which is the one place it has to be picked out.
    const name = taken.includes(slugFor(base, [])) ? `${base} copy` : base;
    const slug = slugFor(name, taken);
    this.medium = { ...this.medium, name, slug };
    const ok = saveMedium(this.medium);
    if (!ok) { this.say('Could not save — storage is unavailable'); return; }
    this.shipped = { ...this.medium, physics: { ...this.medium.physics } };
    this.root.replaceChildren();
    this.build();
    this.say('Saved as a new paint');
    this.events.onLibraryChanged(slug);
  }

  private remove() {
    const slug = this.medium.slug;
    forgetMedium(slug);
    // A shipped paint reappears from underneath; the artist's own is gone, so
    // fall back to the first paint still standing.
    const next = listMedia().find((m) => m.slug === slug) ?? listMedia()[0];
    this.setMedium(next);
    this.say(isBuiltIn(slug) ? 'Back to the paint that shipped' : 'Deleted');
    this.events.onLibraryChanged(next.slug);
  }

  private revertAll() {
    // Restore from the shipped copy, then rebuild so every dial re-reads its
    // value and clears its own edited marker with it.
    this.medium = { ...this.shipped, physics: { ...this.shipped.physics } };
    this.root.replaceChildren();
    this.build();
    this.events.onApply(this.medium);
  }

  private buildTestbar() {
    const label = document.createElement('span');
    label.className = 'st-testbar-label';
    label.textContent = 'test with';
    this.testbar.appendChild(label);

    TEST_COLOURS.forEach(([slug, hex, name], i) => {
      const b = document.createElement('button');
      b.className = 'st-swatch' + (i === 0 ? ' on' : '');
      b.type = 'button';
      b.style.background = hex;
      b.title = name;
      b.setAttribute('aria-label', `Test with ${name}`);
      b.addEventListener('click', () => {
        this.swatches.forEach((s) => s.classList.remove('on'));
        b.classList.add('on');
        this.events.onPickColour(slug);
      });
      this.swatches.push(b);
      this.testbar.appendChild(b);
    });

    const clear = document.createElement('button');
    clear.className = 'st-btn';
    clear.type = 'button';
    clear.textContent = 'clear sheet';
    clear.addEventListener('click', () => this.events.onClearSheet());
    this.testbar.appendChild(clear);
  }

  private openPop(group: Group, anchor: HTMLElement) {
    this.closePop();
    const pop = document.createElement('div');
    pop.className = 'st-pop';
    pop.setAttribute('role', 'dialog');
    const list = group.fields.map((f) => {
      const engineValue = medFrom(this.medium, f.key);
      // The engine's own number stays visible. A studio that hides what it is
      // really setting cannot be used to write a value into a card afterwards.
      return `<dt>${f.label}</dt><dd>${f.help}<br><code>${String(f.key)} = ${engineValue}</code></dd>`;
    }).join('');
    pop.innerHTML = `<h4>${group.title}</h4><dl>${list}</dl>`;
    document.body.appendChild(pop);

    const r = anchor.getBoundingClientRect();
    const w = pop.getBoundingClientRect();
    pop.style.left = `${Math.min(window.innerWidth - w.width - 12, r.left)}px`;
    pop.style.top = `${Math.min(window.innerHeight - w.height - 12, Math.max(12, r.bottom + 8))}px`;
    this.pop = pop;

    // Any tap outside closes it, including on the sheet — a popover must never
    // be a thing you have to hunt for the way out of.
    setTimeout(() => window.addEventListener('pointerdown', this.onOutside, { once: true, capture: true }), 0);
  }

  private onOutside = (ev: PointerEvent) => {
    if (this.pop && ev.composedPath().includes(this.pop)) {
      window.addEventListener('pointerdown', this.onOutside, { once: true, capture: true });
      return;
    }
    this.closePop();
  };

  private closePop() {
    this.pop?.remove();
    this.pop = null;
  }
}

function medFrom(m: WetMedium, key: keyof WetMedium): number {
  return (m as unknown as Record<string, number>)[key as string];
}
