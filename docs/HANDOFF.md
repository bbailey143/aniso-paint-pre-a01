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

**Last updated:** 2026-07-31 (brush studio render verified on screen; nothing in
flight)
**By:** Claude (Opus)

**THE NEXT ACTION IS BARTFORD'S, NOT A MODEL'S.** Two things are waiting on his
eye and neither should be worked around:

1. **Look at the 3D brush studio** on branch `3D-brush` (`brush-studio.html`) —
   see the entry below. Does it read as a brush?
2. **Then decide whether `3D-brush` merges back into `webgpu-test`**, which is
   3 commits behind it. Do not merge it unasked; it is a UI branch and the
   painting app does not depend on it.

The rim/`edgeEvaporation` NEXT ACTION further down this file is **paused at
Bartford's word** and is not the live next step. Read it for context, not as an
instruction.

## MERGE VERIFICATION — `0892571`, checked 2026-07-29

Codex's dry-media foundation merged with the watercolour work. HEAD is `1eab3e6`,
17 commits ahead of `origin/webgpu-test`, 0 behind, working tree clean apart from
the five long-standing untracked items. **Verified, not assumed:**

- Builds; page loads on `webgpu: amd / gcn-4` with no shader or WebGPU
  validation error.
- **Wet paint is unchanged by the merge.** The pre-merge commit `68ef979` was
  checked out into a scratch worktree, served on port 5188, and run through the
  identical four-stroke harness. Both builds return pigment `633.541565`,
  interior roughness `0.381677`, edge roughness `0.609925` — the same numbers,
  not merely close ones. Codex's note that the dry path uses a separate segment
  layout "so wet-brush footprints stay byte-for-byte unchanged" holds up under
  measurement.
- Both uniform-buffer sizes survived intact — fluid params `24*4 + 8*16` with
  `pig` at offset `96`, composite params `80`. These are the merge's most
  dangerous surface: a wrong-side merge here fails **silently**, with every
  parameter frozen and every gauge reading zero. Check them first after any
  future merge.
- E11 still works post-merge: `edgeEvaporation = 10` still humps the radial
  profile (`0.405, 0.379, 0.422, 0.425, 0.404, 0.336, ...`) against a flat
  `edgeEvaporation = 0` (`0.405, 0.358, 0.357, 0.362, 0.354, 0.358, ...`),
  pigment conserved, validation null.
- Water view survived: checkbox present, `__engine.waterView` live.
- Codex's side is present: ten dry tools (9B/2B/HB/2H, two biros, vine charcoal,
  conté, wax crayon, chisel fountain) and long-press settings cards.

**Stale reference numbers.** Earlier entries quote a four-stroke baseline of
interior `0.347627` / edge `0.592322`. Both builds measure `0.381677` /
`0.609925` today, so that older pair came from a differently-configured session
and **why is not known**. Do not compare against it. The pre/post-merge
comparison above is same-day, same-machine, same-harness and is the one to trust.
**Build state:** `npm.cmd run build` passes with the shared water/paper,
below-mask drying, independent paint-load/added-water, layered-flow resistance,
medium gravity response, wet-to-dry value shift, and global pen-cursor corrections.
Chrome exercised every changed shader on AMD/Polaris with no page, shader, or
WebGPU error. E7's level/tilt, dry/wet-underlayer, flooded, and optical comparisons
were each repeated twice. E8's much stronger rim treatment was artist-rejected for
severe stippling, spikes, and false cell contours and has been fully reverted.
See `docs/13-water-paper-behavior-log.md` E7-E8. This checkout still has unrelated
untracked `bench/`, `claude-uncommitted-diff.patch`, two `.mp4` files in `docs/`,
and `process_video.py`; do not touch them.
**Git state:** Bartford authorized publication and Codex pushed E11/E12 through
`0bf9470` to `origin/webgpu-test`. The three local behavior milestones through
E4 plus E5 are not pushed. E6 is committed in the current local history; it must
not be pushed without fresh authorization. E7 is committed in the current local
history and also must not be pushed without fresh authorization. E8 commit
`9f5d1e8` was rejected by Bartford and reversed by `7d5ff35`; do not restore it.
The rollback and this record must not be pushed without fresh authorization.
The listed untracked files remain unrelated and must not be touched.

