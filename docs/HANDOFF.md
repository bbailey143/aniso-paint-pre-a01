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

- Repo: `https://github.com/bbailey143/aniso-paint-pre-a01`, branch `webgpu-test`.
- Worktree: `C:\Users\benja\Documents\aniso-paint-pre-a01\.claude\worktrees\webgpu-test-477000`
- Windows 11, GPU `amd / gcn-4` (Polaris). **The GPU is a suspect in the open fault —
  if you are on different hardware, say so in every entry you write.**
- `npm run dev` (port 5173). Build/typecheck: `npm run build`.
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

**Last updated:** 2026-07-28
**By:** Claude Opus 5
**Build state:** `npm run build` passes. Working tree clean, pushed to `webgpu-test`.

## Current objective

Close, or prove external, the "explosion" fault: a single canvas cell intermittently
acquires ~1e37, and the solver then spreads it into a growing blob that destroys the
painting. **Active log: `docs/12-explosion-hunt-log.md` — read its §0b first.**

P0–P7 of the plan are complete. **P8 (polish + acceptance) is deliberately on hold**
until this is closed or accepted as external. Do not start P8.

## NEXT ACTION

**Verify that `FluidEngine.dump(name)` (`src/engine/fluid.ts`, ~line 853) returns the
texture the passes just wrote, not the stale half of the ping-pong pair.**

- Inspect `PingPong` (`src` / `dst` / `cur` / `flip()`) against `dump()` and establish
  which buffer comes back relative to the last write of a frame.
- Then confirm empirically: CPU-sum `wet5.x` from a dump and compare with the
  saturation lane (lane 1) of `await engine.sampleGauges()`. Repeat for `wet0.y`
  (film) against lane 0. They should agree to ~4 significant figures.
- **Do this on a BLOWN canvas as well as a healthy one.** The healthy case has
  effectively been done (a pigment dump summed 4181.149 against a gauge reading of
  4182.3, so `dump()` is probably right for `wet1`/`wet3`). Nobody has checked `wet5`
  or `wet0`, and nobody has checked any of it while the canvas is corrupted. That gap
  is the whole task.

**Why this and not something bigger:** every current-tree number in `docs/12` came out
of `dump()` — the 13-blowups-in-16, the 1.47e37 peak. If it reads the stale buffer,
those describe a texture nothing is using and the conclusions built on them are wrong.
It is plausible the current tree is healthier than reported and only the instrument is
broken. Cheapest possible check, largest possible consequence.

**Then:** if `dump()` is sound, the next task is to disable the 2048×2048 ink band and
re-run the §3.3 soak — testing whether that extra memory traffic is why the read-guard
fix works on the baseline but not here. If `dump()` is broken, fix it, re-run the
current-tree soak, and mark every affected number in `docs/12` as suspect.

## IN FLIGHT

Nothing. No half-finished edits. Both worktrees clean.

## Recently completed

- Read guard on `capillary_flow.wgsl` reads — **closes the fault on the baseline**
  (0 blowups in 32 sessions vs 24/24 before), **but does nothing on the current tree**
  (14/16 with, 13/16 without, matched control). Committed anyway: proven, conservative,
  free. It is **not** a fix for this tree and must not be reported as one.
- Corrected an earlier overstatement: the previously reported "1 blowup in 16" for the
  current tree was a gauge-only-detector artefact. With a direct texture dump added it
  is ~13/16. The `sane()` write guards largely stopped the *meter* from showing the
  fault rather than reducing it.
- Root cause on the baseline: a transient garbage **read** of `wet5_in` in
  `capillary_flow.wgsl`, multiplied into the canvas by the diffusion term. Never
  stored — which is why guarding twelve *writing* passes failed.

## Blocked / open questions

- **Why do the two builds differ?** The read guard is airtight on `4b1f747` and inert
  on HEAD. Unexplained. This is the crux.
- Root cause is still not proven to be ours vs. driver/hardware. Untested and cheap:
  run the §3.3 soak on a different GPU. If clean there, the guards are the correct
  permanent answer and the fault closes as external.
- A disposable baseline worktree may still exist at
  `C:\Users\benja\AppData\Local\Temp\claude\baseline-4b1f747` (port 5174) with an
  uncommitted read-guard patch. **Keep it** — it is the only deterministic
  reproduction anyone has (fires 24/24). Rebuild instructions: `docs/12` §3.2.
  Never commit from it.

## Do NOT

- Do not "fix" the fault by lowering `KDIFF` in `capillary_flow.wgsl`. Measured still
  firing at k=0.045, five times below the stability limit. Lowering it only makes the
  fault rarer while looking solved.
- Do not close the fault on the strength of the `sane()` guards. They are containment.
- Do not start P8 or any feature work.
