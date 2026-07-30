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

## E7 — Shared wet-layer resistance, gravity response, and drying optics (2026-07-29)

**Purpose.** Correct Bartford's report that a new wet stroke glides down an
existing wet wash at essentially the same speed as it does over dry paper, that
maximum tilt makes every film fall too quickly, and that drying does not visibly
lighten watercolor or leave a concentrated rim.

**Method.** Review the reported `0:36–0:52` passage, trace the medium row through
`UpdateVelocities`, `FlowOutward`, `DryTick`, and `Composite`, and keep every new
control in the shared wet-medium property surface. Use one repeatable direct
ultramarine stroke on Cold Press, with a pure-water underlayer for the wet case.
Measure pigment centre, breadth, frontier, film, water, pigment, rendered centre
RGB, rim/interior concentration, and the post-capillary alarm. Pause the normal
animation and replay every accepted comparison twice on AMD/Polaris.

**Raw result.**

- Before the correction, a 120-step full-tilt stroke shifted `7.8499 / 8.0092`
  cells over dry paper and `7.9063 / 7.9129` cells when its lower end overlapped
  a pre-wet wash. The underlying wetness was effectively invisible to motion.
- The first proposed row (`gravityResponse = 0.12`,
  `wetLayerDrag = 0.18`) was rejected. In the corrected full-overlap instrument,
  the extra depth still dominated: dry-underlayer travel was
  `7.2979 / 7.3703`, while wet-underlayer travel increased to
  `8.8792 / 8.9256`.
- The accepted shared relationship uses the local combined wet load
  `(absorbed + surface water) / paper capacity` to add resistance. The
  provisional watercolor row is now `[UNVERIFIED]`:
  `drag = 0.06`, `gravityResponse = 0.03`, `wetLayerDrag = 0.55`, and
  `edgeDarkening = 0.045`. The same shader and properties are available to
  every future wet-medium row.
- Final level and full-tilt comparisons were:

| underlayer | board | pigment-centre shift | breadth increase | frontier advance |
|---|---:|---:|---:|---:|
| dry | level | `-0.0480 / -0.0693` | `0.2211 / 0.2259` | `3 / 4` |
| dry | full tilt | `1.34366 / 1.34373` | `0.46312 / 0.46328` | `9 / 9` |
| pre-wet | level | `-0.0864 / -0.0879` | `0.3205 / 0.3192` | `5 / 5` |
| pre-wet | full tilt | `0.94975 / 0.94906` | `0.48904 / 0.48793` | `10 / 10` |

  The wet underlayer therefore reduced coherent downhill centre travel by about
  `29%` while slightly increasing broadening. Every alarm was `0`.
- A flooded direct stroke still crossed farther into dry paper. At deposited
  water `0.5`, the frontier advanced `9 / 9` cells and the centre shifted
  `1.34570 / 1.34519`; at water `2.0`, the frontier advanced `13 / 13` cells.
  The flooded centre shift was only `0.50567 / 0.50866` because the pigment
  dispersed across a broader retained film instead of riding one fast tongue.
- `valueShift`, already present in the shared medium contract but previously
  unwired, now controls a wetness-dependent optical value response without
  changing pigment amount. Two identical normal-drying spots rendered centre
  RGB `128,166,203` wet and `150,189,226` dry: luminance
  `165.6667 → 188.3333`, a `13.6821%` lightening within Card 9's `10–30%`
  target. Water reached `0`; pigment remained `63.65414`; alarms were `0`.
- The drying spot's rim/interior pigment ratio rose from
  `0.33463 → 0.39195` in both runs. Correcting `FlowOutward` to use the actual
  surface-film edge rather than the much broader absorbed-water scheduling mask
  is physically necessary, but the isolated row contribution remained small:
  drying with `edgeDarkening = 0` ended at `0.39173 / 0.39157`, versus
  `0.39195 / 0.39195` at `0.045`.
