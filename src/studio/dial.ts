// A rotary dial.
//
// Studios are where the artist builds their materials, and a rack of dials
// reads as equipment in a way a column of sliders never does. That is not
// decoration: a dial is compact enough that eight of them fit where four
// sliders would, so a whole material's handling can sit in one glance.
//
// IT TURNS UNDER YOUR FINGER. Bartford tried the vertical-fader version and
// called it awkward and guessy, which it was — a knob that does not rotate asks
// you to remember which way to pull.
//
// The two real problems with rotary tracking are avoided rather than accepted:
//
//   * It follows the CHANGE in angle, never the absolute angle. So taking hold
//     of a knob never snaps its value to wherever your finger happens to land;
//     it turns by exactly as far as you turn it.
//   * There is a dead zone at the centre. Angle is meaningless within a few
//     pixels of the middle — a hair of movement swings it wildly — so inside
//     that radius the value simply holds.
//
// Hold shift for fine adjustment. Double-tap to put it back where it started.

export interface DialOptions {
  label: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  /** The sourced value. Double-tap returns here, and drifting off it shows. */
  defaultValue?: number;
  /** Suffix for the readout — 'x', '°', 'µm'. Bare numbers otherwise. */
  unit?: string;
  /** Digits in the readout. Some material settings are genuinely small and
   *  rounding them to two would show every value on the dial as 0.00. */
  decimals?: number;
  /**
   * Fill the arc outward from the centre rather than from the left end. For
   * settings whose zero is the middle and whose sign means something — a value
   * shift that goes lighter or darker, a tilt that goes left or right.
   */
  bipolar?: boolean;
  onChange?(value: number, final: boolean): void;
}

const SWEEP = 270;        // degrees of travel, gap at the bottom like a real knob
const START = -135;       // from twelve o'clock, clockwise positive
/** Degrees of finger rotation for the whole range — the same 270 the face
 *  shows, so a turn of the knob matches the turn of your hand. */
const DRAG_FULL_DEG = SWEEP;
/** Inside this radius the angle is noise, so the value holds. */
const DEAD_ZONE_PX = 12;

