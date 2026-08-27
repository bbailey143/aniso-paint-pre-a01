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
- `npm run dev` (port 5173; recent sessions have also served 5174). Build/typecheck:
  `npm run build`. iPad over a tunnel: `npm run ipad`.
- **WGSL errors never appear at build time** — `npm run build` runs `tsc --noEmit &&
  vite build` and does not compile shaders. Load the page after any shader edit.
- Debug handles: `window.__engine`, `window.__stroke`, `window.__BRUSHES`.
  Full API in `docs/12-explosion-hunt-log.md` §4; channel map in §5; the traps that
  have already cost days are in §11. **Read §11 before writing shader code.**

## A7. Finishing (or being interrupted)

- Commit and push to `webgpu-test` whenever a milestone lands. The repo is the source
  of truth; an uncommitted insight does not exist.
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

**Last updated:** 2026-08-26
**By:** Claude, continuing the relay. Codex's 2026-08-25 entries below stand
unchanged; only this block is new.

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

## STOP HERE — the instruments are the next job, not the paint (2026-08-26)

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

**NEXT ACTION — build the bench before tuning anything else.** A command in
`tools/`, beside `brush-bench.mjs`. It must: take medium, brush and paper
explicitly and **assert them**, so a run that is not what it claims fails loudly;
measure the artist-facing quantities (how much of the layer beneath is lifted,
how patchy a stroke is, how much body it holds); and emit the render beside every
number, so a figure that disagrees with the picture is caught at once instead of
three steps later. Ad-hoc console probes are how this session lost its afternoon.

**OPEN, and the reason the bench comes first.** `SURFACE_EXCHANGE = 0.35` shipped
in `1643d2a` and measures 29.8 % of the lower layer lifted where the brush
touches, up from 10.7 %. The artist reports **no visible change**. The floor is
confirmed live (a full brush reports room 0.35, `brushTake` 0.119, against ~0.00
before), so either the effect is invisible at this value or his page was stale —
untested when the session ended. Do not tune the floor until that is resolved: a
number nobody can see is the exact failure the bench exists to prevent.

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