- The conservative flux equation was not changed. Ordinary no-evaporation water
  drift was `+1.40e-7` in both repeated tilted runs. Direct pigment sums still
  varied by `-0.039% / -0.071%` over 120 steps; running the same level scene
  with the old movement values was worse at `-0.108% / -0.145%`.
  High-water and pre-wet comparisons also had intermittent sub-`0.11%` gauge
  variation with alarm `0`. This small AMD/Polaris numerical variability is
  recorded, not treated as exact conservation or as closure of the postponed
  hardware fault.
- `npm.cmd run build` passed. Chrome compiled and ran all changed shaders on
  `webgpu: amd / gcn-4`; the page and WebGPU error logs were empty.

**What it proves.** Gravity is now one shared board field with a per-medium
response, and drag is a shared material response that includes the wet state
already held by the substrate. A pre-wet layer measurably brakes coherent travel
and broadens the wash, maximum tilt is much slower, and a genuinely flooded
stroke still crosses a dry boundary. The existing universal `valueShift`
property now produces a visible, pigment-conserving wet-to-dry change, and a
drying spot leaves more pigment at its rim than it began with. No
watercolor-only motion or render branch was added.

**What it does NOT prove.** The four watercolor row values are not measured
material constants and remain `[UNVERIFIED]`; Bartford's hand decides their final
feel. The numerical rim is not yet proof of a beautiful coffee ring or
cauliflower bloom, and the isolated `edgeDarkening` contribution is small in
this test. The sub-`0.11%` AMD/Polaris variability means this entry does not claim
exact conservation or close the postponed NVIDIA discriminator.

## E8 — Rejected strong-rim experiment (2026-07-29)

**Purpose.** Test whether substantially stronger shared edge transport could make
coffee-stain rims artist-visible while reducing the blocky appearance of the
simulation grid.

**Method.** Raise the provisional watercolor `edgeDarkening` row from `0.045` to
`20`, replace the binary surface-film edge mask with a continuous film response,
and replace the square 9-by-9 neighbourhood with radial weighting. Build, run the
changed shader live on AMD/Polaris, and then judge real brush marks on Cold Press.

**Raw result.** The numerical and live checks completed, but the artist-visible
result failed decisively. Bartford's screenshot showed dense blue stippling,
needle-like projections, repeated cell bands, and false contour lines throughout
ordinary strokes. Bartford rejected the pass: “Hard do no on that pass. It looks
terrible now.” Commit `9f5d1e8` was therefore reverted in full by `7d5ff35`,
restoring the E7 source values and equations.

**What it proves.** ~~The E8 edge treatment is a viable way to strengthen drying
rims.~~ **RETRACTED at E8 because the stronger transport amplified the simulation
grid into visibly artificial paint structure.** The earlier explanation that the
pixelation was only the current working resolution was incomplete: resolution
made the cells available to see, but this experiment made them dominate the mark.
Do not repeat this high edge-pressure route.

**What it does NOT prove.** It does not reject E7's accepted water amount,
wet-layer resistance, slower gravity response, or drying lightness; those are
restored unchanged. It also does not prove that stronger coffee rings are
impossible. A future attempt needs a different, smoother pigment-migration model
and must be judged first on ordinary hand-painted strokes, not synthetic spot
numbers alone.

## E9 — Rim formation, redesigned as pigment migration (DESIGN, 2026-07-29)

**Hardware note.** Claude (Opus), Windows 11, `webgpu: amd / gcn-4` — the same
Polaris part Codex used, so E7's numbers and these are comparable.

**Purpose.** Make the coffee-stain rim artist-visible without the mechanism that
made E8 look synthetic. This entry is the design and its acceptance instrument,
written before any shader code exists, so that an interrupted session leaves the
reasoning rather than a half-edited pass.

### Why E8 failed — the mechanism, not the magnitude

Card 5's physics is right and is not in question: an evaporating drop with a pinned
contact line loses liquid fastest at the boundary, the interior replenishes it, and
that inward-to-outward flow **carries pigment** to the edge, where it strands.

