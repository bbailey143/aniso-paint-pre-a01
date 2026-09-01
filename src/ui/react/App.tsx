/*
 * The painting UI.
 *
 * Structure is unchanged from the hand-written version, because the structure
 * was not the problem: rail on the left, dock along the bottom, sheets above
 * the dock, readout windows on the right. What changed is that every control
 * is now a react-aria hook rather than my own pointer handling.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PIGMENTS } from '../../color/pigment-palette';
import { recipeToHex } from '../../color/km';
import { PAPERS } from '../../substrate/papers';
import { controlsFor, dialGroups, labelOf } from '../controls';
import { DOCK_TOOLS, dockToolsFor } from '../dock-tools';
import { MEDIUM_COLLECTIONS, papersFor } from '../media';
import { Icon } from './icons';
import { Btn, Drawer, RangeSlider, Sheet, Slider, Toggle, useDraggable } from './widgets';
import { HudWindows, type ToolWindow } from './HudWindows';
import type { StudioStore } from './store';

export function App({ store }: { store: StudioStore }) {
  useSyncExternalStore(store.subscribe, store.snapshot);
  const tool = store.toolContext();
  const [drawing, setDrawing] = useState(false);

  /* The chrome steps aside for the whole time the brush is down. The lift is
     watched on the window: a stroke that ends with the pencil already off the
     sheet never sends pointerup to the canvas. */
  useEffect(() => {
    const canvas = document.getElementById('stage');
    if (!canvas) return undefined;
    const down = () => { setDrawing(true); store.setSheet(null); };
    const up = () => setDrawing(false);
    canvas.addEventListener('pointerdown', down, { passive: true });
    window.addEventListener('pointerup', up, { passive: true });
    window.addEventListener('pointercancel', up, { passive: true });
    window.addEventListener('blur', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
    };
  }, [store]);

  const dockRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /* The sheet clears the dock by a measured amount: the dock grows with the
     safe area and changes width with the medium. */
  useEffect(() => {
    const measure = () => {
      const h = dockRef.current?.getBoundingClientRect().height ?? 0;
      if (h > 0) rootRef.current?.style.setProperty('--st-dock-h', `${Math.round(h)}px`);
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = 'ResizeObserver' in window && dockRef.current
      ? new ResizeObserver(measure) : null;
    if (ro && dockRef.current) ro.observe(dockRef.current);
    return () => { window.removeEventListener('resize', measure); ro?.disconnect(); };
  });

  const hex = recipeToHex(store.recipe) ?? '#888';
  const toolWord = store.collection.family === 'dry' ? 'Grade' : 'Brush';
  const toolName = store.activeDry ? store.activeDry.name : store.brush.name;
  const allowedTools = new Set(dockToolsFor(tool).map((d) => d.id));
  /* Only the macros ride the top strip now. Everything else moved into the
     Paint Properties drawer - the artist's call on 2026-08-25: "please remove
     the sliders from the top. This was meant to clean things." */
  const paintDials = controlsFor(tool, 'paint').filter((c) => c.macro);

  return (
    <div className={`st${drawing ? ' drawing' : ''}`} ref={rootRef}>
      {/* --------------------------------------------- the tool, on the left */}
      {/* Two strips, because they answer two different questions. How big the
          brush is has nothing to do with how stiff the paint is, and reading
          them in one column meant scanning a list of unrelated things every
          time. Each dial says for itself which one it belongs to — nothing
          here knows the name of a medium. */}
      <div className="st-rail">
        {controlsFor(tool, 'tool').map((c) => (
          <Slider
            key={c.id}
            label={labelOf(c, tool)}
            value={store.value(c.id)}
            min={c.min}
            max={c.max}
            format={c.format}
            onChange={(v) => store.setValue(c.id, v)}
          />
        ))}
      </div>

      {/* -------------------------------------------- the paint, along the top */}
      {paintDials.length > 0 && (
        <div className="st-paints">
          {paintDials.map((c) => (
            <Slider
              key={c.id}
              orientation="horizontal"
              label={labelOf(c, tool)}
              value={store.value(c.id)}
              min={c.min}
              max={c.max}
              format={c.format}
              onChange={(v) => store.setValue(c.id, v)}
            />
          ))}
        </div>
      )}

      {/* ----------------------------------------------------- bottom dock */}
      <div className="st-dock" ref={dockRef}>
        <DockStep caption="Medium" name={store.collection.name} chip="rgba(255,255,255,.22)"
          open={store.sheet === 'medium'} onPress={() => store.setSheet('medium')} />
        <DockStep caption={toolWord} name={toolName} chip="rgba(255,255,255,.16)"
          open={store.sheet === 'brush'} onPress={() => store.setSheet('brush')} />
        {store.collection.offersColour && (
          <DockStep caption="Colour" name={pigmentName(store)} chip={hex} round
            open={store.sheet === 'colour'} onPress={() => store.setSheet('colour')} />
        )}
        <DockStep caption="Paper" name={store.paper.name} chip={toneOf(store.paper)}
          open={store.sheet === 'paper'} onPress={() => store.setSheet('paper')} />

        <span className="st-sep" />

        {DOCK_TOOLS.filter((d) => allowedTools.has(d.id)).map((d) => (
          d.id === 'tilt' ? (
            <Toggle key={d.id} className="st-icon" aria-label={d.label} title={d.label}
              isSelected={store.tiltOpen} onChange={(v) => store.setTiltOpen(v)}>
              <Icon name={d.icon} />
            </Toggle>
          ) : d.id === 'impasto' ? (
            <Toggle key={d.id} className="st-icon" aria-label={d.label} title={d.label}
              isSelected={store.surfaceOpen} onChange={(v) => store.setSurfaceOpen(v)}>
              <Icon name={d.icon} />
            </Toggle>
          ) : (
            <Btn key={d.id} className={`st-icon${store.sheet === 'drying' ? ' on' : ''}`}
              aria-label={d.label} title={d.label} onPress={() => store.setSheet('drying')}>
              <Icon name={d.icon} />
            </Btn>
          )
        ))}

        <span className="st-sep" />

        <Btn className="st-icon" aria-label="Rinse the brush" title="Rinse the brush"
          onPress={() => store.events.onRinse?.()}><Icon name="rinse" /></Btn>
        <Btn className="st-icon" aria-label="Clear the sheet" title="Clear the sheet"
          onPress={() => store.events.onClear?.()}><Icon name="wipe" /></Btn>
        <Toggle className="st-icon" aria-label="Show the readouts" title="Show the readouts"
          isSelected={store.readouts} onChange={(v) => store.setReadouts(v)}>
          <Icon name="info" size={19} />
        </Toggle>
      </div>

      {/* --------------------------------------------------------- sheets */}
      <Sheet isOpen={store.sheet !== null} onClose={() => store.setSheet(null)}
        title={sheetTitle(store, toolWord)}>
        {store.sheet === 'medium' && <MediumSheet store={store} />}
        {store.sheet === 'brush' && <ToolSheet store={store} />}
        {store.sheet === 'colour' && <ColourSheet store={store} />}
        {store.sheet === 'paper' && <PaperSheet store={store} />}
        {store.sheet === 'drying' && <DryingSheet store={store} />}
      </Sheet>

      <Drawer isOpen={store.surfaceOpen} onClose={() => store.setSurfaceOpen(false)}
        title="Paint Properties">
        <PaintProperties store={store} />
      </Drawer>

      <HudWindows
        stickInHand={store.activeDry?.form === 'stick'}
        readoutsOn={store.readouts}
        tools={[
          ...(store.tiltOpen ? [{
            id: 'tilt',
            title: 'Tilt',
            node: <TiltPad store={store} />,
            onClose: () => store.setTiltOpen(false),
          } as ToolWindow] : []),
        ]}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

const toneOf = (p: { tone: readonly [number, number, number] }) =>
  `rgb(${p.tone.map((v) => Math.round(v * 255)).join(',')})`;

function pigmentName(store: StudioStore): string {
  const names = [...store.recipe.keys()]
    .map((slug) => PIGMENTS.find((q: { slug: string }) => q.slug === slug)?.name)
    .filter(Boolean) as string[];
  return names.length === 0 ? 'None' : names.length === 1 ? names[0] : `${names.length} mixed`;
}

const sheetTitle = (store: StudioStore, toolWord: string) =>
  store.sheet === 'medium' ? 'Medium'
    : store.sheet === 'brush' ? toolWord
      : store.sheet === 'colour' ? 'Colour'
        : store.sheet === 'drying' ? 'Drying' : 'Paper';

function DockStep({ caption, name, chip, round, open, onPress }: {
  caption: string; name: string; chip: string; round?: boolean; open: boolean; onPress(): void;
}) {
  return (
    <Btn className={`st-btn${open ? ' on' : ''}`} aria-label={`${caption}: ${name}`} onPress={onPress}>
      <span className={`st-chip${round ? ' round' : ''}`} style={{ background: chip }} />
      <span className="st-btn-label"><small>{caption}</small><b>{name}</b></span>
    </Btn>
  );
}

function Row({ chip, title, note, selected, onPress }: {
  chip: string; title: string; note: string; selected: boolean; onPress(): void;
}) {
  return (
    <Btn className={`st-row${selected ? ' on' : ''}`} onPress={onPress} aria-label={title}>
      <span className="st-chip" style={{ background: chip }} />
      <span className="st-row-text"><b>{title}</b><small>{note}</small></span>
    </Btn>
  );
}

function MediumSheet({ store }: { store: StudioStore }) {
  return (
    <div className="st-group">
      <h3>Medium</h3>
      <div className="st-list">
        {MEDIUM_COLLECTIONS.map((c) => {
          const count = c.family === 'dry' ? c.media.length : c.brushes.length;
          return (
            <Row key={c.name} title={c.name}
              chip={c.family === 'wet' ? 'rgba(120,170,215,.55)' : 'rgba(255,255,255,.16)'}
              note={`${count} ${c.family === 'dry' ? (count === 1 ? 'grade' : 'grades') : 'brushes'}`
                + (c.offersColour ? ' · full palette' : ' · one colour')}
              selected={c.name === store.collection.name}
              onPress={() => store.pickCollection(c)} />
          );
        })}
      </div>
    </div>
  );
}

function ToolSheet({ store }: { store: StudioStore }) {
  const c = store.collection;
  return (
    <div className="st-group">
      <h3>{c.name}</h3>
      <div className="st-list">
        {c.family === 'wet'
          ? c.brushes.map((b) => (
            <Row key={b.slug} title={b.name} chip="rgba(255,255,255,.16)"
              note={b.kind === 'flat' ? 'Flat — spreads and scratches' : 'Round — points well'}
              selected={!store.activeDry && store.brush.slug === b.slug}
              onPress={() => store.pickBrush(b)} />
          ))
          : c.media.map((m) => (
            <Row key={m.slug} title={m.name} chip="rgba(255,255,255,.10)"
              note={m.hardness <= 0.2 ? 'Soft — dark, fills the valleys'
                : m.hardness >= 0.6 ? 'Hard — faint, catches the peaks' : 'Medium'}
              selected={store.activeDry?.slug === m.slug}
              onPress={() => store.pickDry(m)} />
          ))}
      </div>
    </div>
  );
}

function ColourSheet({ store }: { store: StudioStore }) {
  const groups: Array<[string, string]> = [['warm', 'Warm'], ['cool', 'Cool'], ['neutral', 'Neutral']];
  return (
    <>
      <div className="st-group">
        <h3>Colour</h3>
        <div className="st-mix">
          {store.recipe.size === 0 && <span className="st-empty">Nothing loaded — tap a pigment.</span>}
          {[...store.recipe.keys()].map((slug) => {
            const p = PIGMENTS.find((q: { slug: string }) => q.slug === slug);
            if (!p) return null;
            return (
              <Btn key={slug} className="st-mixchip" aria-label={`Remove ${p.name}`}
                onPress={() => store.dropPigment(slug)}>
                <i style={{ background: p.hex }} />
                <span>{p.name}</span>
                {store.recipe.size > 1 && <u>×</u>}
              </Btn>
            );
          })}
        </div>
      </div>
      <div className="st-group">
        <Toggle className="st-toggle" isSelected={store.mixing} onChange={(v) => store.setMixing(v)}>
          {store.mixing ? 'Mixing — tap adds to the mix' : 'Mix'}
        </Toggle>
      </div>
      {groups.map(([key, label]) => {
        const list = PIGMENTS.filter((p: { temp: string }) => p.temp === key);
        if (list.length === 0) return null;
        return (
          <div className="st-group" key={key}>
            <h3>{label}</h3>
            <div className="st-swatches">
              {list.map((p: { slug: string; name: string; hex: string; ci: string }) => (
                <Btn key={p.slug} className={`st-swatch${store.recipe.has(p.slug) ? ' on' : ''}`}
                  aria-label={`${p.name} — ${p.ci}`} title={`${p.name} — ${p.ci}`}
                  onPress={() => store.pickPigment(p.slug)}>
                  <span style={{ background: p.hex, position: 'absolute', inset: 0, borderRadius: 13 }} />
                  <span style={{ position: 'relative' }}>{p.name}</span>
                </Btn>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function PaperSheet({ store }: { store: StudioStore }) {
  return (
    <div className="st-group">
      <h3>For {store.collection.name.toLowerCase()}</h3>
      <div className="st-list">
        {papersFor(store.collection, PAPERS).map((p) => (
          <Row key={p.slug} title={p.name} chip={toneOf(p)} note={p.grainStyle}
            selected={store.paper.slug === p.slug} onPress={() => store.setPaper(p)} />
        ))}
      </div>
    </div>
  );
}

function DryingSheet({ store }: { store: StudioStore }) {
  /* Anchored on the material rather than on a constant. Watercolour is
     workable for about ninety seconds and oil for two days — four orders of
     magnitude apart — so a fixed range put oil at the dead bottom of the
     slider, where one step made it dry faster than a wash. The middle of the
     dial is now whatever this paint normally does, and the ends are the same
     multiple either side of it whatever is in the brush. */
  const base = store.wetMedium.evapRate;
  const MAX = Math.max(base * 4, 1e-9);
  return (
    <div className="st-group">
      <h3>How fast the {store.wetMedium.name.toLowerCase()} sets</h3>
      <Slider label="Drying" orientation="horizontal" ends={['Slow', 'Fast']}
        value={store.evapRate} min={0} max={MAX} step={MAX / 200}
        format={(v) => (v <= 0 ? 'never' : `${(v / base).toFixed(2)}×`)}
        onChange={(v) => store.setEvap(v)} />
      <p className="st-note">
        1× is what this material normally does. Only for materials that stay
        workable — a pencil is already dry, so this is not offered for one.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- tilt pad */

/**
 * Same maths as the pad it replaces: the puck's distance from the centre is
 * sin(alpha), so the board angle is its arcsine, and what reaches the engine is
 * the normalised downhill vector plus cos(alpha) for the capillary pass.
 *
 * The dragging is useMove now, which means the arrow keys tilt the board too.
 */
/**
 * Paint Properties: each macro at the head of its group, with the properties it
 * will drive underneath — a value slider to set where each one sits now, and a
 * range slider under that for the stretch it is allowed to travel over.
 *
 * The grouping is read from the control library (`dialGroups`), not written out
 * here, so a macro added later brings its own group with it. Sheen appears in
 * both groups on purpose: it answers to both, and it is one property drawn
 * twice, not two.
 *
 * The macros are PARKED and say so on screen. They are still the head of their
 * group so the shape of the thing is visible while its parts are tuned, but a
 * control that silently drove nothing would be exactly what this project's own
 * rules forbid — so it is labelled instead of left to be discovered.
 */
function PaintProperties({ store }: { store: StudioStore }) {
  const tool = store.toolContext();
  const { groups, loose } = dialGroups(tool);
  type Dial = ReturnType<typeof dialGroups>['loose'][number];

  const value = (c: Dial) => (
    <Slider
      slim
      orientation="horizontal"
      label={labelOf(c, tool)}
      value={store.value(c.id)}
      min={c.min}
      max={c.max}
      format={c.format}
      onChange={(v) => store.setValue(c.id, v)}
    />
  );

  const property = (c: Dial) => {
    const [lo, hi] = store.range(c.id);
    return (
      <div key={c.id} className="pp-prop">
        {value(c)}
        <RangeSlider
          slim
          label="Range"
          low={lo}
          high={hi}
          min={c.min}
          max={c.max}
          format={c.format}
          onChange={(a, b) => store.setRange(c.id, a, b)}
        />
      </div>
    );
  };

  return (
    <div className="pp">
      {groups.map((g) => (
        <section key={g.macro.id} className="pp-group">
          <div className="pp-head">
            {value(g.macro)}
            <span className="pp-parked">sweeps the ranges below</span>
          </div>
          <div className="pp-under">{g.under.map(property)}</div>
        </section>
      ))}
      {loose.length > 0 && (
        <section className="pp-group">
          <div className="pp-under">{loose.map((c) => (
            <div key={c.id} className="pp-prop">{value(c)}</div>
          ))}</div>
        </section>
      )}
      <BareOil store={store} />
    </div>
  );
}

/**
 * Step 0 of the oil rebuild (docs/20 §4, §14) — the six behaviours that were
 * added to oil, each with its own switch.
 *
 * Every label says what should come BACK when you switch it off, because each
 * one was added to cure exactly that complaint. So the tooltip is the test, not
 * a description of the code.
 *
 * Oil only, and it only appears for oil: a wash paints identically whatever
 * these say (verified, docs/20 §14d), so showing them for watercolour would be
 * offering a control that does nothing.
 */
const OIL_STEPS: Array<{ bit: number; name: string; off: string }> = [
  { bit: 1, name: 'bridging',
    off: 'Off: the canvas weave never disappears. Lay paint as thick as you like and the texture still prints through every layer.' },
  { bit: 2, name: 'contact ramp',
    off: 'Off: a light touch goes back to a thin even veil instead of breaking into opaque flecks on the high points with bare canvas between. No scumbling.' },
  { bit: 4, name: 'comb settling',
    off: 'Off: every stroke keeps the full ridged comb of the bristles, unsettled.' },
  { bit: 8, name: 'trading',
    off: 'Off: cross a wet colour and the brush picks none of it up. Only shows when two DIFFERENT colours meet, and does nothing at all unless release is on too.' },
  { bit: 16, name: 'smearing',
    off: 'Off: paint already on the canvas stops moving. Drag through a wet stroke and it just sits there.' },
  { bit: 32, name: 'release',
    off: 'Off: a dark outline appears under every crossing. The heaviest of the six — it decides how much paint comes back off the canvas onto the brush.' },
];

function BareOil({ store }: { store: StudioStore }) {
  if (store.activeDry || store.wetMedium.slug !== 'oil') return null;
  return (
    <section className="pp-group oil-steps">
      <div className="pp-head"><span className="oil-title">bare oil</span></div>
      <p className="oil-hint">
        Six things were added to oil, each to cure something you reported. Turn
        one off and its complaint should come back.
      </p>
      {OIL_STEPS.map((s) => (
        <Toggle key={s.bit} className="oil-row" title={s.off}
          aria-label={s.name}
          isSelected={(store.oilFlags & s.bit) !== 0}
          onChange={(v) => store.setOilBehaviour(s.bit, v)}>
          <span>{s.name}</span>
          <span className="oil-dot" aria-hidden="true" />
        </Toggle>
      ))}
      <div className="oil-btns">
        <Btn className="pal-btn" title="Every behaviour off. Nobody has ever seen this."
          onPress={() => store.setOilBehaviours(0)}>bare oil</Btn>
        <Btn className="pal-btn" title="Every behaviour on — the paint as it ships."
          onPress={() => store.setOilBehaviours(63)}>as it ships</Btn>
      </div>
      <p className="oil-hint">
        Trading only shows when two <em>different</em> colours meet, and needs
        release on as well. Cross a blue with a yellow to see it.
      </p>
    </section>
  );
}

function TiltPad({ store }: { store: StudioStore }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const padRef = useRef<HTMLDivElement>(null);

  const send = (x: number, y: number) => {
    store.events.onTiltChange?.(x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y)));
  };
  const clamp = (x: number, y: number) => {
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  };

  /* The gesture belongs to the pad, not the puck. The puck is a 20px marker
     with pointer-events off — attaching the drag to it meant nothing could
     ever reach it, which is why the window opened and then did nothing. */
  const moveProps = useDraggable((dx, dy) => {
    const radius = Math.max(1, (padRef.current?.getBoundingClientRect().width ?? 160) / 2 - 10);
    setPos((p) => {
      const next = clamp(p.x + dx / radius, p.y + dy / radius);
      send(next.x, next.y);
      return next;
    });
  });

  /* Pressing anywhere on the pad puts the downhill there, the way the original
     did. useMove reports deltas, so the absolute landing point has to be taken
     from the press itself. */
  const placeAt = (clientX: number, clientY: number) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const radius = Math.max(1, rect.width / 2 - 10);
    const next = clamp(
      (clientX - (rect.left + rect.width / 2)) / radius,
      (clientY - (rect.top + rect.height / 2)) / radius,
    );
    setPos(next);
    send(next.x, next.y);
  };

  const radius = ((padRef.current?.getBoundingClientRect().width ?? 160) / 2) - 10;
  const degrees = Math.round((Math.asin(Math.min(1, Math.hypot(pos.x, pos.y))) * 180) / Math.PI);

  return (
    <>
      <div
        {...moveProps}
        ref={padRef}
        className="st-tiltpad"
        role="application"
        tabIndex={0}
        aria-label="Press or drag toward the downhill direction. Arrow keys tilt the board."
        onPointerDown={(e) => placeAt(e.clientX, e.clientY)}
      >
        <span className="st-tiltpuck"
          style={{ transform: `translate(${pos.x * radius}px, ${pos.y * radius}px)` }} />
      </div>
      <div className="st-tiltfoot">
        <span>{degrees === 0 ? 'level' : `${degrees}\u00b0 downhill`}</span>
        <Btn className="st-tiltlevel" aria-label="Return the board to level"
          onPress={() => { setPos({ x: 0, y: 0 }); send(0, 0); }}>Level</Btn>
      </div>
    </>
  );
}
