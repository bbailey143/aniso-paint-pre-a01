/*
 * The pieces that used to be hand-written.
 *
 * Every one of these replaces something I built by hand and then fixed twice.
 * The sliders had the same `setPointerCapture` failure in both orientations;
 * the sheet was a div with a scrim and no focus handling; the window drag lost
 * its listeners if the pointer left the title bar; the title bar had to
 * discriminate tap from drag by measuring pixels.
 *
 * `usePress`, `useMove`, `useSlider` and `useModalOverlay` do all of that,
 * across mouse, touch, pen and keyboard, and they were doing it correctly
 * before I wrote a line. The styling is unchanged — these are the headless
 * hooks, so the CSS from the hand-built version carries over as it is.
 */

import { useId, useRef, type ReactNode, type RefObject } from 'react';
import {
  FocusScope, useButton, useDialog, useFocusRing, useModalOverlay, useMove,
  useSlider, useSliderThumb, useToggleButton, mergeProps, Overlay, VisuallyHidden,
} from 'react-aria';
import { useOverlayTriggerState, useSliderState, useToggleState } from 'react-stately';

/* ------------------------------------------------------------------ button */

interface BtnProps {
  onPress(): void;
  className?: string;
  title?: string;
  'aria-label'?: string;
  children: ReactNode;
}

export function Btn({ onPress, className, children, ...rest }: BtnProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton({ onPress, ...rest }, ref);
  const { focusProps, isFocusVisible } = useFocusRing();
  return (
    <button
      {...mergeProps(buttonProps, focusProps)}
      ref={ref}
      className={`${className ?? ''}${isFocusVisible ? ' st-focus' : ''}`}
      title={rest.title}
    >
      {children}
    </button>
  );
}

