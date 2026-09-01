/**
 * EXPERIMENTAL — lift the pen to swap between painting and smudging.
 *
 * The artist's brief, 2026-08-31: one dial, 0 to 5 seconds. Hold the pen OFF the
 * canvas for that long and the mode flips. Paint becomes Smudge — the brush is
 * empty, lays nothing, and is only good for pushing the oil about. Lift again
 * for the same period and the load comes back, with the same colour and loading
 * as before.
 *
 * The lift is the ONLY trigger. Nothing about painting duration enters into it:
 * a stroke can run as long as it likes, and the brush only changes state while
 * it is off the sheet.
 *
 * OIL ONLY, and experimental — not a decision, not on a card. It is here to be
 * tried and thrown away if it does not feel right.
 *
 * Why a timer and not a frame count: the frame loop stops when the fluid settles
 * (`if (engine.isFluidActive) requestFrame()`), so a lifted pen over a still
 * canvas gets no frames at all and a frame-counted lift would never fire. That
 * is the same class of mistake as a per-frame delta — invariant 2 — in a place
 * the invariant does not literally reach.
 */
export type PaintMode = 'paint' | 'smudge';

export class AutoReload {
  /** 0 disables the whole thing, and is the default. */
  private seconds = 0;
  private mode_: PaintMode = 'paint';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private enabled_ = false;

  /** Told when the mode flips, so the host can empty or refill the brush. */
  onFlip?: (mode: PaintMode) => void;

  get mode(): PaintMode { return this.mode_; }
  /** Whether the badge should be showing at all. */
  get active(): boolean { return this.enabled_ && this.seconds > 0; }
  get delay(): number { return this.seconds; }

  /** 0..5 seconds. 0 turns it off and puts the brush back in Paint. */
  setSeconds(s: number) {
    this.seconds = Math.max(0, Math.min(5, s));
    if (this.seconds === 0) this.reset();
  }

  /** Oil only. Any other medium switches it off and restores Paint. */
  setEnabled(on: boolean) {
    if (this.enabled_ === on) return;
    this.enabled_ = on;
    if (!on) this.reset();
  }

  /** Pen down: whatever lift was in progress no longer counts. */
  penDown() { this.cancel(); }

  /**
   * Pen up: start counting. One flip per lift — holding it up for twice the
   * delay must not flip twice and land you back where you started, which would
   * make a long pause feel like nothing happened.
   */
  penUp() {
    this.cancel();
    if (!this.active) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.mode_ = this.mode_ === 'paint' ? 'smudge' : 'paint';
      this.onFlip?.(this.mode_);
    }, this.seconds * 1000);
  }

  /** Back to a loaded brush, with no flip pending. */
  reset() {
    this.cancel();
    if (this.mode_ !== 'paint') {
      this.mode_ = 'paint';
      this.onFlip?.('paint');
    }
  }

  private cancel() {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
  }
}