C97 implements this by lowering *water pressure* near the mask edge
(`p <- p - eta(1 - M')M`), which is what `flow_outward.wgsl` does today. Pigment
then reaches the rim only as a passenger of the water it advects with. That
coupling is the flaw:

> **Rim strength and water-motion strength are the same dial.** You cannot make the
> ring stronger without making the water move faster.

At E7's `edgeDarkening = 0.045` the water motion is calm and the ring is real but
faint (rim/interior concentration `0.3346 -> 0.3920`). At E8's `20` the ring
arrives and the water field is being driven hard at cell scale — and a 512 grid
driven hard at cell scale *is* dense stippling, needles and false contours.
E8's radial reweighting did not save it, because the amplification was in the
velocity coupling, not in the kernel shape.

**Therefore: do not scale the water route. Split the dial in two.**

### The design

Keep C97's pressure term exactly as E7 accepted it — carded, measured, and
artist-approved at `0.045`. **Add** a second, independent term for the same
physical cause that moves suspended pigment *directly*, so rim strength no longer
borrows from water speed.

New pass `rim_migration.wgsl`, inserted **after `outward` and before
`fluxCompute`** — the drying drift and the bulk advection both act on suspension
within a frame, and settling (`transfer`) happens after both. It reads `wet0`
(film), `press` (see below), `wet1`/`wet2` (suspended pigment) and writes
`wet1`/`wet2` — two storage textures, inside WebGPU core's limit of four.

**1. A deliberately smooth direction field.** `flow_outward.wgsl` already sweeps a
9x9 neighbourhood of the film. Extend that same loop to also accumulate a
Gaussian-weighted mean film height `hbar` and emit it in the unused `press.y`
channel. Cost is a few extra ALU ops in a loop already being run; no new pass, no
new texture.

`hbar` is smooth at the scale of its kernel *by construction*, so its gradient
cannot carry cell-scale structure. That is the whole defence against E8's failure
mode, and it is structural rather than a matter of choosing a small number.

**2. Conservative, antisymmetric transfer.** For each of the four edge neighbours
`q` of cell `c`, pigment in slot `k` moves down the `hbar` gradient:

```
out(a->b, k) = rimMigration * dryingDrive * conc_k(a)
               * max(hbar(a) - hbar(b), 0) * holds(b) * limit(a)

g_k(c) <- g_k(c) - sum_q out(c->q, k) + sum_q out(q->c, k)
```

Both cells sharing an edge evaluate the *same expression* for that edge, so the
ledger balances exactly — the trick `flux_apply_pigment.wgsl` already relies on.
No flux buffer is needed.

- `conc_k(a)` — concentration, not amount, so a thick puddle does not migrate
  faster merely for being thick.
- `holds(b)` — the destination must actually have film. Without this, pigment
  walks out of the water and strands on dry paper.
- `limit(a)` — caps the total fraction leaving any cell per step (proposed
  `0.25`). It depends only on `a`'s own four neighbours, so the neighbour can
  recompute it identically and conservation survives the clamp.
- `dryingDrive` — the existing `clamp(evapRate / dryRate, 0, 1)` normalisation
  from `flow_outward.wgsl`, reused unchanged. A wash that is not drying gets no
  ring, which is the physics and not a safety measure.

**Why this cannot manufacture a spike.** It is a *transfer*, never a source. A
cell can only lose what it has, bounded by `limit`, and every loss is some other
cell's gain. Amplification is arithmetically unavailable to it — unlike a pressure
bias, which feeds a velocity field that then multiplies.

### What this adds to the medium row — and why it is not a watercolour branch

Per `src/media/types.ts`, a medium is a data row plugged into shared equations.
Two new `WetMedium` properties, both `[UNVERIFIED]`:

| row | meaning | why it differs per medium |
|---|---|---|
| `rimMigration` | how strongly suspended pigment drifts toward a receding film edge | Particle mobility in the vehicle. Watercolour rings famously; gouache's binder load holds pigment where it lands; oil does not dry by evaporation at all and should be `0`. |
| `rimReach` | Gaussian sigma in cells for the film blur — the width of the rim's catchment | A ring's width tracks the ratio of evaporation to internal transport. Fine transparent washes strand a narrow line; heavier bodied paint leaves a broad soft shoulder. |

`rimReach` is a **weight** inside the existing fixed +/-4 window, not the window
itself, so per-medium cost stays constant and the kernel already in
`flow_outward.wgsl` is reused rather than widened.

Setting `rimMigration = 0` restores today's E7 behaviour exactly. That is the
regression path and also the correct oil row.

**Fence status.** The *physics* is Card 5 / C97 / Deegan and is cited there. The
*route* — a direct pigment term instead of only C97's pressure term — is not on any
card and is offered as a recorded decision with the reason above, for Bartford to
ratify or reject. It does not replace C97's term; it runs alongside it.

### Acceptance instrument — built and baselined BEFORE the change

E8 passed its own numeric test and still looked terrible, because the test measured
the rim and nothing measured the artifact. So the artifact now has a number too.

`roughness` — over cells holding more than a quarter of the mean slot-0 pigment,
the mean absolute discrete Laplacian of total slot-0 pigment (`wet1 + wet3 +
dry1a + dry2a`, channel `.x`), divided by the mean. High = cell-scale structure,
which is what stippling is. `peakLapOverMean` is the same quantity's worst cell.

**Baseline, restored E7 base, four horizontal strokes, load 0.75, water 0, Cold
Press, 120 settle steps, dried out:**

| run | pigment | roughness | peakLapOverMean |
|---|---|---|---|
| first session after page load | 635.520 | 0.5234 | 4.850 |
| second | 633.541 | 0.5250 | 4.861 |
| third (identical repeat) | 633.541 | 0.5250 | 4.861 |

Runs two and three are **bit-identical**, so this instrument is deterministic on
this GPU and a change of even the fourth digit is a real change. The first session
after a page load differs by `0.3%`; use second-and-later sessions as the
reference. Why the first differs is **not known** and is not worth a story.

**Acceptance for the eventual E9 measurement, in this order:**

1. Ordinary brush strokes and flooded washes at actual display scale, judged by
   Bartford. This is first, not last.
2. `roughness` must not rise materially above `0.5250`. A rim that arrives with a
   roughness of `2` is E8 again with better paperwork.
3. Rim/interior concentration ratio should exceed E7's `0.3920`, measured on the
   same synthetic drying spot E7 used — **supporting evidence only.**
4. Pigment conservation across the pass within the sub-`0.11%` AMD/Polaris band
   already recorded at E7, and `rimMigration = 0` reproducing the E7 baseline to
   all digits.

**What this design does NOT claim.** That a smooth `hbar` gradient produces a rim
that *reads as paint* — smooth and conservative rules out E8's failure, it does not
guarantee beauty. That the two new row values are physical constants; they are
not, and no card supplies them. That the roughness metric captures every ugly
outcome — it catches cell-scale noise, and would not catch a rim that is smooth
but too wide or wrongly coloured. Bartford's eye remains the acceptance test;
this is only a tripwire on the specific way E8 went wrong.

## E10 — E9 measured: conserves, ships inert, NOT good enough to turn on (2026-07-29)

**Hardware.** Claude (Opus), Windows 11, `webgpu: amd / gcn-4`.

**Purpose.** Measure the E9 rim-migration pass against its own acceptance list.

**Method.** Implemented as designed in E9 (files listed in the baton). Swept
`rimMigration` over `0, 0.003, 0.03, 0.3, 3, 30` at `rimReach = 2`, on two test
objects: the four-stroke session from E9, and a flooded puddle. Every reading has
a WebGPU validation scope around it. Repeated runs throughout.

### Raw result — what is solid

