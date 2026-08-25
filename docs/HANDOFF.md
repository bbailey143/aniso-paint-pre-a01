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

**Last updated:** 2026-08-25
**By:** Claude (Opus 5), Windows 11, GPU `amd / gcn-4` (Polaris)

> Part B was 750 lines of finished work from early August. It has been replaced
> wholesale with the live state, per "rewrite freely, keep it short and true".
> Everything cut is in git history and in the numbered logs; nothing was lost.
> **Part A §A6 was also corrected** — it named the wrong branch, the wrong
> worktree and the wrong port, which would have sent you to the wrong checkout.

---

## Build state — verified 2026-08-25, not assumed

- `npm run build` **passes** (`tsc --noEmit && vite build`).
- Working tree **clean**. HEAD `90479a0`.
- Branch **`tuft-fill`**, **12 commits ahead of `origin/webgpu-test`**, nothing
  pushed. **Do not push without asking Bartford.** He authorises publication
  case by case; that has been the standing rule all through this repo's history.
- The page loads and paints with no WGSL or WebGPU validation error. Checked by
  `device.pushErrorScope('validation')` around a real stroke, not by reading the
  console — the console in a long session keeps errors from shader versions that
  no longer exist and they will fool you.

## Current objective

**Make oil behave like oil in the hand.** Bartford is tuning the engine by eye,
stroke by stroke, and reporting what looks wrong. The last three sessions have
been: the tuft (filled, random, multi-spine), paste flow and gloss, then the
paint dials, and now brush pickup.

**Active logs:** `docs/16-pickup-log.md` (newest, brush pickup),
`docs/15-paste-flow-log.md`, `docs/14-tuft-geometry-log.md`.

His words, 2026-08-25, and the standard to measure against:

> "Paint strokes need to pick each other up, mix each other around, blend on the
> canvas, leave ridges behind - all that fun stuff. The orange paint simply lays
> on top, it doesn't pick up bottom layers almost at all. While there should be
> some resistance to that, it shouldn't be a ton."

---

## NEXT ACTION

**Get Bartford's verdict on pickup strength, then move two numbers.**

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

**Nothing.** No half-finished edit anywhere. Tree clean, build green, the last
piece of work is committed and its evidence is in docs/16.

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