## Current objective

Correct and hand-check the shared water/paper foundation before feature work. The
current pass covers brush dilution, tablet location feedback, absorption, drying,
and distinguishing downhill film travel from directionless capillary creep.

The NVIDIA E13 discriminator for the separate explosion fault is explicitly
**postponed at Bartford's request**, not cancelled. P8 polish remains on hold.

**Active evidence log for this work:** `docs/13-water-paper-behavior-log.md`.

**Checkpoint:** E6 is implemented, measured, and artist-accepted. The old control compressed a
load-0.6 brush into water/pigment ratios `0.6 → 1.0`, while pigment ignored load.
Load now scales the normal paint charge; water is added independently. The current
sable rows use `[UNVERIFIED] waterOvercharge = 3.0`, allowing maximum water to be
a deliberately flooded brush. The five ratios are now
`1.0, 2.25, 3.5, 4.75, 6.0`; repeated tilted tests and a headed render show
progressively broader, longer-lived washes. Rinse remains pure water. Bartford's
hand test passed: Bartford called the result beautiful. Do not begin the postponed
NVIDIA test.

**E7 COMPLETE — shared layered-flow and drying response.** Wet media now own reusable
row values for ordinary drag, gravity response, resistance from the local wet load,
and edge-darkening strength. Full-tilt centre travel fell from about `8` cells to
`1.34` over dry paper and `0.95` over a pre-wet layer; the wet layer broadens rather
than accelerating the new color. A flooded stroke still advanced its frontier
`13` cells versus `9` for the ordinary stroke. The existing shared `valueShift`
now makes the tested ultramarine spot lighten `13.68%` on drying without changing
pigment. Its rim/interior concentration increased `0.3346 → 0.3920`. The isolated
edge-darkening-row contribution was small, so visual coffee-ring/cauliflower quality
remains an artist hand-check. The provisional watercolor row is
`drag 0.06 / gravityResponse 0.03 / wetLayerDrag 0.55 / edgeDarkening 0.045`;
all four remain `[UNVERIFIED]`. Sub-`0.11%` AMD/Polaris amount variability remains
recorded and does not close the postponed hardware fault.

**E8 REJECTED AND REVERTED.** Raising `edgeDarkening` from `0.045` to `20` while
changing the edge mask and neighbourhood weighting made ordinary marks visibly
synthetic: dense stippling, spikes, repeated cell bands, and false contours.
Bartford gave the pass a hard rejection. The entire E8 source change is reverted;
E7 remains the accepted base. The artifact was not merely “the current
resolution”: E8's algorithm strongly amplified that grid. Do not tune E8 or repeat
its high edge-pressure approach.

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

## DONE, NOT YET SEEN BY BARTFORD — brush studio rendering, branch `3D-brush`
## (Claude, landed `653a756` 2026-07-30, verified on screen 2026-07-31)

**YOU MAY BE ON THE WRONG BRANCH.** Gemini opened `3D-brush` off `webgpu-test`
and built a 3D brush viewer there. `webgpu-test` is 3 commits behind it. Check
`git branch --show-current` before doing anything. **Nothing is in flight; the
tree is clean apart from the five long-standing untracked items.**

**Review verdict on Gemini's work: the engineering is sound, the drawing is not.**
`src/ui/studio.ts` genuinely drives the real `Spine` solver — it calls
`spine.solve(...)` with real tilt/pressure/drag and reads `spine.joints` and
`spine.tip`. That part is worth keeping and is not a mock-up. Three things make
it not read as a brush:

1. **The tuft is a flat fan, not a volume.** Bristle roots are placed with a
   single parameter `u` in -1..1 driving BOTH the angle and the radius, so every
   hair lies on one curved sheet through the axis instead of filling a disc.
2. **The ferrule and handle are screen-aligned 2D shapes** — a bare `ctx.rect`
   and a trapezoid — so they do not rotate when the camera orbits. The tuft
   turns and the handle does not.
