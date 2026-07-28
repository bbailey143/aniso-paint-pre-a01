# Water / paper behaviour evidence log

This log covers the shared wet-medium and substrate foundation: resistance to flow,
gravity-driven crossing of a wet/dry boundary, and absorption into paper. The older
NVIDIA discriminator for the unrelated transient GPU fault is postponed, not closed.

## E1 — Existing paper and medium controls do not reach absorption (2026-07-28)

**Purpose.** Determine why tilted water appears nearly frictionless while wet edges
pool instead of allowing a sufficiently wet wash to run onto dry paper.

**Method.** Trace the documented fluid and substrate equations through
`src/media/library.ts`, `src/substrate/papers.ts`, the fluid parameter buffer, and
the three shared water passes.

**Raw result.**

- The three paper rows already provide sizing and capillary radius: Hot Press
  `0.85 / 2.5e-5`, Cold Press `0.60 / 1.0e-4`, Rough `0.40 / 2.5e-4`.
- `WATERCOLOR` already provides `viscosity = 0.1` and
  `absorptionCoupling = 1.0`.
- `capillary_flow.wgsl` reads paper capacity only. It ignores sizing, capillary
  radius, medium absorption coupling, and medium viscosity, and instead absorbs
  `0.35 * dt * surfaceWater` everywhere.
- `update_velocities.wgsl` adds the full tilt vector as acceleration and removes
  only the fixed C97 drag `0.01` per step, regardless of film depth.
- `flux_compute.wgsl` sends `velocity * surfaceWater * dt`; the documented A26
  face mobility `((h1+h2)/2)^3` is absent.

**What it proves.** The reported behaviour is consistent with missing connections
in the shared foundation. The necessary paper and medium data already exist; this
does not require a watercolor-only exception.

**What it does NOT prove.** Source inspection does not establish the correct
artist-visible speed, nor whether the documented dimensionless equations will need
later calibration against real reference plates.

## E2 — Shared correction compiled and measured on AMD/Polaris (2026-07-28)

**Purpose.** Connect the existing data rows to the documented shared equations.

**Method.** Implement squared-depth Lucas-Washburn integration for uptake, using
paper sizing and pore radius plus medium viscosity and absorption coupling. Apply
the A26 cubic face mobility to conservative surface flux. Build, compile the WGSL
in Chrome, then run repeated flat and tilted measurements.

**Raw result.**

- `npm.cmd run build` passed. Chrome compiled and ran the shaders on
  `webgpu: amd / gcn-4`; no WGSL or WebGPU validation error was reported. The
  only console item was Chrome's warning that `powerPreference` is ignored on
  Windows.
- The first wiring used the provisional `absorptionCoupling = 1.0`. It was
  rejected before acceptance: Cold Press had zero surface film by step 10 and
  Rough had zero after the first step. This was too fast to permit useful runs.
- `WATERCOLOR.absorptionCoupling` is now `0.01`, explicitly `[UNVERIFIED]` until
  real-paper plate calibration. Two identical controlled runs then produced the
  same values to every printed digit:

| paper | film / absorbed after 1 step | after 10 | after 30 |
|---|---:|---:|---:|
| Hot Press | `97.0952988 / 2.3268583` | `90.9195786 / 8.5025768` | `79.7251511 / 19.6970043` |
| Cold Press | `90.5924683 / 8.8296795` | `68.9734497 / 30.4487000` | `41.1427116 / 58.2794380` |
| Rough | `76.2162552 / 23.2021828` | `26.9712849 / 72.4471664` | `0.2970148 / 99.1214371` |

- Total water, with evaporation off, remained effectively flat from step 1 to
  step 30: Hot Press `99.4221570 → 99.4221554`, Cold Press
  `99.4221478 → 99.4221497`, Rough `99.4184380 → 99.4184518`.
- On Cold Press at half tilt, the deep puddle retained `92.3760300` surface
  water after 20 steps, shifted its surface-water centre `15.2992` cells
  downhill, and advanced its downhill frontier from cell `230` to `243`:
  **13 cells onto formerly dry paper**. Total-water drift was
  `+0.00000420 %`.
