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

**Last updated:** 2026-07-28 (E5 real-brush crossing and global pen cursor complete)
**By:** Codex
**Build state:** `npm.cmd run build` passes with the shared water/paper,
below-mask drying, added-water, and global pen-cursor corrections. Chrome exercised
the page on AMD/Polaris with no page, shader, or WebGPU error. Two exact E5 replays
retain surface water through a five-second pause and then cross dry paper under
half tilt; Hot Press / Cold Press / Rough uptake ordering also reproduced twice.
See `docs/13-water-paper-behavior-log.md` E5. This checkout still has unrelated
untracked `bench/`, `claude-uncommitted-diff.patch`, two `.mp4` files in `docs/`,
and `process_video.py`; do not touch them.
**Git state:** Bartford authorized publication and Codex pushed E11/E12 through
`0bf9470` to `origin/webgpu-test`. The three local behavior milestones through
E4 plus E5 are not pushed. E5 is committed at the current local `HEAD` and must
not be pushed without fresh authorization.
The listed untracked files remain unrelated and must not be touched.

## Current objective

Correct and hand-check the shared water/paper foundation before feature work. The
current pass covers brush dilution, tablet location feedback, absorption, drying,
and distinguishing downhill film travel from directionless capillary creep.

The NVIDIA E13 discriminator for the separate explosion fault is explicitly
**postponed at Bartford's request**, not cancelled. P8 polish remains on hold.

**Active evidence log for this work:** `docs/13-water-paper-behavior-log.md`.

**Checkpoint:** E5 is implemented and measured. The wet/dry face was not broken:
an ordinary wash crossed 12 cells when tilted immediately, but the old provisional
uptake rate absorbed nearly all movable film in 20 frames. The shared watercolor
row now uses `[UNVERIFIED]` `absorptionCoupling = 0.0001`; a five-second-old Cold
Press stroke retained `26.8221289` surface film and crossed five more cells under
half tilt in two exact replays. Window-level tracking keeps the pen locator visible
over the right controls. Bartford's hand and physical tablet remain the artist
acceptance gate. Do not begin the postponed NVIDIA test.

## COMPLETED ROUTE (E9–E10; retained for context)

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

## COMPLETED WORK (E9–E12)

**Codex is verifying the inspector before interpreting any more explosion numbers.**
Code reading is complete: each writing pass flips its `PingPong` immediately, and both the live renderer and `FluidEngine.dump()` select the resulting `src` side. Dependencies were restored with `npm.cmd ci`; the live page runs on `webgpu: amd / gcn-4`.

**First checkpoint — healthy sheets are sound.** A naïve first sample gave matching saturation but mismatched film because the requestAnimationFrame loop continued drying the sheet between two asynchronous reads. A held-still method now temporarily replaces only public `e.step` with a no-op, runs the standard session through a saved original function, samples and dumps, then restores it. Six healthy sessions match: film ratio `0.99999999`–`1.00000000`; saturation ratio `0.99999984`–`1.00000062`. So `dump()` is sound for healthy state.

**Important single-run observation — corrupted state does not agree.** The seventh held-still session blew: gauge saturation `3299.884033`, CPU sum of dumped `wet5.x` `1.1038177728633202e36`, peak the same; `wet0.y` film still matched exactly (`0.000452250504` gauge, `0.000452250505` dump). This comparison had no animation step between the gauge and dump. After public `e.step` was restored, the normal containment pass removed the stored impossible saturation before a later re-read, so do not try to inspect that old canvas now.

**CHECKPOINT COMPLETE.** The held-still session was repeated with `g1`, `dump(wet5)`, `dump(wet0)`, and `g2` in one no-step interval. Do not repeat the old separate-instrument soak; it cannot settle the rate.

**NEXT ACTION — one-encoder instrument comparison.** See E9 in
`docs/12-explosion-hunt-log.md`. Two independent
dump-only corrupted readings and one gauge-only reading were captured while the
animation was held still. The next step is now precise:

