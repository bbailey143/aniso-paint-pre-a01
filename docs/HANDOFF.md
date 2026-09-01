# HANDOFF — read this first, every time

**You are one of several AI models working this repo in relay.** Claude, Codex and
Gemini all take turns, whenever the previous one runs out of credits — often
mid-task, sometimes mid-function. This file is the baton.

**The only instruction the human should ever have to give is: "Read `docs/HANDOFF.md`
and keep going."** If that is not enough to get you working, the previous model failed
its job — fix this file as part of yours.

---

# PART A — THE PROTOCOL (stable; do not rewrite)

## A1. Your first five minutes

1. Read this whole file.
2. Read `CLAUDE.md` — what the project is and how it must be built.
3. Read whichever deep log Part B points you at (`docs/11-*`, `docs/12-*`, …).
4. **Before touching anything: update Part B** with what you are about to do
   (see A3). Then work.

## A2. The prime directive

**Leave the baton correct at all times, not at the end.**

You may be cut off mid-sentence. Anything you were "going to write up later" will not
exist. So:

- Update **Part B** *before* you start a piece of work, describing what you are about
  to attempt and how to resume or abandon it.
- Update it again at every checkpoint — roughly every 20–30 minutes of work, and
  always immediately before a long-running operation.
- Never leave the repo in a state where the next model cannot tell what is
  half-finished.

A session that produced no code but left an accurate baton is a **success**. A session
that produced a clever fix nobody can find or verify is a **failure**.

## A3. What "the next step" must contain

Vague is useless. `NEXT ACTION` in Part B must be specific enough to start on
immediately, with no reconstruction:

- The exact file(s) and function(s), with paths.
- What to change or measure, concretely.
- How to tell whether it worked — the command, the number, the expected value.
- What each possible outcome means for the step after.

Bad: "keep investigating the fluid bug."
Good: "Verify `FluidEngine.dump()` (src/engine/fluid.ts:853) returns the post-flip
buffer. Cross-check: sum `wet5.x` from a dump against gauge lane 1 from
`await engine.sampleGauges()`; they must agree to ~4 digits. Do it on a BLOWN canvas,
not a healthy one. If they disagree, every current-tree number in docs/12 is suspect."

## A4. Evidence rules — enforced, not aspirational

This project has had **five** confident diagnoses die on re-test. The failure mode
here is *plausible-but-wrong*, not crashes. Therefore:

- **Reproduce before you believe.** Any conservation, timing, stability or rate result
  gets a second identical run before it is written as fact. Single-run results are
  marked `[1 RUN ONLY]`.
- **Say "I don't know."** Never construct a mechanism to fill a gap. An honest
  unexplained result outranks a tidy story.
- **Check the instrument before the engine.** Four of the five dead diagnoses were
  broken measurement, not broken physics. When a number looks wrong, first ask whether
  the thing measuring it is lying.
- **No invented constants.** If a number is needed and no source supplies it, mark it
  `[UNVERIFIED]` and say so. See the "fence" in `CLAUDE.md`.
- **Log failures.** Especially failures. The dead ends are the most valuable part of
  the record and they stop the next model repeating them.
- **Retract by striking, not deleting.** `~~old claim~~ **RETRACTED at E9 because…**`
  The trail matters.
- **Correct yourself out loud.** If you find that an earlier report — including your
  own, in an earlier session — was wrong or overstated, say so plainly and prominently.

## A5. Where things go

| what | where |
|---|---|
| The baton: current state + next action | **Part B of this file** |
| Deep evidence log for an active investigation | `docs/NN-<topic>-log.md`, entries numbered `E1, E2, …` |
| Ratified decisions, closed | `docs/10-decisions.md`, as `D#` |
| Acceptance measurements | `docs/09-acceptance.md` |
| Architecture, invariants, physics cards | `docs/00`–`08` |

Every experiment entry, in every log, uses this shape:

```
### E<n> — <one-line title> (<date>)
**Purpose.**            why you ran it
**Method.**             enough detail to repeat it exactly
**Raw result.**         the actual numbers, not a summary of them
**What it proves.**
**What it does NOT prove.**    <- never skip this
```

## A6. Environment

- Repo: `https://github.com/bbailey143/aniso-paint-pre-a01`.
- **Working checkout: `D:\aniso-paint-pre-a01`, branch `tuft-fill`.** Corrected
  2026-08-25 — this line named `webgpu-test` and a `Documents\…\.claude\worktrees\`
  path that is not where the work is, which would send you to the wrong tree.
  `webgpu-test` is the publish target and is 12 commits behind local.
- Windows 11, GPU `amd / gcn-4` (Polaris). **The GPU is a suspect in the open fault —
  if you are on different hardware, say so in every entry you write.**
- `npm run dev` — **port 5174, pinned** (`vite.config.ts` sets `strictPort: true`).
  Corrected 2026-08-28; this line said 5173 and cost a session an hour chasing a
  port that config had already fixed. `tools/start-ipad.ps1` passes the port on
  the command line, which OVERRIDES the config — check it if 5173 reappears.
  Build/typecheck: `npm run build`.
- **iPad: `tailscale serve --bg 5174`**, which publishes
  `https://bfamily.tail5d46e0.ts.net/` with a real certificate and the SAME
  address every session. Prefer it to `npm run ipad` (Cloudflare quick tunnel),
  whose address changes every time. WebGPU needs the secure context, so a plain
  LAN IP will not work. `vite.config.ts` allows `.ts.net` and
  `.trycloudflare.com` hosts.
- **WGSL errors never appear at build time** — `npm run build` runs `tsc --noEmit &&
  vite build` and does not compile shaders. Load the page after any shader edit.
- Debug handles: `window.__engine`, `window.__stroke`, `window.__BRUSHES`.
  Full API in `docs/12-explosion-hunt-log.md` §4; channel map in §5; the traps that
  have already cost days are in §11. **Read §11 before writing shader code.**

## A7. Finishing (or being interrupted)

- **Commit and push to `tuft-fill`** whenever a milestone lands. The repo is the
  source of truth; an uncommitted insight does not exist. Corrected 2026-08-28 —
  this line said `webgpu-test`, which stopped being the default branch on
  2026-08-26 and is now far behind. Pushing there would strand the work in
  exactly the way the abandoned `C:` clone did.
- Do **not** commit `.claude/settings.local.json`.
- Commit messages: what changed, what it was measured to do, and what it does *not*
  do. Plain language.
- Before you stop — or whenever you sense you are near a limit — do a final Part B
  update. If you are mid-edit and cannot finish, say exactly that in `IN FLIGHT`,
  including whether the next model should finish it or revert it.

## A8. Who you are working for

Bartford is an artist, not a programmer. He wrote HTML and JS from ~2010–2020, so he
reads code comfortably and understands structure — but frame findings in terms of
**what happens to the paint**, not the type system. When something is done, tell him
what to look at to confirm it. Do not hand him a menu of options; make the call and
say why.

---
---

# PART B — THE BATON (live; rewrite freely, keep it short and true)

**Last updated:** 2026-08-29 (evening)
**By:** Claude, continuing from Codex, which ran out of credits mid-verification.

## DONE — Codex's fluid fix is verified, plus a seam repair (2026-08-29, Claude)

**Codex's numbers were right.** Reproduced independently, three arms (HEAD /
candidate / candidate+seam), two fresh page loads each, every internal pair
exact. Finished-stroke edge ripple **0.04551 -> 0.01376 -> 0.01266**. Its stated
mechanism is confirmed by direct measurement: baseline west and north outward
face speeds are not small but **exactly 0.00000**, because `update_velocities`
returned early on a dry owner cell and a wet region's west/north faces are owned
by its dry neighbours. Water could leave a stroke on two sides only. Full table
and reasoning: `docs/19-paint-on-canvas.md` **E5**.

**The seam I flagged was real and is fixed.** The two shaders disagreed on what
"wet" means — velocity used `mask AND film > WET_EPS`, relaxation used the mask
alone. The mask does not imply film: `flux_apply_water` sets it and never clears
it, `capillary_flow` sets it on absorbed water alone, `dry_tick` alone clears it.
So the damp halo ringing every stroke was interior to the relaxation and dry to
the velocity pass. `relax_divergence` now uses the velocity pass's test. It moves
exactly and only the capillary-fed figures, which is why I believe it.

**What is NOT fixed — the late residual.** Ripple after 16 and 32 flow steps is
WORSE than baseline (0.03370 -> 0.04973, 0.02891 -> 0.03619) and the seam fix
does not touch it. One stroke settles smooth; a wash left moving longer does not.
Nothing tuned to hide it.

**Nothing broke.** Soak clean 4/4 both arms, pigment unchanged. Holding 92.6%
passed. Watercolour drift 0.000002 -> exactly 0. Crossing/trail/stacking read the
same in both arms.

## AWAITING THE ARTIST'S EYE — flat studio lighting (2026-08-29, Codex, uncommitted)

Bartford asked for the single directional surface light to be replaced with a
natural flat model. Codex built it in `composite.wgsl` and never got a verdict:
a soft key `(-0.35, -0.5, 0.78)` at 0.72 plus an opposite-side fill
`(0.25, 0.35, 0.90)` at 0.28, and the shade floor lifted from 0.82/0.25 to
0.88/0.58 so relief stops turning into a black shadow. Sheen and the ground
shadow still take the key direction only. It builds and it is in the tree.
**It has not been looked at.** Judge it on an Oil ridge and on bare paper.

**Where the fish-scale diagnosis history went.** The chain that got here — the
Flat White control, the flat-brush retraction, the round-brush retraction, and
the stage discriminator that located the generator in shared water motion — is
written up in `docs/19-paint-on-canvas.md` E4, with the verification in E5. It
was removed from this baton to keep Part B short, not because it stopped being
true. Read E4 before re-opening any of it.

## OIL IS MEASURED NOW — it is the DEPOSIT, one scale per frame (2026-08-29, Claude)

**Oil and watercolour have different faults. They were never the same bug.**

`?fish-scale=1&medium=oil` (Flat Hog / Flat White). Every pair exact, reproduced
across fresh loads. Full table: `docs/19` **E6**.

- **94% of oil's ripple exists at deposit**, with every flow pass disabled
  (0.04277 of a finished 0.04549). The brush shove adds the last 6%.
- **Nothing downstream moves it by one part in 10^5** — not the slump against the
  yield, not the outward bias, not transfer, capillary or drying, not 32 further
  flow steps. Watercolour was the opposite: smooth deposit, rhythm grown in the
  water motion (E4).
- **The wavelength is frame travel.** `?group=N` bundles N reports per frame at 4
  cells each: 1 -> repeat 4, 2 -> repeat 8, 4 -> repeat 16. One scale per engine
  frame. (`TREND_RADIUS` is also 16, so a fixed 16 would have been the metric
  talking; it moves with the frame, so it is not.)
- **Amplitude scales with bundling**: 0.01288 at one report per frame against
  0.04549 at four — 3.5x. The CPU footprint stays smooth (0.00312), so the brush
  geometry is fine; it is how that footprint reaches `deposit.wgsl` per frame.

## OIL'S SEAM CLOSED - fast strokes now behave like slow ones (2026-08-29)

**It was the fresh-paint levelling in `deposit.wgsl`, in two parts.** Numbers in
`docs/19` E6/E7/E8.

1. **Where it measured.** It compared each cell's post-deposit height against its
   neighbours' PRE-deposit heights - inside the deposit pass the neighbours' new
   heights do not exist yet. Moved to `level_fresh.wgsl`, run after the deposit
   and before the appliers, both sides post-deposit.
2. **How often it ran.** Once per browser frame, so a frame carrying sixteen
   cells of travel got one smoothing sweep where a slow stroke got sixteen. The
   count now follows brush solve steps (cap `LEVEL_SWEEP_MAX = 8`) with the
   per-sweep budget divided by it - same total paint moved, delivered as finely
   as the travel deserves.

| Oil full pipeline, Flat White | |
|---|---:|
| before | 0.04549 |
| after | **0.01424** |
| frame dependence | 3.53x -> **1.13x** |

Cotton Duck: 0.03520 -> 0.01425. Conservation ~0.02%. Watercolour byte-identical
- sweeps are 1 for any zero-yield medium.

**Cost about 2-3 ms/frame** (9.2-9.5 against 6.4-7.8 with the cap forced to 1),
RX 570, inside the 16.7 ms budget. Noisy, upper bound, no timestamp queries.
**`LEVEL_SWEEP_MAX` is the dial if the iPad is tight.**

## RETRACTED — the E11/E12 diagnosis does not reproduce (2026-08-29, docs/19 E13)

The section that used to stand here said the banding was stick-slip in the tuft
and that the fix was an overlap question in `emitFootprint`. **Both halves are
wrong and were built on a figure that cannot be reproduced.** Kept as a warning,
not as guidance:

- E11's "CPU footprint 0.06279". Re-measured two ways — the browser bench's own
  CPU row (**0.00455**) and a line-for-line node replica of it
  (`node tools/brush-bench.mjs density flat-hog oil`, **0.0034**). The brush
  footprint is clean and has been all along.
- E12's stick-slip, "advance 0.28 to 0.77". That is the first ten steps of the
  stroke. `node tools/brush-bench.mjs reach flat-hog` shows the advance
  converging to **0.800 and staying there**, contact reach CV **0.0000**,
  segments per step CV **0.0000**, at 1, 2 and 4 cells per report.
- The resampler's remainder is innocent too: reports alternating 3.60/3.70
  across a `ceil()` boundary measure **0.0812** against **0.0820** held
  constant. Nothing to fix in `steps = ceil(dist / maxStep)`.

**Do not go back into the tuft solver on this.** Nothing has been found wrong
with it.

## THE INSTRUMENT WAS BROKEN — fixed, and it invalidates old numbers

`toneRipple` was `relativeRms` over the WHOLE profile, ends included. A stroke's
touch-down and lift-off ramp between bare canvas and full tone (100 → 78.7 →
68.3 in, 77 → 82 → 107 out), and a ±16 moving-mean detrend cannot flatten a step
sitting at the array boundary. Measured: reported **0.04104**, interior only
**0.00359**. **Ninety-one per cent of the number was the ends of the stroke.**

`analyseTone` now trims 24 cells from each end — the same 24 the film metrics
already used — and still prints the old figure as `toneEndsIncluded`.

**Every tone figure recorded before 2026-08-29 is the old quantity and does not
compare with anything after it.** That includes "4.55% to 1.38%" and the "34%
improvement". Do not read them as a baseline.

This is the third time the same mistake has landed here in a different costume:
edge ripple measured WIDTH when the complaint was THICKNESS, and tone measured
the ENDS when the complaint is the MIDDLE. **Before optimising a number, print
the profile it came from and look at it.**

## DONE — the fish scales are PICKUP, and the bench had it switched off

Every `engine.step` in `fish-scale-bench.ts` passed `0, 0` for the tuft's grab.
So the lifting term in `deposit.wgsl` had never once been measured by this
bench, while the artist has been painting with it on the whole time. Nine
experiments went past it.

New `STROKE SPEED` section — the same 336-cell stroke reported more or less
often, which is what speed IS to a browser. Oil / Flat Hog / Cotton Duck, full
pipeline, corrected tone ripple:

| stroke | pickup off | before | **after the fix** |
|---|---:|---:|---:|
| 1 cell per report (slow) | 0.00480 | 0.00752 | **0.00553** |
| 4 cells per report | 0.00374 | 0.03452 | **0.01240** |
| 12 cells per report (fast) | 0.00471 | 0.05953 | **0.03124** |
| accelerating 1 → 12 | 0.00554 | 0.06918 | **0.03455** |
| decelerating 12 → 1 | 0.00556 | 0.05069 | **0.02444** |