**Conservation is exact.** Across the whole sweep, total pigment held at
`1239.16` on the ring object and `633.5414` on the strokes, varying in the sixth
significant figure. The antisymmetric edge ledger works; the limiter does not leak.

**Inert by default, verified.** Six consecutive `rimMigration = 0` sessions are
**bit-identical** to the pre-E9 baseline: pigment `633.541443`, roughness
`0.5249959`, peakLap `4.861012`. Turning the row to zero is a true regression
path, not approximately one.

**No validation errors** anywhere, and no shader compile error, once a real bug
was fixed: the params uniform buffer was allocated at a fixed `208` bytes and the
two new rows pushed the write to `224`. Chrome rejected the write and every
parameter silently stopped updating — all gauges read `0`. The buffer size, the
`ArrayBuffer` in `writeParams`, and the struct in `common.wgsl` are now
commented as three places that must agree.

### Raw result — the correction that mattered

The first implementation divided a smooth numerator by the **raw** per-cell film
height. ~~The direction field being a blur makes cell-scale amplification
arithmetically unavailable.~~ **RETRACTED at E10:** the *direction* was smooth
and the *magnitude* was not, because `1/h_f` is a per-cell quantity sitting in
the middle of the transfer fraction. Measured effect of moving the denominator to
the blurred film, four-stroke object:

| `rimMigration` | roughness, raw denominator | roughness, blurred denominator |
|---|---|---|
| 0 | 0.4776 | 0.4774 |
| 0.03 | 0.6135 | 0.5028 |
| 0.3 | 1.2198 | 0.9748 |
| 3 | 2.6666 | 2.7045 |

Reproduced identically. It is a real improvement at low strength and no help at
high strength. **The lesson generalises beyond this pass: every factor in a
transfer fraction has to come from the smooth field, not just the gradient.**

### Raw result — where the added structure actually lives

The single roughness number cannot tell a rim from stipple, which E9 admitted and
then immediately needed. Split it: `interior` = mask cells whose whole 5x5
neighbourhood is in the mask; `edgeBand` = the rest of the mask.

Four strokes, blurred denominator, reproduced identically:

| `rimMigration` | interior rough | edgeBand rough | interior cells |
|---|---|---|---|
| 0 | 0.3476 | 0.5923 | 2123 |
| 0.03 | 0.3435 | 0.6314 | 2208 |
| 0.3 | 0.4516 | 1.2467 | 2597 |
| 3 | 0.6754 | 2.2214 | 336 |

On **strokes**, `0.3` puts its new structure in the edge band: `+110%` there
against `+30%` in the interior. That is a rim, and the rendered strokes read as
darker-edged marks rather than as noise.

On a **flooded puddle** (filled pool object, corrected — see instrument errors
below), the same setting does the opposite. Alternating runs, each value repeated:

| `rimMigration` | pigment | rim/interior | interior rough | edgeBand rough |
|---|---|---|---|---|
| 0 | 7370.14 | 0.19151 | 0.5168 | 0.2763 |
| 0.3 | 7369.62 | 0.20680 | 1.9672 | 1.6292 |
| 0 (repeat) | 7369.28 | 0.19170 | 0.5211 | 0.2857 |
| 0.3 (repeat) | 7368.63 | 0.20629 | 1.9689 | 1.5683 |

Interior roughness rises **3.8x** and edge roughness **5.7x**, for a rim ratio
gain of `0.1915 -> 0.2065` — an 8% rim improvement bought with a near-4x rise in
cell-scale structure through the entire body of the wash. Note also that on this
object the baseline has *more* interior structure than edge structure
(`0.517` vs `0.276`), the reverse of the stroke object, so the two test objects
are not interchangeable and their numbers must not be compared across.

Interior structure now **exceeds** edge structure, and the rendered wash carries a
dense concentric texture across its whole body. It looks synthetic. Radial profile
went from monotone falling (`0.405` centre to `0.027` rim) to humped
(`0.339, 0.294, 0.306, 0.339, 0.345, 0.371, 0.333, ...`) — pigment did move
outward, but as a broad interior redistribution, not a stranded ring.