3. **No depth sorting**, so far bristles paint over near ones and the tuft has
   no read of solidity.

All three were fixed in the render only, plus a fourth found on the way: the
projection had world height and view depth swapped in the elevation rotation, so
the brush hung upside down with its handle below the tuft. **The solver was not
touched** — if the brush's behaviour looks wrong now, that is a real finding
about the brush engine and not about this viewer. The uncommitted 237-line
layout pass that was in the tree was absorbed into the same commit.

**Verified on screen 2026-07-31, not assumed.** `npm.cmd run build` passes
(`tsc --noEmit` clean, 47 modules). `brush-studio.html` served and rendered; no
console error, no page error. Four frames captured off `studio-canvas` and
looked at:

- Default view: handle above, banded ferrule below it, tuft tapering to a point
  at the bottom. Right way up — fix 4 holds.
- Tuft reads as a solid tapered volume with front-to-back shading, not a
  scribble — fixes 1 and 3 hold.
- Camera orbited 90°: handle, ferrule and tuft turn together as one object —
  fix 2 holds.
- Under `pressure 0.85` with a drag vector, the tuft visibly curves and trails
  against the shaft, so the viewer is being driven by a live `Spine` solve
  rather than drawing a fixed shape.

**Instrument note for whoever repeats this.** The studio draws from
`requestAnimationFrame`, so a headless or hidden browser pane leaves
`studio-canvas` fully transparent and the viewer looks broken when it is not.
Call `render3D()` directly to force a frame, or look at it in a visible window.

**What is still owed: Bartford's eye.** Nobody who paints has looked at it. Open
`brush-studio.html`, orbit the view, and push the pressure slider up and down.
The question is not whether the geometry is correct — it is whether it reads as
a brush he recognises.

## PREVIOUS: view zoom/pan (Claude, 2026-07-30)

**Rim work is PAUSED at Bartford's word** — he has not decided a direction and
does not want one chosen for him. E12's two findings stand; nothing is being
changed on the back of them. `edgeEvaporation` and `rimMigration` stay `0`.

**Building: smooth zoom and pan.** He needs to judge pigments up close, and
that is now the blocker. Design, with what it can and cannot honestly do:

- View transform lives in `composite.wgsl`'s fit block plus the Comp uniform
  (`zoom`, `panX`, `panY`). `zoom = 1` with pan at the document centre must
  reproduce today's framing exactly — that is the regression path.
- **`toGrid()` in `src/main.ts` mirrors that same fit math and MUST be changed
  with it**, or paint lands somewhere other than under the cursor. This is the
  one way to get zoom badly wrong.
- Paper grain (`paper.wgsl`: `hash2`/`vnoise`/`fbm`) is **procedural**, so it can
  be evaluated per screen pixel instead of stretched from the 512 texture. That
  is what keeps a zoomed view crisp rather than soft, and it is the whole reason
  this is worth doing properly.
- Honest limit to state plainly and not paper over: **the pigment field is 512
  cells and zoom cannot invent detail in it.** Smooth interpolation avoids
  blockiness; it does not add resolution. What IS resolution-independent is the
  colour — Kubelka-Munk is already evaluated per screen pixel — and the paper
  relief once it is procedural. Dry media are already 2048.

Uniform arithmetic: Comp goes 80 -> 112 bytes (view group + paper-params group).
Three places must agree — `struct Comp` in composite.wgsl, the `ArrayBuffer` in
`writeCompParams`, and the `createBuffer` size. This has bitten twice.

**CHECKPOINT — written, `npm.cmd run build` passes, NOT yet run in the browser.**
WGSL does not compile at build time, so nothing below is verified until the page
loads. Changed files and what is in each:

- `composite.wgsl` — Comp gains `zoom/panX/panY` and `pTooth/pFreq/pSeed`; the
  fit block becomes `(fragPx - view*0.5)/scale + pan`; `bicubic()` +
  `paint()` (Catmull-Rom above zoom 1.05, bilinear at or below); `grain_h()`
  duplicates paper.wgsl's noise so relief is evaluated per screen pixel with the
  gradient stepped one screen pixel, not one paper texel.
