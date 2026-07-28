# Codex handoff — 2026-07-27

This is the complete handoff for the work done after Claude's interrupted
ballpoint/fine-grid phase. Work is in this nested worktree, not the repository
root:

```text
C:\Users\benja\Documents\aniso-paint-pre-a01\.claude\worktrees\webgpu-test-477000
```

Current branch: `webgpu-test` at `4b1f747` (`Ballpoint: real width variation,
and nibs that actually go fine`). Nothing from this handoff has been committed.

## What changed

### 1. Fine grid for all dry media, with ballpoint as the proof case

The previous unfinished change introduced an ink/dry-media grid at 2048 square
while the wet-fluid simulation remains at 512 square. It is now connected end
to end.

- `src/engine/canvas.ts`
  - Creates a matching 2048-square paper texture for fine dry media.
  - Generates the same procedural paper grain at both resolutions.
  - Passes the fine paper view into `FluidEngine` and binds the fine ink bands
    into the final composite.
- `src/engine/fluid.ts`
  - Holds two ping-pong fine ink textures (`ink0`, `ink1`) in `rgba16float`.
  - Scales dry stroke footprints from the 512-coordinate input space to the
    2048-coordinate ink space before deposit. Pigment amount is not scaled;
    only position/radius are, which preserves ink per drawn distance.
  - Uses texture dimensions inside the fine-grid deposit and clear shaders, so
    the full 2048-square surface is addressed rather than only its upper-left
    512-square quarter.
  - Adds a separate fine-grid conservation reduction and merges it into the
    live pigment/readout totals. New shaders:
    - `src/engine/shaders/fluid/reduce_ink.wgsl`
    - `src/engine/shaders/fluid/reduce_ink_final.wgsl`
- `src/engine/shaders/composite.wgsl`
  - Renders the fine dry-media pigments as part of the permanent dry floor,
    beneath subsequent wet watercolor glazes.
- `src/media/dry-tool.ts` and `src/media/library.ts`
  - Refines ballpoint variation. Ink flow still makes occasional starve/recover
    skips, but width now changes in smaller, slower rolling variation instead
    of turning every light patch into a dramatic pinch.
  - Ballpoint `skipStrength` changed from `0.88` to `0.72`; `chatter` from
    `0.40` to `0.26`.

Artist-visible result already seen by the user: the fine ballpoint work looked
good. The key remaining artist check is whether the smallest Biro setting and
the quieter width variation feel right over longer hatching passages.

### 2. Water charge for watercolor brushes

Added a wet-brush `water` slider in the palette.

- `src/ui/palette.ts`
  - Adds `water` (0 to 1) below `load`.
  - At 100%, its hover help promises clean water with no pigment.
- `src/brush/reservoir.ts`
  - `Reservoir.charge(mix, load, waterCharge)` now performs one bounded blend:
    0% water charge preserves the old pigment-loaded brush; 100% creates a
    full, pigment-free water brush. Intermediate values add water while
    reducing pigment.
- `src/input/stroke.ts` and `src/main.ts`
  - Carry the water charge through fresh dips, brush changes, and the existing
    stroke path.

This does not create a new or fake path: clear water reaches the existing wet
fluid path, so it can use the existing `ReWet` pass for watercolor. Dry media
remain direct permanent dry deposits and are not made re-wettable.

### 3. Temporary paper-tilt picker

Added a compact circular picker modelled on the supplied Rebelle reference.

- `src/ui/palette.ts`
  - Adds a `tilt` header, blue draggable puck, `level` reset, and the hint
    `drag toward downhill`.
  - Puck direction maps to canvas downhill direction: right/down pulls paint
    right/down. Puck distance controls strength. Centre is level.
  - Puck radius is converted to the existing `cosAlpha` value so the existing
    capillary behavior responds to board angle.
- `src/main.ts`
  - Passes `gravityX`, `gravityY`, and `cosAlpha` into the already-existing
    `FluidEngine` parameters.
- `src/style.css`
  - Supplies only the small blue-puck instrument styling. It is intentionally
    a temporary, compact production-control stand-in.

User confirmation: tilt was tested manually and reported to work great.

### 4. Startup regression fixed

The first water-control version caused a blank canvas. Cause: `Palette`
immediately announces its initial mix during construction, while the callback
tried to read `palette.waterCharge` before the `palette` variable existed.

`src/main.ts` now keeps a local `waterCharge` startup value outside the palette
object, updates that value when the slider changes, and uses it for the initial
brush charge. This restores normal canvas startup. A live browser screenshot
after the fix showed the paper canvas and controls correctly.

### 5. Conservation/debug panel moved

The new tilt picker made the right-side palette tall enough to cover the live
conservation readout. `src/style.css` now places `#gauges` on the lower left,
directly above `#stylus`, with an 8-pixel gap. The right side is now exclusively
painting controls. The local layout was visually checked.