### Instrument errors found and fixed in this entry

Two, both mine, both caught by looking at the render rather than the number:

1. **The first "puddle" was not a puddle.** Its 45 concentric rings were spaced
   ~13 px apart, wider than the brush footprint, so it painted a bullseye of
   separate rings. Every rim ratio measured on it — the `0.2147 -> 0.2350` series
   in the sweep above — was measuring **ring spacing**, not a rim, and is
   **retracted**. Ring spacing is now ~2 px and the object is a filled pool.
2. **One premature interpretation, stated out loud and wrong.** On seeing
   roughness rise across the sweep I called the trade-off bad before splitting
   interior from edge. On strokes it is not bad. The number rose for two different
   reasons and I read only one of them.

The residual concentric texture in the puddle result is **partly confounded**: the
test object is painted as concentric rings, so a term that amplifies existing
deposition structure would produce concentric artifacts on this object
specifically. That confound is not resolved here and the visual verdict on washes
should be treated as suggestive, not settled.

**What it proves.** The pass is arithmetically sound: conservative to six figures,
inert at zero to all digits, no validation errors, and the params-buffer arithmetic
is now correct. The gradient-of-blurred-film route does move pigment outward, and
on brush strokes it produces edge-localised darkening.

**What it does NOT prove — and why this is not shipped ON.** It does not produce a
coffee ring on a wash. The direction field is the gradient of a blur with a
fixed +/-4 window, so it has support only in a band a few cells wide around the
film edge; it physically cannot carry pigment from the middle of a puddle to its
rim, which is the entire Deegan mechanism. What reaches the edge at high strength
arrives by repeated short hops, and the hops leave their own texture. The wash
verdict is also confounded as noted. `rimMigration` stays `0` in
`src/media/library.ts`; nothing about the paint Bartford sees has changed.

**Recommended next route (not yet ratified).** Stop building a second pigment
transport path and drive the ring from **non-uniform evaporation**, which is what
Deegan actually describes: weight the evaporation in `dry_tick.wgsl` toward the
film edge using the same blurred film already in `press.y`. The pool then thins at
its rim, the existing *validated* conservative flux carries water inward-to-outward
to replenish it, and `flux_apply_pigment.wgsl` carries pigment along for free. No
new transport term, no second ledger, and the driving quantity is a thickness
gradient rather than a velocity injection. It adds one shared row —
`edgeEvaporation`, `0` for oil, low for bodied paint, high for watercolour — and
the rim strength stops borrowing from water speed without needing a bespoke
mechanism to do it.

## E11 — Edge-weighted evaporation: clean, real, ring in the wrong place (2026-07-29)

**Hardware.** Claude (Opus), Windows 11, `webgpu: amd / gcn-4`. Bartford
authorized this route after reading E10.

**Purpose.** Produce the coffee ring from its actual cause — faster evaporation
at a film's pinned edge — instead of adding a third way to push paint about.

**Method.** Verified by code reading first that the existing engine will do the
transport: `update_velocities.wgsl` accelerates water by
`-(h_neighbour - h_here)`, so a thinner rim really does drive outward flow, and
`flux_apply_pigment.wgsl` carries pigment on the resulting flux through the
ledger validated since the bench. So the only change is *where* water leaves.

`flow_outward.wgsl` now also emits its blurred wet mask in `press.z`.
`dry_tick.wgsl` reads it and scales evaporation by
`1 + edgeEvaporation * (1 - m_blur)` — 1 deep inside a puddle, higher toward the
contact line. One new `WetMedium` row, `edgeEvaporation`, `[UNVERIFIED]`,
default `0`. **No new pass, no new transport term, no second ledger.**

Test object: the corrected filled pool (45 overlapping rings, radius 90 px,
flooded brush, 1500 settle steps, Cold Press). Radial profile in 12 bins from
centre to the 99th-percentile radius. Interior/edgeBand roughness split from E10.
Every run inside a WebGPU validation scope.