- `canvas.ts` — `zoom/panX/panY`, `zoomAt/panBy/resetView/clampPan`,
  `PAPER_SEED = 0.137` hoisted to a named constant (three things must agree on
  it), `MIN_ZOOM 0.25 / MAX_ZOOM 16`, compParams 80 -> 112.
- `main.ts` — `toDoc()` inverts the shader's fit; wheel zooms about the cursor,
  middle-drag/space-drag pans, Ctrl+0 fits. View input is kept OFF the brush's
  pointer path so a stray wheel notch cannot leave a mark.
- `index.html` — a zoom percentage in the HUD.

**If this is abandoned mid-way:** `zoom = 1` with pan at `DOC/2` is exactly the
old framing, so the feature is inert by default and safe to leave in tree. The
one thing that must not be half-done is the `composite.wgsl` fit block and
`toDoc()` in main.ts — they are inverses of each other and a mismatch paints off
under the cursor without erroring.

**VERIFIED IN THE BROWSER.** Page loads on `webgpu: amd / gcn-4` with no shader
or validation error. Zoom, pan and Ctrl+0 all work; the HUD reads the zoom
percentage. Nothing is half-done.

**One real change came out of measuring rather than assuming.** Four octaves of
fBm magnified is soft blobs, not crisp grain: adjacent-pixel detail on bare paper
fell `2.20` at fit to `0.15` at 16x. `grain_h` now adds one octave per doubling
of zoom, capped at three extra. Re-measured: `0.15 -> 0.29` at 16x and
`0.48 -> 0.57` at 8x. The extra octaves are strictly finer than one simulation
cell, so they are fibre the water cannot feel — the same licence the ink grid
already takes by evaluating the sheet at 4x for pen nibs.

**The honest ceiling, which must not be oversold to Bartford:** the paint field
is 512 cells. Bicubic removes blockiness; it cannot add detail that was never
simulated. At 8x and beyond a brush mark is visibly SOFT. What IS exact at any
zoom is the colour — Kubelka-Munk runs per screen pixel — and that is what he
actually needs for judging pigments. If mark sharpness under magnification later
matters more than it does now, the only real fix is raising `SIM`, which is a D7
wetness-budget decision and costs solver time. **Not a decision to make quietly.**

**Trap found, worth knowing:** `debugReadback(size)` in canvas.ts silently
returns all-black unless `size * 4` is a multiple of 256 (so `size` a multiple of
64). WebGPU rejects the `copyTextureToBuffer` and nothing surfaces. Two probes at
size 16 and 32 read as "the screen is black" before this was spotted.

**Also worth knowing for any future harness:** `StrokeEngine.begin/add` take
**grid** coordinates (0..512), not document px. Panning to a "stroke at y=300"
in doc space lands on bare paper. This cost a wrong measurement in this session.

### Hand panning (space-drag), added after the zoom

The first cut had a real bug: `PointerInput.onDown` started a stroke on **any**
press, so space-drag would have panned *and painted*. Fixed properly rather than
by hoping two handlers stay out of each other's way — `PointerCallbacks` gained
`shouldIgnorePress(e)`, asked before a stroke may begin, and main.ts answers
`spaceHeld || panning`. `onDown` also now ignores any button but the primary, so
a middle-drag and a right-click cannot paint either.

Checked on the way DOWN only, deliberately: a stroke already in progress is never
interrupted, so a mistimed space cannot tear a line in half. Space is likewise
ignored while `painting` is true.

Cursor: `grab` while space is held, `grabbing` while dragging, back to
`crosshair` on release (`#stage.hand` / `#stage.grabbing` in style.css).
`window.blur` clears both flags so alt-tabbing away with space down does not
leave the hand stuck on. `auxclick` is suppressed or Windows opens its
middle-click scroll widget over the sheet.

**Verified with synthetic pointer events, run twice:** space-drag pans and leaves
pigment at exactly `0`; middle-drag the same; an identical drag with space up
paints (`55.33`, then `46.80` on the repeat — different because the sheet was
cleared and re-charged between runs, not a discrepancy). Both runs agree on the
part that matters, which is `0` versus not-zero.