- The thin application started with only `2.0102732` surface water against
  `7.9319420` already absorbed and was fully taken into the paper within the
  same 20 tilted steps. It did not remain as a frictionless sliding film.
- An additional screenshot-oriented run was not identical: several cases gained
  exactly `+2` or `+4` water while the main animation was nominally paused.
  That run is excluded from the conservation result and logged as unexplained,
  consistent with the separate AMD/Polaris transient investigation in
  `docs/12`. Its rendered preview still showed a broad ultramarine wash moving
  downward into a soft, paper-textured fringe rather than remaining a pinned
  bar.

**What it proves.** The shared correction is live on the GPU, conserves water in
the two repeated controlled runs, gives the three existing paper rows distinctly
ordered uptake, and permits a sufficiently wet wash to cross a dry boundary under
gravity. The behaviour comes from common equations plus paper/medium rows, with no
watercolor-only shader branch.

**What it does NOT prove.** `0.01` is not a measured material constant and must not
be presented as one. The numerical tests establish direction, conservation, and
parameter wiring; Bartford's hand and real-paper reference plates still decide
whether the final visual timing and amount of bloom feel right. The extra run's
`+2/+4` event remains part of the postponed GPU fault, not evidence against the two
identical clean measurements.

## E3 — Thin absorbed water now finishes drying (2026-07-28)

**Purpose.** Diagnose Bartford's recording of stale paint that continues to jump
while its water does not visibly evaporate.

**Method.** Inspect
`20260728-2209-11.9256907.mp4` at one-second and five-frame-per-second intervals.
Trace DryTick and the medium row into the live controls. Change DryTick so the wet
mask schedules motion but does not gate evaporation. Connect the active wet
medium's evaporation value to the shared solver and the initial slider display.
Build, compile in Chrome on AMD/Polaris, then repeat a controlled below-mask drying
case twice. Also repeat a heavier pigmented drying case twice.

**Raw result.**

- The 13.0666-second, 930×1080 recording has the dry slider at maximum. It shows
  water near `104.01` and `wet cells = 0` throughout. The water gauge has one
  transient frame at `1.0244241027175636e+35`, then returns to `104.01`;
  pigment remains `7673.883`.
- Source inspection found that DryTick removed both standing and absorbed water
  only inside `if (wetMask >= 0.5)`. Capillary creep can put water into cells
  below that motion threshold. Those cells therefore retained water forever.
- `CanvasEngine.setWetMedium()` did not pass the row's existing `evapRate` to the
  solver. The slider also displayed zero initially even though the watercolor
  row specifies `0.0015`.
- `npm.cmd run build` passed. Chrome ran the updated WGSL on
  `webgpu: amd / gcn-4`; the browser reported no page, shader, or WebGPU error.
- In each of two identical thin-water runs, evaporation was first disabled and
  the paint was advanced 900 steps. Both arrived at exactly:
  `water = saturation = 0.000008323441761604045`, `film = 0`,
  `wetCells = 0`, `pigment = dryPigment = 0.0001664688461460173`, and
  `wetPigment = 0`. After enabling evaporation at `0.004` for one step, both
  returned `water = 0` with every pigment value unchanged. Capillary alarm was
  `0` in both runs.
- In two heavier pigmented runs at `evapRate = 0.004`, water fell from
  `5.4197614 / 5.4211417` at step 0 to `0` by step 30 and stayed zero.
  At step 700, `wetCells = 0`; total pigment was `3.7184889` and dry pigment
  was `3.7184882 / 3.7184885`, leaving only
  `0.000000706 / 0.000000556` in the wet band. Both capillary alarms were `0`.

**What it proves.** The stale-water mechanism in the recording was real and is
corrected in the shared drying pass. Absorbed water now finishes evaporating even
after it is too thin to participate in fluid motion. Pigment is conserved and
moves into the dry layer rather than remaining mobile. The medium row, solver,
and visible control now agree on the initial evaporation rate.

**What it does NOT prove.** The existing `[UNVERIFIED]` evaporation timing is
artist-calibrated or matches the 1–5 minute acceptance range. The one-frame
`1.0244e35` jump is the separate AMD/Polaris transient already tracked in
`docs/12`; this drying correction does not close it, and the postponed NVIDIA
discriminator is still needed after the behavior pass.
