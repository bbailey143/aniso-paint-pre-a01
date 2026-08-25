/*
 * Angle helpers shared by every gesture that turns the sheet.
 *
 * Both of these exist because a turning gesture is measured as a running sum of
 * small steps, and both the measuring and the summing have a seam in them.
 */

const TAU = Math.PI * 2;
const QUARTER = Math.PI / 2;

/**
 * Fold a difference of two `atan2` readings into the short way round.
 *
 * `atan2` jumps from +PI to -PI as a hand crosses straight-up. Without this, one
 * frame of that crossing reports a nearly full turn and the sheet spins.
 */
export function wrapAngle(a: number): number {
  return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

/**
 * A gentle magnet at each right angle.
 *
 * Getting back to square by hand is otherwise a fussy job — the last two degrees
 * are the hardest to see and the easiest to care about. Within `tol` the sheet
 * settles onto the quarter turn; outside it, the fingers have it exactly.
 *
 * The caller keeps the unsnapped angle and passes it in every time, so leaving a
 * snap costs the same twist that entering it did. Feeding the snapped value back
 * would make each right angle a trap.
 */
export function snapRight(angle: number, tol = 0.06): number {
  const near = Math.round(angle / QUARTER) * QUARTER;
  return Math.abs(angle - near) < tol ? near : angle;
}