## PREVIOUS: session closed clean, 2026-07-29 evening.

No half-edits, no uncommitted source, no experiment mid-flight. Build passes,
page loads clean, working tree holds only the five long-standing untracked items.
A stale pre-merge server that was running on port 5188 for the merge check has
been stopped and its scratch worktree removed — if you see 5188 anywhere in these
notes, it is gone.

**TWO THINGS ARE OWED BY BARTFORD, NOT BY THE NEXT MODEL. Do not do them for him
and do not proceed as though they came back positive:**

1. Water view on a real drying wash — does the dry-down look like paper?
2. `edgeEvaporation` `10` vs `0` on a flooded wash — is there a soft darker band,
   and crucially **no** dot field, spikes or contour bands?

**PUSH AUTHORIZED AND DONE — 2026-07-30.** Bartford said "Let's push and commit
this sucker", which lifts the hold that had been sitting on E6, E7, the E8
rollback and everything after them. 22 commits went to `origin/webgpu-test`,
covering the whole water/paper behaviour pass, the rim work, Codex's dry-media
foundation and its merge, the water view, zoom/pan and hand panning.

The rejected E8 commit `9f5d1e8` went up **together with its revert** `0fe23f0`.
That is deliberate: the record of a pass the artist rejected, and why, is worth
more than a tidy history. See log 13 E8.

**The old default is back in force:** commit and push whenever a milestone lands
(protocol A7). The blanket hold is over; do not re-invent it. Ask again only for
something genuinely new in kind — rewriting history, force-pushing, or pushing to
a branch other than `webgpu-test`.

**Offered and unanswered:** putting the taste dials (`drag`, `gravityResponse`,
`wetLayerDrag`, `evapRate`, `valueShift`) on live sliders beside the drying one,
so tuning is Bartford's loop rather than a model's. Worth doing if he says yes;
do not build it unasked.

Dev server on `http://127.0.0.1:5173` (vite.config.ts pins 5173; the baton's old
5175 was a collision that session, not a setting).

**E9 is implemented and inert, uncommitted.** `npm.cmd run build` passes and the
page loads with no shader or WebGPU validation error on `webgpu: amd / gcn-4`.
The design entry is in `docs/13-water-paper-behavior-log.md` E9. Changed files:

- `src/engine/shaders/fluid/rim_migration.wgsl` — new pass (the whole mechanism)
- `src/engine/shaders/fluid/flow_outward.wgsl` — also emits a Gaussian-blurred
  film height in `press.y`; its own pressure bias is UNCHANGED
- `src/engine/shaders/fluid/common.wgsl` — `rimMigration`, `rimReach` in Params
- `src/engine/fluid.ts` — pass wiring, params packing, **buffer resized 208 -> 224**
- `src/media/types.ts`, `src/media/library.ts` — the two new rows
- `src/engine/canvas.ts` — rows fed to the solver

**Shipping default is `rimMigration = 0`**, which skips the dispatch entirely.
Verified: six consecutive rim=0 sessions are bit-identical to the pre-E9 E7
baseline (pigment `633.541443`, roughness `0.5249959`). So this changes no paint
until someone sets the row — and **it is staying at 0.**

**E10 measured it and it is not good enough to turn on.** It conserves pigment to
six figures and adds edge darkening to brush strokes, but it does not make a
coffee ring on a wash: its direction field is the gradient of a fixed +/-4 blur,
so it only has reach a few cells inside the film edge and cannot carry pigment
from the middle of a puddle to its rim. At the strength where a wash changes
visibly, cell-scale structure across the whole wash rises ~4x. Full numbers,
both instrument errors, and one retracted claim of mine are in
`docs/13-water-paper-behavior-log.md` E10.

**Nothing is half-edited.** Build passes, no validation errors, default inert.