### Raw result

`edgeEvaporation = 0` reproduces the pre-E11 four-stroke baseline **to all
digits** over repeated sessions: pigment `633.541443`, interior roughness
`0.347627`, edgeBand `0.592322`. The extra texture binding and the multiply by
`1.0` change nothing.

Pool, fresh page load, each value run twice:

| `edgeEvaporation` | pigment | water | wet cells | interior rough | edgeBand rough |
|---|---|---|---|---|---|
| 0 | 7370.11 / 7370.98 | 0 | 0 | 0.5196 / 0.5185 | 0.2705 / 0.2672 |
| 3 | 7370.41 / 7369.58 | 0 | 0 | 0.5301 / 0.5291 | 0.2587 / 0.2588 |
| 10 | 7370.62 / 7370.72 | 0 | 0 | 0.5407 / 0.5407 | 0.2446 / 0.2385 |

Radial profile, centre to rim, second run of each:

| | b0 | b1 | b2 | b3 | b4 | b5 | b6 | b7 | b8 |
|---|---|---|---|---|---|---|---|---|---|
| `0` | .4053 | .3588 | .3584 | .3623 | .3530 | .3574 | .3191 | .2889 | .2502 |
| `3` | .4054 | .3570 | .3669 | .3731 | **.3828** | .3689 | .3177 | .2806 | .2431 |
| `10` | .4003 | .3772 | **.4163** | **.4173** | .4030 | .3366 | .3017 | .2789 | .2403 |

Profiles reproduce to four or five significant figures between runs. No
validation errors at any setting.

**What it proves.** The mechanism works and it is clean. A ring forms — the flat
profile develops a genuine hump — and it forms **without the artifact that killed
both previous attempts**: interior roughness rises `0.5196 -> 0.5407`, about
`4%`, against E9's `0.52 -> 1.97`. Edge-band roughness actually *falls*. Pigment
is conserved to five figures and the sheet dries to exactly zero water. The
rendered wash reads as paint at display scale, not as fabric or stipple. Setting
the row to `0` is a true regression path.

Two failed routes pushed paint and both put the grid into the mark; this one
changes only where water leaves and lets the existing physics move the paint, and
the grid does not appear. That is the result worth keeping from today.

**What it does NOT prove — the ring is in the wrong place.** The hump sits at
roughly `25-35%` of the radius, not at the outer edge where a coffee ring
belongs, and the outermost bins are unchanged (`.125 / .059 / .028` at every
setting). The rim/interior ratio therefore *falls* rather than rises. **Why the
ring lands there is not established and no mechanism is offered here.**

The obvious suspicion, recorded as a suspicion and nothing more: Deegan's ring
requires a **pinned** contact line, and nothing in this engine pins one. As the
wash dries, its wet region shrinks, so the edge that drying tracks moves inward
and the enhanced-evaporation band follows it. `[UNVERIFIED]` — the cheap test is
to log the wet-region radius over time in a single drying run and see whether the
band's position tracks it. Do that before building anything.

**Instrument note — a scare that was not real, and a new rule.** Mid-session the
pool began finishing with 68-148 units of water left instead of 0, and water
*rose* with longer settling. That looked like this change breaking conservation.
It is not: it appears at `edgeEvaporation = 0` as well, only after many sessions
have run in one page, always with `wetCells = 1`, and it vanishes on a fresh page
load. It is consistent with the already-documented single-cell fault in
`docs/12`, and is **not** attributed further here.

**Rule for anyone measuring this engine: reload the page before a measurement
session.** Long-lived pages accumulate the fault and it silently poisons water
totals. Every number in this entry comes from a freshly loaded page.

**Also not proven.** That `edgeEvaporation` belongs at any particular value —
it ships at `0` and Bartford has not yet judged it by hand. That a correctly
placed ring will still be artifact-free; the pinning change is untested. That
this closes anything about drying *time*, which nobody has measured against real
paper.