**COMPLETE (E10).** `compareWet5ReadPaths()` builds and was run on AMD/Polaris:
three healthy controls agree, while two bad copy readings disagree with a normal
compute gauge inside one encoder. The dump-derived current-tree rate is retracted as
unknown.

**E11 IMPLEMENTATION (complete):** GPU-resident post-capillary alarm.
Add `src/engine/shaders/fluid/capillary_alarm.wgsl`, a four-byte latched alarm
buffer and readback method in `src/engine/fluid.ts`, and narrow exposure through
`src/engine/canvas.ts`. The alarm must default OFF, reset on `clear()`, dispatch
immediately after `wet5.flip()` in the capillary block, and add no CPU wait per
frame. After build plus live shader compilation, run an empty-sheet control and
standard 26-stroke sessions on `webgpu: amd / gcn-4` until either two alarm events
are reproduced or a bounded clean run is complete. Record every raw outcome in E11.

**Checkpoint:** implementation and `npm.cmd run build` pass. Chrome compiled and
ran the shader on `webgpu: amd / gcn-4`; 200 empty-sheet frames returned alarm `0`
with a null WebGPU validation error. Codex is now running bounded standard sessions,
capturing both the post-capillary alarm and E10's one-encoder compute/copy comparison
once per finished session.

**E11 COMPLETE:** standard painted sessions returned alarm `0, 1, 1`; both latched
sessions finished with normal compute and copied saturation near 3300 and peaks near
0.123. A following `clear()` reset the latch to `0`. The transient intermediate fault
is real and reproduced, while the dump-derived rate remains invalid.

**E12 IMPLEMENTATION (complete):** matched ink-band traffic discriminator before asking
for the NVIDIA machine. Add a default-ON debug switch that, when OFF, skips only the
2048x2048 ink textures' repeated clear and reduction work (the standard watercolour
recipe deposits no ink). Run equal bounded batches with traffic ON and OFF using the
post-capillary alarm, no per-frame CPU waits. Record raw event counts and final gauge
health in E12; restore the switch to ON after every test.

**Checkpoint:** the default-ON `inkBandTrafficEnabled` switch is implemented and the
build passes. It skips only repeated fine-ink clear/reduction dispatches when OFF;
textures remain allocated and the watercolour recipe never deposits dry media. Next
operation is the live matched AMD batch.

**Matched batch 1 [1 RUN ONLY]:** alarm events were `8/8` with ink traffic ON and
`8/8` with it OFF; final saturation/pigment were healthy and the WebGPU validation
error was null. This strongly excludes repeated ink clear/reduction traffic as the
trigger under the alarm observer, but the project requires a second identical
8-versus-8 batch before recording the rate as reproduced.

**E12 COMPLETE:** identical batch 2 also returned `8/8` ON and `8/8` OFF, with
healthy final gauges and null validation. Repeated fine-ink clear/reduction traffic
is excluded as the trigger under this observer. The observer makes the event
deterministic and therefore cannot supply the normal app's failure rate. No code or
experiment is in flight; both debug switches restore/default to normal behaviour.

1. In `src/engine/fluid.ts`, add a temporary public debug method that puts
   `recordGauge(...)` and the `wet5.srcTex` `copyTextureToBuffer` in **one command
   encoder**, then reads both buffers after that single submission. Expose it through
   `CanvasEngine` and `window.__engine` (the latter already exposes the canvas
   engine). It must return `{ gaugeSaturation, dumpedSaturation, dumpedPeak, cur }`.
   Do not change the simulation or `dump()`.
2. Run the same held-still 26-stroke session until at least two corrupted states are
   caught. Record the raw pair from this one-encoder probe and a healthy control in
   E10. The expected healthy relation is four-significant-figure agreement.
3. If the mismatch remains within one encoder, current-tree direct-dump *and*
   gauge-only rates are invalid; label the current-tree rate unknown and test the
   2048x2048 ink-band isolation only as a possible **trigger**, not by counting those
   old detectors. If the one-encoder pair agrees when prior separate submissions did
   not, the readback ordering/instrument is at fault; make a deliberate snapshot API
   and rerun the current-tree soak through it.