Pickup on made fast strokes **thirteen times** worse than slow ones. That is the
artist's own report — "slow strokes perform superiorly to fast strokes" —
reproduced in an instrument for the first time.

**The bug.** `deposit.wgsl` lifted with `dist = length(C.travelX, C.travelY)`,
the WHOLE FRAME's travel, applied as the exponent for every cell the frame
touched — as though the brush had rubbed each of them for the frame's entire
journey. The comment claimed frame-independence because the exponents add back
up; that holds only for a cell every frame touches, and an ordinary stroke
crosses each cell once. `docs/00-invariants.md` §2: "never a per-frame delta".

**The fix.** `rubbed` — the hand's movement summed over the solve steps whose
hairs actually touched THIS cell. Per-cell, frame-blind, splits when a frame
splits. Slow strokes now sit on the pickup-off floor. Pickup still lifts a
proper amount (total film 536.7 → 445.2, 17 % taken up), so it has not been
switched off by the back door.

## THE BRUSHES HOLD PAINT FOR THREE CANVAS WIDTHS (2026-08-29, docs/19 E14)

The artist asked how long these brushes hold on to oil — "it seems too long by a
lot". Measured, `node tools/brush-bench.mjs dryout`, one dip dragged straight,
against a sheet **1024 cells across**:

| brush / medium | half strength | 10 % | still held after 3000 cells |
|---|---:|---:|---:|
| flat hog / oil | 573 | 1173 | **12.8 %** |
| round sable / oil | 567 | 1683 | 13.4 % |
| flat hog / watercolour | 398 | 1576 | 16.8 % |

**One dip lasts about three canvas widths and is still not empty.** No constant
was changed — the call on brush legs is the artist's, by eye.

**Command palette → Toggle Dry-Out Marks.** A red line at the brush's own
contact point, along its own blade axis, at its own half-width. A LADDER (half
full, a quarter, a tenth, a twentieth, out) because a tuft's holding decays
towards zero and never arrives, so one line at one threshold would draw nothing
at all on most of these brushes. Faint at half full, solid red when out. **If
the solid line never appears, that is the answer.** On a 3000-cell drag the flat
hog draws exactly two: half full at 359 cells, a quarter left at 738.

Verified against a hand-fed ladder: marks land at screen x 360/480/600/720/840
against expected 360/480/600/720/840, height 98 px against 96. Nothing touches
paint — the marks are on their own transparent canvas above the picture.

## THE SCALE IS RECORDED AT LAST — 1 cell = 1 mm (2026-08-30, docs/19 E15)

Nothing in `docs/` said what a cell was in millimetres, which is why no outside
model could ever be applied. **The brush rows say it.** Flat hog `length: 22`,
`widthRatio: 1.05` = a 23.1 mm blade on 22 mm bristles, which is a real #12 flat
hog, and the 512-cell grid becomes a **512 mm sheet — a 20-inch canvas**. Film
height rides the same ruler (Cotton Duck `toothAmp` 0.30 = 0.30 mm of weave),
so **one paint unit = 1 mm^3 = 1 microlitre**.

[UNVERIFIED - arithmetic from the brush rows.] The paper rows disagree
(`featureFreq` 64 threads across 512 mm is far coarser than real canvas) but
that row is marked "chosen to read correctly, not measured", so the brush wins.

## BRUSH LOADS SIZED FROM THE ARTIST'S COATINGS MODEL (docs/19 E16)

    wet film = dry film / volume solids;  deposited = area * wet film
    load = deposited / transfer efficiency

From the model's parameter table: **dry film 100-250 um** for full opacity,
solids 0.85-1.00, and **transfer PER BRISTLE TYPE - sable ~0.35, hog ~0.45**.
Worked example: 150 x 20 mm at 150 um dry, 0.90 solids -> 167 um wet, 0.50 mL
deposited, 1.25 mL on the brush. Those are the inputs used.

**167 um is corroborated from inside the repo**, which is why it is trusted:
`deposit.wgsl` records an 18 um pass against Cotton Duck's 300 um weave,
"stamped the weave forever". At 167 um one pass clears the bridging depth -
the artist's "one or two thick strokes should cover", quoted in that shader.

The three brushes disagreed with each other by more than SIX TIMES (hog 22 um,
round sable 139 um) and all three laid about a QUARTER of what thick cover
needs. `node tools/brush-bench.mjs load`.

Two knobs, independent (measured, `reservoir.ts`): `downRate` sets transfer and
the legs; `capacity` then sets the film without moving transfer, because what
leaves is a fraction of what is held. Converged in one pass each time:

| brush | model load | now | model lays | now | transfer | wet film |
|---|---:|---:|---:|---:|---:|---:|
| flat hog | 1283 uL | 1277 | 578 uL | 577 | 0.452 | 166.5 um |
| round sable | 631 uL | 634 | 221 uL | 222 | 0.350 | 167.4 um |
| flat sable | 1629 uL | 1629 | 570 uL | 571 | 0.350 | 166.8 um |

**Legs much improved** - flat hog / oil half strength 573 -> 279 cells, about
two designed strokes. That was the "holds on too long" complaint.

**THE COST, and it is severe.** Tone ripple, oil / flat hog / cotton duck, full
pipeline with pickup: 1 cell/report 0.00553 -> 0.021, 4 cells 0.01240 -> 0.136,
12 cells 0.03124 -> 0.171, accelerating 0.03455 -> 0.154. Total film 537 ->
2901 as designed. Pickup-OFF rows moved too (0.00542 -> 0.02757), so more paint
means more banding everywhere - which is what the Flow clue always said.
**Nothing regressed; the E13 fault got louder.** Finishing E13 is now the only
thing between this and a usable oil brush.

**AMBER, NEW AND LOUD.** The pickup rows no longer reproduce at all - 0.13605
against 0.07979 on two identical runs, total film differing by 5 %. At the old
paint level they agreed to the fourth decimal. The reservoir is credited from an
ASYNCHRONOUS readback and at this film thickness that jitter is first-order.
**Do not read any single pickup figure at this paint level as a measurement**
until that readback is deterministic. This is now a blocker on measurement, not
just a caveat.

**To paint rather than test in the meantime:** the Capacity dial is the intended
lever and needs no code change. About 0.3x restores the old film and the old,
milder banding, at the cost of thin cover.

**NOT FIXED: paint stranded in the tuft.** The tuft still holds 12.6 % after
3000 cells while what it LAYS is down to 1 % by cell 1058. The belly holds paint
the tip never brings to the paper. **The brush is not holding on too long so
much as failing to deliver what it holds.** A `wick` question, not a capacity
one, and untouched by any of this.

## DONE — THE PICKUP FIX IS FINISHED (2026-08-30, docs/19 E17)

E13 found the fish scales in the lifting term and fixed the first of FOUR
frame-shaped faults in it. The other three are now fixed. All four were the same
mistake in different clothes: **a quantity belonging to a patch of canvas was
being decided once per browser frame instead.**

**The test that made it possible** — a new `bundling` ladder in the fish-scale
bench: same stroke, fixed four cells per report, cut into frames of 1/2/4/8/16
reports. The hand is identical in every row so the picture must be too. This is
invariant 2 put directly, and it should have existed long ago.

| reports/frame | frame travel | before | after |
|---|---|---:|---:|
| 1 | 4 cells | 0.00832 | 0.00851 |
| 2 | 8 cells | 0.00906 | 0.00842 |
| 4 | 16 cells | 0.01555 | 0.01409 |
| 8 | 32 cells | 0.07992 | **0.02138** |
| 16 | 64 cells | 0.15966 | **0.01119** |

A 19x spread becomes 2.5x; the repeat lag stops tracking frame travel; tonal
swing at 16/frame 40.75 -> 1.14.

**Fault 2, the readback lag.** `brushTake` is credited from an ASYNC readback
that `drainPickup` skips while a map is in flight, so scouring strength sat
still then jumped. New `FluidEngine.settlePickup()` awaits the map. **For
measuring only** - stalling the queue every frame in the paint loop would be
absurd. Fixed the nondeterminism AND was a real cause: 0.1361/0.0798 ->
0.01556 at four cells per report.