**E11 IS DONE AND IT IS THE ROUTE THAT WORKS.** `dry_tick.wgsl` now evaporates
faster near a film's edge, scaled by one new row `edgeEvaporation`. No new pass,
no new transport term — `update_velocities.wgsl` and `flux_apply_pigment.wgsl`
already move water downhill and carry pigment on it, so thinning the rim is
enough. Measured, reproduced, and clean: a ring forms while cell-scale structure
rises only `4%` (E9's route raised it `280%`). Pigment conserved to five figures,
sheet dries to zero water, no validation errors. Full numbers in `docs/13` E11.

**Open and specific: the ring lands at ~25-35% of the wash radius, not at its
outer edge.** Not explained. The suspicion — recorded as suspicion — is that
Deegan needs a *pinned* contact line and nothing here pins one, so the drying
band walks inward as the wet region shrinks. **Test that before building
anything:** log the wet-region radius over time in one drying run and see whether
the deposition band tracks it.

**Instrument rule learned the hard way: reload the page before any measurement
session.** Long-lived pages accumulate the single-cell fault and it silently
poisons water totals — it fakes a conservation break that is not there.

**WATER VIEW is now in the app** (checkbox above "clear sheet", or
`__engine.waterView = true`). Bartford asked for it and it is the right
instrument for the rim work as well: strong blue is standing film, teal is water
soaked into the fibres, a yellow line marks the wet-mask boundary. Log ramp over
four decades, `1e-5` to `1e-1` per cell, so the long tail of a dry-down is
visible rather than one bright flash and then nothing. It reads the same
textures the paint path reads and writes nothing back — leaving it on cannot
change what dries or where.

**First thing it showed, recorded as an observation and NOT a conclusion:** on a
flooded wash the standing-water disc is much smaller than the wet-mask ring
around it, and the disc shrinks inward as it dries while the mask ring stays put.
So the last standing water sits in the MIDDLE of the wash. Whether that is why
E11's ring lands inside rather than at the edge is exactly the question the next
action asks, and this view is how to answer it by eye before instrumenting it.

**If you must abandon this:** safe to leave in tree exactly as is. Do not revert it
to "get back to E7" — E7 *is* what runs at `rimMigration = 0`. The 208 -> 224
params-buffer resize is load-bearing for everything else in that file; do not
partially revert that line. `flow_outward.wgsl` now also emits a blurred film
height in `press.y`, which the recommended next route needs, so keep that too.

`git status` in the repo root tells you the truth. The five untracked items
listed under Build state are unrelated — leave them.

## NEXT ACTION — Find out why the ring sits inside the wash, before pinning anything

E11 works and is clean. One thing is wrong with it and it has one cheap test.

1. **Measure before building.** In one drying run of the pool at
   `edgeEvaporation = 10`, record every ~100 steps: the radius of the wet region
   (from the `wet0.x` mask), and the radius of the peak in the dried-pigment
   radial profile. If the deposition band follows the shrinking wet edge inward,
   the contact line is retreating and pinning is the fix. If the band sits still
   while the wet edge retreats past it, pinning is **not** the fix and the
   suspicion in E11 is wrong — say so loudly, because everything below assumes it.
2. **Only if step 1 confirms retreat:** pin the contact line. The physical hook is
   already in the engine — paper tooth and sizing resist a receding meniscus. Look
   at `capillary_flow.wgsl` and the `PAPER` texture before inventing anything, and
   expect it to want a shared row (`edgePinning`?) rather than a watercolour case.
3. **Do not touch what works.** E7's `drag 0.06 / gravityResponse 0.03 /
   wetLayerDrag 0.55 / edgeDarkening 0.045` stays. `rimMigration` stays `0`.
   `edgeEvaporation` stays `0` until Bartford has judged it by hand.
4. **Bartford's hand test is still owed** on E11. He should flood a wash on Cold
   Press with drying up, and compare `edgeEvaporation` `0` against `10` live:
   `__engine.setFluid({ edgeEvaporation: 10 })` in the page console, then paint.
   What to look for: a soft darker band appearing inside the wash, and — the part
   that matters — **no** dot field, spikes or contour bands anywhere.
5. Reload the page before each measurement session. See the instrument rule above.
6. Keep NVIDIA E13 postponed until Bartford explicitly says he is ready to switch
   computers.

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
