// Pointer deposit — stands in for BrushContact + Transfer until the brush
// engine lands (P5). Writes h_f, M, g[8], w.
//
// It reads its four neighbours' film heights, which it did not use to: the
// smear and the levelling below both need to know which way is downhill. Both
// are written as an OUTFLOW this cell computes from its own state, never as a
// direct write into a neighbour, so the pass still cannot corrupt anything but
// itself and the conservative appliers do the moving.
//
// The stroke arrives as a list of resampled segments, NOT single points: stylus
// samples are far sparser than simulation steps, and depositing once per frame
// at the instantaneous position makes strokes bead into dots (Card 6 TRAP; the
// bench reproduced it). The host resamples the path to <= 1 cell per step and
// this pass integrates distance to each segment.

struct Seg {
  a: vec2<f32>,     // start, grid space
  b: vec2<f32>,     // end, grid space
  radius: f32,      // contact radius in cells
  water: f32,       // water deposited at the centreline
  pigment: f32,     // pigment deposited at the centreline
  reach: f32,       // 0..1 how deep into the paper's tooth this hair reaches
  drag: vec2<f32>,  // this resampled solve step's local hand travel
  stepId: f32,      // segments sharing one resampled brush solve share this id
  _pad: f32,
};

struct Ctl {
  count: f32,
  minX: f32,
  minY: f32,
  maxX: f32,
  maxY: f32,
  /** Where the brush went this frame, in cells. A footprint segment runs ALONG
   * a hair, not along the stroke, so the direction cannot be recovered from the
   * footprint and is carried here instead. */
  travelX: f32,
  travelY: f32,
  /** How hard the brush shoves the paint already on the sheet. 1 is the lab's
   * own share; higher exaggerates it so it can be seen and then pulled back. */
  smear: f32,
  /** How willingly the MATERIAL comes back up off the sheet, per cell
   * travelled. 0 disables pickup entirely, which is every dry medium. */
  upRate: f32,
  /** The TUFT's side of the same exchange: how grabby these bristles are,
   * times how much room they have left. A hog scrubs harder than a sable, and
   * a thirsty brush drinks where a laden one mostly shoves.
   *
   * Computed on the CPU because only the CPU knows the tuft, and applied HERE
   * rather than there so that what the sheet loses and what the brush gains
   * cannot drift apart. */
  brushTake: f32,
  /** The SAME grab with the room term left out. `brushTake / brushGrab` is
   * therefore how much room the tuft has, and `1 -` that is how laden it is:
   * the share of its grab that cannot be drunk and is shoved instead. Sent as
   * the pair rather than as a separate fullness so the two cannot disagree. */
  brushGrab: f32,
};

/**
 * Fixed point for the pickup tally. WGSL has no atomic float, and the tally has
 * to survive being written by every cell under the footprint at once.
 *
 * 1e5 is chosen against the overflow, not for the precision: a heavy cell can
 * give up a couple of units of film, a big footprint is a few thousand cells,
 * and 2 * 1e5 * 3000 is still under a tenth of what a u32 holds. A per-cell
 * ceiling below keeps that arithmetic true even if a cell goes strange.
 */
const TALLY: f32 = 1.0e5;
const TALLY_CEIL: f32 = 64.0;

/**
 * Report `v` as lifted, and return the amount actually reported.
 *
 * The caller must subtract the RETURN value from the sheet, not `v`. Tallying a
 * rounded-down copy of a full-precision subtraction sounds harmless and is not:
 * every cell loses its last fraction, the brush is never told, and that paint
 * simply stops existing. [MEASURED 2026-08-25] Done the wrong way round it came
 * to 0.91 % of everything lifted, twice, to three decimal places. Quantising
 * first makes the two sides the same number by construction and the error zero.
 *
 * Amounts below one part in TALLY therefore lift nothing at all, which is the
 * honest behaviour: below the resolution of the ledger, nothing moved.
 */