**Fault 3, the ceiling on `rubbed`.** E13 kept the old `clamp(..., 16)`. The
hog's blade is 23 cells and lies ALONG the stroke, so a cell's honest `rubbed`
is ~23: bundled into one frame it clipped, spread over six it did not. Raised
to 64 (above any tuft's contact length; a rail, not a term). Effect 0.09415 ->
0.07992 - **real and minor, and recorded as minor because it was tested before
it was believed.**

**Ruled out: `brushTake` as a per-frame scalar.** Pinned to a value the stroke
actually reaches (0.5x `brushGrab`, not the useless stroke-start zero of the
2026-08-29 attempt), the frame signature stayed. Not it.

**Fault 4, and it was the rest of it: a frame's own paint was immune to its own
lift.** `filmBefore` is captured before the deposit. But this blade is 23 cells
lying along the stroke - its trailing hairs drag over paint its own leading
hairs just laid. Whether that was modelled at all depended on where the frame
boundary fell. The lift now also sees HALF of what the frame laid here: the
midpoint reading of a quantity accumulating across the interval, not a dial.
Conservation untouched.

**WHERE THE OIL BRUSH STANDS**, at E16's model-sized loads, pickup live:

| stroke | E16 morning | now |
|---|---:|---:|
| 1 cell/report (slow) | 0.0207/0.0258 | **0.00839** |
| 4 cells/report | 0.1361/0.0798 | **0.01409** |
| 12 cells/report (fast) | 0.1706/0.1263 | **0.01655** |
| accelerating 1 -> 12 | 0.1536/0.1761 | **0.01792** |

**The speed dependence is gone** - 0.0084 to 0.0179 across a twelvefold range,
which was the artist's entire complaint. Every row reproduces exactly. Pickup ON
is now BETTER than off at every speed, which is what a lifting term should do.
And this is at 3.75x the paint E13 was measured with.

## `?full-check` NO LONGER NEEDS A VISIBLE PAGE

`stroke1` awaits `settlePickup` after every step, so the measurement no longer
depends on how long the yield takes - which was the entire reason the fast yield
was reverted on 2026-08-29. The yield is now a MessageChannel, throttling cannot
clamp it, and the suite finishes in under 40 s on a hidden page. **Numbers taken
before 2026-08-30 were taken under the old timing; re-measure, do not compare.**

Latest, and no regressions found:

    crossing lift  35.9% / 35.9%       reference ~36%
    crossing trail 20.6 -> 8.6 -> 5.5 -> 4 -> 3.3
    stack last/first 0.936 / 0.936     reference ~0.897, but PRE-E16
    holding peak 92.9% / 92.9% passed  reference ~92.6%
    Watercolour drift 0.000015

Crossing lift landing back on 36 % is the strongest evidence `settlePickup` is
right: the 2026-08-29 fast-yield gave 44.9 % with the trail collapsed to 4.6 ->
0. **Stacking 0.936 is NOT called a pass or a fail** - its reference predates
E16's loading change, which quadrupled the film on purpose. Re-baseline it.

**Watercolour checked, not assumed** (shared code): tone 0.0022-0.0070 at every
speed and bundling, pickup on/off within 0.00005, total film identical to the
digit across all five bundlings.

## THE BRUSH DOES NOT RELOAD — 91 % OF ITS PAINT CANNOT REACH THE PAPER
(2026-08-30, docs/19 E18. The artist asked; this is the answer.)

**Not reloading, and that was checked rather than assumed.** Wrapping
`Reservoir.charge` and `StrokeEngine.begin` in the live app over a continuous
480-cell drag: `charge` called ZERO times after the one dip at `begin`, `begin`
called zero extra times, holding falling monotonically 0.555 -> 0.237. Pickup is
not refilling it either - lifting off against on ends 0.3908 / 0.3929 straight
and 0.3910 / 0.3993 while scrubbing over its own wet paint.

**But the instinct was right.** `node tools/brush-bench.mjs stranded`:

| after a continuous stroke of | 480 cells | 960 cells |
|---|---:|---:|
| reservoir cells ever touched | **77 of 432** | 77 of 432 |
| capacity that ever contacts | **9 %** | 9 % |
| contacting cells still hold | **4.4 % full** | **1.3 % full** |
| whole tuft reads | 18.6 % full | 14.1 % full |
| of the paint left, stranded | **98 %** | **99 %** |

**The part that touches the paper is empty; the rest is full and cannot get
there.** From outside that IS "auto-reloading": the tip runs dry, a step later
it has paint again, fed by a belly you cannot see that never empties.

**WHY.** `Reservoir.wick` moves paint along a bristle, `s` to `s+1`. **There is
no `b` direction** - the 72 bristles are 72 isolated straws, and paint in a
bristle that never contacts can never reach the paper by any route. Real
bristles are wetted against each other and share by capillarity. A gap in the
model, not a tuning value. Indexing checked first: `new Reservoir(..., segments
+ 1)` matches `emitFootprint`'s `cell = b * J + s`. No off-by-one.

**THIS AND E16 MUST BE SETTLED TOGETHER.** The loading model reached the right
deposited volume by inflating the TOTAL load fourfold while 91 % stays sealed:
112 uL reachable of a 1283 uL load. Give the wick a cross-bristle path and the
reachable fraction jumps, so the capacities must come back down or every brush
lays far too much. Order: fix the transport, re-run `brush-bench load` (it
re-converges in one pass), then re-measure banding, which is multiplicative in
paint and will move.

**NOT ATTEMPTED.** How a tuft shares paint between bristles is a brush-engine
design decision with no card behind it, and the artist's judgement of how a
loaded brush should behave is the deciding evidence. Measurement recorded, change
not made.

## OIL RESET, AND THE REAL DRIFT (2026-08-30, docs/19 E19)

The artist: *"I'm to a point of resetting the oil paint. Start from scratch - I
feel like we're getting too far away from pure oil and adding too many fixes."*

**DONE.** `src/brush/library.ts` capacities and `downRate` are back to shipped
values. E15/E16's coatings-model sizing is kept in docs/19 in full and is one
`git revert` away, but should not have shipped: E18 measured **91 % of a loaded
tuft as unreachable**, so the model's "required load" was satisfied by inflating
a number that is mostly sealed off - compensating for a transport bug rather
than describing oil. Its millimetre scale is also arithmetic off the brush rows,
not a measurement, and the paper rows disagree with it.

**THE AUDIT'S REAL FINDING, and it is not the code.** `docs/18-oil-body.md` §5
is the ratified order of attack for oil. Steps 1 and 2 are done. **Step 3 reads
"NEXT, and it is the artist's" and has not moved since 2026-08-27.**

Everything in docs/19 from E1 to E18 - fish scales, frame invariance, the pickup
path, the loading model - is a DIFFERENT investigation. Real faults, genuinely
fixed, and **not one of them is a step in the oil plan.** The plan has been
parked three days at a step that needs the artist's eye and no code. That is the
drift, and no further engine work closes it.

**One number has never been satisfied:** "3 % feels correct" (2026-08-26), still
the only accepted carry verdict on record. The crossing trail today runs
**20.6 -> 8.6 -> 5.5 -> 4 -> 3.3** - about seven times his figure where it
begins. docs/16 is explicit: **"Do not tune this to a number. Show him a
crossing and take the verdict."**

**WHERE OIL STANDS after the reset** - original character, only invariant bugs
fixed. Oil / Flat Hog / Cotton Duck, pickup live, against this morning:

| stroke | this morning | reset build |
|---|---:|---:|
| 1 cell/report (slow) | 0.00752 | **0.00324** |
| 4 cells/report | 0.03452 | **0.00775** |
| 12 cells/report (fast) | 0.05953 | **0.01238** |
| accelerating 1 -> 12 | 0.06918 | **0.01482** |

**Four to five times cleaner at every speed**, speed dependence largely gone
(0.0032-0.0148 across a twelvefold range, against 0.0075-0.0692). Bundling spans
4x where it spanned 19x. Swing 7-10 against 36-80. Every row reproduces exactly.

**Kept, and none of it is "a fix to oil":** the pickup exponent, the readback
settle, the lift seeing its own frame's paint, the raised `rubbed` ceiling, the
trimmed tone metric. All frame-packaging or instrument correctness - invariant 2
work that applies to watercolour identically. Reverting them would restore
measured faults in both media and blind the bench.

## OIL IS BEING REBUILT FROM ZERO — read docs/20 first (2026-08-30)

The artist: *"We need to start from ground 0, as if oil does not exist and start
building it."* [`docs/20-oil-from-zero.md`](20-oil-from-zero.md) is that build.
Nothing has been stripped yet; **the build order is his to ratify first.**

**The evidence for oil is smaller than anyone assumes.** `07-media.md`'s build
rows are Watercolor, Graphite, Ballpoint - **oil is not among them.** It sits in
"The extended roadmap (parked, not built)", which grants it four properties:
`solvent oil`, `bodyShrink ~= 1` (100 % peak retention), multi-day `openTime`,
and a **fat-over-lean viscosity gradient**. `09-acceptance.md` adds zero-to-
minimal value shift, glossy/satin, 2-7 days, one-way door. B04 (IMPaSTo) is the
architecture, and supplies no oil constants.

**The medium row is NOT where oil drifted.** `library.ts` already states its own
derivation - six lines, each mapped to a value - and says plainly "[UNVERIFIED]
Every value below is reasoned from the spec, not measured." That is a sound
ground zero. Two gaps against the roadmap: `bodyShrink` is 0.85 against ~1
(currently unread by any pass, so inert), and **fat-over-lean is not built at
all.**

**The drift is six oil-only shader behaviours, each [UNVERIFIED], each added to
cure a real reported complaint, stacked without anyone standing back:** the
`bridged` tooth-gate fill, the viscosity-narrowed scumble gate, the whole
`level_fresh` pass, `rExchange` + the TVD metric (this one IS ratified plan work
- 18 section 5 step 2), `smearStrength`, and the teflon/workable release. Table
with what each cures is in docs/20 section 3.

**NOT drift, and staying:** `relief: 10`, `hidesGround: 2`, `kInstrument: 0`.
Each set by the artist at the easel on a stated date with reasoning recorded.
Recorded decisions under the fence.

**MUST NOT BE TOUCHED by the rebuild:** the frame-invariance and instrument work
of docs/19 E13/E17. None of it is a fix to oil - it is all invariant 2 work
applying to watercolour identically, and it is the bench that would judge the
rebuild.

## REAL PAINT MEASURED — THE TARGET WAS WRONG (2026-08-30, docs/20 section 7)

The artist supplied reference paintings. `tools/measure-real-paint.py` reads the
same quantity the fish-scale bench reads - along-stroke tone profile, detrended,
relative RMS - on real oil.

| detrend radius | close-up 2900px | Chris Long | palette knife |
|---|---:|---:|---:|
| +/-4 px | 0.0388 | 0.0901 | 0.0947 |
| **+/-16 px** | **0.0907** | **0.1481** | **0.1717** |
| +/-32 px | 0.1139 | 0.1734 | 0.2149 |

**The engine, after a week aimed at this number: 0.003 to 0.015.**

**Real oil carries TEN TO FIFTY TIMES more along-stroke tone variation than we
produce.** Zero was the wrong target. Real oil is not smooth along a stroke -
that structure is most of what makes it read as paint.

**The banding was still a real fault** - its repeat lag tracked frame travel
exactly, and paint cannot know what a browser frame is. **But the goal was never
"make the stroke smooth". It is "the structure must be the brush's, not the
frame's."** Every E13/E17 frame-invariance fix was right and stays; every
instinct to smooth the mark further was aimed at the wrong end.

**What the references show that the engine does not do at all:**
1. **Bristle striation is the dominant texture, not a defect.** `level_fresh`
   exists to SETTLE that comb; the reference says it should be strong.
2. **Colour striates rather than averages** - one sweep carries several colours
   as distinct filaments. docs/17 already named this "the scalar bottleneck";
   it is the largest single difference from our output.
3. **Paint TEARS when dragged thin** - hard-edged gaps, not a smooth fade.
4. **Terminal ridges catch light** - docs/18 section 3a's berm, still unbuilt.

**PROVENANCE: two of five supplied images are NOT evidence.** `1c656e12...`
carries the watermark "Содержимое, сгенерированное ИИ" - **AI-generated**, must
not be cited. `4c714d56...` has no relief, weave or specular; it reads as a
digital painting. Rejected as physical reference. **Check every reference image
for provenance before citing it.**

**CAVEAT: pixels are not cells.** Without a scale reference in frame these
figures cannot be mapped onto engine cells. The gap is far too large to be a
confound, but the exact number is not a target until the scale is known.

## THE ENGINE HAS NO EARTH COLOURS (2026-08-30, docs/20 section 8)

Second batch of artist references, and most of it is **mixing charts with named
pigments** - evidence for the OPTICAL engine, not the fluid one.

**Card 9's proof test #1, done in real oil and measured.** From the labelled
UB+CYM panel, white-balanced on the chart's own ground:

    Ultramarine Blue (Gamblin, oil)   #223066
    Cadmium Yellow Medium (Gamblin)   #dcad02
    their mixture, mid-ladder         #64701c   <- R 100, G 112, GREEN
    naive RGB average predicts        #7f6e34   <- R 127, G 110, tan

The channels swap order. **The product thesis is confirmed on real paint,
measured, not cited from a figure.** First time that test has been run against
material rather than MB21 Fig. 1.

**THE FOUNDATIONAL FINDING.** The library is twelve pigments - Titanium White,
Hansa/Diarylide Yellow, Cadmium Orange, Pyrrole/Quinacridone Reds, Quinacridone
Magenta, Dioxazine Purple, Ultramarine, Phthalo Blue, Phthalo Green, Bone Black.
**That is a modern synthetic palette.** The references run on Yellow Ochre, Raw
Sienna, Burnt Umber, Light Red, Transparent Red Oxide, Cadmium Red Light,
Cadmium Yellow Medium. **Only Ultramarine is in both. There is not one earth
colour in the engine** - and earths are the backbone of oil painting.

D1 already reserves for this ("library of 24-48 is separate"); it sits at 12.
**Oil cannot be built from ground zero on a palette with no earth pigments.** And
these charts are the material to validate additions with - two-pigment series
with white tint ladders, exactly the shape a K/S spectrum is fitted against, and
exactly acceptance proof test #3.

**Worth checking, not a fault:** engine Ultramarine masstone `#382e68` against
the reference's `#223066`. Blue and green agree closely; red is 56 against 34,
so ours reads more violet. One photo, unknown colour management. Check against a
colour target before changing any spectrum.

**A fourth real painting** (thin, scumbled, over a visible weave) reads **0.2091**
at +/-16 px - the highest yet. Real-paint range is now **0.091 / 0.148 / 0.172 /
0.209** across four paintings against the engine's **0.003-0.015**.

**REJECTED:** `4bdaa4d1...`, the loaded brush - a stock product photo of ACRYLIC,
staged for a catalogue. Its one suggestive detail (paint as a blob at the tip,
not through the tuft) is consistent with E18 but must not be cited as evidence.

**STILL THE BOTTLENECK: a scale reference.** Pixels are not cells. Nothing in
sections 7-8 can become an engine target until something of known size is
photographed beside the paint.

## THE ZORN PALETTE IS THE RIGHT GROUND ZERO (2026-08-30, docs/20 section 9)

The artist suggested it. It is the right call, and **two of its four pigments are
already in the engine**: Titanium White (PW6), and **Bone Black PBk9 IS ivory
black** - same pigment, traditional name. Missing: **Yellow Ochre PY43** and
**Cadmium Red Light PR108** (the engine's Cadmium Orange PO20 is the same
cadmium family, spectrally adjacent, not it).

**Why it is right and not just convenient:**
1. **A COMPLETE palette in four pigments** - a full-range painting can be made
   with it, so "does oil work yet?" becomes answerable at the smallest scale.
   Twenty-four pigments is a library; four is a test.
2. **It supplies a second KM proof test we cannot currently run: Yellow Ochre +
   Ivory Black -> GREEN.** Ivory black is blue-biased so real paint goes olive;
   RGB predicts only a darker ochre. **The artist's `b64b8978...` already
   contains it** - its lower panel is Yellow Ochre / Cadmium Red Light / into
   Black and White, which IS a Zorn chart. Validation material already in hand.
3. **It is the skin-tone palette** - if KM reproduces that flesh range from four
   pigments, the optical engine is working in a way no swatch can show.
4. It closes the earth-colour gap with the fewest possible additions.

Ultramarine stays regardless - it is what makes the blue+yellow test possible.

**SETTLED 2026-08-30 - and the earlier guess here was half wrong.** BE16's own
paper is on disk (`~/Downloads/ArtistSpectralDatabase.pdf`) and its Table I lists
**nineteen** paints. Twelve were taken; seven were left: PY184, PO73, **C.P.
CADMIUM RED LIGHT PR108**, PB28, PB36:1, PB15:1, PG36. So **Cadmium Red Light IS
in BE16** (UNVERIFIED: column 7 by Table I order, exact from col 8 on), and
**Yellow Ochre never was** - BE16 has NO earth pigment of any kind, by design.

**The spreadsheet is gone from disk AND from the web.** Machine-wide search found
only the paper. RIT's link is dead; so is the grayskyimaging link to Berns's later
58-pigment dataset (that page now says the spectral database "is no longer
available"). Both doors shut.

**The real damage was never Zorn - it was that the optical library had NO
RUNNABLE INPUT**, a generated file nobody could reproduce, exactly what the fence
forbids. **FIXED:** K/S read back out of `pigments.ts` into `data/be16-ks.csv`,
now the default input to `build_pigments.py` and the provenance of record; keyed
by slug, not column, so it cannot shift a pigment. **Verified byte-identical
regeneration, twice.** It rescues only the twelve already built - Cadmium Red
Light is NOT in it.

**Sourcing, ranked:** (1) `realtimerendering.com/downloads/GoldenSpectra.zip` is
LIVE - 78 Golden Heavy Body acrylics with K/S, same paint line; check whether it
is two-constant K and S or only the ratio, and note it reads 400-700nm (31 bands)
against our 380-750 (38). (2) Wayback Machine - the RIT file was recovered that
way once already. (3) Ask Berns; the 2022 paper says the 2016 file was available
by request. **NEEDS THE ARTIST'S OK before downloading anything.**

**Nothing waits on it.** Both pigments can exist today as **named recipes mixed
from the measured twelve** - not invented spectra, mixtures of measured ones,
which is what the engine does every frame and what the (UNRATIFIED, not in card
10, and NOT D13 - D13 is coverage per thread) studio idea wants anyway. Cad Red
Light ~ Cadmium Orange PO20 + Pyrrole Red (PO20/PR108 are the same cadmium
sulfoselenide chemistry). Yellow Ochre ~ Diarylide Yellow + Bone Black + a little
Pyrrole Red, tuned against the artist's own Zorn chart. Labelled recipe, not
measurement; replaced the day real spectra land.

**Two caveats to record before this is treated as measured oil:** BE16 measured
Golden Heavy Body **ACRYLICS**, not oils - same pigment chemistry, different
binder; a fair K/S proxy, and the existing twelve carry the same caveat, which
has never been written down. And transport rows (rho/omega/gamma) are not in
BE16 at all; an ochre would take a reasoned C97 analog marked UNVERIFIED, as
titanium-white, pyrrole-red and bone-black already do.

**This is a build item in its own right, parallel to the behavioural steps.** The
optical engine can be rebuilt and validated against the artist's charts while
the fluid behaviours are still switched off. It does not wait on step 0, and
step 0 does not wait on it.

## NEXT ACTION

**SUPERSEDED 2026-08-31 — see "THE BUILD ORDER HAS ITS FIRST RATIFIED STEP" at
the end of this file.** The order is no longer waiting on him in full: he has
ratified COVERAGE PER THREAD into it as Step 1, ahead of looking at bare oil, and
it blocks on the scale decision. What follows is the older framing, kept because
steps 0 and 2 are unchanged.

**1. The artist ratifies the build order in docs/20 section 4.** Then step 0:
one flag per behaviour so oil can be built up one at a time and each addition
judged. Then look at BARE oil - nobody has ever seen it, because each behaviour
was added on top of the last.

**2. Still open and still his, from 18 section 5 step 3 (since 2026-08-27):**
one oil pass at Flow well above default - does the THICKNESS look right? And a
crossing - how strong should the CARRY feel? Last accepted figure "3 % feels
correct"; the trail today starts at 20.6 %. `16` is explicit: do not tune it,
show him a crossing and take the verdict.

**3. Engine-side, before any loading model is attempted again:** E18's stranded
paint. 91 % of a loaded tuft is unreachable because `wick` has no cross-bristle
path.


**IT IS THE ARTIST'S, AND IT IS ZERO-CODE.** `docs/18` §3b, the step the plan
stopped on:

1. **Paint one oil pass at Flow well above default. Does the THICKNESS look
   right?**
2. **Paint a crossing. How strong should the carry feel?** His last verdict was
   3 %; the trail currently starts at 20.6 %.

Those two verdicts restart the oil plan at the step it stalled on. Until they
exist there is nothing here worth tuning, and adding more engine work only
widens the drift he is describing.

Then, in the order docs/18 §5 gives: the berm (§3a), then the relief sweep
(§3c). Engine-side, the largest open item remains E18's stranded paint - 91 % of
a tuft unreachable because `wick` has no cross-bristle path - and it must be
settled BEFORE any loading model is attempted again.


**Settle the stranded paint above with the artist — it is the biggest lever
left and it moves the loading and the banding with it.** Then:

**The pickup path is no longer the largest term.** The worst rows are now
**pickup OFF** - 0.0276 to 0.0315, against 0.0084-0.0179 with it on. Much of
their tonal swing (~44) is the brush fading along the stroke, which is correct,
but the DEPOSIT's own ripple is the biggest thing left and has not been looked
at since E16 quadrupled the paint loads. `bundling` is the test for it.

Also open, and unchanged by any of this:

- **Paint stranded in the tuft.** The tuft holds 12.6 % after 3000 cells while
  what it LAYS is down to 1 % by cell 1058. The belly holds paint the tip never
  brings to the paper. A `wick` question, not a capacity one.
- **Strokes over EXISTING paint have never been measured.** Every stroke this
  bench runs lands on bare canvas. The artist reports the banding returns as
  heavy layers build. Add a stage that lays N passes and measures the last.
- **Re-baseline the pickup suite's stacking reference** against E16 loads.

## NEW INSTRUMENTS — node, no GPU, one second

- `node tools/brush-bench.build.mjs` then
  `node tools/brush-bench.mjs density <brush> <medium> [--profile]` — the
  bench's CPU-footprint stage in node, a line-for-line copy of
  `rasterFootprint`. Sweeps flow and speed. This is what refuted E11.
- `node tools/brush-bench.mjs reach <brush> [cells-per-report]` — contact reach,
  tuft advance and segments per solve step. This is what refuted E12.

## THE BENCH NOW STATES ITS OWN SCOPE (2026-08-29)

Every fish-scale panel prints the medium, brush, paper AND the route the engine
actually took, read back off `engine.fluid.params` rather than assumed, plus a
line naming which passes that route SKIPPED and telling you to run the other
medium separately. If the configured route and the live route disagree the
header goes red and says not to read the numbers.

This exists because a session reported this bench as "verified" when every figure
in it was a watercolour figure and the change it verified could not run for oil.
The scope is now the second thing on screen.

## TRAP — a hidden page does not run the benches (2026-08-29, measured)

Chrome clamps `setTimeout` on a hidden page to one call per MINUTE after five
minutes, and never fires `requestAnimationFrame`. The fish-scale bench paced at
one stroke-group per minute and read as a hang; the soak never advanced a
session. Cost most of a session.

- `fish-scale-bench.ts` yields through `MessageChannel` now — safe, pickup is
  disabled there, and it reproduced four old timer-measured figures exactly.
  `soak.ts` does the same only when the page is hidden.
- `pickup-bench.ts` and `banding-bench.ts` were LEFT on the timer on purpose.
  They run with pickup on and yield so async pickup credit can land, so yield
  speed changes what they measure. **Run those two on a visible page.**

## PANELS ARE COLOURED NOW (2026-08-29, Bartford's request)

A successful test reads green. `src/bench/panel.ts` holds the helpers; all four
benches use them. Green means a stated criterion was met — passed, clean, or
*the pair reproduced*. Amber means two identical runs disagreed, which is a
finding about the instrument and must be read before the numbers. Ripple figures
have no threshold, so they are never green on their own merit. It earned itself
on the first run: Oil stacking came back amber, 0.928 / 0.927, from two runs in
one load.

## NEW INSTRUMENT — paint contours, then the terrain view (2026-08-28, Claude)

**Terrain view is the usable one.** Contours alone were measured unusable at fit
zoom; the artist sent a topographic map as the target and pointed out that
colour can carry elevation. **Toggle Terrain View** in the command palette
replaces the picture with hypsometric tint + exaggerated hillshade + contours.
Ceiling defaults to 0.30 — Cotton Duck's tooth — so the ramp's top is "as tall
as the weave it sits on".

The compromise is a ±2 cell smoothing before contouring and shading: furrows
narrower than about four cells are averaged away. It answers *what shape is this
passage*, not *what is in this cell*. Unfiltered height is still on the bench.

**NOT VERIFIED:** whether the lines read well over the tint. Canvas readback
lagged a frame and went stale when rAF was stubbed — every comparison returned
0.0%, including one the row scan proves differs. Needs an eye on a real display.

## NEW INSTRUMENT — paint contours (2026-08-28, Claude)

A topographic overlay on the film height, so the paint's shape can be READ
instead of inferred from its lighting. Command palette: **Toggle Paint
Contours**, plus Finer/Coarser. It contours `wet0.y` raw, which is the same
number the benches print.

Full entry, including what it is good for and where it lies, is
`docs/12-explosion-hunt-log.md` under "Paint contours". Three things worth
knowing before using it as evidence:

- **It is a zoomed-in instrument.** At fit zoom one cell is ~1.5 screen pixels
  and cell-scale roughness merges the lines — measured, ten times the lines for
  five percent more ink. A dense black band at fit zoom is not a finding.
- **Dry media are blank, correctly.** There is no height channel in the dry
  path at all. Giving pastel a body height is a schema change and a D-number.
- **[TRAP] No derivative may be called from non-uniform control flow.** Two
  versions of this were rejected whole — the picture simply does not draw, no
  error thrown — and `npm run build` passed through both, because it never
  compiles a shader. Load the page.

## PAINT PROPERTY CENTRE — the defaults moved (2026-08-28, Claude)

The artist tuned the Paint Properties page by eye, screenshotted it, and asked
for it to become the default **with every slider reading 50%** — a centre he can
push either side of. Those are now the shipped defaults. If a number below
surprises you, it is his and it is deliberate.

| dial | default | slider | where |
|---|---|---|---|
| Impasto Depth | 0.55 | 50% | derived, `depthFromRelief` |
| Smear | 2.75x | 50% | `controls.ts` |
| Relief | 10.0 | 50% | `OIL.relief`, was 26 |
| Sheen | 0.99 | 50% | `controls.ts`, was 0.55 |
| Gloss | wet | **100%** | `OIL.kInstrument` 0, was 0.25 |
| Glossiness | wet | **100%** | derived from the same term |
| Sheen Width | 0.90 | **90%** | `controls.ts`, was 0.632 |

**The three that are not centred cannot be, and that is recorded where someone
would try.** Gloss is `1 - kInstrument`, a Saunderson surface term that is
physically 0..1 and clamped again in `setGloss`; Sheen Width is the lerp
`mix(120, 6, clamp(sheenWidth, 0, 1))`. Both are AT their ceiling, so a centred
dial would need a top half that does nothing — a dial that lies about having
room. Centring them means redefining what "wet" and "broad" mean in the shader,
which changes every existing setting, so it is the artist's call and not a side
effect of a UI request. Glossiness rides Gloss and inherits it.

**Impasto is DERIVED, not set.** It is `depthFromRelief(relief)`, so it cannot
be pinned independently. The 0.69 on his screenshot was what relief **26**
gives; he had since pulled Relief to 10, so 0.69 was a stale readout rather
than a setting, and freezing it would have contradicted the Relief dial beside
it. `depthFromRelief`'s divisor tracks Relief's max (40 -> 20) so it keeps
meaning "how far along Relief is".

**Not a physics change.** `relief` and `kInstrument` are read only by
`composite.wgsl`; no solver pass touches either, so no pickup, stacking,
holding or conservation number can move. Verified by construction, not by
re-running the bench.

## LIVE CHECKPOINT — directional Flat Hog snakeskin

**Build/browser state.** `npm.cmd run build` passes. The live D: checkout is
served at `http://127.0.0.1:5175/`; a fresh reload produced no new WebGPU
errors. The tree is deliberately dirty and uncommitted. Do not push without
Bartford's fresh authorization.

**Current objective.** Remove the broadside Flat Hog's repeated scale/chatter
without blurring away brush furrows or making a screen-direction special case.
Active evidence is `docs/19-paint-on-canvas.md` §6.

**IN FLIGHT.** The `[UNVERIFIED]` Flat Hog `bundleOverlap: 1.45` remains because
Bartford reports it improved the Hog, but both flat brushes still band. A new
`tools/brush-bench.ts pulse` probe is kept. The attempted shared spine
continuation was measured, worsened Hog contact cadence, and was fully reverted.
`composite.wgsl` and docs/19 also carry the preceding paint-grounding pass.
The post-footprint test is complete and retained as
`src/bench/banding-bench.ts`; load `?banding=2` to repeat it. It changes nothing
without that query parameter.

Bartford authorized the frame-invariant Smear fix. It is implemented and all
paired automated gates pass; details are `docs/19-paint-on-canvas.md` E2. The
normal browser page is open on Oil / Flat Hog / Cotton Duck for artist review.

**DECISIVE RESULT — reproduced.** Same Flat Sable/Oil/Cotton Duck path, one
report per frame versus four: stored-body ripple rose 0.0235 -> 0.0484 and the
height pattern locked to the 16-cell frame boundaries at 0.1992. Turning only
Smear off, with fresh-paint levelling still on, reduced that lock to 0.0568
(71% lower) and body ripple to 0.0177 (63% lower). Paired runs reproduced.
The common snakeskin is stored-height stepping caused mainly by the frame-wide
shove in `deposit.wgsl`, not a brush reset, canvas generator, or compositor.
Full entry: `docs/19-paint-on-canvas.md` E1.

**NEXT ACTION — make Smear independent of browser frames, not weaker.** Keep
pickup and total paint movement intact. First split the two shove contributions
in `deposit.wgsl:644-687` under the same four-report bench: pressure-carried
versus laden-brush `grabCarried`. Then replace the guilty frame-wide use of
`Ctl.travelX/Y` with travel measured from the resampled footprint step(s), or
fixed sub-batches whose boundaries do not depend on requestAnimationFrame.
Acceptance: the 1-report and 4-report `wet0.y` profiles agree closely and the
four-report frame-locked span falls near the 0.05 baseline with Smear still 1;
run each twice, then confirm blue is still pushed through yellow before asking
Bartford to judge Flat Sable and Flat Hog broadside strokes.

**COMPLETED.** Both shove routes contributed (pressure-only span 0.1239,
complete 0.1992, Smear-off 0.0568). Wet footprint segments now carry their own
<=0.9-cell travel and solve id; `deposit.wgsl` combines each resampled contact's
pressure/grab fraction inside the frame. Afterward, 1-report versus 4-report
stored-body ripple is 0.0151 versus 0.0153; the four-report phase span is 0.0607,
at the 0.0568 levelling-only floor rather than the old 0.1992 seam.

**ARTIST VERDICT — E2 IS NOT A VISIBLE FIX.** Bartford reports no visible change
in either flat brush. The frame-dependent stored-height seam was real and the
instrument shows it removed, but it was not the dominant visible snakeskin.
Do not call the symptom solved. Lighter-pressure strokes show much less of the
pattern, which makes the pressure/contact ramp the current lead.

**CURRENT NEXT ACTION — artist check of the flat-brush pressure trial.** The
instrument's stale 8-float stride is repaired and all pressure probes reproduced.
The pen curve is linear; the brush response is stepped. Both flats jumped from
five to ten contacting spine joints around the middle/firm part of the dial, and
their mark width snapped narrower rather than spreading naturally. The reset
hypothesis is still rejected: Sable contact never pulsed, while Hog's pulse was
in the direction the artist says already looks better.

Both flat brush rows now carry an `[UNVERIFIED] pressureExponent: 1.6`; Round
Sable is untouched. This makes mid-pressure gentler without changing zero or
full pressure, and moves Hog's 5-to-10 contact transition from 0.65 to 0.80 in
the paired ramp. Sable remains more sensitive and transitions sooner. Build and
the live full regression suite pass, with the expected changed Oil contact:
crossing lift 36%, trail to 1.9%, stacking 0.937, holding 92.6%, Watercolour
drift at zero to reported precision. The normal 5175 page should be left on Oil /
Flat Hog / Cotton Duck. Bartford should compare comfortable-pressure broadside
strokes in Hog and Sable. If the scales materially retreat, keep the softer flat
response and next smooth the remaining Sable contact step. If there is no visible
change, revert `pressureExponent` before further contact work; do not call it a
fix based on the bench alone.

**Measured, reproduced as paired current-source runs.** At pressure 0.75 the
shared overlap 1.15 paints 53% of the Flat Hog footprint; 1.45 paints 60%.
Track-spacing variation remains 205% in both, so the change connects more of
the coarse bundles without regularising their placement. This does NOT prove
the visible snakeskin is fixed.

## Housekeeping settled 2026-08-26 — read this before doubting which tree you are in

- **`tuft-fill` is now the repository's DEFAULT branch on GitHub** (was
  `webgpu-test`). A fresh clone lands here. Bartford: this is the working point
  and it is not going back; new branches may be built off it.
- **`ui/frontend-0alpha` in `C:\Users\benja\Documents\aniso-paint-pre-a01` is
  ABANDONED** and now carries a STOP signpost at the top of its own
  `docs/HANDOFF.md` pointing here. It cost a session an afternoon on 2026-08-26:
  its Part A still named the wrong branch, worktree and port, and the correction
  committed here as `7a741da` never existed in that clone. **If a file tells you
  where the work is, check the drive letter before believing it.**
- **`5cf482c` and `002b488` are pushed.** `origin/tuft-fill` is level with local
  HEAD; nothing is waiting. The 7 modified files in the tree are Codex's
  deliberate in-flight state per IN FLIGHT below — still uncommitted, still
  unpushed, by instruction.
- **The port is 5174, pinned.** `vite.config.ts` now sets `port: 5174` with
  `strictPort: true`, and `tools/start-ipad.ps1` defaults to 5174 to match. That
  script passes the port on the command line, which OVERRIDES the config — its
  stale 5173 default is why 5173 kept coming back regardless of the config.

## ARTIST VERDICT — 2026-08-26, yellow through wet blue, Oil / Flat Hog

Bartford painted the crossing. Two halves, one passes and one fails:

- **CARRY: ACCEPTED.** "3% feels correct." The trail composition question that
  has been open since docs/16 E5 is **closed**. Do not tune the carried
  percentage without a fresh instruction — it is right.
- **REMOVAL: REJECTED.** "The blue paint underneath the yellow stroke did not
  leave the canvas. It stayed right in place." The IN FLIGHT acceptance below
  is therefore NOT met; the contacted blue is still sitting under the stroke.

**Measured on the live page during that same session, not reasoned:**

| quantity | value | where |
|---|---|---|
| `roomFraction` (brush ~85% full) | 0.154 | reservoir.ts |
| `brushTake` = upRate × room | 0.052 | stroke.ts:182 |
| medium `upRate` (Oil) | 0.42 | fluid params |
| `yieldStress` (Oil) | 0.34 | fluid params |
| `smearStrength` | 1.0 | fluid params |
| `SMEAR_RATE` | 0.10 | deposit.wgsl:172 |
| shove share (press ≈ 1) | 0.6, its cap | deposit.wgsl |
| **most the shove can move, per cell travelled** | **6% of the film** | 0.6 × 1.0 × 0.10 |
| brush composition after the crossing | 13.3% blue / 86.7% yellow | `__stroke.live` |

**Diagnosis — the two mechanisms are unbalanced, and only one of them scales.**
A freshly dipped brush correctly cannot drink: `brushTake` collapses to 0.052
because `roomFraction` is 0.154. The code already says what should happen
instead — "a brush that has run down drinks where a freshly dipped one mostly
shoves" — but the shove does **not** rise as the drink falls. It is a flat 6%
per cell whatever the brush is holding. So at the moment the brush is fullest,
and shoving hardest in real life, the engine is at its weakest on both routes.
That is why the blue stays put.

## The instrument traps — still binding, all six (2026-08-26)

**Read this before running any experiment.** Five measurements went wrong in one
session, each producing a confident, plausible, wrong number. Every one was
caught only by the artist looking at the screen. The pattern is not bad luck:

1. The browser console keeps WGSL errors from shader versions that no longer
   exist — a fixed shader looked broken through two reloads.
2. A step sweep fed more stylus samples as it shrank the step, so it also ran
   `engine.step()` more often and measured fluid relaxation, not sampling.
3. `Reservoir.take` floors travel at `STILL = 0.25`, so any finer step lays 75 %
   more paint per cell and the readings invert.
4. `CanvasEngine.onPickUp` is a setter with NO getter, so reading it returns
   undefined; a probe "found" the credit path unwired when it was fine, then
   broke it by overwriting.
5. Pickup was measured over a whole region including cells the brush never
   touched, understating it by 20x.

And a sixth that is a process fault rather than a code trap: the runs set the
medium through the engine API and never touched the UI, so **the tool bar read
"Watercolour / Round Sable" while the solver ran oil.** The physics was right and
the labels were lying — confirmed from `fluid.params` — but it cost trust, and
the pickup runs also failed to pin the paper, so they were not identical setups.

**NEXT ACTION — read `docs/19-paint-on-canvas.md` and execute its §5 order of
attack, starting with the perimeter probe in §3a. Build the instrument before
touching a dial; that rule has been earned seven times in this file.**

## FOR THE NEXT MODEL — start here (written 2026-08-28, for Codex)

Bartford handed this over deliberately, not mid-crisis. The tree is clean, every
branch is pushed, and nothing is half-finished. Read in this order:

1. This file's Part A (protocol), then `CLAUDE.md` (what the project is).
2. **`docs/19-paint-on-canvas.md`** — your job. Suggestions only, nothing built.
3. `docs/16` E10 for the state of the brush, and `docs/18` for oil body. Both
   are DONE; you need them as context, not as work.

**The task in one line:** the paint looks like a sticker floating above the
canvas, and the artist named the cause himself — *"the shadow is making it look
like it floats."* `docs/19` breaks that into three visual cues, anchors each to
the line of `composite.wgsl` that produces it, and proposes a fix per cue with
an order to try them in. It is a LIGHTING problem. Do not go fixing it in the
solver; the film's sharp edge is real and is `yieldStress` working correctly.

**Two things in `docs/19` that are easy to miss and will save you a round:**

- E10 made this WORSE by making the paint five times taller. The float is
  partly the price of the body fix, which is why it shows now. Do not "fix" it
  by undoing body.
- Do NOT shrink `paintRelief` or raise the 0.25 shade floor to kill the outline.
  Both re-flatten the interior that the artist's own 0.82 -> 0.45 -> 0.0 -> 0.25
  sweep just won. That history is in `composite.wgsl` around :727.

**What is verified and must not regress.** Re-run these after any change; they
are one import in the browser console and they assert their own setup:

```js
const b = await import('/src/bench/pickup-bench.ts');
await b.stacking(__engine, __stroke);          // last/first must stay ~0.897
await b.crossing(__engine, __stroke);          // lifted ~33%, trail 12.4 -> 1.8
await b.holding(__engine, __stroke);           // peak ~92.6%, passed true
await b.watercolourControl(__engine, __stroke);// pigment 32.9182, to 4 decimals
```

The watercolour control is the sharpest one: every pickup change is gated on
`workableBody`, which is exactly 0 for any medium with `yieldStress 0`, so that
number moving means you have broken the gate.

**Run everything twice on an identical command line before interpreting it.**
This is not ceremony. Seven measurements in this file were confident, coherent
and wrong, and the artist caught most of them by looking at the screen. The
seventh was three days ago: a dial set on a console-`import()`ed module does not
reach the running app, and the sweep returned identical numbers for 0 and 1.0.
**Treat a flat sweep as a broken instrument before treating it as a finding.**

**Marking your work.** You are on `amd / gcn-4` only if you are on Bartford's
Windows box; say so in every log entry either way, because the GPU is a suspect
in the open `--precision full` fault. Mark reasoning `[UNVERIFIED]`, measurements
`[MEASURED]`, and strike retractions rather than deleting them — several entries
here are valuable precisely because they record what was tried and failed.

## 2026-08-27, later — oil builds body now, and E9's three faults were two bugs

`docs/18`'s suspect was right and bigger than it looked. The brush was lifting
what it had just laid, because the exchange had no notion of LIKE paint. Four
stacked passes, film summed over a fixed corridor:

| | p1 | p2 | p3 | p4 | last/first |
|---|---|---|---|---|---|
| pickup OFF | 47.2 | 94.6 | 142.1 | 189.6 | 1.007 |
| pickup ON, before | 24.2 | 31.6 | 36.8 | 41.0 | 0.174 |
| pickup ON, after | 46.2 | 90.7 | 133.5 | 175.0 | **0.897** |

Peak film after four passes went 0.053 -> **0.263**, against a canvas tooth of
0.30. Oil buries the weave for the first time.

Four fixes, all in `docs/16` E10 with the numbers: the like-paint scaling; the
holding ledger (E9 fault 3 was a MIS-MEASUREMENT, no paint was ever created);
the surface film rationed per hair segment instead of offered whole to all ~150
of them (E9 faults 1 and 2 were this one bug); and pickings bleeding inward
through `wick` at a new swept constant `SURFACE_BLEED = 0.1`.

The trail now goes 12.4 -> 1.8 % over fifty cells instead of sitting flat at
44 %. Holding peaks at 92.6 % and passes. **The watercolour control is
unchanged to four decimals (32.9182).** Confirmed by eye: yellow in pure, green
through the band, yellow again below it.

**A seventh instrument trap, and it nearly cost the session:** a dial set on a
console-`import()`ed module does NOT reach the running app — different module
instance. The first sweep returned identical numbers for 0 and 1.0. Set bench
dials on the live object's own constructor, and treat a flat sweep as a broken
instrument first.

## WHERE WE STOPPED — 2026-08-27, docs/17 executed, three things still wrong

All three parts of `docs/17-pickup-rework.md` are built, benched and committed:
`55a57f0` (bench + step 0), `8e4b0d9` (Part A — contact is an exchange,
`SURFACE_EXCHANGE` retired), `fe57146` (Parts B and C — surface film on the
reservoir; laid colour is the colour of what was withdrawn this frame).

**It works.** Contacted blue lifted went 24.5 % → 33–37 %; blue in the trail ten
cells past the crossing went 1.6 % → 44–50 %. Artist confirmed by eye: yellow
enters pure, crosses, comes out green, carries it forward, and the band is
visibly thinned where crossed. His words: *"the lower layers are behaving far
better."* The full table, method and traps are `docs/16` **E9** — read it, it
carries the reasoning these three lines do not.

**The three open faults, in priority order. E9 has the detail and the
discriminators; do not re-derive them.**

1. **The carried colour never fades.** 44–50 % and flat past 10 cells; target was
   ≥10 % decaying. **[UNVERIFIED]** hypothesis in E9: the trail figure is a
   ratio, and it may have risen because *less yellow* is arriving, not more blue
   — removal actually fell from Part A's 57.5 % while the trail rose 50×.
   Measure absolute blue AND yellow laid per cell, plus the film's own blue
   fraction, before believing either story.
2. **It probably picks up far too much.** The artist's only accepted carry number
   is **"3 % feels correct"** (2026-08-26, ARTIST VERDICT above). 45 % is fifteen
   times past it. His eye may have moved — ask, do not assume, and do not tune to
   a number. Dial is `SURFACE_SHARE` (`reservoir.ts:105`, 0.08); judge it after
   (1) is understood.
3. **Holding reaches 100.7 % against a 100.5 % guard.** Paint is being created.
   **[UNVERIFIED]** first suspect: the film's capacity may not be subtracted from
   the rooms', so film + overflow can exceed 100 %. Check `surfaceCapacity`
   against `totals()`. This is a bug, not a dial — fix before tuning anything.

**Harness limit:** readings spread ~10 % run to run (async GPU pickup tally).
A 5 % move means nothing.

**Serving the iPad:** `tailscale serve --bg 5174` publishes the dev server at
**https://bfamily.tail5d46e0.ts.net/** with a real certificate — stable across
sessions, unlike the cloudflare tunnels. WebGPU needs the secure context, so this
is the route. `vite.config.ts` allows `.ts.net` and `.trycloudflare.com` hosts.

**Repo state:** `tuft-fill`, working tree clean.

**Also on file:** `docs/18-oil-body.md` — the artist believes oil is missing
body/mass and asked for suggestions documented, nothing built. It argues the
mass variable already exists (`w0.y`), names the Part A exchange as the prime
suspect for the E10 stacking saturation, and queues a one-run discriminator
plus a berm proposal. Read it before touching oil thickness.

## E13 — the pickup gate was shut, not throttled (2026-08-26)

**The artist's standard.** "Paint strokes need to pick each other up, mix each
other around, blend on the canvas… The orange paint simply lays on top, it
doesn't pick up bottom layers almost at all. While there should be some
resistance to that, it shouldn't be a ton."

**Method.** Blue band, then a fully-charged yellow Flat Hog dragged across it.
Blue removal counted only in the cells the yellow actually reached — measuring
the whole region understates it badly, since most of the blue is never touched.
Every row run twice, agreeing to every digit.

| room floor | blue lifted where touched | brush holding |
|---|---|---|
| 0 (as shipped) | 10.7 % | 97.5 % |
| 0.2 | 20.1 % | 98.1 % |
| 0.5 | 34.4 % | 98.9 % |

**Why it was shut.** `roomFraction` gates pickup and reaches zero at capacity.
The code assumed a full brush "drops below full within a few cells and starts
taking again on its own". Measured over a 150-cell stroke, its room opened from
0 to **0.038** — a charged tuft holds far more than one stroke lays, so the gate
stays shut for the whole stroke. With no floor, pickup is not throttled, it is
off. Removal at floor 0 is 10.7 % locally and **0.5 % across the region**, which
is the artist's "almost at all" in one number.

**The revert that caused it was aimed at the wrong culprit.** The floor was
removed because a brush once finished strokes holding 158 % — even 516 % — of
capacity while the sheet went bare. That was real, but it happened alongside a
deposit that charged per frame and counted the hand's speed twice, fixed in
`5cf482c`. Re-measured with the charging correct, **six scrubs through wet paint
with no recharge, holding never exceeds 100 % at any floor tried** (97.5 / 98.1 /
98.9 %). The overfill does not recur. The floor was reverted for a fault that
belonged to something else, and the note in `reservoir.ts` arguing against it is
struck through there.

**Applied.** `SURFACE_EXCHANGE = 0.35` — a brim-full tuft still trades paint at
its surface even with no room to net-gain any. On a heavier blue field that
gives **29.8 %** lifted where touched, blue reaching the brush, holding at 98 %.

**[UNVERIFIED] and it is a feel number.** Artist verdict owed: 0.35 against the
standard "some resistance, but not a ton". The table above is the dial — 0
restores the shut gate exactly, 0.5 lifts about a third.

**Watch for, when judging it:** pickup and deposit both scale with contact, so a
brush that lifts more also blends more of what it lifted back out. If crossings
now go muddy rather than mixed, that is the place to look, not the floor.

## E12 — the snakeskin is the BLADE's angle to travel, not the screen axis (2026-08-26)

**Artist report.** "See how clean the vertical strokes are - and then the
horizontal strokes. These were approximately same pressure, just vertical is
smooth and horizontal is snakeskin."

**A wrong fix first, retracted.** The session before this read the joint-count
ramp (5 of 30 joints touching across the whole comfortable pressure range) and
put a `pressure^0.45` curve on the wet path. The reading was real; the diagnosis
was not. Pressure knows nothing about which way the hand is travelling and
cannot produce a directional pattern. Reverted to raw at the artist's request;
`PEN_GAMMA` is kept as a documented identity in `input/stroke.ts`.

**Method.** Matched strokes, same pressure 0.6, same tilt 35°, 160 cells long,
ripple measured as the variation of the cross-stroke mean ALONG the stroke —
i.e. how much the mark pulses down its length. Every condition run twice, all
pairs agreeing to every digit.

| | ripple |
|---|---|
| travel horizontal, blade broadside | 0.153 |
| travel vertical, blade broadside | 0.133 |
| travel horizontal, blade edge-on | 0.091 |
| travel vertical, blade edge-on | 0.091 |

**What it proves.** The pattern follows the blade's angle to the direction of
travel, NOT the screen axis. Dragged broadside the mark ripples; dragged edge-on
it does not, and the two edge-on cases agree exactly. The artist's vertical and
horizontal strokes almost certainly differed in how the blade was held, not in
which way they ran.

**Not the ground.** Ripple ratio is 1.45–1.47 on Cotton Duck, on Flat White
(smooth), on Medium Texture (watercolour), and with `toothAmp` forced to 0. The
paper generator is exonerated.

**The mechanism, settled.** It is Card 6 beading arriving on the other axis:
broadside, the contact patch is long across the stroke and thin along it, so
each resampled step advances by nearly its own thickness and the stamps touch
instead of overlapping.

~~The step sweep does not behave — 0.90 -> 0.155, 0.45 -> 0.121, 0.225 -> 0.128,
0.113 -> 0.172, non-monotonic.~~ **RESOLVED: that was a broken instrument, twice
over, and both faults were mine.**

**Fault 1 — the STILL floor.** `Reservoir.take` floors travel at `STILL = 0.25`
of a cell so a held brush still bleeds. Any step under 0.25 therefore charges as
though the hand had moved further than it did. Measured:

| maxStep | paint per cell | ripple |
|---|---|---|
| 0.90 | 0.0677 | 0.141 |
| 0.45 | 0.0686 | 0.074 |
| 0.30 | 0.0695 | 0.065 |
| 0.25 | 0.0693 | 0.064 |
| **0.20** | **0.1212** | 0.113 |

Above the floor, deposition per unit distance is invariant within 2.7% and
ripple falls monotonically. At 0.20 the brush lays 75% more paint per cell and
the reading is meaningless. **Never take a resampling step below 0.25 without
changing that floor too.**

**Fault 2 — the sweep changed two things.** It fed more stylus samples as it
shrank the step, so it also called `engine.step()` more times and the paste
relaxed between those extra frames. Most of the apparent gain was extra fluid
iterations, not better sampling. Holding the sample count fixed and varying only
the sub-step gives a much smaller, honest number.

**Fix applied, and its real size.** `StrokeEngine.stepFor` scales the sub-step by
how broadside the blade is — `|sin|` of the angle between travel and the blade
axis — from 0.90 edge-on to 0.30 broadside. Matched strokes, each run twice:

| | before | after |
|---|---|---|
| broadside, horizontal | 0.153 | 0.118 |
| broadside, vertical | 0.133 | 0.120 |
| edge-on, either way | 0.091 | 0.092 |

A 10–23% reduction, edge-on untouched, at about 2.7x the footprint segments on a
broadside stroke (5283 against 1952).

**ARTIST VERDICT — REVERTED, 2026-08-26.** "It's no different, so just revert."
The code is back to a flat 0.9; the two instrument faults and the mechanism are
kept in the comment on `StrokeEngine.maxStep` and here, because both are worth
more than the fix was. **The lesson to carry: the mechanism being right does not
make a fix worth having.** A measurable 23% that costs 2.7x and is invisible at
the easel is a bad trade, and the only way to find that out was to ask.

**Still open.** Ripple does not go to zero. Whatever remains at 0.118 is not the
sub-step, since the sweep's floor of ~0.064 turned out to be fluid relaxation
rather than sampling. The per-hair footprint accumulation is the next place to
look.

## E11 — why Cover made the paint stop looking like paint (2026-08-26)

**Artist observation, from a screen recording.** "When cover is off completely,
the paint suddenly looks more like paint. I dunno, something to consider." In
the recording the same scumbled blue passage reads as thin oil over canvas at
Cover `stains`, and as flat slabs of blue at Cover `1.06x`.

**Cause, from the source.** Coverage does not only hide the ground's colour, it
multiplies the ground's TEXTURE out of the lighting as well:

```
seen = exp(−hidesGround × (laid × thickScale + standingBody) × 2)
gx   = (paper slope) × visiblePaperRelief × seen + (paint slope) × paintRelief
```

So a covered passage loses the weave from its shading — and nothing replaced it,
because the paint's own relief was capped at an 18% tonal swing by the `0.82`
shade floor. A covered passage therefore had almost no surface left to look at.
Turning Cover off brought the weave back and it did the job the paint's own
surface should have been doing.

**This is the same finding as the white-outline note, from the other side.** Both
say the paint's own relief has no tonal range to work with. The shade floor for
paint is now `0.0` at the artist's request (`400bc52`, then this commit) — the
end of the range, so the resting place can be found by coming back down from a
known extreme rather than guessing upward.

**What it does NOT prove.** Nothing here says `hidesGround 3` is wrong. The
opacity may be right and only the surface missing. Judge them separately: with
the deeper shadow in place, look again at whether Cover up still flattens the
paint. If it does, the next suspect is that `seen` gates the weave to nothing
long before the paint is thick enough to justify it.

## E10 — the body-field premise, measured before building it (2026-08-26)

Bartford asked for a body field and the eleven-second timer fixed. The timer is
done (`26b7370`). The body field is NOT started, deliberately, because measuring
first changed what it should be.

**Method.** Four stacked Oil passes with the Flat Hog, load 1.0, then 600 idle
steps, reading peak and mean film straight from a `wet0` dump.

| | peak film | mean film |
|---|---|---|
| 1 pass | 0.5624 | 0.0724 |
| 2 passes | 0.8145 | 0.1010 |
| 3 passes | 0.9386 | 0.1180 |
| 4 passes | 1.0159 | 0.1295 |
| after 600 idle steps | 1.0151 | 0.1304 |

**What it proves.** Oil height accumulates across passes and then HOLDS — 0.08%
lost over 600 idle steps. It is not leaking, not slumping (its slopes are far
under `yieldStress` 0.34) and not evaporating. What made a stroke read as a thin
wash was the 90° blade bug fixed in `8d43c41`, which halved film depth per cell.

**So a second height field is probably the wrong build.** The paste solver flows
`wet0.y`; adding a parallel `h_p` would give oil two heights and leave the solver
moving the one that is no longer the paint. On the retired branch that split made
sense because paint sat in a water film. Here the film IS the paint.

**Two things the measurement did surface, both real:**

1. **It saturates.** Each pass adds less: +0.56, +0.25, +0.12, +0.08. Real oil
   keeps building. This is the likeliest remaining cause of "doesn't hold body",
   and it is also the old "should only take one or two thick strokes to cover"
   complaint wearing different clothes. Cause not yet established — candidates
   are the deposit's own tooth/bridge gate closing as height rises, and the
   brush exchanging out as much as it lays.
2. **Oil can never cure.** `justDried` fires only when `hf <= WET_EPS`, and
   oil's film never leaves, so the transition is unreachable. `bodyShrink 0.85`
   therefore cannot fire even if it were wired. With the timer fixed this is
   now mostly academic — `w` takes ~5.9 hours of painting frames to reach zero,
   which for a session means oil correctly never sets — but any future
   cure-driven behaviour has to be driven by `w`, not by the film vanishing.

**NEXT ACTION on body, pending the artist's look.** Bartford is to paint Oil
with the blade fix and the timer in place and say whether it now has body. If it
still does not, chase the saturation in (1) — instrument the deposit gate under
a stacked pass and find which term is closing — before adding any field.

## E9 — the shove now scales, and it is NOT enough (2026-08-26)

**Applied.** `deposit.wgsl` splits one grab into two outcomes: the share the tuft
has room for is drunk, the remaining `1 - room` is shoved. `brushGrab` (the grab
before the room clamp) rides in Ctl lane 10, spare in both paths, so the uniform
card is unchanged at 48 bytes. `room` is recovered as `brushTake / brushGrab`
rather than sent as a third number that could drift.

**Method.** Blue stripe, then a fully-charged yellow Flat Hog dragged across it,
driven through `StrokeEngine` directly (no synthetic PointerEvents — those cannot
paint, see the traps). Oil, Cotton Duck, pressure 0.65. Every condition run twice
on an identical command line; all four pairs agreed to every digit printed.

| condition | sheet pigment after |
|---|---|
| smearStrength 1, new term OFF | 463.309 |
| smearStrength 1, new term ON | 445.396 |
| smearStrength 12, new term OFF | 429.714 |
| smearStrength 12, new term ON | 429.014 |

**What it proves.** The term does what it was designed to do, and it introduces
no leak of its own: it moves the sheet total the same way turning the existing
`smearStrength` dial does, and by smear 12 the two arms converge on the same
floor. The pre-existing sheet-falls-as-shove-rises behaviour is visible with the
new term OFF, so it is not this change's doing.

**What it does NOT prove, and the retraction.** It does not meet the artist's
acceptance. Screenshotted side by side at smear 1, ON and OFF are
indistinguishable by eye, and raising the dial to 12 saturates without clearing
the blue. ~~"the shove does not rise as the drink falls … that is why the blue
stays put"~~ **RETRACTED at E9**: the imbalance was real and is now fixed, but it
is NOT the whole cause. Something downstream binds first — the per-frame ceiling
`w0.y * 0.9`, and the fact that the shove only moves paint one cell along the
travel direction, so it nudges the blue along instead of clearing it.

**Where to look next, NOT yet attempted.** The artist's words are "pick each
other up, mix each other around". A laden brush dragged through wet paint is
unloading and loading at the same time, so gating pickup on `roomFraction` alone
may be the wrong model: the room it needs is the room it is making as it
deposits. That is close to the `max(brushTake, …)` bypass reverted on
2026-08-25 for emptying the canvas — but that revert happened while the
per-frame charging bug was still present, and that bug is now fixed, so the
reason it emptied the sheet may no longer apply. **Do not re-apply it without
re-running E7/E8 first.**

**Superseded proposal, kept for the trail.** Scale the shove by
how full the tuft is (the complement of `roomFraction`), so drink and shove hand
over to each other instead of both fading. **This does not reopen the
2026-08-25 canvas-emptying failure**: that was `lift()` REMOVING paint into the
brush, and it broke conservation of what the sheet held. Shoving is a matched
give/receive transfer between cells — the paint stays on the canvas, it just
stops sitting under the stroke. The two failures are not the same mechanism.

> Part B was 750 lines of finished work from early August. It has been replaced
> wholesale with the live state, per "rewrite freely, keep it short and true".
> Everything cut is in git history and in the numbered logs; nothing was lost.
> **Part A §A6 was also corrected** — it named the wrong branch, the wrong
> worktree and the wrong port, which would have sent you to the wrong checkout.

---

## Build state — verified 2026-08-25, not assumed

- `npm run build` **passes** (`tsc --noEmit && vite build`) when run with normal
  Windows permissions. The sandbox-only run hit `EPERM` writing Vite's temporary
  config file; the escalated run passed. Vite emitted only the existing >500 kB
  chunk warning.
- Working tree has **one documentation change**: `docs/HANDOFF.md`. HEAD `7a741da`.
- Branch **`tuft-fill`**, **12 commits ahead of `origin/webgpu-test`**, nothing
  pushed. **Do not push without asking Bartford.** He authorises publication
  case by case; that has been the standing rule all through this repo's history.
- The page loads and paints with no WGSL or WebGPU validation error. Checked by
  `device.pushErrorScope('validation')` around a real stroke, not by reading the
  console — the console in a long session keeps errors from shader versions that
  no longer exist and they will fool you.

## Current objective

**Settle the unresolved brush-to-sheet accounting question before changing pickup strength.**
The active evidence log remains `docs/16-pickup-log.md`; the artist has not yet given
a verdict on whether the measured ~3% blue pickup trail is too shy or too strong.

**Active logs:** `docs/16-pickup-log.md` (newest, brush pickup),
`docs/15-paste-flow-log.md`, `docs/14-tuft-geometry-log.md`.

His words, 2026-08-25, and the standard to measure against:

> "Paint strokes need to pick each other up, mix each other around, blend on the
> canvas, leave ridges behind - all that fun stuff. The orange paint simply lays
> on top, it doesn't pick up bottom layers almost at all. While there should be
> some resistance to that, it shouldn't be a ton."

---

## NEXT ACTION

**Run docs/16 E2 again as E7, with known total tuft coverage, before touching pickup numbers.**
Use the standing setup from `docs/16-pickup-log.md`: Oil, Flat Hog, load 0.75,
mouse pressure 0.65, 512 grid, pickup entirely off. Record the brush pigment drop,
the total coverage laid by the stroke, and the sheet pigment gain from the GPU dump.
Drive exactly one engine step per task with `await new Promise(r =>
setTimeout(r, 0))` between steps. Repeat the identical run twice. If sheet gain is
still greater than brush loss by the same coverage factor, document that the
instrument is measuring deposited coverage rather than brush-mass conservation and
leave the engine unchanged; if the ratio changes materially, inspect the deposit
coverage path before adjusting pickup. This is the next step because pickup strength
changes every stroke and should not be tuned against a broken conservation check.

Pickup landed today (`90479a0`) and works, but *how much* it picks up is a
by-eye call that has not been made yet. Measured today: an orange stroke pulled
across a blue stripe now carries blue the full 164 cells to the end of the
stroke, and the trail comes out about **3 % blue** (docs/16 E5). Nobody has said
whether 3 % looks right.

Ask him to paint orange through wet blue, oil, flat hog, and say whether the
muddying is too shy or too strong. Then:

- **Too shy** → raise `MediumPhysics.upRate` for oil in
  `src/media/library.ts:106` (currently `0.42`), and/or
  `ReservoirDef.upRate` for the flat hog in `src/brush/library.ts:184`
  (currently `0.34`). The deposit multiplies the two.
- **Too strong** → lower the same two.

**How to tell it worked.** Re-run docs/16 E5 exactly: oil, flat hog, load 0.75,
blue stripe down x=256, orange across at y=250, then `fluid.dump('wet1')` and sum
slot 0 over y 230..270 at x = 265, 300, 340, 380, 420. Baseline today is
`0.0198, 0.0175, 0.0141, 0.0127, 0.0089` against orange `0.67, 0.63, 0.58, 0.59,
0.48`. **Drive one engine step per task with a `await new Promise(r =>
setTimeout(r, 0))` between steps** — see the trap in docs/16 E4 or your numbers
will be fiction.

**Also flag to him, because it changes every mark and not only crossings:** a
stroke now lays about **20 % less paint** than before, because a wide tuft trails
over ground its own leading edge just covered and takes a little back (docs/16
E6). That is real brush behaviour, but it is a change to the feel of everything
and he has not yet said whether he likes it. If he does not, it is the same two
numbers.

### If he is not available — the concrete job that does not need him

**Settle docs/16 E2: the deposit is not one-for-one.** With pickup entirely off,
a single stroke took `95.757` off the brush and put `223.577` on the sheet — a
factor of about 2.3. A hair's withdrawal is laid into *every* cell its footprint
covers (`take = cov * prof * gate`, `deposit.wgsl`), so coverage multiplies it.

This may be the intended reading of coverage or may be a long-standing fault. It
matters because it defeats any brush-versus-sheet conservation check, and it
invalidated three measurements in one afternoon before it was found. Decide it
with a measurement, not an argument: lay one stroke with a footprint of known
total coverage and compare. Write it up in docs/16 as E7 either way.

---

## IN FLIGHT

**ARTIST SEMI-PASS / CLAUDE HANDOFF — Codex, 2026-08-25.** Bartford gives the
latest Oil state a semi-pass and is switching to Claude because Codex credits
are exhausted. Do not treat the material as accepted: the newest wet-remnant
pickup mapping still needs the blue-under-yellow Pencil verdict recorded in the
checkpoint below. Resolution context for visual judgement: the square document
is `1024 x 1024`; wet paint/Oil physics and pigment fields are `512 x 512` (one
wet cell spans 2 document pixels); dry media use `2048 x 2048`; paper appearance
is evaluated procedurally at screen resolution. The live in-app canvas backing
store is currently `1084 x 958` at DPR 1, and its HUD reads `30%`. Since zoom 1
means fit, that is zoomed OUT to 0.30x fit, not a zoomed-in crop. `npm.cmd run
build` passed after the latest shader edit and a fresh 5174 reload rendered
normally. Tree remains modified and unpushed by explicit instruction. Claude's
first action: read this whole Part B, then have Bartford perform/describe the
crossed-colour pickup test; if dark contour ghosts remain, measure live brush
composition across the crossing before further `upRate` tuning.

**WET LOWER-LAYER REMNANT PICKUP STARTED — Codex, 2026-08-25.** Bartford's
annotated crossed-colour result shows dark green outlines/remnants of lower wet
layers left under yellow. He explicitly rejects them: contacted wet Oil should
be picked up and carried by the painting action, not left as contour traces.
Inspect the pickup section of `src/engine/shaders/fluid/deposit.wgsl`, especially
the unconditional `teflonMin` adhesion floor, `brushTake`, per-pass cap, and
coverage profile. Distinguish wet workable body from dried/stuck pigment using
existing wet/open material state; do not hide the remnants in the compositor.
Verify build and fresh 5174 shader reload. Acceptance is a yellow stroke through
wet blue that removes the contacted blue remnant, becomes green, and carries
that green forward without dark outline ghosts under the stroke.

**WET REMNANT PICKUP CHECKPOINT — code/browser complete, Pencil verdict owed.**
The remnant mechanism was real transfer, not display: pickup always applied
Oil's full `teflonMin=0.18` adhesion floor even at wetness 1, then multiplied by
the nearly-full brush's low room fraction and capped removal at 0.5. Fully
workable yielding paint now releases that adhesion floor according to the
existing `wet5.y` continuum. Its surface-exchange share is at least the existing
viscosity row even when reservoir room is low, still multiplied by Oil's
existing `upRate=0.42`. Partial contact uses square-root coverage so edge hairs
collect contacted remnants instead of tracing them; the pickup ceiling blends
from the existing 0.5 to the existing movement ceiling 0.9 while fully workable.
The smear path uses the same wetness-released adhesion floor. Watercolour takes
the old path exactly because `yieldStress=0`; drying Oil regains its adhesion as
`wet5.y` falls. All removed amounts still go through `lift()` and the existing
GPU tally/brush credit. `npm.cmd run build` passes and a fresh 5174 WGSL reload
renders normally with Oil / Flat Hog / Cotton Duck selected. Artist test remains
blue under yellow: contacted blue should disappear from beneath the stroke,
green should enter and travel with the brush, and no dark contour ghost should
remain. Mapping is `[UNVERIFIED]` until that Pencil result.

**RESTORE OIL DEPLETION / RIDGES / MIXING STARTED — Codex, 2026-08-25.**
Bartford finds the latest Oil visually more convincing in principle, but reports
three linked regressions: the brush no longer appears to run out, no brushstroke
structure is visible, and new paint appears to sit over lower colour instead of
picking up and swirling it. The hard compositor minimum (`sqrt(Cover)` for
every present body cell) makes a trace amount look fully loaded and suppresses
the visible differences that carry depletion, ridges, and mixed proportions.
Remove that minimum. Replace it with a continuous square-root body response so
small Oil amounts retain colour but still vary and approach zero. In
`Reservoir.withdraw`, restore actual hair contact to the body packet's VOLUME
while keeping one common vehicle/pigment fraction. Verify build and fresh 5174
WGSL reload. Acceptance is one long stroke that visibly runs down, overlapping
wet colours that alter and carry each other, and visible tuft/ridge variation.

**DEPLETION / RIDGES / MIXING CHECKPOINT — code/browser complete, Pencil
verdict owed.** Removed the hard body optical minimum entirely. Body thickness
now maps continuously as `sqrt(actual optical thickness * Cover)`: thin paint
keeps more pigment colour than the old linear glaze, but different amounts no
longer collapse to the same opaque value and the response reaches zero as paint
runs out. Removed the forced sheet-visibility cap as well, restoring actual
height/amount variation to the canvas and ridge lighting. Body reservoir packets
now multiply by the hair's real contact fraction; vehicle and all pigment lanes
still share one fraction, but a grazing hair no longer unloads a full packet.
This reduces fresh top-colour dominance so the existing pickup composition can
show through. `npm.cmd run build` passes and a fresh 5174 WGSL reload renders
normally; Oil / Flat Hog / Cotton Duck is selected. Browser automation cannot
perform the decisive pressure-varied crossed-colour stroke. Bartford should lay
one blue stroke, switch to orange, and drag through it without lifting: judge
(1) visible blue entering and travelling in the orange, (2) tuft/ridge lines,
and (3) clear depletion along a long continuation. If pickup still does not
show, measure the live brush composition across the crossing before increasing
`upRate`; do not guess from appearance again.

**OIL MIDPOINT + RELATIVE BRUSH ANGLE STARTED — Codex, 2026-08-25.** Bartford
reports the binary body-color correction is significantly different and not
entirely bad, but the desired Oil appearance lies between this and the earlier
plastic gel. Reduce the body minimum optical thickness using the existing Cover
row rather than restoring translucent white-canvas averaging. The horizontal
Flat Hog correction also overreached: it stays horizontal while his Pencil
turns. Make horizontal a per-stroke starting calibration, then follow changes
in Pencil azimuth/barrel twist relative to that starting pose. Match the cursor
to the same live relative angle. Verify build and fresh 5174 WGSL reload.
Acceptance: first contact is horizontal, turning the hand turns the blade, and
thin Oil remains recognizably Ultramarine without becoming flat poster colour.

**MIDPOINT + RELATIVE ANGLE CHECKPOINT — code/browser complete, Pencil verdict
owed.** The body-paint minimum optical thickness is now `sqrt(Cover)` rather
than the full Cover value (Oil `sqrt(3)`, not `3`), and surviving body cells
retain at most `exp(-sqrt(Cover))` of sheet tint/relief instead of forcing it to
zero. This is the requested midpoint using the existing material row, with no
new constant; the established pigment-presence cutoff still removes the pale
tail below it. Flat wet brushes now capture `tiltAzimuth + twist + 90` at
touch-down as their zero. The first contact is horizontal; later changes in
azimuth or twist rotate the blade by the same relative change. On lift the
preview returns to horizontal. `npm.cmd run build` passes; a fresh 5174 shader
reload renders normally, and the live Flat Hog hover outline is horizontal.
The standalone Node angle probe could not import Vite's extensionless TS module
graph (`ERR_MODULE_NOT_FOUND` for `src/brush/spine`), so do not count it as
angle evidence. Bartford's curved/turning Pencil stroke is the actual test.

**PALE-TAIL + FLAT-BRUSH ANGLE PASS STARTED — Codex, 2026-08-25.** Bartford's
annotated Pencil result shows the body-packet change improved run-out but did
not close it: a large off-white blue remnant remains. It must either be bare
Cotton Duck or Ultramarine, never a pale veil. Inspect body-paint optical
coverage in `src/engine/shaders/composite.wgsl` and the final fractional
coverage in `deposit.wgsl`; use the existing pigment/vehicle state to preserve
full local colour and let low coverage disappear spatially. Do not introduce a
white or clean-medium channel. In the same pass, make a flat wet brush's neutral
blade direction horizontal in `src/brush/brush.ts` and match the contact cursor
in `src/input/stroke.ts`; preserve intentional barrel twist and dry-tool angles.
Verify build, fresh 5174 reload, and Oil selection. Pencil acceptance: a
depleted Ultramarine stroke ends as blue fragments then bare canvas, and a newly
selected Flat Hog begins horizontal rather than diagonally.

**PALE-TAIL + ANGLE CHECKPOINT — code/browser complete, Pencil verdict owed.**
For any material with both Relief and Cover, a cell above the compositor's
existing `1e-4` pigment-presence cutoff now receives at least the material's
existing Cover value as optical thickness and fully buries the sheet tint/tooth.
Below that existing cutoff it is bare. This makes Oil's final decision spatial:
Ultramarine fragment or Cotton Duck, not an off-white average. Watercolour has
zero Relief/Cover and retains the old continuous glaze path. Flat wet brushes
now define zero barrel twist as an exactly horizontal x/y blade; handle tilt
changes the blade's edge heights but no longer turns the footprint diagonally.
The contact cursor uses the same zero-twist horizontal angle. Dry tools are
unchanged. `npm.cmd run build` passes and a fresh 5174 reload renders Cotton
Duck normally with Oil / Flat Hog selected. One intermediate reload went black
because the first WGSL draft declared adjusted thickness values immutable;
that was corrected (`let` -> `var`) before this checkpoint and the next reload
rendered normally. Acceptance remains Bartford's Pencil stroke and hover check.

**MILKY RUN-OUT TRANSFER PASS STARTED — Codex, 2026-08-25.** Bartford reports
that a depleted/light Oil stroke still becomes milky white, as though the brush
continues laying clear medium after pigment is gone. Reservoir inspection shows
water/vehicle and every pigment lane are withdrawn by the same rate, so there is
no demonstrated pigment/vehicle separation in a clean stroke. The current CPU
path instead multiplies every contacting hair's whole withdrawal by pressure,
then the GPU applies another fractional tooth gate; this creates a tiny,
uniformly weak film whose white-canvas show-through reads as pigment dilution.
Trace `src/input/stroke.ts`, `src/brush/brush.ts`, and medium selection in
`src/main.ts`. For yielding body media, make pressure reduce contact area rather
than the concentration of every surviving contact; preserve the exact existing
zero-yield Watercolour path. Do not add a white/medium channel or another display
cover-up. Verify `npm.cmd run build`, reload 5174 to compile WGSL, inspect browser
warnings/errors, and compare a fast/light Oil stroke: success is fewer coloured
fragments ending in bare canvas, not a continuous pale tail. Pencil remains the
acceptance test because mouse pressure is fixed.

**MILKY RUN-OUT CHECKPOINT — implementation complete, Pencil verdict owed.**
The reservoir was not separating clean vehicle from pigment: every lane used
one common fraction. The milky tail came from that fraction being applied to
the ever-smaller remainder, making every contacting hair fade together like
opacity over white canvas. `Reservoir.withdraw()` now has a body-paint route
selected from the medium's existing `yieldStress`: it releases a nominal packet
built from that reservoir cell's existing capacity and `downRate`, capped by
what remains. Vehicle and every pigment lane still use one common fraction.
There is no new tuning constant. A direct 1-cell probe, repeated twice, gave
Oil/body withdrawals `0.2, 0.2, 0.2, 0.2, 0.2, 0, 0`; the untouched wash route
gave `0.2, 0.16, 0.128, 0.1024, 0.0819, 0.0655, 0.0524`. In both routes vehicle
and pigment matched at every withdrawal. The live 5174 page reloaded and Oil
selection exercised the new material-to-brush path without a fatal/runtime
failure. Browser automation cannot produce a trustworthy held continuous
Pencil stroke here, so Bartford's test is decisive: one long Cadmium Orange or
Ultramarine Oil stroke with decreasing pressure. Pass means full-colour marks
become fewer and end in bare Cotton Duck, rather than fading to cream/white.
If it still looks milky, inspect sub-cell optical coverage in the compositor;
do not add clear-medium separation, because the measured reservoir paths do
not produce it. The mapping remains `[UNVERIFIED]` pending that hand test.

**LIGHT-STROKE SCUMBLE PASS STARTED — Codex, 2026-08-25.** Bartford accepts the
second appearance pass as superior but reports that a light fast Oil stroke
still looks as though white was mixed into it and breaks robotically. Source
cause: the hair withdrawal is already reduced by contact pressure on the CPU,
then `deposit.wgsl` applies a broad fractional tooth gate again, spreading the
remaining pigment as a pale veil over nearly every contacted cell. Correct the
body-medium GPU gate to be sharper as viscosity rises: light Oil should leave
fewer coloured contacts with genuinely bare canvas between them, not diluted
blue everywhere. Preserve the actual pigment amount leaving the reservoir—do
not divide out pressure or invent mass. In the display, let low standing body
use the existing Cover row more decisively so surviving Oil contacts retain
their colour. Zero-yield Watercolour must keep the current smooth gate exactly.
Verify build, WGSL reload, browser warnings/errors, then compare a fast/light
mouse proxy only as a structural check; Pencil pressure is the acceptance test.

**SCUMBLE CHECKPOINT — code/browser complete, Pencil test decisive.** For a
yielding body medium only, the tooth-contact ramp now narrows from `0.18` by the
existing `(1 - viscosity)` response (Oil: `0.027`), so near-threshold contacts
choose coloured peaks and bare valleys instead of applying a broad fractional
veil. The amount already withdrawn from the reservoir is unchanged. The display
uses `sqrt(standingBody)` in the existing Cover response so a surviving thin Oil
fragment retains more colour. Watercolour's zero-yield route keeps the exact old
`0.18` ramp and no body optical boost. `npm.cmd run build` passes; fresh 5174
shader reload and a fast mouse proxy produced no warning/error. The proxy still
fades as the brush reservoir empties and cannot exercise light pressure because
mouse pressure is fixed at `0.65`; do not call the white-mix report closed from
that test. Bartford's Pencil test: one freshly loaded, fast feather-light Flat
Hog pass on Cotton Duck. Pass means distinctly blue fragments separated by bare
warm canvas, with no milky-blue continuous veil and no mechanically repeating
checker. If it remains milky, the next fault is the CPU withdrawal multiplying
each contacting hair by pressure before the GPU gate; that requires separating
contact area from film concentration, not another renderer adjustment.

**SECOND OIL APPEARANCE PASS STARTED — Codex, 2026-08-25.** Bartford's verdict
on the first lighting pass: “Greatly improved” and “insanely better already,”
but still slightly plastic and the canvas pattern remains too obvious. Continue
the same direction: lower/broaden the cured-Oil sheen slightly, quiet the visible
Cotton Duck relief slightly, and correct the existing body-paint bridge in
`deposit.wgsl`. The bridge currently divides actual Oil film (~0.018/cell from
the recorded live measurement) by Cotton Duck tooth `0.30`, so one loaded pass
only fills about 6% of the tooth gate and stamps the weave into every pass.
Use the existing medium viscosity to make a high-viscosity body bridge valleys
sooner; do not add an Oil-only branch or alter Watercolour. Verify build, fresh
WGSL reload, warnings/errors, then identical one- and two-pass Flat Hog samples.
Acceptance: the second pass should visibly join across the woven valleys while
retaining broad bristle direction, and the remaining highlight should read satin
rather than gel. All mappings remain `[UNVERIFIED]` until Bartford's Pencil check.

**SECOND PASS CHECKPOINT — code/browser complete, Pencil verdict owed.** Default
Sheen/Width are now `0.10 / 0.96`; Cotton Duck visible relief is `0.30` of the
old strength. The physical substrate texture is unchanged. In `deposit.wgsl`,
the existing body-only bridge now uses
`toothAmp * max(1 - viscosity, 0.05)` as the depth required to fill the tooth.
For current Oil/Cotton Duck this is `0.30 * 0.15 = 0.045`, bounded to `0.05`,
instead of the old `0.30`; the recorded `0.018` film therefore bridges about
36% after the first loaded contact rather than 6%. Zero-yield Watercolour never
enters this route and is unchanged. `npm.cmd run build` passes; fresh 5174 WGSL
reload and identical one-/two-pass Flat Hog mouse strokes produced no browser
warning/error. The second pass visibly fills more of the regular gaps, but mouse
pressure is fixed and does not establish artist feel. Bartford should now make
the same Pencil test and decide whether the remaining pattern is canvas contact
or still a stamp. Do not tune further without that hand result.

**OIL MATERIAL-LIGHTING PASS STARTED — Codex, 2026-08-25.** Bartford rejected
the live Oil appearance as plastic/gel compared with four supplied cured-impasto
references. The immediate change is display-only in
`src/engine/shaders/composite.wgsl`: remove the raw additive white sheen, make
substantial bodied paint bury the Cotton Duck weave more decisively, and retain
broad ridge light/shadow from the existing paint height. Do not touch pickup,
deposit, flow, or the parked macro dials. Verify `npm run build`, reload
`http://127.0.0.1:5174/` so WGSL actually compiles, inspect validation errors,
then compare the same Ultramarine Oil / Flat Hog strokes. Acceptance is coloured
raised paint with restrained broad light and shadow, not white repeating glints;
the canvas weave should remain visible on bare ground but largely disappear
under a loaded mark. All new visual mappings are `[UNVERIFIED]` until Bartford's
hand judgement.

**FIRST PASS CHECKPOINT — code/browser complete, artist Pencil check owed.**
`composite.wgsl` no longer adds a raw white scalar after the paint colour;
the existing sheen lobe now lifts the paint's own colour. Default Sheen/Width
are `0.16 / 0.90` (`[UNVERIFIED]`, broad cured-Oil starting point). Standing
body now contributes to both optical covering and burial of sheet tone/tooth.
Paint relief is read across a six-cell span so the lamp responds to broader
tuft planes rather than every tiny height change. Cotton Duck display relief is
`0.42` of the prior strength (`[UNVERIFIED]`); its solver texture is unchanged.

`npm.cmd run build` passes. A fresh 5174 WebGPU reload and real mouse strokes
produced no browser warning/error. Before/after live inspection confirms the
hard white gel sparkle is gone, blue remains blue in the lit areas, and the bare
Cotton Duck is quieter. A repeated two-pass Flat Hog mouse stroke still shows a
regular weave imprint inside the colour. This means lighting was one cause, but
not the whole cause: the current deposit gate lays pigment peak-first and its
bridge fraction grows too slowly at the actual Oil film height. Do not hide
that remaining pattern with more display gloss. Bartford's next check: make one
slow, pressure-varied Ultramarine Oil / Flat Hog stroke and a second pass over
it on Cotton Duck. Judge (1) whether it has stopped reading as wet plastic and
(2) whether the remaining woven breakup feels like useful canvas contact or an
obvious stamped grid. If plastic is closed but the grid is rejected, inspect
the existing `bridged = w0.y / toothAmp` route in `deposit.wgsl` and measure its
actual value before changing it; that is a paint-contact correction, not another
lighting pass.

**E7 measurement is not started.** No fluid-engine edits are in flight. The required
browser/GPU control tool was unavailable in this turn, so the experiment could not
be run honestly. The next model should finish the measurement and append it to
`docs/16-pickup-log.md`, or record the exact blocker and leave the engine untouched.

---

## Recently completed — with the numbers, not adjectives

**Brush pickup — `90479a0`, 2026-08-25.** The two-way exchange Card 6 specifies
had only ever had its first half built; `upRate` sat in two data rows marked
`[NOT WIRED]` and the material inspector showed "picks up" as a feature the whole
time. Before: blue reached **6 cells** past a crossing on a **290-cell** stroke,
then exactly `0.0000`. After: the full 164 cells to the end, fading. Sheet loss
and brush credit match **to four decimal places, twice** (docs/16 E3).

Three faults found and fixed inside that work, all worth not repeating:

- **Quantise before you subtract, not after.** Tallying a rounded-down copy of a
  full-precision subtraction destroyed **0.91 %** of everything lifted — measured
  twice to three decimals. `lift()` in `deposit.wgsl` now returns what it
  reported and the caller subtracts *that*.
- **A dip must discard pickup still in the post**, or the previous stroke's
  colour lands on a tuft just washed out. It did: an orange stroke came out
  carrying blue before it had reached the blue.
- **The tally must not be per-frame.** Gating the drain on there being contact
  this frame stranded the tail of every stroke.

The deferral said this needed a GPU→CPU path "with a frame of lag". It needs the
path; the lag measures **0 steps** at one step per frame (docs/16 E4).

**The top strip was unbounded — `d97721d`.** Two dials divided up the whole
monitor: 1332 px at 1680 wide, now 486.

**Paint dials — `798bc96`, `b3447ab`, `8408721`.** Impasto Depth and Glossiness
sweep between artist-set ranges. Every hand-written curve of mine was deleted;
the sweep is generic and data-driven. Sheen answers to both macros *multiplied*,
because the reference set showed glossy smooth paint with almost no shine — shine
needs a surface **and** a ridge. Paint Properties is a plain drawer, not a modal,
because a modal dims the canvas you are trying to watch. **Bartford asked on
2026-08-25 to leave this alone for now** — it is sufficient as it stands.

**Body 0 was a solver switch — `161bf73`.** The "circuit board" artefact was oil
being run on the water solver at exactly Body 0. Cost hours of failed
reproduction; solved the moment Bartford sent an **uncropped** screenshot showing
the dial. Ask for the whole screen first, every time.

**Paste flows in any direction — `f81cba0`.** Four-face flow turned a round pile
into a diamond.

**Tufts are bundles — `45ac5e6`.** Filled, not hollow: coverage 26 % → 88 %. Five
spines on the flats. `DRIVE` cut 1.0 → 0.35 because all three brushes folded to
~134° at 1.0.

### Corrections to the record — read these before trusting an old claim

- **The wet-film gloss override was NOT what made oil look like jelly.** Claimed,
  then measured: the film is 0.018/cell, the term is ~0.11, and the "fix" moved
  the picture by one unit of blue in 255. The real cause was a hard-coded sheen
  tightness of 48. Retracted in code and in docs.
- **docs/14 E1 was overstated.** "A flat brush has one spine's worth of
  behaviour" came from a straight-pull-only film. On an arc the spines already
  differed by 21.86 cells. Second time in one week that measuring one stroke
  direction and generalising went wrong.
- **Three broken shape instruments in a row**, all of which produced confident
  wrong answers: one measured the woven canvas instead of the paint; one asserted
  a circle reads 0.22 on a straight-edge metric when calibration said **0.547**;
  one scored a dense blob against its own pale halo. §A4's "check the instrument
  before the engine" is not decoration.

---

## Blocked / open questions

- **How strong should pickup be?** Artist call. See NEXT ACTION.
- **The deposit multiplies by coverage** (docs/16 E2). Undecided.
- **"Runs freely" at Body 0 no longer runs.** Paint did not reach one new cell in
  3000 steps, because `CREEP` throttles regardless of yield. Either the label is
  wrong or the throttle is. Left as Bartford's feel call, explicitly.
- **The pressure ramp is a coarse staircase** — about three levels. `press` comes
  from how deep a hair sits in the tooth and reads **0.995–1.000 at every
  pressure**, so it is saturated; and contacting joints are pinned to exactly
  z=0. Two candidate fixes measured, neither taken. A mouse reports a fixed 0.65
  and will never show this; an Apple Pencil will.
- **The spine fan converges to a ~5.9-cell floor** rather than zero. Unexplained.
- **Oil still paints pale.** That is covering power and density, not shine, and
  it has not been touched.
- **iPad performance pass never started.** It was the stated goal at the start of
  the 2026-08-24 session and has been displaced every time since. Bartford tests
  on iPad over a Cloudflare tunnel (`npm run ipad`).
- **The old conservation fault** (`docs/11`, `docs/12`) is contained by the
  `sane()` guards, not closed. The cheap decisive experiment — run the §3.3 soak
  on a different GPU — is still unrun. An iPad is a different GPU; `?soak=8` in
  the URL runs it and reports on screen.

---

## Do NOT

- **Do not push.** 12 commits sit unpushed on `tuft-fill`. Ask first.
- **Do not treat the VL paper as the standard.** Bartford rejected it on
  2026-08-24: *"methinks the VL standard is not my standard. Many of its
  principles have been the primary cause of pain points with the brushes."* It is
  a source, not an authority. Its reservoir schema is still good; its two-spine
  tuft and hollow brush are not.
- **Do not add a dial that drives nothing.** `upRate` sat in the schema reading
  like a feature and doing nothing for months, and the inspector displayed it.
  That is the exact failure mode to avoid.
- **Do not resize a WGSL uniform without resizing its buffer to match.** The bind
  group goes silently invalid — blank canvas, no error thrown. It has cost days
  twice. `composite.wgsl` is 144 bytes; fluid params are `24*4 + 8*16` with `pig`
  at offset 96.
- **Do not trust `npm run build` to catch shader errors.** It runs `tsc --noEmit
  && vite build` and never compiles WGSL. Load the page.
- **Do not drive the engine in a tight loop without yielding** when measuring
  anything time-dependent. The queue goes deep and readbacks arrive in one lump
  at the end. Two measurements in one afternoon were read that way and said the
  wrong thing (docs/16 E4).
- **Do not run `clear()` and then set the mix in the other order.** `clear()`
  wipes the slot map; a mix set before it gives a silently colourless brush.
- **Do not lower `KDIFF` in `capillary_flow.wgsl` to "fix" the old fault.** Still
  fires at k=0.045, five times below the stability limit. It only makes it rarer
  while looking solved.

---

## How to talk to Bartford

§A8 covers it, and he restated it on 2026-08-25: *"please remember not to start
getting drowned out in tech speak. I feel it creeping a little bit and I don't
wanna get lost."*

Frame everything as what happens to the paint. Give him numbers when they settle
an argument, never as the point of a sentence. Make the call yourself rather than
handing him a menu. And when something is done, tell him exactly what to paint to
see it.

---

## THE SCALE IS SOLVED — 2026-08-31. Read this before quoting any ripple number.

The artist got his own oils out and shot nine photographs of a thinned
Ultramarine + Raw Sienna stroke **with a steel rule in frame**. Full write-up in
`docs/20-oil-from-zero.md` §10; the scale photograph is IN THE REPO at
`docs/reference/scale-ruler-blue-stroke.jpg`; `tools/measure-scaled-paint.py`
regenerates every number.

**38.91 px per mm**, sd 0.033 across the best 8 of 31 bands on the rule. (The
wider shot drifts 33.9 to 37.3 px and was rejected for scale on that test —
always check the period is flat before trusting a rule.)

**What real thinned oil is:** stroke 9.94 mm from a #2 synthetic flat; canvas
thread 0.864 mm warp / 0.772 mm weft; **11.6 threads across one stroke.** The
weave reads 0.859 mm THROUGH the paint against 0.864 mm on bare ground beside it
— agreement to half a percent, which proves both that the period is the weave and
that the canvas dominates the inside of a thin mark.

**Along-stroke ripple, in mm, reproduced on three separate photographs** (0.0472
/ 0.0440 / 0.0450 at ±1 mm; 0.089 / 0.085 / 0.077 at ±4 mm). It climbs steadily
with the window — **real paint has no characteristic wavelength**, so no single
roughness constant will ever reproduce it.

**RETRACT §7's headline.** "Real 0.091-0.209 vs engine 0.003-0.015" compared a
±16-PIXEL window with a ±16-CELL window. **THE ENGINE HAS NO
MILLIMETRES-PER-CELL ANYWHERE** — not in the invariants, the cell schema or the
substrate — so that ratio never meant anything. The gap may be real; that
arithmetic did not show it. Do not quote it again.

**The comparison that survives needs no scale, and it is a genuine fault.**
Threads of canvas across one brush width: real **11.6**, engine Fine Linen
**5.3**, engine Cotton Duck **2.9**. (Paper is built at SIM=512, `canvas_weave`
is one thread per unit p, so a thread is 512/featureFreq cells; flat blades are
~23 cells.) **The engine's canvas is 2.2x to 4.0x too coarse for its own brush.**

**And it cannot be fixed by turning featureFreq up.** Anchored on the measured
brush, one sim cell is **0.432 mm**, the 512 grid covers **221 mm**, and a real
thread is **2.0 sim cells — exactly Nyquist.** UNVERIFIED way out: the weave you
SEE is re-derived by the composite at screen resolution and is not bound by the
sim grid, so that half can be made right today; the tooth the paint FEELS is
bound by it and can only be a coarser stand-in. **Splitting those, and the
mm-per-cell under them, is a cross-engine decision and the artist's to ratify.
Tune nothing until he does.**

**THE CROSSING IS MEASURED and both previous answers were low.** `18` §5 step 3,
open since 2026-08-27: real thinned oil carries **50-60 % flat for the first
8 mm** (about one brush width), decays 37/25/14/9 % over the next 5 mm, and is
**zero by 16 mm**. Against the artist's remembered "3 % feels correct" and the
engine's 20.6 %. **The plateau-then-knee shape is the finding; the 55 % is ONE
FRAME and unreproduced** — treat it as provisional until a second crossing is
shot.

**Still missing, and worth asking for:** the tearing stroke (he flagged it
himself); the same stroke fast and slow, since speed is the axis the engine is
known to get wrong; and one loaded brush run all the way to empty in a single
pass, which is what E18's stranded paint is really about.

---

## PAINT DOES NOT FADE, IT STOPS — 2026-08-31 evening. The one to act on.

Test panel with a 25 cm rule: Tear / Slow / Fast / Run Out, seven strokes.
`docs/20-oil-from-zero.md` §11; panel in the repo at
`docs/reference/test-panel-tear-slow-fast-runout.jpg`. **He sent two files — a
contrast-stretched greyscale carrying the labels and the untouched colour frame.
USE ONLY THE COLOUR ONE for tone; the greyscale has had its levels pulled.**

**Scale 10.00 px/mm, self-confirming** (mm graticule 10.00, cm graticule 9.98).
Weave reads **0.860 mm** against §10's 0.864 at four times the magnification, and
the Slow stroke is **10.0 mm** wide against §10's 9.94 for the same #2 flat. Three
cross-session agreements; the measurement chain is sound.

**THE FINDING.** Across every mark on the board — tearing, running out, fast,
slow, the loaded head of a stroke and the dying tail of the same stroke — paint
crosses from bare canvas to full cover in **0.4 to 0.8 mm, about ONE CANVAS
THREAD.** Reproduced on §10's frame at 38.91 px/mm as **0.75 mm = 29 pixels**, so
it is a real distance and not the camera's blur.

> **There is no partial coverage at the scale of a thread. A thread is painted or
> it is bare. What fades is the PROPORTION of threads covered, over tens of
> millimetres — 29.9 mm for a brush running out, about three brush widths.**

The Run Out stroke shows both halves at once: envelope decaying over 29.9 mm
(78/68/61/31/21 % in fifths, two methods agreeing at 29.9 and 30.25 mm) while
every edge inside it stays hard at 0.70 mm.

**The engine does the opposite** — it fades film thickness and lets alpha run to
zero, an optical fade. Real paint is **binary per thread, statistical over the
stroke.** UNVERIFIED but worth saying: this is probably why `19`'s fish-scale hunt
would not end. It was smoothing a quantity that in real paint has no smooth
values. It also puts a floor under §10d — a mechanism that lives at one thread
needs the thread resolved, and at 0.432 mm per sim cell a thread is 2.0 cells.

**SLOW vs FAST, same brush, same board, 190 mm each:** slow 50 % coverage with
8 mm of bare stroke; fast **22 %** coverage with **131 mm** bare. A fast stroke
lays under half the paint and spends two thirds of its length off the canvas.
CAUTION: its longest void is 48 mm, nearly five brush widths, and the last fifth
recovers to 59 % — that reads like a lifted brush, not skipping. "Fast deposits
less" is solid; "fast skips 48 mm" is not. Ask for one more fast pass held flat.

**ASK HIM:** the four Tear strokes are **15–19.6 mm wide** against the #2 flat's
10 mm, so they were made with a different brush or a much harder press, and they
cannot be compared with the rest until that is known. They also show no
full-width breaks at all — whatever tearing is in them is filaments inside the
mark, which is the same binary-per-thread behaviour, not a separate effect.

---

## THE BUILD ORDER HAS ITS FIRST RATIFIED STEP — 2026-08-31

**The artist ratified COVERAGE PER THREAD into the rebuild, and it is Step 1** —
after step 0 (make the behaviours switchable) and **before** "look at bare oil".
Written into `docs/20-oil-from-zero.md` §4.

**Why ahead of the bare-oil look, and this is the reasoning to keep:** it is not
a §3 behaviour sitting on top of the paint, it is how paint meets cloth at all,
which §4 already counts as ground zero when it calls the paint opaque. Real
opacity is per-thread. And every judgement in the steps after it is made BY EYE
ON A MARK — so a mark that fades by the wrong mechanism poisons every later
verdict. `19` already lost a week to exactly that, smoothing a quantity that in
real paint has no smooth values. Nothing is lost by the order, either: step 0's
flags keep the old behaviour a switch away, so the "before" picture is available
on demand instead of being spent once.

**IT BLOCKS ON THE SCALE DECISION AND MUST NOT START BEFORE IT.** A mechanism
that lives at one thread needs the thread to exist, and at the brush-anchored
0.432 mm per sim cell a thread is 2.0 cells — Nyquist. So the step opens by
settling §10d and §10e: millimetres per cell, and the split between the weave
that is SEEN (re-derived at screen resolution, not bound by the sim grid) and the
tooth that is FELT (bound by it). Both cross-engine, both his.

**The tear brush is identified.** A **#12 filbert**, not the #2 flat that made
the other three strokes — measured 14.8-19.6 mm, right for a 12 filbert, and its
rounded end is why those four have no square shoulders. Their widths must not be
compared against the flat's. What does carry across is the edge, which is a
property of the paint rather than the brush, and it matches.

**Still unasked-for and still open:** one more fast pass held flat on the board,
to separate skipping from a lifted brush (§11c).

---

## D13 IS RATIFIED — coverage is a fraction of threads, not a film alpha

**2026-08-31, by the artist.** Row in `docs/10-decisions.md`; evidence, open
questions and acceptance tests in `docs/20-oil-from-zero.md` §12. It is the
standing ground for §4's Step 1.

**The decision.** A cell stores what FRACTION of its canvas threads carry paint,
not how transparent the paint is. Deposition raises it; running out, tearing and
lifting lower it. **The compositor decides WHICH threads at draw time**, by
threshold against the weave field it already evaluates at screen resolution — so
the drawn edge is hard at thread scale at any zoom, and the fade across a mark is
the change in the fraction. A thread is painted or bare; paint renders at full KM
strength and the ground shows only where threads are uncovered.

**Why, in one line:** no single alpha can be hard at 0.7 mm and soft over 30 mm,
and real paint measures both, in the same stroke. Two quantities were being asked
of one number.

**Why not a finer grid:** a thread is 2.0 sim cells, so resolving it is 4x the
cells against a 3.78 ms bench. The fraction costs one number, and it is
`00-invariants.md` §4 ("coarse sim under fine display") APPLIED, not excepted.

**WHAT D13 DOES NOT SETTLE — do not treat any of these as decided:**
1. **Millimetres per cell.** Open. §10e's 0.432 mm/sim cell is UNVERIFIED,
   reasoned from one brush over a 23-cell blade. **Step 1 opens by settling it**;
   the fraction is meaningless until a cell has a size.
2. How the fraction evolves — deposition, lifting, drying, tearing rates. Step 1.
3. Where it lives in the cell — schema, canvas engine's call, under D8 RGBA16F.
4. Wet-on-wet: whether two wet coverages merge, and how.

**INVARIANT 2 BINDS IT.** The coverage rate must be per unit DISTANCE TRAVELLED
or per unit TIME — never per frame, never per cell stepped. A per-frame coverage
rate reproduces `19`'s fish-scale banding exactly, in a new place. E13 and E17 are
the record of how long that takes to find.

**Acceptance tests, written before the code so they cannot be fitted to it:**
(1) a cross-section anywhere along a stroke, dying tail included, crosses bare to
covered in <=1 mm; (2) a brush running out falls 60 % to 25 % coverage over
30 mm +/- 10; (3) over equal distance a fast stroke deposits materially less than
a slow one (22 % vs 50 % measured); (4) **zooming in reveals no soft ramp** —
that is the test that separates this from a cosmetic tweak.

**Watch for:** at 10-20 % coverage a thresholded regular weave may read as printed
fabric rather than broken paint. `canvas_weave` already carries a `slub` noise
term for this in the height field and it is available here; whether it is enough
is UNVERIFIED and is the first thing to look at once anything is on screen.

**TWO NUMBERING TRAPS, both now noted in card 10:**
- **This branch's D-numbers are its own** (D2). The `main` canvas contract has its
  own D1-D12 meaning different things — its D1 is "8 pigment slots per cell",
  ours is the stack. **A bare "D7" is ambiguous. Say which.**
- **"D13 = the artist builds their own materials" was never real.** It is
  referenced in a couple of places but appears nowhere in card 10. Those
  references are corrected; the studio idea is UNRATIFIED and needs recording or
  dropping on its own merits.