## Files modified by this session

```text
src/brush/reservoir.ts
src/engine/canvas.ts
src/engine/fluid.ts
src/engine/shaders/composite.wgsl
src/input/stroke.ts
src/main.ts
src/media/dry-tool.ts
src/media/library.ts
src/style.css
src/ui/palette.ts
src/engine/shaders/fluid/reduce_ink.wgsl              (new)
src/engine/shaders/fluid/reduce_ink_final.wgsl        (new)
docs/CODEX-HANDOFF-2026-07-27.md                      (this file)
```

There is also an untracked `.claude/settings.local.json`. It is user/tool
local configuration; preserve it and do not stage it.

## Verification actually run

All of the following passed after the final source changes:

```powershell
npm.cmd run build
```

That command runs TypeScript checking and Vite's production build. `git diff
--check` was also clean before the handoff report was added.

Live local preview is currently responding at:

```text
http://localhost:5173/
```

It was restarted outside the Codex sandbox because Vite cannot read its nested
worktree configuration from inside the sandbox. It may stop when the owning
shell/session exits; restart it with:

```powershell
cd C:\Users\benja\Documents\aniso-paint-pre-a01\.claude\worktrees\webgpu-test-477000
npm.cmd run dev -- --host 127.0.0.1
```

## Known issue deliberately not addressed

The user noticed high GPU use even while idle. That diagnosis is confirmed:

1. `src/main.ts` runs `engine.step()` and `engine.render()` on every animation
   frame, even when no stroke is happening and no wet paint needs movement.
2. `FluidEngine.step()` also reduces the full 2048-square fine ink band every
   frame to update the conservation meter.

This is expected from the current prototype, but not the desired idle behavior.
The agreed future fix is an active-canvas mode: advance continuously only while
paint is wet or a stroke is in progress; render once and rest when dry; update
the fine ink total after a dry-media stroke rather than every frame. Do not
silently change this behavior without re-measuring conservation and artist
motion.

## Review priorities for Claude

1. Check the fine ink conservation reducer for performance and numerical
correctness. It uses a 128x128 workgroup grid and an 8-lane final reduction.
2. Paint long ballpoint hatching at several sizes. Confirm the new smaller,
quieter width variation feels physical rather than jittery.
3. Test water at 100% over a dried watercolor wash. The expected result is
that the wash reactivates/moves; graphite and Biro should remain fixed.
4. Test tilt with a wet, pooled wash. Start close to centre; the edge of the
picker is intentionally a strong visibility test rather than a calibrated
production range.
5. Preserve the separate-fluid versus dry-media architecture. Watercolor runs
through the wet reservoir/fluid/re-wet path. Pencil and ballpoint remain in the
permanent dry path.
6. Do not commit `.claude/settings.local.json`. No commits were created in this
session.


---

## Review outcome — 2026-07-27

Reviewed against Bartford's report that this work *"really broke wet watercolor
painting"*. It had. Full write-up in `11-open-fault-conservation.md`, round 8.

**One regression, and it was fatal:** `clear()` had stopped clearing anything at
all. The ink variant of `zero_fill.wgsl` was built by swapping `P.grid` for
`textureDimensions(dst)`, which left the `Params` uniform declared but statically
unused. `layout: 'auto'` drops such a binding; binding it is a validation error;
the invalid bind group invalidated the whole clear encoder — and every wet
zero-fill shared that encoder. Two ink dispatches took eleven wet textures with
them. Every wipe left the previous painting in the buffers and the next one went on
top. Fixed by removing the uniform from the shader entirely rather than
special-casing the ink build.

**Two things corrected in passing, both listed above as intended behaviour:**

1. Merging the ink total into `pigment` / `dryPigment` blinds the conservation
   meter — a ballpoint line reads 2871 against a wash's 159, so a wet-band leak
   would vanish inside it. Ink now has its own lane and its own readout row.
2. The idle GPU load ("known issue deliberately not addressed") was almost entirely
   the per-frame ink reduction. The ink band has no physics, so its total cannot
   change unless a dry tool wrote there. Reducing only on change: **16.4 ms → 5.8
   ms per idle frame**, measured twice.

**Everything else in this handoff verified sound**, twice each: wet conservation,
the drying handoff, the water charge at 0 / 0.5 / 1.0, and watercolour glazing over
ballpoint (see `09-acceptance.md`). The tilt picker and the gauge relocation are
fine.

**One non-fault worth knowing:** two identical strokes alternate in a period of two
(99.3039 / 95.4106 / …). That is `spine.recover(0.5)` keeping half the tuft's
plastic splay between strokes — modelled behaviour, not a bug, but it will confuse
any measurement that assumes strokes repeat.