fn lift(v: f32, lane: u32) -> f32 {
  let q = u32(clamp(v, 0.0, TALLY_CEIL) * TALLY);
  if (q == 0u) { return 0.0; }
  atomicAdd(&lifted[lane], q);
  return f32(q) / TALLY;
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> segs: array<Seg>;
// The footprint's bounding box. Every cell still copies through (this pass
// ping-pongs, so a skipped cell would lose its contents), but only cells the
// hairs can actually reach pay for the segment loop.
@group(0) @binding(2) var<uniform> C: Ctl;
@group(0) @binding(3) var<storage, read> mix: array<vec4<f32>>;  // 2 x vec4 = 8 slot weights
@group(0) @binding(4) var wet0_in: texture_2d<f32>;
@group(0) @binding(5) var wet1_in: texture_2d<f32>;
@group(0) @binding(6) var wet2_in: texture_2d<f32>;
@group(0) @binding(7) var wet5_in: texture_2d<f32>;
@group(0) @binding(8) var wet0_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(9) var wet1_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(10) var wet2_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(11) var wet5_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(12) var paper: texture_2d<f32>;
/** Where the smear puts what it lifts. Written for EVERY cell, zero where the
 * brush is not, and moved by the same conservative appliers the fluid uses. */
@group(0) @binding(13) var<storage, read_write> flux: array<vec4<f32>>;
/** What the tuft took up this frame, in fixed point: [vehicle, then 8 slots].
 * Cleared before the frame's first chunk, summed across all of them, and handed
 * back to the reservoir on the CPU. */
@group(0) @binding(14) var<storage, read_write> lifted: array<atomic<u32>>;
/** What this dispatch laid into each cell, and how hard the hairs pressed it.
 *  Handed to `level_fresh`, which cannot recompute either without redoing the
 *  whole segment loop four more times over. Written for EVERY cell, so it
 *  clears itself: a cell the brush missed publishes (0, 0) and levels nothing. */
@group(0) @binding(15) var<storage, read_write> fresh: array<vec2<f32>>;

/** A neighbour's film height. Off the sheet reads as nothing there. */
fn filmAt(c: vec2<i32>, n: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  return textureLoad(wet0_in, c, 0).y;
}

/**
 * Levelling under the hairs.
 *
 * The artist's observation, 2026-08-24: the paint looks RIGHT once it has sat
 * and flattened out, and wrong at the moment it is laid — "whatever is
 * happening there should be happening much, much sooner, with much less paint,
 * and not just be an effect of falling over."
 *
 * That is exactly right, and the reason is that the deposit lays a comb. Each
 * hair puts down its own ridge and the gaps between them stay empty, so a
 * fresh stroke is a row of spikes; the slump then spends the next few seconds
 * filling the gaps in, and what it arrives at is the coherent band with gentle
 * striation that a loaded flat brush actually leaves. The settling was doing
 * the brush's job.
 *
 * So: under the hairs the paint is not merely sitting there, it is being
 * SQUEEZED. The stress on it is the brush's, not just its own weight, and
 * paint that would hold its own shape gives way and levels as it is laid. What
 * is left of the yield stress is what the hairs have not already overcome.
 *
 * [MEASURED, and the comment here used to overclaim] `press` comes from the
 * hair's `reach` into the tooth, and with the tuft driven properly onto the
 * paper that quantity sits at 0.995-1.000 at EVERY pressure — the bench reads
 * it straight out of the footprint. So "press harder and it flattens, lift and
 * it holds" is not happening: it flattens the same however lightly you touch,
 * because the number being tested is saturated.
 *
 * That it lands on "levels freely" is what is wanted right now, so this is left
 * alone rather than changed mid-tuning. But the stress here should be the
 * stylus's own pressure rather than how deep a hair sits in the tooth, and a
 * light glaze should not flatten like a loaded scrub. A mouse reports a fixed
 * 0.65 and would never show the difference; an Apple Pencil would.
 *
 * [BOUNDED BY THE FRESH DEPOSIT — and this is the whole of why carving works]
 * Only paint that has JUST left the brush is still flowing. Paint the hairs
 * passed over a moment ago has come to rest, and a groove cut into it is a
 * groove that stays. The first version levelled the whole film, so it filled in
 * every furrow from the sides as fast as the hairs cut them — "it no longer
 * accepts brush marks; it just sort of moves around a bit", exactly as
 * reported. Levelling merges the comb the deposit lays. It must not touch the
 * surface behind the brush.
 */
/**
 * What fraction of the loose film one cell's worth of travel drags along.
 *
 * [MEASURED] Without this the smear ran at its conservation ceiling on every
 * single frame. From the numbers the bench reports — reach saturated at 1.0, so
 * share pinned at its 0.6 cap, coverage 1, dial 2.5 — the amount asked for came
 * to 1.23x the whole film, clipped down to 0.9. Up to ninety per cent of a
 * cell thrown forward per frame. That is not a brush dragging through paint, it
 * is a conveyor belt, and it moves the mark bodily instead of carving it: "it
 * just sort of moves around a bit", and it leaves a step at every frame
 * boundary, running square across the stroke, for the relief to catch.
 *
 * A tenth of the loose film per cell travelled is a drag you can see over a
 * stroke without the paint sloshing. The dial multiplies this, so 1x is a
 * normal smear and the old behaviour is off the top of the scale.
 */
const SMEAR_RATE: f32 = 0.10;

fn levelOut(here: f32, there: f32, yieldHere: f32) -> f32 {
  let excess = (here - there) - yieldHere;
  if (excess <= 0.0) { return 0.0; }
  return min(here * 0.2, excess * P.dt * 0.5 / max(P.viscosity, 0.05));
}

// Distance from point p to segment ab.
fn segDist(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let ab = b - a;
  let len2 = dot(ab, ab);
  if (len2 < 1e-8) { return distance(p, a); }
  let t = clamp(dot(p - a, ab) / len2, 0.0, 1.0);
  return distance(p, a + ab * t);
}

/** One resampled contact's conservative shove fraction and direction.
 *
 * A browser frame may contain one contact or many. Combining the contacts as
 * successive fractions (`1 - product(1-q)`) gives the same total fraction in
 * either packaging, without paying for a full-sheet GPU pass per sub-cell
 * solve. Coverage saturates inside each contact, so adding represented hairs
 * fills the contact rather than inventing force. */
fn shoveStep(coverRaw: f32, reach: f32, motionSum: vec2<f32>, motionWeight: f32,
             laden: f32) -> vec3<f32> {
  if (motionWeight <= 1.0e-6 || reach <= P.yieldStress) {
    return vec3<f32>(0.0);
  }
  let motion = motionSum / motionWeight;
  let speed = length(motion);
  if (speed <= 1.0e-4) { return vec3<f32>(0.0); }
  let contact = clamp(coverRaw, 0.0, 1.0);
  let pressureShare = clamp(
    (reach - P.yieldStress) / max(0.05, 1.0 - P.yieldStress), 0.0, 0.6);
  let pressurePart = pressureShare * min(speed, 4.0) * contact * SMEAR_RATE;
  let grabShare = clamp(C.upRate * C.brushGrab * laden * contact, 0.0, 0.9);
  let grabPart = 1.0 - pow(1.0 - grabShare, min(speed, 4.0));
  let fraction = clamp(
    (pressurePart + grabPart) * max(C.smear, 0.0), 0.0, 0.9);
  return vec3<f32>((motion / speed) * fraction, fraction);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }
  let idx = u32(c.y * n + c.x);

  var w0 = textureLoad(wet0_in, c, 0);
  /* The film BEFORE this pass adds to it. The levelling compares against the
     neighbours' pre-deposit heights, so it has to compare like with like — a
     cell measured after its own deposit would think it was the highest thing
     around simply because it was served first, and the whole band would push
     outward instead of levelling. */
  let filmBefore = w0.y;
  var glo = textureLoad(wet1_in, c, 0);
  var ghi = textureLoad(wet2_in, c, 0);
  var w5 = textureLoad(wet5_in, c, 0);
  /* The colour that was here before the hairs added any. The pickup takes its
     share of THIS and not of the sum, or the brush would immediately lift back
     the paint it had just that instant laid — a loop that changes nothing on
     the sheet and steadily fills the tuft with its own colour. */
  let gloBefore = glo;
  let ghiBefore = ghi;

  /* How hard the hairs are driving this cell, and how much of the cell they
     cover. Two different questions, and running them together is what made the
     first smear invisible: `press` was multiplied by coverage, so a hair
     pressed at 0.6 covering half a cell tested as 0.3 and never once cleared a
     yield stress of 0.34. Nothing was ever lifted.

     Stress decides WHETHER the paint gives way. Coverage decides HOW MUCH.
     They are kept apart now, which is how the lab has it. */
  var press = 0.0;
  var cover = 0.0;
  /** How far the brush travelled WHILE THIS CELL WAS UNDER HAIRS, in cells.
   *  Summed one resampled solve step at a time below; see the pickup block. */
  var rubbed = 0.0;
  /** Vehicle laid into this cell by this pass. The levelling may move this and
   *  no more: paint already on the sheet has come to rest. */
  var laidHere = 0.0;
  /** Pigment laid into THIS cell this frame. The exchange below may trade only
   *  what it gave, so it needs the giving side in scope. */
  var laidPigHere = 0.0;
  /* Accumulate one resampled contact at a time. The segments are emitted in
     solve order, so a changing id closes the previous contact. */
  var stepId = -1.0;
  var stepCover = 0.0;
  var stepReach = 0.0;
  var stepMotion = vec2<f32>(0.0);
  var stepMotionWeight = 0.0;
  var shoveDirection = vec2<f32>(0.0);
  var shoveRemaining = 1.0;
  let tuftRoom = select(
    0.0, clamp(C.brushTake / max(C.brushGrab, 1.0e-6), 0.0, 1.0), C.brushGrab > 0.0);
  let tuftLaden = clamp(1.0 - tuftRoom, 0.0, 1.0);

  let count = i32(C.count);
  let inBox = f32(c.x) >= C.minX && f32(c.x) <= C.maxX
           && f32(c.y) >= C.minY && f32(c.y) <= C.maxY;
  if (count > 0 && inBox) {
    let pos = vec2<f32>(f32(c.x) + 0.5, f32(c.y) + 0.5);
    var water = 0.0;
    var pig = 0.0;

    // Drybrush / scumbling. A hair pressed lightly only skims the peaks of the
    // paper; only when it is driven deeper does it reach into the valleys. So
    // deposition is gated on the paper's own height field against how far this
    // hair reaches, which is what breaks a fast or light stroke into a ragged
    // broken mark on rough paper and lets a slow firm one lay solid. [C97 4.7]
    let toothH = textureLoad(paper, c, 0).x;

    for (var i = 0; i < count; i = i + 1) {
      let s = segs[i];
      if (stepId >= 0.0 && s.stepId != stepId) {
        let action = shoveStep(
          stepCover, stepReach, stepMotion, stepMotionWeight, tuftLaden);
        shoveDirection = shoveDirection + action.xy;
        shoveRemaining = shoveRemaining * (1.0 - action.z);
        // Every step that put a hair on this cell rubbed it by that step's own
        // hand movement. `stepMotion` is the coverage-weighted sum of `s.drag`
        // over this step's segments and `stepMotionWeight` is that same weight,
        // so the quotient is the step's travel exactly.
        if (stepMotionWeight > 0.0) {
          rubbed = rubbed + length(stepMotion / stepMotionWeight);
        }
        stepCover = 0.0;
        stepReach = 0.0;
        stepMotion = vec2<f32>(0.0);
        stepMotionWeight = 0.0;
      }
      stepId = s.stepId;
      let d = segDist(pos, s.a, s.b);
      if (d < s.radius + 0.5) {
        // Cell COVERAGE times the hair's own pressure profile.
        //
        // [TRAP, measured] A bristle genuinely does press hardest along its
        // centreline, so the soft profile is real and stays. But sampling it as
        // `g(d / radius)` — one sample per cell — beads a sub-cell hair into
        // dots on any diagonal, because the hair passes BETWEEN cell centres.
        // Bristles are thin by construction (the radius floors at well under a
        // cell), so this bit every wet stroke too, just less obviously than it
        // bit the ballpoint, since a tuft's many hairs dither each other's gaps.
        // Coverage asks how much of the cell the hair crossed, which is both
        // the physically meaningful question and the one that does not alias.
        let cov = clamp(s.radius - d + 0.5, 0.0, 1.0);
        let prof = 1.0 - 0.55 * clamp(d / max(s.radius, 1e-3), 0.0, 1.0);
        let f = cov * prof;
        // Peaks-first contact. A C1 ramp, not a hard cut, or the mark stipples.
        //
        // Referenced to the sheet's OWN tooth range, for the same reason
        // dry_deposit is: the generator centres every paper on ~0.5 and varies
        // only the spread, so on hot press (0.42-0.58) a lightly-pressed hair
        // needs a height the sheet never reaches and lays nothing at all. Left
        // raw, this speckled every wet stroke on smooth paper — 93 % ripple
        // along a diagonal — which is drybrush appearing where there should be
        // none. A hair rides the high points, and a smooth sheet is nearly all
        // high point.
        let ride = 1.0 - P.toothAmp * (1.0 - toothH);
        let need = 1.0 - clamp(s.reach, 0.0, 1.0);
        // Paint fills the tooth. Once there is a film here the hair is not
        // touching paper any more — it is touching paint — and the drybrush
        // gate has nothing left to break the stroke on. Without this the weave
        // is stamped into every layer however thick it gets, which is exactly
        // why the canvas never disappeared under the paint. Water media keep
        // the old gate untouched.
        var bridged = 0.0;
        if (P.yieldStress > 0.0) {
          /* A paste bridges the valleys before its raw height equals the full
             paper-tooth range: viscosity is precisely its resistance to
             sagging into those valleys. The old denominator was toothAmp alone,
             so measured Oil film 0.018 on Cotton Duck 0.30 filled only 6% of
             the gate per loaded pass and stamped the weave forever. Reuse the
             shared viscosity row: high-viscosity body bridges sooner; every
             zero-yield water medium keeps the old path exactly. [UNVERIFIED —
             artist contact mapping, 2026-08-25.] */
          let bridgeDepth = P.toothAmp * max(1.0 - clamp(P.viscosity, 0.0, 1.0), 0.05);
          bridged = clamp(w0.y / max(bridgeDepth, 0.05), 0.0, 1.0);
        }
        // Written out rather than `mix(base, 1.0, bridged)`: binding 3 in this
        // shader is called `mix`, which shadows the built-in of that name.
        /* Water washes need the broad C1 contact ramp: it prevents stippling.
           A viscous body paint needs the opposite visual structure. Its light
           contact is opaque fragments on the peaks with bare canvas between,
           not a translucent average over every cell. Narrow the same sourced
           ramp as viscosity rises; no pigment is created because `take` still
           only distributes the amount already withdrawn from the hair.
           [UNVERIFIED — artist scumble mapping, 2026-08-25.] */
        var gateHalfWidth = 0.18;
        if (P.yieldStress > 0.0) {
          gateHalfWidth = 0.18 * max(1.0 - clamp(P.viscosity, 0.0, 1.0), 0.15);
        }
        let base = smoothstep(need - gateHalfWidth, need + gateHalfWidth, ride);
        let gate = base + (1.0 - base) * bridged;
        let take = f * gate;
        water = water + take * s.water;
        pig = pig + take * s.pigment;
        press = max(press, clamp(s.reach, 0.0, 1.0));
        cover = cover + f;
        stepCover = stepCover + f;
        stepReach = max(stepReach, clamp(s.reach, 0.0, 1.0));
        stepMotion = stepMotion + s.drag * f;
        stepMotionWeight = stepMotionWeight + f;
      }
    }
    if (stepId >= 0.0) {
      let action = shoveStep(
        stepCover, stepReach, stepMotion, stepMotionWeight, tuftLaden);
      shoveDirection = shoveDirection + action.xy;
      shoveRemaining = shoveRemaining * (1.0 - action.z);
      if (stepMotionWeight > 0.0) {
        rubbed = rubbed + length(stepMotion / stepMotionWeight);
      }
    }

    laidHere = water;
    laidPigHere = pig;
    if (water > 0.0 || pig > 0.0) {
      w0.y = w0.y + water;          // h_f
      w0.x = 1.0;                   // M — wet
      w5.y = 1.0;                   // w — fully wet
      // Pigment split across the active slots by the mix weights.
      glo = glo + mix[0] * pig;
      ghi = ghi + mix[1] * pig;
    }
  }

  /* ---- Pickup: the brush takes paint back UP off the sheet -----------------
   *
   * The other half of the transfer the brush card specifies, and the half that
   * was never built:
   *
   *     toCanvas    = downRate * reservoirQuantity     (the loop above)
   *     toReservoir = upRate   * canvasQuantity        (this)
   *
   * Without it a brush can only add. It cannot lift, cannot scrub, and cannot
   * carry the colour it is dragged through — so every stroke lies on top of
   * what is under it, which is what the artist reported on 2026-08-25 looking
   * at orange laid across blue.
   *
   * [MEASURED, same day, two identical runs] Blue stripe, orange stroke pulled
   * across it: blue reached 6 cells past the crossing and was exactly 0.0000
   * from there on. The stroke was 290 cells long. The only thing moving any
   * blue at all was the smear below, shoving one neighbour at a time.
   *
   * What is taken here LEAVES THE SHEET. That is not a hole in the ledger: the
   * brush is already outside it — every deposit above arrives from the same
   * place — so the sheet's total is meant to fall when a brush lifts, exactly
   * as it rises when one lays. The amount subtracted here is tallied and handed
   * to the reservoir, so the two sides are one subtraction, reported.
   *
   * HOW MUCH, and the mistake that was in here first.
   *
   * [MEASURED, docs/16 E7] The first version multiplied by the frame's travel
   * distance. That was wrong twice over. `cover` below is summed over EVERY
   * hair segment that crossed this cell during the frame, so it already carries
   * how far the brush moved — multiplying by distance on top counts the speed
   * a second time, and it makes the same stroke lift twice as much when it
   * happens to be cut into twice as many frames. That is a per-frame delta,
   * which invariant 2 forbids outright.
   *
   * What it did to the painting: six stacked layers reached a film of 0.256
   * with pickup off and 0.066 with it on, against a canvas whose tooth is 0.30.
   * Three quarters of the paint taken straight back off, the sheet never
   * covered, and the weave showing white through every layer. The artist saw it
   * immediately and described the brush as "skipping along the canvas".
   *
   * So: no distance term. `cover` is the whole of it, clamped at one cell's
   * worth, and the ceiling is what a single frame may ever take.
   */
  // `brushTake` is deliberately NOT in this gate any more: a full brush has a
  // brushTake near zero and must still be able to EXCHANGE. Both rates below
  // come out zero on their own when they should, so nothing runs that should not.
  if (C.upRate > 0.0 && cover > 0.0) {
    /* Adhesion belongs to paint that is setting, not to fully workable oil.
       Applying the whole teflon floor at wetness 1 left dark outlines of the
       lower stroke beneath every crossing. Let a yielding body's existing
       wetness continuum release that floor while it is workable; watercolour
       retains the exact old route. [Codex, 2026-08-25 — kept: it addresses a
       real artefact, and it is not what was emptying the sheet.] */
    let workableBody = select(0.0, clamp(w5.y, 0.0, 1.0), P.yieldStress > 0.0);
    let loose = clamp(1.0 - P.teflonMin * (1.0 - workableBody), 0.0, 1.0);
    /* `brushTake` is the tuft's own grabbiness times the room it has left, and
       it is the term that stops a brush filling past its capacity. It must not
       be bypassed: ~~`max(C.brushTake, workableBody * viscosity)`~~ raised it
       from about 0.2 to 0.85 whenever the paint was workable, which is every
       oil stroke, and with the room clamp gone the tuft finished strokes
       holding 158 % of what it can hold. Reverted 2026-08-25 with E7's numbers;
       ~~`sqrt(cover)`~~ and the ceiling at 0.9 went with it for the same
       reason. If the underlying want was "edge hairs should collect remnants",
       that is a coverage question and belongs in `cover`, not in a term that
       overrides how full the brush is. */
    /* `r` is the share taken per ONE CELL TRAVELLED. What a frame takes is that
     * applied `dist` times over, which compounds — it is not `r * dist`.
     *
     * Compounding is what makes this frame-independent: a stroke cut into more
     * frames gives each frame a smaller `dist`, and the exponents add back up
     * to the same total. Multiplying instead lets a slow hand take more from
     * the same stroke, which is the per-frame delta invariant 2 forbids.
     *
     * TWO wrong versions stood here first, both measured, both recorded because
     * the second looked like a fix and was worse:
     *
     * ~~`r * cover * dist`~~ counted the speed twice — see the block above.
     *
     * ~~`1 - pow(1 - r, cover)`~~ compounded over the wrong quantity. `cover`
     * is NOT a distance: it sums one 0..1 coverage per hair track, and a tuft
     * puts 2 to 6 tracks on a single cell in a single frame even at one cell of
     * travel (measured on the flat hog: 154 segments over 61 cells). Raised to
     * that power it stripped 93 % of the film every frame — the six-layer stack
     * came out at 0.063 against 0.930 with pickup off, and the tuft finished
     * holding 516 % of its own capacity.
     *
     * `cover` keeps its ordinary meaning here: how much of the cell is under
     * hairs at all, one cell's worth at most.
     *
     * A brush held still lifts nothing, because `dist` is 0. That is a real
     * simplification — a brush pressed and held does slowly load — but the
     * alternative is a floor, and a floor is per-frame accumulation again.
     *
     * ~~`clamp(length(vec2(C.travelX, C.travelY)), 0.0, 16.0)`~~ — THE FRAME'S
     * TRAVEL. This was the fish scales, and the argument above for why it was
     * safe is where the mistake hid.
     *
     * The claim was that compounding makes it frame-independent, because a
     * stroke cut into more frames gives each frame a smaller `dist` and the
     * exponents add back up. That is true only for a cell EVERY frame touches.
     * A cell the brush crosses ONCE — which is every cell in an ordinary
     * stroke — is lifted once, with whatever exponent its own frame happened to
     * be carrying, as though the brush had rubbed it for the frame's entire
     * journey. Move the hand faster and the same cell, crossed the same way, is
     * scoured harder. That is a per-frame delta, which invariant 2
     * (`docs/00-invariants.md`) forbids in those words.
     *
     * [MEASURED, docs/19 E13] Oil / Flat Hog / Cotton Duck, full pipeline, tone
     * ripple with this term as it stood. Pickup is ON in the app and had been
     * switched OFF in every bench figure ever recorded here, which is how nine
     * experiments went past it:
     *
     *     stroke                pickup off   pickup on
     *     1 cell per report        0.00480     0.00752
     *     4 cells per report       0.00374     0.03452
     *     12 cells per report      0.00471     0.05953
     *     accelerating 1 -> 12     0.00554     0.06918
     *
     * Slow strokes barely move; fast ones are thirteen times worse. That is the
     * artist's own report — "slow strokes perform superiorly to fast strokes" —
     * reproduced in an instrument for the first time.
     *
     * THE RIGHT QUANTITY is how far the brush rubbed THIS CELL, and the pass
     * already had it in hand. `rubbed` sums the hand's movement over the solve
     * steps whose hairs actually touched this cell, so it is the contact length
     * the tuft dragged across it. It is per-cell, it does not know what a frame
     * is, and cutting a frame in two splits it in two — which is the invariance
     * the paragraph above wanted and did not have.
     *
     * THE CEILING IS A SAFETY RAIL, NOT A TERM, and at 16 it was neither.
     *
     * 16 came from the old quantity, where it bounded a runaway FRAME. Against
     * `rubbed` it means something else entirely: the flat hog's blade is 23
     * cells and lies ALONG the stroke, so a cell stays under the tuft for about
     * 23 cells of travel and its honest `rubbed` is 23. Bundle that whole rub
     * into one frame and it was clipped to 16; spread it over six short frames
     * and each was under the ceiling, so the exponents summed to the full 23.
     * **The clamp itself was the per-frame delta** — long frames lifted less
     * than short ones over identical ground.
     *
     * [MEASURED, docs/19 E17] Same stroke at four cells per report, cut into
     * frames of 1 to 16 reports, pickup on and the readback settled: tone
     * ripple 0.00832, 0.00906, 0.01556, 0.09415, 0.15966, with the repeat lag
     * tracking the frame travel exactly (4, 8, 16, 31). Pinning `brushTake`
     * did not remove it, so it was not the last per-frame scalar on the host.
     *
     * 64 is above any tuft's contact length in this library (the widest blade
     * is 23 cells) and stays a rail against a degenerate frame. */
    let dist = clamp(rubbed, 0.0, 64.0);

    /* INTAKE — drinking, and it is limited by how much room the tuft has left.
       Unchanged, and it is the only route a water medium ever takes. */
    let rIntake = clamp(C.upRate * C.brushTake * clamp(cover, 0.0, 1.0) * loose, 0.0, 0.9);

    /* EXCHANGE — swapping, which needs no room at all.
     *
     * A brush laying paint into a cell while dragging through it is TRADING,
     * not filling: what it takes goes where what it gave just left. The room
     * gate is the right throttle on drinking and the wrong one on trading, and
     * because it multiplies into the same product it took the whole take with
     * it. Measured: material 0.42 x tuft 0.34 x room 0.35 = 0.05 per cell, so a
     * crossing lifted a quarter of what it touched at best, and with the room
     * term at its true value for a charged brush — 0.0 to 0.038 across an
     * entire stroke — it lifted 5 %. That is the artist's "it doesn't pick up
     * bottom layers almost at all", in arithmetic. See docs/17.
     *
     * So a workable body paint gets a second route with the room term and the
     * tuft's own grabbiness both out of it. `workableBody` is the gate: it is
     * `select(0.0, …, P.yieldStress > 0.0)`, hence exactly 0 for every water
     * medium, so `max` below returns `rIntake` unchanged and watercolour is
     * byte-for-byte what it was. It also fades as the paint sets, which is
     * right — cured oil should not trade.
     *
     * [UNVERIFIED] Dropping the tuft factor as well as the room term is the
     * strong form. If this proves too eager, the weaker form multiplies by the
     * brush row again; that needs the tuft's grab passed down, which this Seg
     * struct does not currently carry. Judge by eye first. */
    /* HOW UNLIKE THE TWO PAINTS ARE — and why an exchange must be scaled by it.
     *
     * [MEASURED 2026-08-27, docs/18 §2 / docs/16 E10] The exchange above had no
     * notion of LIKE paint, so a loaded brush restating its own colour lifted
     * what it was laying in the same invocation. Four stacked oil passes on one
     * line, brush recharged each pass, film summed over a fixed corridor:
     *
     *     pickup off   47.2  94.6  142.1  189.6   (dead linear, last gain 1.007)
     *     pickup on    24.2  31.6   36.8   41.0   (converging, last gain 0.174)
     *
     * The first pass alone lost HALF its paint on bare-ish canvas, and by pass
     * four the peak film was 0.053 against a canvas tooth of 0.30 — the weave
     * never buries. That is the artist's "oil is missing body / missing height"
     * and the older "one or two thick strokes should cover" complaint, in
     * arithmetic. It is not a deposit problem: with this route shut, oil builds
     * exactly as it should.
     *
     * The drain is directional, which is what makes it a leak rather than a
     * wash. Canvas -> brush runs at the exchange rate; brush -> canvas runs at
     * `downRate * flow` of what a hair holds, which is slower. So paint pools in
     * the tuft and the sheet loses. For UNLIKE paints that asymmetry is exactly
     * the pickup docs/17 was built to get, and it stays untouched. For like on
     * like it is pure loss of body, and the trade it models is a no-op anyway:
     * what you lift is what you just laid.
     *
     * Total-variation distance between the two normalised compositions: 0 when
     * the brush is restating the cell's own colour, 1 when they share no slot.
     * Bounded, monotone, and free of a new constant.
     *
     * [UNVERIFIED — the METRIC is a design choice, not physics.] TVD was picked
     * for being bounded and cheap; a perceptual or spectral distance would rank
     * near-colours differently. What is measured is the fault it fixes, not that
     * this is the one true curve. Judge the crossing by eye before trusting it.
     *
     * Note it also self-limits mid-crossing: a brush that has already picked up
     * blue is less unlike the blue beneath it, so it trades less avidly for
     * more of the same — which pulls in the same direction as docs/16 E9's
     * "probably picks up far too much". */
    let presentPig = gloBefore.x + gloBefore.y + gloBefore.z + gloBefore.w
                   + ghiBefore.x + ghiBefore.y + ghiBefore.z + ghiBefore.w;
    /* Compared against what the brush is DEPOSITING, which is what `mix` is.
       [MEASURED — sending the tuft's steady load instead recycles paint; the
       numbers are on `StrokeEngine.brushMix`.] An empty brush has an all-zero
       vector and gets no discount, which is the safe default: it is not "like"
       anything. */
    let laidSum = mix[0].x + mix[0].y + mix[0].z + mix[0].w
                + mix[1].x + mix[1].y + mix[1].z + mix[1].w;
    var unlike = 1.0;
    if (presentPig > WET_EPS && laidPigHere > WET_EPS && laidSum > WET_EPS) {
      let dLo = abs(gloBefore / presentPig - mix[0] / laidSum);
      let dHi = abs(ghiBefore / presentPig - mix[1] / laidSum);
      unlike = clamp(0.5 * (dLo.x + dLo.y + dLo.z + dLo.w
                          + dHi.x + dHi.y + dHi.z + dHi.w), 0.0, 1.0);
    }
    let rExchange = clamp(C.upRate * clamp(cover, 0.0, 1.0) * loose * workableBody * unlike,
                          0.0, 0.9);

    /* THE SWAP CAP — what keeps a trading brush from filling.
     *
     * Exchange with the room gate removed is not free: measured without this,
     * six scrubs took the tuft to 101.2 % of its own capacity, which is the
     * 2026-08-25 failure in miniature. A cap on the RECEIVING side is not
     * available — refused paint is paint destroyed (see `Reservoir.pickUp`) —
     * so the limit has to be here, on the asking.
     *
     * A trade can only move what was traded. This cell knows both halves in the
     * same invocation: `laidPigHere` is what the tuft just gave it, and
     * `presentPig` is what was there to take. So drinking may use whatever real
     * room the tuft has, and trading may take at most as much as it laid.
     *
     * No new constant, and it self-limits in the right way: a brush running dry
     * lays less, so it trades less, and stops scouring the sheet exactly when it
     * has nothing left to swap. */
    // `presentPig` is computed above, with `unlike`.
    let swapCap = select(
      0.0, clamp(laidPigHere / max(presentPig, WET_EPS), 0.0, 1.0), presentPig > WET_EPS);

    let upIntake = 1.0 - pow(1.0 - rIntake, dist);
    let upBoth = 1.0 - pow(1.0 - max(rIntake, rExchange), dist);
    // Never more than "the room I had" plus "what I just gave". Watercolour has
    // `rExchange` 0, so `upBoth` is `upIntake` and this min changes nothing.
    let up = min(upBoth, upIntake + swapCap);

    /* WHAT THE LIFT MAY SEE — and this was the last frame-shaped fault in the
     * pickup path.
     *
     * ~~`filmBefore` alone.~~ That is `w0.y` captured at the top of the pass,
     * BEFORE the deposit, so a frame's own paint was completely immune to that
     * frame's own lift. Which is wrong on its face: this tuft's blade is 23
     * cells and lies along the stroke, so its trailing hairs are dragging over
     * paint its own leading hairs laid a moment earlier. Whether the engine
     * modelled that at all depended entirely on where the frame boundary fell —
     * with short frames the next frame's lift saw the previous frame's deposit
     * and it worked; bundle the same travel into one frame and it vanished.
     *
     * [MEASURED, docs/19 E17] Same stroke at four cells per report cut into
     * frames of 1 to 16 reports, pickup on, readback settled: tone ripple
     * 0.00832, 0.00906, 0.01555, 0.07992, 0.15966, and the repeat lag tracked
     * the frame travel exactly (4, 8, 16, 31). Pinning `brushTake` did not
     * remove it, so it was not a host-side scalar; raising the `rubbed` ceiling
     * from 16 to 64 moved it only 0.09415 -> 0.07992, so the clip was real but
     * minor. This is the rest of it.
     *
     * HALF, because a rub falling at a uniformly-distributed moment within the
     * frame sees, on average, half of what that frame lays here — the ordinary
     * midpoint reading of a quantity accumulating across the interval. It is
     * the value that makes one long frame agree with the many short ones that
     * were already right, and it needs no constant from outside: 0.5 is the
     * mean of a uniform arrival over the interval, not a tuning dial.
     *
     * Conservation is untouched. Everything below still subtracts exactly what
     * `lift` reports, and what may be seen is at most the film that is actually
     * standing here after the deposit, so nothing can be lifted that was never
     * laid. */
    let selfSeen = 0.5 * max(laidHere, 0.0);
    let selfPig = 0.5 * max(laidPigHere, 0.0);
    let gloSeen = max(gloBefore, vec4<f32>(0.0)) + mix[0] * selfPig;
    let ghiSeen = max(ghiBefore, vec4<f32>(0.0)) + mix[1] * selfPig;

    /* Subtract exactly what `lift` reports rather than what was asked for. */
    w0.y = max(w0.y - lift((max(filmBefore, 0.0) + selfSeen) * up, 0u), 0.0);
    glo.x = max(glo.x - lift(gloSeen.x * up, 1u), 0.0);
    glo.y = max(glo.y - lift(gloSeen.y * up, 2u), 0.0);
    glo.z = max(glo.z - lift(gloSeen.z * up, 3u), 0.0);
    glo.w = max(glo.w - lift(gloSeen.w * up, 4u), 0.0);
    ghi.x = max(ghi.x - lift(ghiSeen.x * up, 5u), 0.0);
    ghi.y = max(ghi.y - lift(ghiSeen.y * up, 6u), 0.0);
    ghi.z = max(ghi.z - lift(ghiSeen.z * up, 7u), 0.0);
    ghi.w = max(ghi.w - lift(ghiSeen.w * up, 8u), 0.0);
  }

  /* ---- Smear: the brush shoves the paint that is already there -------------
   *
   * Everything above only ADDS. A brush that can only add cannot drag a colour
   * out onto bare canvas, cannot pick one colour up into another, and cannot
   * push a ridge sideways — which is most of what painting in oil IS.
   *
   * Ported from the sarasara lab's `smearBody`. Three parts:
   *
   *   LIFT   Paint gives way only where the hairs press harder than the paint's
   *          own yield stress, and then only a share of it.
   *   FLOOR  `teflonMin` is a film that adheres and does not come off however
   *          hard you scrub. It is why a brush cannot wipe a canvas back to
   *          white, and why the second stroke through a passage takes less than
   *          the first.
   *   CARRY  What is lifted goes the way the brush is going. The lab carries it
   *          on the brush as a running total; here it is pushed into the next
   *          cells along, which is the same journey expressed as a flux — and a
   *          flux is the only way this engine is allowed to move anything.
   *
   * Written as an outflow the donor cell computes from its own state, so the
   * existing appliers move it and the ledger balances by construction.
   * `flux_apply_pigment` carries colour in proportion to the vehicle leaving,
   * so pigment follows without a second calculation: that is what makes a
   * dirty brush drag one colour through another.
   *
   * Every cell writes, so nothing stale survives a frame. Water media never
   * enter — their yieldStress is 0 — and pay one zero write for the privilege.
   */
  var smear = vec4<f32>(0.0);
  /* Levelling stays with the yielding media, and for a reason rather than by
     habit: it stands in for the flow water gets for free. A wash spreads its
     own comb flat through the fluid passes within a frame or two; a paste has
     no such flow, so without this its comb of hair ridges would just sit
     there. Running it for water as well would be levelling the same paint
     twice. */
  /* The fresh-paint levelling USED TO BE HERE, and it was the whole of oil's
     fish scales. It compared this cell's post-deposit height against its
     neighbours' PRE-deposit heights - `filmAt` reads wet0_in, which this pass
     has not written yet - so a cell measured itself against neighbours that
     were still bare, and how wrong that comparison was depended on how much
     paint the frame happened to be carrying. One scale per frame, wavelength
     exactly the frame's travel. [MEASURED, docs/19 E6/E7: switching this block
     off dropped stored edge ripple 0.04277 -> 0.00312, which is the CPU
     footprint's own figure, and the 16-cell repeat became 2. Capping by total
     film instead of by this frame's deposit did NOT fix it - 0.03987 - so the
     stale neighbour was the fault, not the budget.]

     It cannot be repaired in place: a neighbour's new height does not exist
     until this dispatch has finished. So it is now `level_fresh.wgsl`, running
     immediately after this pass and before the appliers, reading post-deposit
     film for BOTH sides. This pass publishes what it laid, in `fresh`. */
  /* EVERY wet material, not only the pastes.
   *
   * This was gated on having a yield stress, which put picking-up and pushing
   * in a box marked "oil" — and a wet brush dragged through a wet wash lifts
   * and moves pigment too. That is lifting, and blending wet into wet, and it
   * is half of what watercolour is. The artist caught it on 2026-08-24: "these
   * settings we've been adjusting on the brushes should affect all brushes -
   * nothing is done in a box."
   *
   * The yield stress does not need a gate around it because it IS the term: at
   * 0 the paint gives way to any pressure at all, which is exactly what water
   * does, and the share below falls out of the same arithmetic. A material that
   * holds its shape resists; one that does not, does not. */
  if (press > P.yieldStress) {
    /* Each resampled contact has already contributed above. This direction is
       their pressure/grab-weighted pull; the combined fraction below is what
       the same contacts would carry if submitted one at a time. */
    let speed = length(shoveDirection);
    // The film that will not come off, as a SHARE of what is there rather than
    // an absolute height. The lab's floor is a height in its own deposit units,
    // and transplanting that number into this engine's film units set it above
    // everything a stroke lays — so `loose` was zero and, again, nothing was
    // ever lifted. As a share it means the same thing at any scale: teflonMin
    // 0.18 leaves 18 % stuck down, teflonMin 1 (every dry medium) leaves all
    // of it.
    let workableBody = select(0.0, clamp(w5.y, 0.0, 1.0), P.yieldStress > 0.0);
    let loose = w0.y
              * clamp(1.0 - P.teflonMin * (1.0 - workableBody), 0.0, 1.0);
    if (speed > 1.0e-4 && loose > 0.0) {
      /* THE GRAB THAT CANNOT BE DRUNK.
       *
       * The pickup above is `upRate * brushTake * …`, and `brushTake` is the
       * tuft's grab times the room it has left. So a laden tuft drinks almost
       * nothing — measured 0.052 with the brush 85 % full — and that is right.
       * What was wrong is that its grab then did nothing at all: the shove
       * above does not know how full the brush is, so at the moment the tuft is
       * fullest, and shoves hardest in life, the engine was at its weakest on
       * BOTH routes. Blue sat untouched under a yellow stroke that crossed it.
       * [Artist, 2026-08-26: "the blue paint underneath the yellow stroke did
       * not leave the canvas. It stayed right in place."]
       *
       * So: one grab, two outcomes, and they hand over to each other. The share
       * the tuft has room for is drunk. The remaining `1 - room` is shoved.
       * `room` is recovered from the two numbers the host already sends, rather
       * than being a third that could drift out of step with them.
       *
       * No new constant: `upRate` is the material row, `brushGrab` the tuft
       * row, and the split is the room the tuft itself reports. Compounded over
       * distance for the same reason the pickup is — multiplying instead lets a
       * slow hand shove more from the same stroke, which is the per-frame delta
       * invariant 2 forbids.
       *
       * This is NOT the mechanism that emptied the canvas on 2026-08-25. That
       * was `lift()` removing paint into the brush and breaking what the sheet
       * held. This moves paint between neighbouring cells through the same
       * matched give/receive ledger as the shove above: the paint stays on the
       * canvas, it just stops sitting under the stroke.
       *
       * [UNVERIFIED — artist feel, 2026-08-26.] `smearStrength` is the dial to
       * turn if the amount is wrong; the mechanism is the claim here. */
      /* `shoveRemaining` already combines the pressure and laden-grab routes,
         with the artist's Smear dial applied to each local contact before the
         contacts are compounded. One ceiling still governs their shared
         conservative ledger. */
      let carried = min(
        loose * clamp(1.0 - shoveRemaining, 0.0, 0.9), w0.y * 0.9);
      let u = shoveDirection / speed;
      // Split across the two faces the direction points at. The parts sum to
      // exactly `carried`, so the split cannot invent or lose paint.
      let w = abs(u.x) + abs(u.y);
      smear = smear + vec4<f32>(
        max(u.x, 0.0), max(-u.x, 0.0), max(u.y, 0.0), max(-u.y, 0.0),
      ) * (carried / max(w, 1.0e-6));
    }
  }
  /* One ceiling over both, because both come out of the same cell. The
     appliers subtract this from what is there, so more than the cell holds
     would be paint invented from nothing. */
  let asked = smear.x + smear.y + smear.z + smear.w;
  let room = w0.y * 0.9;
  if (asked > room && asked > 0.0) { smear = smear * (room / asked); }
  if (c.x >= n - 1) { smear.x = 0.0; }
  if (c.x <= 0)     { smear.y = 0.0; }
  if (c.y >= n - 1) { smear.z = 0.0; }
  if (c.y <= 0)     { smear.w = 0.0; }
  fresh[idx] = vec2<f32>(max(laidHere, 0.0), press);
  flux[idx] = smear;

  // Containment. See `sane` in common.wgsl — this is where the 4e37 seed was
  // measured entering, with every fluid pass disabled. It is a guard rail, not
  // a diagnosis: it keeps one bad cell from becoming a growing blob, and it
  // costs a healthy stroke nothing, because no real deposit comes near PIG_LIM.
  w0.y = sane(w0.y, WATER_LIM);
  // The paper's saturation rides through this pass untouched, so it was left
  // unguarded at first — and that is exactly where the last surviving blowup
  // landed (wet5.x = 2.98e36). A field being merely COPIED is not a field that
  // is safe; it still has to come out sane.
  w5.x = sane(w5.x, WATER_LIM);
  textureStore(wet0_out, c, w0);
  textureStore(wet1_out, c, sane4(glo, PIG_LIM));
  textureStore(wet2_out, c, sane4(ghi, PIG_LIM));
  textureStore(wet5_out, c, w5);
}