## COMPLETED ROUTE (E11–E12)

**Do not run another direct-dump soak; it cannot measure the failure rate.** Add a
temporary GPU-resident post-capillary alarm instead, then test the standard recipe.

1. In `src/engine/fluid.ts`, immediately after the `capillary` pass flips `wet5`
   (around the block beginning `run('capillary'`), dispatch a debug-only shader that
   scans the resulting `wet5.src` and atomically latches a one-word buffer if `.x` is
   NaN, negative, or `> 1e4`. Reset that latch in `clear()` and expose a one-time
   `readCapillaryAlarm()` through `CanvasEngine`. Keep it out of normal acceptance
   measurements; it changes GPU traffic.
2. Run a healthy control plus two standard sessions on AMD/Polaris. Record the latch
   only after each session, without per-frame CPU waits. If it stays zero while the
   copy path reports a huge value, the copy path is proven unsuitable as a stored
   paint detector. If it latches, a compute consumer observed a bad post-capillary
   state; then the current tree has a real intermediate fault and the ink-band
   isolation is worth testing as a trigger.
3. Append E11 with raw outcomes and what the added observer may itself perturb. Do
   not call either outcome a root cause, and do not start P8.

## NEXT ACTION — Bartford hand-checks E5, then shape calibration

1. Refresh `http://127.0.0.1:5175`. On Cold Press, use a fully watered blue brush,
   wait about five seconds, then tilt halfway. The wash should retain a visible
   movable film and push a tongue past its old dry edge instead of only travelling
   inside its previous wet shape.
2. Repeat once on Hot Press and Rough. Hot Press should keep the most surface water;
   Rough should soak fastest. This ordering is already numerically verified, but
   the visible timing and bloom shape are artist decisions.
3. Move the physical pen from the paper across the pigment, brush, paper, and tilt
   controls. The ring-and-cross locator should remain visible until the pen leaves
   the application window.
4. If crossing exists but is still too slow or too narrow, calibrate the shared
   mobility/resistance mapping next, preserving conservation and the cubic wet/dry
   face. If the film disappears too soon or hangs too long, adjust only the
   `[UNVERIFIED]` medium-row uptake value against the real-paper reference plates.
   Keep NVIDIA E13 postponed.

## PREVIOUS NEXT ACTION — Bartford's hand test, then calibration

The shared correction is implemented and two controlled AMD/Polaris runs agree.
See `docs/13-water-paper-behavior-log.md` E2 for exact values.

1. Bartford should paint on Cold Press with the evaporation slider at zero: make
   one merely damp wash and one visibly deep puddle, then tilt halfway. The damp
   wash should grip/soak; the puddle should visibly cross its old dry edge and
   form a downhill tongue. Repeat on Hot Press and Rough; Hot should stay on the
   surface longest, Rough should soak fastest.
2. If the *shape* is right but timing is wrong, calibrate only the
   `[UNVERIFIED]` `WATERCOLOR.absorptionCoupling` row in
   `src/media/library.ts` against real-paper reference plates. Do not fork the
   shader or alter paper rows to compensate.
3. If water still feels too slippery or too pinned, capture the exact paper,
   water load, tilt amount, and about how many seconds it should take. Adjust the
   shared mobility/resistance mapping only with a repeated conservation test.
4. The NVIDIA E13 experiment remains postponed until Bartford finishes this
   behaviour pass; do not ask him to switch computers yet.

## Recently completed

- Read guard on `capillary_flow.wgsl` reads — **closes the fault on the baseline**
  (0 blowups in 32 sessions vs 24/24 before). It is conservative and remains kept.
  E10 retracts the earlier current-tree `14/16` and `13/16` readings as *rates*;
  they depended on a raw-copy detector that demonstrably lies on this GPU.
- E9/E10: source inspection rules out a stale ping-pong side; healthy texture copies
  and compute reads agree; two same-encoder bad-copy events do not. The current-tree
  stored-state failure rate is unknown, not "13/16".
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
