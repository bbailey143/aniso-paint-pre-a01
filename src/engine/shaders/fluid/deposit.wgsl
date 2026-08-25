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
  /** Vehicle laid into this cell by this pass. The levelling may move this and
   *  no more: paint already on the sheet has come to rest. */
  var laidHere = 0.0;

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
        if (P.yieldStress > 0.0) { bridged = clamp(w0.y / max(P.toothAmp, 0.05), 0.0, 1.0); }
        // Written out rather than `mix(base, 1.0, bridged)`: binding 3 in this
        // shader is called `mix`, which shadows the built-in of that name.
        let base = smoothstep(need - 0.18, need + 0.18, ride);
        let gate = base + (1.0 - base) * bridged;
        let take = f * gate;
        water = water + take * s.water;
        pig = pig + take * s.pigment;
        press = max(press, clamp(s.reach, 0.0, 1.0));
        cover = cover + f;
      }
    }

    laidHere = water;
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
   * Rate is per CELL TRAVELLED, never per frame (invariant 2), and matches how
   * `Reservoir.withdraw` charges the other direction: a brush held still still
   * works at the paint a little, so distance floors at a quarter cell rather
   * than falling to nothing.
   */
  if (C.upRate > 0.0 && cover > 0.0 && C.brushTake > 0.0) {
    /* Only what is not stuck down comes off — the same adhesion floor the
       smear obeys, and the reason a second pass through a passage lifts less
       than the first. teflonMin 1 (every dry medium) lifts nothing at all. */
    let loose = clamp(1.0 - P.teflonMin, 0.0, 1.0);
    let dist = clamp(length(vec2<f32>(C.travelX, C.travelY)), 0.25, 4.0);
    /* Capped at half a cell's worth per frame. A brush pulls paint off; it does
       not strip a cell bare in one step, and leaving a share behind is what
       makes the lift read as a gradual muddying rather than an erase. */
    let up = clamp(C.upRate * C.brushTake * clamp(cover, 0.0, 1.0) * loose * dist,
                   0.0, 0.5);

    /* Take the share off what was here BEFORE the hairs added anything, and
       subtract exactly what `lift` reports rather than what was asked for. */
    w0.y = max(w0.y - lift(max(filmBefore, 0.0) * up, 0u), 0.0);
    glo.x = max(glo.x - lift(max(gloBefore.x, 0.0) * up, 1u), 0.0);
    glo.y = max(glo.y - lift(max(gloBefore.y, 0.0) * up, 2u), 0.0);
    glo.z = max(glo.z - lift(max(gloBefore.z, 0.0) * up, 3u), 0.0);
    glo.w = max(glo.w - lift(max(gloBefore.w, 0.0) * up, 4u), 0.0);
    ghi.x = max(ghi.x - lift(max(ghiBefore.x, 0.0) * up, 5u), 0.0);
    ghi.y = max(ghi.y - lift(max(ghiBefore.y, 0.0) * up, 6u), 0.0);
    ghi.z = max(ghi.z - lift(max(ghiBefore.z, 0.0) * up, 7u), 0.0);
    ghi.w = max(ghi.w - lift(max(ghiBefore.w, 0.0) * up, 8u), 0.0);
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
  if (P.yieldStress > 0.0 && press > 0.0 && laidHere > 0.0) {
    // Level first: what the hairs are squeezing gives way before it is shoved
    // anywhere. See `levelOut`.
    let yieldHere = P.yieldStress * clamp(1.0 - press, 0.0, 1.0);
    // The surface it levels ACROSS is the whole film — a ridge is a ridge
    // whenever it was laid.
    let top = filmBefore + laidHere;
    var lvl = vec4<f32>(
      levelOut(top, filmAt(vec2<i32>(c.x + 1, c.y), n), yieldHere),
      levelOut(top, filmAt(vec2<i32>(c.x - 1, c.y), n), yieldHere),
      levelOut(top, filmAt(vec2<i32>(c.x, c.y + 1), n), yieldHere),
      levelOut(top, filmAt(vec2<i32>(c.x, c.y - 1), n), yieldHere),
    );
    // ...but the paint it may MOVE is only what just arrived. Everything under
    // that has set as far as this pass is concerned.
    let asks = lvl.x + lvl.y + lvl.z + lvl.w;
    let flowing = laidHere * 0.8;
    if (asks > flowing && asks > 0.0) { lvl = lvl * (flowing / asks); }
    smear = lvl;
  }
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
    let travel = vec2<f32>(C.travelX, C.travelY);
    let speed = length(travel);
    // The film that will not come off, as a SHARE of what is there rather than
    // an absolute height. The lab's floor is a height in its own deposit units,
    // and transplanting that number into this engine's film units set it above
    // everything a stroke lays — so `loose` was zero and, again, nothing was
    // ever lifted. As a share it means the same thing at any scale: teflonMin
    // 0.18 leaves 18 % stuck down, teflonMin 1 (every dry medium) leaves all
    // of it.
    let loose = w0.y * clamp(1.0 - P.teflonMin, 0.0, 1.0);
    if (speed > 1.0e-4 && loose > 0.0) {
      // Share taken, from how far past yielding the hairs are pressing. Capped
      // at 0.6 — a brush shoves paint, it does not teleport it.
      let share = clamp((press - P.yieldStress) / max(0.05, 1.0 - P.yieldStress), 0.0, 0.6);
      /* A brush standing still smears nothing, and one that crosses four cells
         in a frame drags four times what one crossing a single cell does —
         scaled by DISTANCE, not by frames, or the same gesture would smear
         differently on a fast machine than a slow one. Bounded at four cells so
         one stalled frame cannot fling the paint across the sheet.

         A hair barely grazing the cell smears in proportion to what it covers.
         The ceiling stays as a conservation guard, but it should now be rare
         for it to bind at all — when it was doing the deciding, the smear was
         not a physical quantity, it was a clip. */
      let carried = min(
        loose * share * min(speed, 4.0) * clamp(cover, 0.0, 1.0)
          * max(C.smear, 0.0) * SMEAR_RATE,
        w0.y * 0.9);
      let u = travel / speed;
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