/** Polar to SVG, with 0 degrees at twelve o'clock. */
function point(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  if (Math.abs(to - from) < 0.01) return '';
  const s = point(cx, cy, r, from);
  const e = point(cx, cy, r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

export class Dial {
  readonly root: HTMLElement;
  // Only the four the constructor actually resolves are Required here; the
  // genuinely optional ones stay optional or every new option becomes mandatory.
  private opts: Required<Omit<DialOptions, 'onChange' | 'unit' | 'bipolar' | 'decimals'>> & DialOptions;
  private val: number;
  private fillEl!: SVGPathElement;
  private needleEl!: SVGLineElement;
  private valueEl!: HTMLElement;
  private dragging = false;
  private lastAngle = 0;
  /** End of the last interaction, and whether it was a tap rather than a drag.
   *  Both are needed: a double-tap is two quick TAPS, and timing alone would
   *  make a second quick grab-and-adjust throw the first adjustment away. */
  private lastEnd = 0;
  private lastWasTap = false;
  private moved = false;

  constructor(mount: HTMLElement, opts: DialOptions) {
    const min = opts.min ?? 0;
    const max = opts.max ?? 1;
    // Caller's options FIRST, resolved values after. The other way round lets
    // an absent `min` in the spread overwrite the default that was just worked
    // out, which is undefined rather than 0 and quietly breaks every angle.
    this.opts = {
      ...opts,
      min, max,
      step: opts.step ?? 0.01,
      value: opts.value ?? min,
      defaultValue: opts.defaultValue ?? opts.value ?? min,
    };
    this.val = this.opts.value;

    this.root = document.createElement('div');
    this.root.className = 'st-dial';
    this.root.tabIndex = 0;
    this.root.setAttribute('role', 'slider');
    this.root.setAttribute('aria-label', opts.label);
    this.root.innerHTML = this.template();
    mount.appendChild(this.root);

    this.fillEl = this.root.querySelector('.st-dial-fill')!;
    this.needleEl = this.root.querySelector('.st-dial-needle')!;
    this.valueEl = this.root.querySelector('.st-dial-value')!;

    this.root.addEventListener('pointerdown', this.onDown);
    this.root.addEventListener('pointermove', this.onMove);
    this.root.addEventListener('pointerup', this.onUp);
    this.root.addEventListener('pointercancel', this.onUp);
    this.root.addEventListener('keydown', this.onKey);
    // A knob under a finger must not also scroll the panel behind it.
    this.root.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

    this.render();
  }

  get value() { return this.val; }
  set value(v: number) { this.setValue(v, true); }

  private template() {
    const { label } = this.opts;
    // The track is a full-sweep arc; the fill and needle are redrawn per value.
    return `
      <svg class="st-dial-face" viewBox="0 0 100 100" aria-hidden="true">
        <path class="st-dial-track" d="${arcPath(50, 50, 38, START, START + SWEEP)}" />
        <path class="st-dial-fill" d="" />
        <circle class="st-dial-cap" cx="50" cy="50" r="26" />
        <line class="st-dial-needle" x1="50" y1="50" x2="50" y2="18" />
      </svg>
      <span class="st-dial-label">${label}</span>
      <span class="st-dial-value">—</span>`;
  }

  private clamp(v: number) {
    return Math.min(this.opts.max, Math.max(this.opts.min, v));
  }

  private setValue(v: number, final: boolean) {
    const { step, min } = this.opts;
    const snapped = Math.round((this.clamp(v) - min) / step) * step + min;
    // Snapping in float leaves 0.30000000000000004 lying around, which then
    // shows up in a readout and in a saved material row.
    const next = parseFloat(snapped.toFixed(6));
    if (next === this.val) {
      if (final) this.opts.onChange?.(this.val, true);
      return;
    }
    this.val = next;
    this.render();
    this.opts.onChange?.(this.val, final);
  }

  private render() {
    const { min, max, defaultValue, unit, bipolar, label } = this.opts;
    const t = (this.val - min) / Math.max(1e-9, max - min);
    const angle = START + t * SWEEP;

    // Bipolar fills outward from whatever angle the centre sits at, so a value
    // either side of zero reads as a direction and not just a bigger number.
    const zero = bipolar ? START + ((0 - min) / Math.max(1e-9, max - min)) * SWEEP : START;
    this.fillEl.setAttribute('d', arcPath(50, 50, 38, Math.min(zero, angle), Math.max(zero, angle)));

    const tip = point(50, 50, 32, angle);
    const base = point(50, 50, 14, angle);
    this.needleEl.setAttribute('x1', base.x.toFixed(2));
    this.needleEl.setAttribute('y1', base.y.toFixed(2));
    this.needleEl.setAttribute('x2', tip.x.toFixed(2));
    this.needleEl.setAttribute('y2', tip.y.toFixed(2));

    const shown = this.val.toFixed(this.opts.decimals ?? (this.opts.step >= 1 ? 0 : 2));
    this.valueEl.textContent = unit ? `${shown}${unit}` : shown;

    const edited = Math.abs(this.val - defaultValue) > 1e-9;
    this.root.classList.toggle('is-edited', edited);
    this.root.setAttribute('aria-valuenow', String(this.val));
    this.root.setAttribute('aria-valuemin', String(min));
    this.root.setAttribute('aria-valuemax', String(max));
    this.root.setAttribute('aria-valuetext', `${label} ${shown}${unit ?? ''}`);
  }

  private onDown = (ev: PointerEvent) => {
    if (!ev.isPrimary) return;
    ev.preventDefault();
    // Double-tap returns the dial to the value it was sourced with. On a rack
    // of eight this is the only quick way back from a wrong turn — but it must
    // be two TAPS. Firing on timing alone means a second quick grab, to nudge
    // the value you just set, silently discards it.
    if (this.lastWasTap && ev.timeStamp - this.lastEnd < 320) {
      this.lastWasTap = false;
      this.setValue(this.opts.defaultValue, true);
      return;
    }
    this.moved = false;
    this.dragging = true;
    this.lastAngle = this.angleOf(ev).deg;
    this.root.focus();
    try { this.root.setPointerCapture(ev.pointerId); } catch { /* drag still tracks */ }
  };

  /** Finger angle about the face centre, degrees, zero at twelve o'clock. */
  private angleOf(ev: PointerEvent) {
    const face = this.root.querySelector('.st-dial-face')!.getBoundingClientRect();
    const dx = ev.clientX - (face.left + face.width / 2);
    const dy = ev.clientY - (face.top + face.height / 2);
    return { deg: Math.atan2(dx, -dy) * 180 / Math.PI, r: Math.hypot(dx, dy) };
  }

  private onMove = (ev: PointerEvent) => {
    if (!this.dragging) return;
    ev.preventDefault();
    const { min, max } = this.opts;
    const now = this.angleOf(ev);
    // Wrap the difference into -180..180 so crossing twelve o'clock is a small
    // step forward, not a whole turn backwards.
    let step = now.deg - this.lastAngle;
    if (step > 180) step -= 360;
    if (step < -180) step += 360;
    this.lastAngle = now.deg;
    // Near the middle the angle is noise. Hold the value, but keep tracking the
    // angle, so leaving the dead zone does not jump.
    if (now.r < DEAD_ZONE_PX) return;
    if (Math.abs(step) > 1.5) this.moved = true;
    const fine = ev.shiftKey ? 0.25 : 1;
    this.setValue(this.val + (step / DRAG_FULL_DEG) * (max - min) * fine, false);
  };

  private onUp = (ev: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    this.lastEnd = ev.timeStamp;
    this.lastWasTap = !this.moved;
    try { this.root.releasePointerCapture(ev.pointerId); } catch { /* already released */ }
    this.opts.onChange?.(this.val, true);
  };

  private onKey = (ev: KeyboardEvent) => {
    const { step, min, max } = this.opts;
    const big = (max - min) / 10;
    let next: number | null = null;
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowRight') next = this.val + (ev.shiftKey ? step : big);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowLeft') next = this.val - (ev.shiftKey ? step : big);
    if (ev.key === 'Home') next = min;
    if (ev.key === 'End') next = max;
    if (next === null) return;
    ev.preventDefault();
    this.setValue(next, true);
  };
}