export function Toggle({ isSelected, onChange, className, children, ...rest }: {
  isSelected: boolean; onChange(v: boolean): void; className?: string;
  title?: string; 'aria-label'?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const state = useToggleState({ isSelected, onChange });
  const { buttonProps } = useToggleButton({ ...rest }, state, ref);
  const { focusProps, isFocusVisible } = useFocusRing();
  return (
    <button
      {...mergeProps(buttonProps, focusProps)}
      ref={ref}
      className={`${className ?? ''}${isSelected ? ' on' : ''}${isFocusVisible ? ' st-focus' : ''}`}
      title={rest.title}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ slider */

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  orientation?: 'vertical' | 'horizontal';
  format(v: number): string;
  onChange(v: number): void;
  /** Shown at each end of a horizontal slider instead of a numeric readout. */
  ends?: [string, string];
  /**
   * The thin form: a hairline track and a small round handle, name on the left
   * and reading on the right.
   *
   * The fat pill suits the paint strip, where a slider is the whole control and
   * has to be hit with a thumb on a tablet. A column of twelve of them does not
   * suit anything — asked for on 2026-08-25: "you're holding onto the regular
   * sliders like they're sacred... let's make the space clean and let it
   * breathe."
   */
  slim?: boolean;
}

/**
 * One slider for both orientations.
 *
 * useSlider brings arrow keys, Home/End, page steps and the ARIA wiring, none
 * of which the hand-written pair had. The visual parts keep their old class
 * names so the styling did not have to change.
 */
export function Slider(props: SliderProps) {
  const { label, format, orientation = 'vertical', ends } = props;
  const trackRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const state = useSliderState({
    numberFormatter: { format: (v: number) => format(v) } as Intl.NumberFormat,
    minValue: props.min,
    maxValue: props.max,
    step: props.step ?? (props.max - props.min) / 200,
    orientation,
    label,
    value: [props.value],
    onChange: ([v]) => props.onChange(v),
  });
  const { groupProps, trackProps, labelProps, outputProps } =
    useSlider({ label, orientation }, state, trackRef);
  const { thumbProps, inputProps } = useSliderThumb({ index: 0, trackRef, inputRef }, state);
  const { focusProps, isFocusVisible } = useFocusRing();

  const pct = state.getThumbPercent(0);
  const KNOB = props.slim ? 16 : 26;
  // The thumb travels inside the track, so a full circle is always visible.
  const along = `calc(${pct * 100}% - ${pct * KNOB}px)`;
  const filled = `calc(${pct * 100}% - ${pct * KNOB}px + ${KNOB / 2}px)`;

  if (orientation === 'horizontal') {
    /* Two horizontal forms, told apart by whether the caller named the ends.
       `ends` means a two-ended scale — Slow to Fast — where the heading above
       already says what is being set and a number would mean nothing. Without
       them it is a dial in its own right and needs both its name and its
       reading, which is what the paint strip wants. */
    const track = (
      <div {...trackProps} ref={trackRef} className="st-htrack">
        <div className="st-hfill" style={{ width: filled }} />
        <div
          {...mergeProps(thumbProps, focusProps)}
          className={`st-knob st-knob-h${isFocusVisible ? ' st-focus' : ''}`}
          style={{ left: along, width: KNOB, height: KNOB }}
        >
          <VisuallyHidden><input ref={inputRef} {...inputProps} /></VisuallyHidden>
        </div>
      </div>
    );
    if (!ends) {
      return (
        <div {...groupProps} className={`st-hslider st-hlabelled${props.slim ? ' st-slim' : ''}`}>
          <span {...labelProps} className="st-hname">{label}</span>
          <output {...outputProps} className="st-hval">{format(props.value)}</output>
          {track}
        </div>
      );
    }
    return (
      <div {...groupProps} className="st-hslider">
        <VisuallyHidden><span {...labelProps}>{label}</span></VisuallyHidden>
        <span className="st-hcap">{ends[0]}</span>
        {track}
        <span className="st-hcap">{ends[1]}</span>
      </div>
    );
  }

  return (
    <div {...groupProps} className="st-slider">
      <span {...labelProps} className="st-cap">{label}</span>
      <div {...trackProps} ref={trackRef} className="st-track">
        <div className="st-fill" style={{ height: filled }} />
        <div
          {...mergeProps(thumbProps, focusProps)}
          className={`st-knob${isFocusVisible ? ' st-focus' : ''}`}
          style={{ bottom: along }}
        >
          <VisuallyHidden><input ref={inputRef} {...inputProps} /></VisuallyHidden>
        </div>
      </div>
      <output {...outputProps} className="st-val">{format(props.value)}</output>
    </div>
  );
}

/* ------------------------------------------------------------------- sheet */

/**
 * The bottom sheet, as a real dialog.
 *
 * It now traps focus while it is open, restores focus to whatever opened it,
 * closes on Escape, and is announced as a dialog. The hand-built version did
 * none of that — it was a div with a dimmed background.
 */
export function Sheet({ isOpen, onClose, title, children }: {
  isOpen: boolean; onClose(): void; title: string; children: ReactNode;
}) {
  const state = useOverlayTriggerState({ isOpen, onOpenChange: (o) => { if (!o) onClose(); } });
  if (!state.isOpen) return null;
  return (
    <Overlay>
      <SheetBody state={state} title={title}>{children}</SheetBody>
    </Overlay>
  );
}

function SheetBody({ state, title, children }: {
  state: ReturnType<typeof useOverlayTriggerState>; title: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { modalProps, underlayProps } = useModalOverlay({ isDismissable: true }, state, ref);
  // The title id is given rather than left to be discovered. useDialog can
  // generate one, but it only keeps it if it finds a matching element during a
  // layout pass, and it was coming back empty — leaving the dialog unnamed to
  // anything reading the page aloud.
  const titleId = useId();
  const { dialogProps } = useDialog({ 'aria-labelledby': titleId }, ref);
  const titleProps = { id: titleId };
  return (
    <div {...underlayProps} className="st-scrim open">
      {/* Contain keeps Tab inside the sheet while it is open, restoreFocus puts
          it back on whatever opened it, and autoFocus is what lets Escape reach
          the overlay at all — a dialog nothing is focused inside cannot hear a
          key press. The hand-written sheet did none of these. */}
      <FocusScope contain restoreFocus autoFocus>
        <div {...mergeProps(modalProps, dialogProps)} ref={ref} className="st-sheet open">
          <div className="st-grab" />
          <div className="st-head">
            <h2 {...titleProps}>{title}</h2>
            <span className="st-spacer" />
            <Btn className="st-icon" aria-label="Close" onPress={() => state.close()}>✕</Btn>
          </div>
          <div className="st-body">{children}</div>
        </div>
      </FocusScope>
    </div>
  );
}

/* -------------------------------------------------------------------- move */

/**
 * Dragging, for the HUD windows and the tilt puck.
 *
 * useMove reports movement the same way whether it came from a finger, a
 * pointer or the arrow keys, and it cannot lose the gesture halfway through —
 * which is exactly what went wrong twice in the version this replaces.
 */
export function useDraggable(
  onMove: (dx: number, dy: number) => void,
  onStart?: () => void,
  onEnd?: () => void,
) {
  const { moveProps } = useMove({
    onMoveStart: () => onStart?.(),
    onMove: (e) => onMove(e.deltaX, e.deltaY),
    onMoveEnd: () => onEnd?.(),
  });
  return moveProps;
}

export type Ref<T> = RefObject<T | null>;

/* ------------------------------------------------------------ range slider */

/**
 * A slider with two handles: a low end and a high end.
 *
 * Asked for on 2026-08-25 so each paint property can be given the stretch it is
 * allowed to travel over, rather than one fixed number. The macro dial above a
 * group will sweep between these two once it is wired back up, so setting them
 * IS the tuning.
 *
 * Same hooks as the single slider, so both handles get arrow keys, Home/End and
 * page steps for free.
 */
export function RangeSlider(props: {
  label: string;
  low: number;
  high: number;
  min: number;
  max: number;
  step?: number;
  format(v: number): string;
  onChange(low: number, high: number): void;
  slim?: boolean;
}) {
  const { label, format } = props;
  const trackRef = useRef<HTMLDivElement>(null);
  const loRef = useRef<HTMLInputElement>(null);
  const hiRef = useRef<HTMLInputElement>(null);

  const state = useSliderState({
    numberFormatter: { format: (v: number) => format(v) } as Intl.NumberFormat,
    minValue: props.min,
    maxValue: props.max,
    step: props.step ?? (props.max - props.min) / 200,
    orientation: 'horizontal',
    label,
    value: [props.low, props.high],
    onChange: ([lo, hi]) => props.onChange(lo, hi),
  });
  const { groupProps, trackProps, labelProps, outputProps } =
    useSlider({ label, orientation: 'horizontal' }, state, trackRef);
  const lo = useSliderThumb({ index: 0, trackRef, inputRef: loRef }, state);
  const hi = useSliderThumb({ index: 1, trackRef, inputRef: hiRef }, state);
  const loRing = useFocusRing();
  const hiRing = useFocusRing();

  const KNOB = props.slim ? 16 : 26;
  const pos = (i: number) => {
    const p = state.getThumbPercent(i);
    return `calc(${p * 100}% - ${p * KNOB}px)`;
  };
  const a = state.getThumbPercent(0);
  const b = state.getThumbPercent(1);

  return (
    <div {...groupProps} className={`st-hslider st-hlabelled st-range${props.slim ? ' st-slim' : ''}`}>
      <span {...labelProps} className="st-hname">{label}</span>
      <output {...outputProps} className="st-hval">
        {format(props.low)}
        {'–'}
        {format(props.high)}
      </output>
      <div {...trackProps} ref={trackRef} className="st-htrack">
        {/* The span between the handles is the part that means something, so it
            is the part that is lit. */}
        <div
          className="st-rfill"
          style={{
            left: `calc(${a * 100}% - ${a * KNOB}px + ${KNOB / 2}px)`,
            right: `calc(${(1 - b) * 100}% + ${b * KNOB}px - ${KNOB / 2}px)`,
          }}
        />
        <div
          {...mergeProps(lo.thumbProps, loRing.focusProps)}
          className={`st-knob st-knob-h st-knob-r${loRing.isFocusVisible ? ' st-focus' : ''}`}
          style={{ left: pos(0), width: KNOB, height: KNOB }}
        >
          <VisuallyHidden><input ref={loRef} {...lo.inputProps} /></VisuallyHidden>
        </div>
        <div
          {...mergeProps(hi.thumbProps, hiRing.focusProps)}
          className={`st-knob st-knob-h st-knob-r${hiRing.isFocusVisible ? ' st-focus' : ''}`}
          style={{ left: pos(1), width: KNOB, height: KNOB }}
        >
          <VisuallyHidden><input ref={hiRef} {...hi.inputProps} /></VisuallyHidden>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ drawer */

/**
 * A drawer that comes in from the right.
 *
 * The same dialog machinery as the bottom sheet: focus trapped while it is
 * open, focus restored to whatever opened it, Escape closes, announced as a
 * dialog. It differs only in where it comes from and in being tall rather than
 * wide, which is what a column of properties wants.
 */
export function Drawer({ isOpen, onClose, title, children }: {
  isOpen: boolean; onClose(): void; title: string; children: ReactNode;
}) {
  const state = useOverlayTriggerState({ isOpen, onOpenChange: (o) => { if (!o) onClose(); } });
  if (!state.isOpen) return null;
  return (
    <Overlay>
      <DrawerBody state={state} title={title}>{children}</DrawerBody>
    </Overlay>
  );
}

function DrawerBody({ state, title, children }: {
  state: ReturnType<typeof useOverlayTriggerState>; title: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { modalProps, underlayProps } = useModalOverlay({ isDismissable: true }, state, ref);
  const titleId = useId();
  const { dialogProps } = useDialog({ 'aria-labelledby': titleId }, ref);
  return (
    <div {...underlayProps} className="st-scrim open">
      <FocusScope contain restoreFocus autoFocus>
        <div {...mergeProps(modalProps, dialogProps)} ref={ref} className="st-drawer open">
          <div className="st-head">
            <h2 id={titleId}>{title}</h2>
            <span className="st-spacer" />
            <Btn className="st-icon" aria-label="Close" onPress={() => state.close()}>&#10005;</Btn>
          </div>
          <div className="st-body">{children}</div>
        </div>
      </FocusScope>
    </div>
  );
}
