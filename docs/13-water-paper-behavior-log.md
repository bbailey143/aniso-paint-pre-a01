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

## E4 — Added water keeps color; level creep is directionless (2026-07-28)

**Purpose.** Diagnose Bartford's second behavior recording: 100% water charge
removed all pigment, a tablet pen had no visible cursor, and wet-cell count kept
growing after the tilted sheet returned level.

**Method.** Inspect `20260728-2234-27.0103556.mp4`, trace brush charging and pointer
events, then correct and live-test those paths. Run two identical painted-stroke
comparisons at 0% versus 100% added water. Run two identical tilt-then-level tests
with evaporation disabled; measure wet-cell count and the absorbed-water centre.

**Raw result.**

- The 90.8-second, 1920×994 recording confirms all three reports. In the latter
  section, the board returns level while water remains about `9092.3`, drying is
  at minimum, and wet cells continue rising until drying is increased; water then
  falls to `0` and wet cells follow to `0`.
- `Reservoir.charge()` explicitly multiplied pigment by
  `1 - waterCharge`; at 100% it therefore produced a pigment-free brush. This
  contradicted the UI wording “add clean water” and duplicated the explicit rinse
  action.
- After correction, reservoir totals at 0% versus 100% added water were:
  water `163.8646183 → 273.1076927`, while pigment stayed exactly
  `273.1076927`.
- Two identical round-brush strokes each emitted `4414` footprint segments.
  Run 1 laid pigment `72.2355576 / 72.2355499` at 0% / 100% added water;
  run 2 laid `72.2355576 / 72.2355576`. Water increased from
  `43.3413382 / 43.3413372` to `72.2355480 / 72.2355547`.
- Windows/browser pen input can hide the operating-system cursor. A new
  PointerEvent-driven pen locator was exercised with a synthetic pen-hover event:
  it appeared at the supplied `400px / 300px` location with computed opacity `1`.
  A headed screenshot on `webgpu: amd / gcn-4` shows the ring-and-cross locator
  clearly on light paper. Mouse input retains its native crosshair.
- In each of two identical controlled level tests, absorbed water was
  `7.8808665` at leveling and remained `7.8808651–7.8808675` with evaporation
  off. Wet cells grew `836 → 844 → 879 → 923 → 947` over 100 level steps, but
  the water centre stayed at approximately `260.012044 / 189.094215`; its total
  movement was below `0.000001` cell. Capillary alarm was `0` both times.
- `npm.cmd run build` passed before live testing. The updated page ran on
  `webgpu: amd / gcn-4`.

**What it proves.** The 100%-water pigment loss was incorrect control behavior and
is fixed: added water now increases fluid without erasing color, while rinse remains
the deliberate clean-water-only action. Pen location is now rendered by the app
instead of depending on the tablet driver's cursor. Continued wet-cell growth after
leveling can be valid fibre creep: in the repeated controlled case the boundary grew
while the water centre did not drift at all. The renamed “drying” control is the
evaporation-speed control Bartford inferred it to be.

**What it does NOT prove.** A synthetic pen event cannot prove every tablet driver
delivers hover events; Bartford's physical tablet remains the acceptance test.
Wet-cell growth alone does not certify every visible run as correct: if a leveled
deep surface puddle keeps travelling directionally for too long, that requires a
separate film-centre timing test. The evaporation and absorption constants remain
`[UNVERIFIED]` pending real-paper timing calibration.

## E5 — A hand-laid wash now survives long enough to cross dry paper (2026-07-28)

**Purpose.** Diagnose Bartford's recording in which a fully watered wash appeared
to run inside an already-wet area but scarcely pass its dry boundary, and the pen
locator disappeared over the right controls.

**Method.** Inspect `20260728-2322-29.7912188.mp4`, then replace the earlier
oversized direct puddle with a real `StrokeEngine` round-brush footprint on Cold
Press. First tilt immediately to distinguish a broken wet/dry face from premature
uptake. Then hold the sheet level for 300 animation steps (about five seconds at
60 Hz), tilt halfway for 120 steps, and measure surface-film amount, centre, and
frontier. Replay the exact same footprint twice with the adaptive relaxation
controller held at the same starting state. Finally, repeat 300-step flat uptake
twice on all three paper rows. Track the pen locator from window-level pointer
events and dispatch a pen-hover event over the drying slider.

**Raw result.**

- The 61.6333-second, 1920×1080 recording shows the wash extending along its
  already-wet route while retaining a conspicuously crisp dry-facing boundary.
- With the old `[UNVERIFIED]` `absorptionCoupling = 0.01`, an ordinary fresh
  brush stroke did cross when tilt was applied immediately: its downhill
  frontier advanced 12 cells in 20 steps. But its movable surface film collapsed
  from `75.1511120 / 75.1843062` to `5.5423388 / 6.8258980` in those same 20
  steps. In a pre-wet-strip reproduction, only `0.0245425` surface water remained
  after 120 level steps. The dry face was not a mathematical wall; the painter
  was reaching the tilt control after almost all gravity-responsive water had
  already been absorbed.
- The shared watercolor row is now `[UNVERIFIED]`
  `absorptionCoupling = 0.0001`. No shader branch or paper-specific exception was
  added. In two exact-replay Cold Press runs, the initial film was
  `88.4987082`. After 300 level steps it was `26.8221289`; after 120 half-tilt
  steps it was `12.5889855`. Both runs advanced the downhill frontier exactly
  `5` cells and shifted the surface-water centre exactly `2.4536093` cells.
  Final water was `90.4068575`, pigment `90.4068985`, and capillary alarm `0`
  in both runs.
- The three paper rows retained their ordering after 300 steps; every row was
  reproduced exactly on its second run:

| paper | surface film | absorbed water | total water |
|---|---:|---:|---:|
| Hot Press | `70.0852280` | `20.4498272` | `90.5350552` |
| Cold Press | `26.8221283` | `63.5847244` | `90.4068527` |
| Rough | `1.5584794` | `87.3790512` | `88.9375306` |

- `npm.cmd run build` passed. The live page ran on
  `webgpu: amd / gcn-4` with no page, shader, or WebGPU error.
- A synthetic pen hover over the right-side drying slider placed the locator at
  `824.094px / 589.344px`; after its short fade it had computed opacity `1` and
  z-index `30`. The headed screenshot shows the ring-and-cross above the slider.

**What it proves.** The apparent wall in this recording was dominated by uptake
timing, not a failure of the already-installed cubic wet/dry face mobility. An
ordinary fully wet stroke now retains movable surface water long enough for a
painter to tilt the sheet, crosses dry paper under gravity, conserves paint, and
still responds differently to Hot Press, Cold Press, and Rough through shared
paper and medium rows. The pen locator no longer uses the canvas edge as its
visibility boundary.

**What it does NOT prove.** `0.0001` is not a measured material constant; it is an
artist-facing provisional calibration and remains `[UNVERIFIED]` until compared
with the real-paper reference plates. These measurements do not say that the
visible crossing speed or final bloom shape is ideal. A synthetic pen event also
cannot certify a particular tablet driver's hover stream; Bartford's physical
tablet remains the final cursor test.

## E6 — Paint load and added water now produce distinct washes (2026-07-29)

**Purpose.** Diagnose Bartford's recording in which strokes made with different
water-slider values looked and travelled alike, including while the sheet was
tilted.

**Method.** Inspect `20260729-0043-57.8200406.mp4`. Trace the UI through
`StrokeEngine.charge()` and `Reservoir.charge()`. At fixed Round Sable, load
`0.6`, pressure `0.75`, Cold Press, Dioxazine Purple, full downhill tilt, and
normal drying `0.0015`, measure brush output and GPU pigment travel at water
`0`, `0.25`, `0.5`, `0.75`, and `1`. Hold the adaptive controller at the same
starting state and replay every accepted GPU comparison twice. Render the five
revised strokes together for a headed visual check.

**Raw result.**

- The 25.1947-second, 1920×1080 clip shows two groups of similar purple strokes.
  In the saved tilted portion, changing the water slider does not create a clear
  progression in the visible downhill shapes.
- The old relationship was
  `water = load + (1 - load) × waterCharge`, while pigment ignored load and
  always filled its entire nominal capacity. At load `0.6`, the five laid
  water/pigment ratios were only `0.6, 0.7, 0.8, 0.9, 1.0`. In two exact GPU
  runs, minimum-to-maximum water changed the pigment centre shift only
  `2.9719165 → 3.9865746` cells after 120 full-tilt steps. The numerical frontier
  changed `24 → 42` cells, but most of that was a faint trace; the dense visible
  stroke remained nearly the same.
- `load` now scales the normal paint charge—both its pigment and base water.
  Added water is independent and does not remove pigment. A brush-row
  `waterOvercharge` value describes exterior water carried around a flooded
  tuft; both current sable rows provisionally use `[UNVERIFIED] 3.0` nominal
  capacities at maximum water.
- At load `0.6`, the revised laid pigment remained `35.1366568` at all five
  water settings, while laid water was:

| water control | laid water | water / pigment |
|---:|---:|---:|
| `0` | `35.1366568` | `1.0000000` |
| `0.25` | `79.0574781` | `2.2500000` |
| `0.5` | `122.9782967` | `3.4999999` |
| `0.75` | `166.8991171` | `4.7499999` |
| `1` | `210.8199363` | `5.9999999` |

  The brush-output comparison reproduced to every printed digit on its second
  run.
- Two exact live GPU replays produced:

| water | initial surface film | film after 120 tilt steps | pigment frontier advance | pigment-centre shift |
|---:|---:|---:|---:|---:|
| `0` | `51.2351007` | `0` | `24` | `2.9719165` |
| `0.25` | `118.1941295` | `0` | `46` | `4.3552279` |
| `0.5` | `185.5099982` | `0.8553973` | `48` | `4.8328096` |
| `0.75` | `252.8292321` | `12.0636514` | `50` | `5.0614560` |
| `1` | `320.1490995` | `38.2750767` | `50` | `5.1754824` |

  Every capillary alarm was `0`.
- The headed five-stroke render shows increasingly broad and persistent downhill
  fringes from ordinary paint to the flooded maximum. The maximum remains visibly
  wet after the lower settings have soaked/dried.
- Load `0.2 / 0.6 / 1` now gives matching normal water and pigment totals
  `54.6215389 / 163.8646183 / 273.1076927`. Rinse still returns pigment `0`
  with water `273.1076927`.
- `npm.cmd run build` passed. Chrome ran the final source on
  `webgpu: amd / gcn-4` with no page, shader, or WebGPU error.

**What it proves.** The report was real: the old controls compressed the useful
water range and made load semantically ineffective for pigment. Load and water
are now independent shared brush quantities. Zero water is an ordinary paint
charge; maximum water is a deliberately flooded brush that stays wetter and
develops a broader downhill wash, without erasing its pigment. The range is a
brush data property rather than a watercolor-only engine branch.

**What it does NOT prove.** `waterOvercharge = 3.0` is not a measured sable
constant and remains `[UNVERIFIED]`. The upper three settings approach the
solver's maximum downhill pigment-front speed; their largest difference is
retained water and fringe breadth rather than proportionally greater travel.
Bartford's hand test decides whether the five visible steps are sufficiently
distinct and whether the maximum carries too much or too little water.
