/*
 * The dock windows.
 *
 * Two kinds live here and they behave identically once framed:
 *
 *   adopted — markup that already exists in index.html. The element is moved
 *             into the frame rather than re-rendered, so `main.ts` keeps
 *             writing to `#g-water` and friends by id, unaware.
 *   drawn   — React content, like the tilt pad.
 *
 * The tilt pad was previously rendered loose in the studio root with no frame
 * around it, so `width: 100%` meant the width of the screen and it came out
 * 1280 by 1318. A window is not something to reimplement per tool.
 *
 * Dragging is `useMove`: it reports movement the same way from a finger, a
 * pointer or the arrow keys, and cannot lose the gesture halfway — which is
 * what went wrong twice in the hand-written manager.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useButton, useFocusRing, useMove, mergeProps } from 'react-aria';
import { Btn } from './widgets';

interface Adopted {
  id: string;
  title: string;
  el: HTMLElement;
}

export interface ToolWindow {
  id: string;
  title: string;
  node: ReactNode;
  /** Closing a tool window is the tool's business — it owns the dock button. */
  onClose(): void;
}

const ADOPT: Array<{ selector: string; title: string }> = [
  { selector: '#hud', title: 'Aniso-paint' },
  { selector: '#stylus', title: 'Stylus' },
  { selector: '#gauges', title: 'Conservation' },
  // Not "Conte contact". Every bare stick presents a face — chalk, a pastel, a
  // crayon with the paper off — and naming the window after the first medium
  // that needed it would have to be undone for the second.
  { selector: '#conte-viewer', title: 'Stick contact' },
];

/** Adopted windows that only make sense for certain tools. */
const CONDITIONAL: Record<string, 'stick'> = { 'conte-viewer': 'stick' };

type Placement = { docked: true } | { docked: false; x: number; y: number };
const STORE = 'aniso.hud.v2';
const DOCK_REACH = 130;

export function HudWindows({ tools = [], stickInHand = false, readoutsOn = false }: {
  tools?: ToolWindow[];
  /** Whether the tool in hand is a bare stick with faces to show. */
  stickInHand?: boolean;
  /** Closing readouts individually is undone by the numbers toggle. */
  readoutsOn?: boolean;
}) {
  const [panels, setPanels] = useState<Adopted[]>([]);
  const [place, setPlace] = useState<Record<string, Placement>>(() => {
    try { return JSON.parse(localStorage.getItem(STORE) ?? '{}'); } catch { return {}; }
  });
  const [min, setMin] = useState<Record<string, boolean>>({});
  /* A readout closed with its X stays shut until the numbers button is turned
     off and on again. That is the way back, and it is the same button that put
     them there. Tool windows have their own dock button instead. */
  const [shut, setShut] = useState<Record<string, boolean>>({});
  useEffect(() => { if (readoutsOn) setShut({}); }, [readoutsOn]);

  useEffect(() => {
    const found: Adopted[] = [];
    for (const spec of ADOPT) {
      const el = document.querySelector<HTMLElement>(spec.selector);
      if (!el) continue;
      el.classList.remove('panel');
      el.removeAttribute('style');
      found.push({ id: el.id, title: spec.title, el });
    }
    setPanels(found);
    /* They are ours now, so they may be seen. Until this line they are hidden
       by style.css — see the note there about the old app appearing to flash
       up and be replaced. */
    document.body.classList.add('studio-ready');
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(place)); } catch { /* private mode */ }
  }, [place]);

  const wanted = panels.filter((p) => {
    const needs = CONDITIONAL[p.id];
    return needs === undefined || (needs === 'stick' && stickInHand);
  });

  const all = [
    ...wanted.filter((p) => !shut[p.id]).map((p) => ({
      id: p.id, title: p.title, adopt: p.el, node: null, readout: true,
      onClose: () => setShut((s) => ({ ...s, [p.id]: true })),
    })),
    ...tools.map((t) => ({
      id: t.id, title: t.title, adopt: null, node: t.node, readout: false, onClose: t.onClose,
    })),
  ];
  const at = (id: string) => place[id] ?? { docked: true };

  return (
    <>
      <div className="hud-dock">
        {all.filter((w) => at(w.id).docked).map((w) => (
          <Window key={w.id} {...w} minimised={!!min[w.id]}
            onMinimise={() => setMin((m) => ({ ...m, [w.id]: !m[w.id] }))}
            onMoveTo={(x, y) => setPlace((s) => ({ ...s, [w.id]: { docked: false, x, y } }))} />
        ))}
      </div>
      <div className="hud-free">
        {all.filter((w) => !at(w.id).docked).map((w) => {
          const p = at(w.id) as { docked: false; x: number; y: number };
          return (
            <Window key={w.id} {...w} minimised={!!min[w.id]} at={p}
              onMinimise={() => setMin((m) => ({ ...m, [w.id]: !m[w.id] }))}
              onMoveTo={(x, y) => setPlace((s) => ({ ...s, [w.id]: { docked: false, x, y } }))}
              onDock={() => setPlace((s) => ({ ...s, [w.id]: { docked: true } }))} />
          );
        })}
      </div>
    </>
  );
}

function Window({ title, adopt, node, readout, minimised, at, onMinimise, onMoveTo, onDock, onClose }: {
  id: string;
  title: string;
  adopt: HTMLElement | null;
  node: ReactNode;
  readout: boolean;
  minimised: boolean;
  at?: { x: number; y: number };
  onMinimise(): void;
  onMoveTo(x: number, y: number): void;
  onDock?(): void;
  onClose(): void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const at_ = useRef(at);
  at_.current = at;

  useEffect(() => {
    const body = bodyRef.current;
    if (adopt && body && adopt.parentElement !== body) body.appendChild(adopt);
  });

  const { buttonProps } = useButton({
    elementType: 'div',
    onPress: () => { if (!dragged.current) onMinimise(); },
  }, barRef as React.RefObject<HTMLDivElement>);
  const { focusProps, isFocusVisible } = useFocusRing();

  const { moveProps } = useMove({
    onMoveStart: () => { dragged.current = false; },
    onMove: (e) => {
      dragged.current = true;
      const box = hostRef.current?.getBoundingClientRect();
      if (!box) return;
      onMoveTo((at_.current?.x ?? box.left) + e.deltaX, (at_.current?.y ?? box.top) + e.deltaY);
    },
    onMoveEnd: () => {
      const box = hostRef.current?.getBoundingClientRect();
      if (box && onDock && window.innerWidth - (box.left + box.width / 2) <= DOCK_REACH) onDock();
    },
  });

  return (
    <div
      ref={hostRef}
      className={`hud-win${at ? ' floating' : ''}${minimised ? ' min' : ''}`}
      data-role={readout ? 'readout' : undefined}
      style={at ? { left: at.x, top: at.y } : undefined}
    >
      <div
        {...mergeProps(buttonProps, moveProps, focusProps)}
        ref={barRef}
        className={`hud-bar${isFocusVisible ? ' st-focus' : ''}`}
        aria-label={`${title} — tap to minimise, drag to move`}
      >
        <span className="hud-name">{title}</span>
        <span className="hud-mark" aria-hidden="true">{minimised ? '+' : '–'}</span>
      </div>
      {/* Outside the title bar's press area, so closing is never mistaken for
          minimising and a drag never fires it. */}
      <Btn className="hud-close" aria-label={`Close ${title}`} title="Close" onPress={onClose}>✕</Btn>
      <div className="hud-body" ref={bodyRef}>{node}</div>
    </div>
  );
}
