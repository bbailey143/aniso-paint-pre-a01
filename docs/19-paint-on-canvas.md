# 19 — Making the paint sit ON the canvas, not float above it

**Opened 2026-08-28 by Claude (Fable 5), on `tuft-fill`.** Written at the
artist's instruction, with his screenshot of a blue/yellow crossing: *"Document
any suggestions for how to make the paint look more like it's on the canvas.
The shadow is making it look like it floats."* Nothing here is built.
Everything is either read from `composite.wgsl` as it ships (anchored) or
**[UNVERIFIED]** reasoning to be tested before it is trusted.

---

## 1. What the eye is reporting, in the screenshot's own terms

The strokes read as **stickers**: crisp, uniformly-outlined shapes hovering a
millimetre off the cloth. Three visual cues produce that reading, and the
current lighting produces all three:

1. **The shadow rings the whole mark.** A real ridge is dark on the side away
   from the lamp and lit on the side toward it — an outline that is dark all
   the way round is what a die-cut edge looks like.
2. **Nothing falls on the canvas.** All the darkening lives on the paint's own
   pixels. A real object pressed onto cloth throws its shade onto the CLOTH
   beside it; that spill is the single strongest "these two things touch" cue
   the eye has, and it is entirely absent.
3. **The paint is smoother than what it sits on.** Inside the stroke the weave's
   embossing is gone while the surrounding canvas is strongly textured. A
   smooth patch on rough cloth reads as a separate object lying on top; thin
   paint on real canvas DRAPES — the threads emboss through it until the paint
   is genuinely thick enough to bury them.

## 2. Why the lighting does each of those — anchors, no speculation

**The silhouette is the steepest slope in the picture.** Since E10 a stroke
carries ~0.26 of film, and at its boundary that falls to zero across a cell or
two. No interior brush ridge is remotely that steep, so the relief shading
(`paintGx/paintGy`, composite.wgsl:713–714) spends its whole range tracing the
outline. The 6-cell sampling span (`paintLightSpan`, :698) widens the traced
band without softening the cliff — the edge still dominates the gradient.
**Note the irony:** E10 made this WORSE by making the paint five times taller.
The floating look is partly the price of the body fix, which is why it shows
now and did not before.

**The deep shadow floor keys on slope, not on which slope.** `paintShare`
(:762) routes the 0.25 floor to any pixel whose tilt comes from paint — edge
cliffs first, since they are the steepest. Direction is left to `lambert`, and
with the lamp high (`lightDir` z = 0.78, :718) the away-side of a cliff goes
deep while the toward-side catches a rim of light — so the mark is RINGED, dark
one side, bright the other, everywhere on its perimeter. That ring is cue 1.

**Shade multiplies the paint only.** `shade` scales the pixel being drawn, and
a pixel just OUTSIDE the mark has no paint gradient — so shadow stops dead at
the silhouette. Cue 2 has no mechanism at all today: there is nothing in the
compositor that lets a ridge darken the sheet beside it.

**The weave is removed from under the paint too early, and by the wrong
quantity.** `seen` (:625) fades the paper's embossing by `hidesGround × (laid ×
thickScale + standingBody)` — an OPTICAL amount, pigment in the light path. But
whether threads still shape the SURFACE is a geometric question: film height
against tooth height (0.30). A one-pass stroke (~0.075 peak) optically covers
well at `hidesGround 2`, so `seen` kills the weave's shading — while
physically a film a quarter the height of the threads should still be draped
over every one of them. Cue 3 is this conflation.

## 3. Suggestions, in the order they should be tried

**(a) Measure the ring before touching it.** One probe: sample the composited
tone at N points around a stroke's perimeter and plot against angle to the
lamp azimuth. If the dark band is near-uniform rather than lobed toward the
away side, part of the ring is not lambert at all and the fix hunts elsewhere
first. Cheap, and it gives the "before" for everything below.

**(b) Let the weave emboss through the paint.** Fade the paper's shading
gradient by film-vs-tooth (`w0.y` against `P.toothAmp`) instead of by the
optical `seen`, or blend the two so colour-coverage and surface-burial are
separate questions. Thin and medium paint then carries the canvas texture
INSIDE the mark, matching its surroundings — cue 3 gone, and it is the
cheapest of the three fixes: a change of one fade term, watercolour untouched
at `paintRelief 0`. **[UNVERIFIED — the blend curve is a design choice; judge
against the screenshot.]**

**(c) Ground shadow: let the ridge shade the sheet it stands on.** In the
compositor, sample the film height a short step TOWARD the lamp
(screen-space, along `lightDir.xy`); if taller paint sits there, darken this
pixel by an amount falling off with distance. Costs a couple of taps, needs no
new buffer, and puts shade ON THE CANVAS on the away side of every ridge —
cue 2, the strongest grounding cue. It also softens the outline into something
attached to the ground plane. **[UNVERIFIED — step length and falloff are feel
numbers; sweep on the bench like `SURFACE_BLEED` was.]**

**(d) Stop the silhouette monopolising the shading range.** Compress extreme
slopes before lighting (e.g. shade from the gradient of a saturating function
of height rather than raw height), so a 0.26-to-0 cliff and a genuine interior
furrow stop differing thirtyfold. Interior brushwork then becomes visible
relative to the edge instead of being flattened by comparison — this is also
what §18's berm needs to look right when it arrives. Try only if the ring
survives (b) and (c). **[UNVERIFIED.]**

**(e) The lamp itself, last.** `lightDir` is fixed at elevation ~0.78 — a high
lamp gives short, tight shading, which is part of why the shadow reads as an
outline rather than as light falling across a surface. If (b)–(d) are not
enough, a slightly lower lamp for canvas grounds lengthens every cue at zero
per-pixel cost. Artist's call, at the easel.

## 4. What NOT to do

- **Do not soften the paint's edge in the SOLVER.** The film cliff is real —
  oil holds a sharp edge; that is `yieldStress` doing its job. This is a
  lighting problem, and it should be fixed where the light is.
- **Do not shrink `paintRelief` or raise the 0.25 shade floor to hide the
  ring.** Both would re-flatten the interior that E11 and the artist's
  0.82→0.45→0.0→0.25 sweep just won. The floor's history is in
  composite.wgsl:727; reopening it casually costs that work.

## 5. Order of attack, when building resumes

1. The perimeter probe in §3a — the instrument, before any dial.
2. Weave-through-paint (§3b) — cheapest, and likely half the float on its own.
3. The ground shadow (§3c) — the strongest cue, one screen-space term.
4. Slope compression (§3d) only if the ring survives 2 and 3.
5. The lamp (§3e) last, artist judging at the easel.

---

## 6. Artist review — first live pass (2026-08-28)

The first live pass produced useful rejection criteria:

- The ridge read as raised canvas rather than paint sitting flat with the
  canvas. The relief response is too strong for the surface treatment.
- Broad, smooth paint shapes read as a tube squeezed from a nozzle. The top of
  the paint should show brush-sculpted ridges and valleys, not a smooth rolling
  hill.
- A darkened area was visible where the canvas should have remained unaffected.
  Source inspection found that the first ground-shadow mask was inverted: it
  darkened covered paint instead of bare canvas beside the ridge. This is now
  corrected.
- Small dotted/cross-like marks near the strokes are still unexplained. Treat
  them as an open visual artefact investigation; do not assume they are paint
  texture or change the solver to hide them.
- The repeated fine weave was described as a “snakeskin” appearance. This is a
  later visual discussion item: determine whether it is the paper relief scale,
  the paint-light sampling, or a separate cursor/readout overlay before tuning
  it away.

The next review should judge the corrected shadow placement and the shorter,
weaker paint-light response together. If the mark still reads as a rounded
tube, inspect the stored body-height profile and brush footprint before adding
more lighting tricks.

### Directional snakeskin follow-up (2026-08-28)

**Artist report.** With the same Flat Hog, Oil, and Cotton Duck, vertical
strokes can look smooth and convincing while horizontal/broadside strokes form
a repeated chattered snakeskin. The solution must respect the interaction of
surface, brush, and medium rather than hiding the symptom in one box.

**Existing evidence recovered.** Handoff E12 already ran matched broadside and
edge-on strokes on Cotton Duck, Flat White, and watercolor paper. The ripple
followed the blade angle to travel and remained in nearly the same ratio on all
three grounds. This rules out the canvas weave as the root generator, though
the weave and relief lighting make the height pulses much easier to see.

**New brush measurement.** The first brush-bench result was stale and is
retracted. Rebuilt from current source, at pressure 0.75 the shared overlap
paints 53% of the Flat Hog footprint; the proposed hog overlap paints 60%.
Track-spacing variation remains 205% in both runs. That is a bounded 13% gain
in connected coverage without regularising the coarse tuft. Increasing the
hair count is not the lever because represented bundles correctly get thinner
as more are packed in. The first artist-test correction is therefore a Flat
Hog `bundleOverlap` row: coarse represented bundles overlap slightly more when
loaded, while their irregular roots, lengths, bends, and separate tracks
remain. Oil still decides that the resulting surface remains as body; Cotton
Duck still gates contact against its own tooth. Nothing is blurred after the
fact and no screen direction is special-cased.

**Artist test owed.** Repeat one edge-on and one broadside stroke at similar
pressure on Cotton Duck. Pass means the broadside stroke becomes a connected
paint film with irregular brush furrows rather than repeated scales, while the
edge-on stroke remains crisp and the canvas still breaks a genuinely light or
dry contact. If both strokes simply become smooth blocks, reduce the overlap;
do not add a directional blur.

### Reset hypothesis tested and retracted (2026-08-28)

The artist noticed the bars in both Flat Hog and Flat Sable and asked whether
the brush repeatedly resets upright instead of remaining pulled. The shared
spine solver does start every equilibrium solve from a laid-back rest seed, so
the hypothesis was plausible and deserved a direct contact test.

A new `brush-bench pulse` probe records contacting spine joints and paint laid
at every 0.9-cell solve, in both travel directions, for both flats. Run twice,
the Flat Sable held 10 contacting joints throughout and its laid-paint variation
was only 0.036–0.038. The Flat Hog did periodically fall from 10 to 5 contacts
in its broadside direction, but not in the other direction.

Continuing from the previous solved shape instead of the rest seed was tried.
It did nothing to either Sable reading and made the Hog contact drop more often
(roughly every 10 steps rather than every 20–23). **REVERTED.** Therefore the
Hog has a real contact-loss wrinkle, but brush reset is not the shared cause of
the visible bars across both flats.

The common fault must be sought after the CPU footprint: frame batching,
body-paint deposit/levelling, or relief rendering. Both brushes hand the engine
a smoothly changing amount while the picture shows discrete transverse bands.
Next instrument the stored film height before lighting, and compare band
spacing to frame boundaries. If the stored height is banded, inspect the
once-per-frame body levelling in `deposit.wgsl`; if height is smooth but the
image bands, return to `composite.wgsl`.

### E1 — the shared snakeskin is frame-stepped paint shoving (2026-08-28)

**Purpose.** Decide whether the transverse bars live in the actual Oil film or
are added later by relief lighting, then separate fresh-paint levelling from
the brush's shove.

**Method.** `src/bench/banding-bench.ts` lays the same Flat Sable, Oil, Cotton
Duck stroke from `(120,250)` to `(392,250)`, pressure 0.75, tilt 35 degrees,
azimuth 90 degrees, with 68 identical input reports four cells apart. The only
first-test change is frame grouping: one report per engine frame versus four
reports per frame. It reads `wet0.y` directly, sums film across the brush width,
removes only the slow load-depletion trend, and phase-averages the remaining
ridge/valley shape around known frame boundaries. A second A/B keeps the
four-report rhythm but sets Smear to zero; fresh-deposit levelling remains on.
Every condition was run twice on the live WebGPU page at
`http://127.0.0.1:5175/?banding=2`.

**Raw result.** Paired identical runs:

| submission | stored-body ripple | frame-locked ridge span |
|---|---:|---:|
| 1 report/frame, 4-cell frames, Smear 1 | 0.0236 / 0.0234 | 0.0513 / 0.0506 |
| 4 reports/frame, 16-cell frames, Smear 1 | 0.0484 / 0.0484 | 0.1992 / 0.1992 |
| 4 reports/frame, 16-cell frames, Smear 0 | 0.0177 / 0.0177 | 0.0568 / 0.0568 |

The four-report repeat differed by 0 at the reported precision. Disabling
Smear cut total short-scale body ripple 63% and the frame-locked ridge span
71%, while leaving the levelling path active.

**What it proves.** The common Flat Sable/Flat Hog snakeskin is not primarily a
brush reset and is not generated by Cotton Duck or by the compositor. The bars
already exist in stored paint height and their cadence follows frame grouping.
Most of the repeatable seam comes from the brush's frame-wide paint-shoving
term in `deposit.wgsl`, which is handed one travel vector and one shove for the
whole frame. Canvas relief and paint lighting reveal those ridges; they do not
create them. This is exactly the cross-system relationship the artist expected:
brush travel creates the contact, Oil lets the displaced film stand, and the
canvas/compositor makes that standing ridge visible.

**What it does NOT prove.** Smear should not simply be removed. A wet loaded
brush must still push and mix paint, and the artist already rejected a build in
which underlying blue stayed put. The remaining 0.0568 frame-phase span also
means levelling/deposit has a smaller residual or the phase instrument includes
ordinary bristle texture. The fix must make the shove depend on the brush's
resampled local travel rather than browser-frame packaging, then preserve the
same total movement and pickup ledger before artist review.

### E2 — Smear now follows resampled contact, not browser frames (2026-08-28)

**Purpose.** Remove the stored transverse ridge without weakening the brush's
ability to push, lift, and carry paint.

**Method.** First, the E1 four-report condition was split by passing
`brushTake = brushGrab = 0`, which leaves only the pressure shove. Its
frame-locked span was 0.1239 against 0.1992 for the complete shove and 0.0568
with Smear entirely off: both the pressure and laden-brush routes contributed.

The wet footprint was then extended with the local `dx/dy` and a monotonically
increasing id for every <=0.9-cell brush solve. `deposit.wgsl` gathers coverage,
pressure, and direction for each such solve separately. Their conservative
fractions are combined as `1 - product(1-q)` inside one GPU dispatch, so four
contacts bundled into one browser frame carry the same share as the same four
contacts submitted separately. The existing material yield/adhesion, tuft
grabbiness and room, Smear dial, paper gate, and matched pigment/film flux all
remain active. No direction is special-cased and no blur is applied.

**Raw result.** Paired identical Flat Sable/Oil/Cotton Duck runs after the fix:

| submission | stored-body ripple | frame-locked ridge span |
|---|---:|---:|
| 1 report/frame, Smear 1 | 0.0151 / 0.0149 | 0.0310 / 0.0307 |
| 4 reports/frame, Smear 1 | 0.0153 / 0.0153 | 0.0607 / 0.0607 |
| 4 reports/frame, pressure shove only | 0.0144 / 0.0144 | 0.0467 / 0.0467 |
| 4 reports/frame, Smear 0 | 0.0177 / 0.0177 | 0.0568 / 0.0568 |

The body-ripple result that doubled before the fix is now effectively the same
(`0.0151` versus `0.0153`). The remaining four-report phase span is at the
levelling-only floor rather than the old Smear seam (`0.0607` versus `0.0568`,
old complete-Smear value `0.1992`).

The live paired regression suite also passed: Oil crossing lift 30.1% / 30.1%,
blue trail 19.6 -> 11.8 -> 6.8 -> 4.2 -> 3.1%, stacked-body last/first gain
0.899 / 0.899, and brush holding 92.6% / 92.6%. The Watercolour control was
found to inherit the preceding brush/paper and to leave pickup asynchronous,
so its old absolute 32.9182 reference was not self-contained. It now fixes Flat
Hog/Cotton Duck explicitly, disables pickup for the conservation control, and
measures total-pigment drift: 47.2381 / 47.2381 initially and 0.000004 /
0.000004 drift after twenty shared-fluid frames. Build and fresh WebGPU load
passed with no browser errors.

**What it proves.** Smear strength and colour carry survive while the broadside
body pulse no longer follows browser timing. Brush, medium, and surface remain
coupled: the brush supplies local contact and pull; the medium decides what
gives way and stays raised; canvas controls contact and reveals the relief.

**What it does NOT prove.** The remaining contact texture is artist-approved,
or that Flat Hog and Flat Sable now feel right under a Pencil. The normal page
is left on Oil / Flat Hog / Cotton Duck for matched broadside and edge-on review.

### E3 — lighter-pressure clue exposes a stepped flat-brush ramp (2026-08-28)

**Purpose.** Follow the artist's report that lighter strokes show much less
snakeskin, and distinguish a heavy pen curve from the flat brush abruptly
changing how much of its blade is down.

**Method.** First, `tools/brush-bench.ts` was repaired to read the current
12-float wet-footprint stride (`SEG_FLOATS`); its old hard-coded 8-float stride
made it stale after E2. The current `ramp`, `drive`, and `pulse` probes were then
run twice for Flat Hog and Flat Sable. Source inspection separately confirmed
that the wet pen mapping is identity (`PEN_GAMMA = 1.0`).

The artist authorized trying the pressure lead. A brush-row
`pressureExponent` was added rather than changing the hardware-wide pen curve.
Both flat rows use 1.6 for this `[UNVERIFIED artist trial]`; Round Sable remains
linear. This maps input 0.75 to effective 0.631 while preserving 0 and 1. Oil's
body, pickup and shove rules and Cotton Duck's contact gate are unchanged.

**Raw result.** Before the trial, both flat ramps changed from 5/30 contacting
spine joints at input 0.50 to 10/30 at 0.65. At that same transition, Hog's
measured footprint width changed 29.81 -> 19.52 cells and Sable's changed
13.60 -> 7.49 cells: more pressure made the blade abruptly narrower, not
smoothly wider. Paired runs were identical at the reported precision.

The pulse probe also reproduced: Flat Sable held 10 contacts in both travel
directions (contact CV 0); Flat Hog horizontal held 10, while vertical briefly
dipped 10 -> 5 (CV 0.097). The occasional Hog dip therefore occurs in the
direction the artist reports as visually cleaner, so it cannot explain the
shared broadside snakeskin.

With exponent 1.6, Hog remains at 5 contacts through input 0.65 and reaches 10
at 0.80; its paired readings reproduced. Sable is more sensitive and still
reaches 10 at 0.65. `npm.cmd run build` passed. The live full regression suite
finished twice internally with paired values: Oil crossing lift 36% / 36%,
trail 15.8 -> 7.1 -> 4.0 -> 2.5 -> 1.9%, stacking 0.937 / 0.937, holding
92.6% / 92.6%, and Watercolour drift 0 / -0.000002 after twenty frames.

**What it proves.** The stylus curve is not secretly amplifying pressure. Both
flat brushes do have a coarse mid-pressure contact transition, and softening
the brush's own response moves that transition while preserving the existing
brush-medium-paper route. The brush reset is not the common cause.

**What it does NOT prove.** The pressure transition is the dominant visible
snakeskin, that exponent 1.6 is the right feel, or that moving the step is an
adequate final substitute for making contact continuous. The E2 numerical fix
was also real but visually rejected, so this remains an artist trial until a
matched Hog/Sable broadside comparison is judged on the live page.

### E4 — smooth brush marks become fish scales inside shared water motion (2026-08-29)

**Purpose.** Find the first stage that turns a steady Round Sable mouse stroke
into the same repeating edge scallop seen with both flat brushes, without
changing pressure, brush shape, paper, lighting, or paint settings.

**Method.** A temporary live WebGPU discriminator was added behind
`?fish-scale=1`. It uses Watercolour, Round Sable size 1, Flat White, fixed mouse
pressure 0.65, and the same horizontal resampled path for every condition.
Pickup is disabled so only laid paint is measured. The CPU footprint and GPU
passes are enabled cumulatively, then a second control lays one smooth deposit
with flow disabled and advances water motion for 1, 2, 4, 8, 16, or 32 empty
steps. A final eight-step split enables the raw velocity force, divergence
relaxation, and outward edge-pressure bias separately. Every condition is run
twice; the metric retains the complete two-dimensional cross-section and
measures the residual variation in the 90%-mass edge width.

**Raw result.** All paired runs reproduced exactly. The CPU footprint and GPU
deposit each had 0.00000 edge ripple. Deposit plus normal brush shove, velocity,
divergence relaxation, outward bias, the first flux ledger, and pigment flux
also remained 0.00000. Applying water flux was the first stored-paint change:
edge ripple became 0.04334 with a two-cell repeat. Pigment transfer did not
change it; capillary and drying altered its strength but did not remove it.

In the smooth-deposit/flow-only control, stored paint remained at 0.00000 after
1, 2, and 4 steps. The movement ledger developed 0.11942 edge ripple at step 4;
stored paint then reached 0.03317 at step 8 and 0.03370 at step 16. At exactly
eight steps, the force split measured:

| active water-motion parts | stored edge ripple | dominant repeat |
|---|---:|---:|
| velocity -> flux -> apply | 0.01977 | 2 cells |
| velocity + divergence relaxation -> flux -> apply | 0.03435 | 4 cells |
| outward bias -> flux -> apply | 0.00000 | none |
| velocity + outward bias -> flux -> apply | 0.02065 | 4 cells |
| all water motion | 0.03317 | 2 cells |

`npm.cmd run build` passed after the final split. The full live result remains
available as `window.__fishScaleResult` on the diagnostic page.

**What it proves.** The shared fish-scale pattern is not stamped by the brush.
The Round footprint is smooth, and the GPU stores that smooth deposit exactly.
A short-wavelength rhythm first grows in the shared movement ledger, then its
conservative water application writes the rhythm into paint height. Raw
velocity-driven movement starts it; the current divergence-relaxation pass
amplifies it in this test instead of damping it. That shared fluid loop explains
why Round, Flat Sable, and Flat Hog can show the same pattern in Watercolour and
Oil, while paper relief and lighting merely make the stored ridges easier to see.

**What it does NOT prove.** `flux_apply_water.wgsl` is itself arithmetically
wrong; applying a patterned ledger will necessarily produce patterned height.
The remaining question is why `update_velocities` and `relax_divergence` grow
the two-cell mode that feeds `flux_compute`. No production fluid constant or
brush setting has been changed, and the visible defect is diagnosed, not fixed.

### E5 — the dead west and north faces, verified; and the seam between two shaders (2026-08-29, Claude)

**Purpose.** Codex reported in chat, and in no file, that a change to
`update_velocities.wgsl` and `relax_divergence.wgsl` cut the finished stroke's
edge ripple from 4.55% to 1.38%. Reproduce that independently before it is
believed, decide whether it breaks the paint, and check one defect found by
reading rather than measuring.

**Method.** Three arms of the same `?fish-scale=1` bench, unchanged between
arms: HEAD (baseline), Codex's candidate, and the candidate plus the seam repair
below. Each arm was run on two fresh page loads, and each load runs every
condition twice internally. Every pair in every arm reproduced exactly.

**Raw result.**

| measurement | baseline | candidate | + seam fix |
|---|---:|---:|---:|
| finished mark, full pipeline | 0.04551 | 0.01376 | **0.01266** |
| after capillary | 0.03853 | 0.05526 | **0.03641** |
| after water flux | 0.04334 | 0.05135 | 0.05135 |
| smooth deposit, 8 flow steps | 0.03317 | **0.00000** | 0.00000 |
| smooth deposit, 16 flow steps | 0.03370 | 0.04973 | 0.04973 |
| smooth deposit, 32 flow steps | 0.02891 | 0.03619 | 0.03619 |
| outward speed, west face | **0.00000** | 0.00680 | 0.00680 |
| outward speed, north face | **0.00000** | 0.00823 | 0.00823 |
| outward speed, east / south | 0.00085 / 0.00055 | 0.00085 / 0.00055 | unchanged |

**What it proves.** Codex's 4.55% and 1.38% are real, and so is its stated
mechanism. The baseline west and north outward speeds are not small, they are
*exactly zero*: `update_velocities` returned early whenever the owner cell was
dry, and a wet region's west and north boundary faces are owned by its dry
neighbours. Water could leave a stroke on two sides and not the other two. The
repair makes a face live when either adjacent cell is wet, and after it all four
faces carry speed in the same proportion to the film standing at them
(speed/height 0.939, 0.933, 0.938, 0.936 east/west/south/north) — that ratio
agreeing on all four sides is what "symmetric" means here, not the raw speeds,
which follow the paint.

Separately, `relax_divergence` now converges monotonically: mean |divergence|
0.1248 -> 0.1049 -> 0.0891 -> 0.0662 -> 0.0393 -> 0.0155 over 0, 1, 2, 4, 8, 16
iterations, with the open boundary faces untouched at every count.

**THE SEAM — the two shaders disagreed about what "wet" means.** Found by
reading, then measured. `update_velocities` tested `mask AND film > WET_EPS`;
`relax_divergence` tested the mask alone. That is not a hair-splitting
difference, because the mask does not mean "there is film here":
`flux_apply_water` sets the mask and never clears it, `capillary_flow` sets it
on absorbed water with no film at all, and only `dry_tick` clears it, and only
once film, absorbed water and the blurred mask are all gone. The damp halo of
paper that has drunk the water but holds no standing film therefore rings every
stroke, and it was interior to the relaxation while the velocity pass called it
dry and wrote zero to its faces — the same one-sided gather the fix removes,
surviving in the seam between two files. `relax_divergence` now uses the
velocity pass's test, in `wet_at` and in `dv`'s own early-out.

The measurement matches the mechanism exactly, which is the reason to believe
it: the seam repair moves the two figures that involve absorbed water (capillary
0.05526 -> 0.03641, finished mark 0.01376 -> 0.01266) and leaves every
flow-only figure bit-identical, because those conditions never run capillary and
so never produce a mask-wet cell with no film.

**What it does NOT prove, and what got worse.** The candidate is not a clean
win. Ripple after 16 and 32 flow steps is *higher* than baseline (0.03370 ->
0.04973, 0.02891 -> 0.03619), and the seam fix does not touch that. A single
stroke settles smooth where it did not before; a wash left to move for longer
does not. That is the "late residual", and on this metric it is not merely
un-erased but increased. Nothing here explains why, and no fluid constant was
tuned to hide it.

**Regression: the paint still behaves.** Baseline and candidate were measured
under identical conditions. Pigment on the canvas is unchanged (soak: 4045.97
then 4046.10 held, both arms, no blow-ups in 4/4 sessions). Brush holding
92.6% / 92.6%, passed, both arms. Watercolour conservation drift went from
0.000002 to exactly 0. Crossing lift, trail and stacking read the same in both
arms, so the fluid change moves none of them.

**Open, and not attributed.** Three things this run surfaced and did not settle:

- Crossing lift measures 44.9% with the trail collapsed to `4.6 -> 0 -> 0 -> 0`,
  against 36% and `15.8 -> 1.9` recorded on 2026-08-28. Both shader arms give
  44.9%, so it is not the fluid change. It is either the commits since that date
  or the bench-pacing hazard below. **Re-run `?full-check` on a VISIBLE page
  before trusting either figure.**
- Oil stacking returned 0.928 / 0.927 from two identical runs in one load. Small,
  but it is a paired disagreement and the suite has been assumed deterministic.
- The stroke's film at its north boundary measures 15x its film at the south
  boundary (0.00879 vs 0.00059) after deposit alone, with gravity zero, in both
  arms. A horizontal stroke should not be lopsided — but this may equally be a
  half-cell sampling offset in `boundaryOutflow` cutting a steep profile at
  different heights top and bottom. Check the metric before calling it paint.

**[TRAP, measured] A hidden page does not run these benches.** Chrome clamps
`setTimeout` on a hidden page to one call per MINUTE after five minutes
(intensive throttling), and does not fire `requestAnimationFrame` at all. The
fish-scale bench paced at about one stroke-group per minute and read as a hang;
the soak never advanced one session. This cost most of a session to find. Two
consequences, decided differently on purpose:

- `fish-scale-bench.ts` now yields through a `MessageChannel`, which is exempt.
  Safe there because it disables pickup, and proven inert because it reproduced
  four figures measured under the old timer exactly (0.04334, 0.03317, 0.03370,
  0.04551). `soak.ts` falls back the same way only when the page is hidden.
- `pickup-bench.ts` and `banding-bench.ts` were deliberately left on the timer.
  Both run WITH pickup enabled, and their yield exists so asynchronous pickup
  credit can land, so how long it takes changes what they measure. **Run those
  two on a visible page.** Making that yield fast is not a shortcut, it is a
  change to the experiment.

### E5a — correction: E5 is a WATERCOLOUR result, and oil never ran those passes (2026-08-29, Claude)

**The artist's verdict, and it is right.** Shown the tree from E5, Bartford
reported oil "way way way worse" and watercolour improved. Both halves are true,
and the split identifies the cause exactly.

**E5's scope was overstated.** `fish-scale-bench.ts` hardcodes `WATERCOLOR`,
`round-sable` and `FLAT_WHITE`. Every figure in E5 is a watercolour figure. Oil
was never measured, and E5 should have said so instead of reading as a general
"verified".

**The fluid repair cannot affect oil at all.** `src/engine/fluid.ts:927`:

```
const paste = !this.params.hasCurrent || this.params.yieldStress > 0;
if (!paste) run('vel',   ...)   // UpdateVelocities
if (!paste) run('relax', ...)   // RelaxDivergence
```

Oil is a paste on two independent counts — `yieldStress 0.34` and
`hasCurrent false` — confirmed live from `engine.fluid.params`, not read off the
source. A paste is moved by its own steepness against its yield in
`flux_compute`, and reads no velocity field. Both shaders changed in `eeb96d0`
are skipped for it. **Do not look for oil's fish scales in `update_velocities`
or `relax_divergence`. They do not run.**

**What actually broke oil: the studio lighting, bundled in by mistake.** Codex's
flat-lighting change sat uncommitted and unjudged; it was committed alongside the
fluid fix, which it should not have been. It moved the shading floor from
`mix(0.82, 0.25, paintShare)` to `mix(0.88, 0.58, paintShare)`, and `paintShare`
rides `C.paintRelief`. On oil impasto the darkest a slope may go went from 0.25
to **0.58** — shadows less than half as deep — with a further 0.28 fill light
flattening what remained. Watercolour carries almost no relief, so `paintShare`
is near zero and only the paper floor moved, 0.82 -> 0.88. That is the medium
split precisely. Reverted in `7b6d681`; the fluid fix stays.

**What this leaves open.** Oil's fish scales are undiagnosed and unmeasured. The
generator for oil must be in the paste route — `flux_compute`'s yield gate and
its four-face split, the brush shove, or fresh-body levelling — and none of it
has been instrumented. **The next real job is an oil arm on the fish-scale
bench**: same discriminator, `OIL` and a flat brush, so oil gets numbers instead
of inheriting watercolour's.

**Rule earned.** Do not commit another model's unjudged work together with a
measured fix. If it has not been looked at, it goes in its own commit or stays
out, so a verdict like this one can name a single cause.

### E6 — oil's fish scales are made at DEPOSIT, one per frame (2026-08-29, Claude)

**Purpose.** Oil had never been measured. E5 was watercolour throughout, and the
passes it repaired do not run for a paste (E5a). Give oil its own numbers.

**Method.** `fish-scale-bench.ts` now takes the medium, brush and paper from the
query (`?fish-scale=1&medium=oil`), defaults oil to Flat Hog, and builds a ladder
appropriate to the ROUTE the engine actually takes — read back off
`engine.fluid.params`, never assumed from the medium's name. For a paste the
velocity and relaxation rungs are removed rather than printed as no-change rows,
and the face-ownership and relaxation sweeps are skipped and said to be skipped,
because a paste has no velocity field to probe. Watercolour defaults were checked
to return byte-identical figures to E5 first (full pipeline 0.01266, capillary
0.03641, water flux 0.05135, 8 steps 0.00000, west face 0.00679857).

**Raw result — Oil / Flat Hog / Flat White, every pair exact, reproduced across
fresh loads.**

| stage | edge ripple | repeat |
|---|---:|---:|
| CPU footprint | 0.00312 | 2 cells |
| **deposit only** | **0.04277** | **16 cells** |
| deposit + brush shove | 0.04549 | 16 |
| + outward scratch | 0.04549 | 16 |
| + slump ledger | 0.04549 | 16 |
| + pigment flux | 0.04549 | 16 |
| + paint flux | 0.04549 | 16 |
| + pigment transfer / capillary / drying | 0.04549 | 16 |
| full pipeline | 0.04549 | 16 |
| 1, 2, 4, 8, 16, 32 flow steps | 0.04549 | 16 |

**What it proves. Oil's scales are stamped by the deposit, not grown by the
fluid.** 94% of the finished ripple (0.04277 of 0.04549) is present with every
GPU flow pass disabled; the brush shove adds the last 6%; and after that nothing
moves the number by one part in 10^5 — not the slump against the yield, not the
outward bias, not pigment transfer, not capillary, not drying, and not
thirty-two further flow steps. This is the opposite of watercolour, where deposit
was smooth and the rhythm grew inside shared water motion (E4).

**The wavelength is frame travel.** `?group=N` sets how many stylus reports are
bundled into one simulated browser frame, at 4 cells per report:

| reports per frame | frame travel | measured repeat | deposit ripple |
|---:|---:|---:|---:|
| 1 | 4 cells | **4 cells** | 0.01294 |
| 2 | 8 cells | **8 cells** | 0.03962 |
| 4 | 16 cells | **16 cells** | 0.04277 |
| 8 | 32 cells | (2 — see below) | 0.03972 |

The repeat tracks frame travel exactly at 1, 2 and 4. That rules out the
alternative worth ruling out: `TREND_RADIUS` is also 16, so a fixed 16-cell
answer would have been the detrend talking rather than the paint. It is not
fixed — it moves with the frame. **One scale per engine frame.**

At 8 reports per frame the reported repeat drops to 2, which is a limit of the
instrument and not a counterexample: the moving-mean detrend has radius 16, so a
32-cell wavelength is largely subtracted before the autocorrelation sees it.
Raise `TREND_RADIUS` before reading anything at that bundling.

**And it scales with bundling.** One report per frame gives 0.01288 finished
against 0.04549 at four — **3.5x smaller**. The CPU footprint is smooth
throughout (0.00312), so the brush geometry is not at fault; what matters is how
that footprint is handed to `deposit.wgsl` in per-frame batches.

**What it does NOT prove.** Which line in `deposit.wgsl` does it. The candidates
are how a frame's segments are accumulated, and anything that resets or
re-normalises per dispatch rather than per segment. This also does not say the
fix is "submit smaller frames" — that is a frame-rate-dependent mark, which is
its own defect: the same stroke would look different on a fast and a slow
machine. It says the per-frame seam is the generator, and the deposit is where
to look.

**Relation to the older banding bench.** `banding-bench.ts` was built for exactly
this and reported a "frame-locked ridge span" that widened with bundling
(0.0543 at one report per frame against 0.0918 at four). That was the same
finding on the Oil route, in a different metric, and it was read at the time as a
Smear seam. E6 says the seam survives with Smear off and with every flow pass
off, so it is upstream of both.

### E7 — the per-frame seam found and half-closed: fresh-paint levelling (2026-08-29, Claude)

**The generator, isolated to nineteen lines.** With the fresh-paint levelling
block in `deposit.wgsl` switched off, Oil / Flat Hog / Flat White measured:

| | edge ripple | repeat |
|---|---:|---:|
| deposit only, levelling ON | 0.04277 | 16 cells |
| deposit only, levelling OFF | **0.00312** | 2 cells |
| full pipeline, levelling OFF | 0.00345 | 2 cells |

0.00312 is the CPU footprint's own figure. With that block off the GPU
reproduces the brush's smooth footprint exactly, and the frame-locked wavelength
is gone. **The whole of oil's fish scales is that block.**

**Why it could not work where it stood.** To level a ridge a cell compares its
height with its neighbours'. Inside the deposit pass a cell knows its own new
height but reads neighbours from `wet0_in`, which that pass has not written yet
— so every cell compared post-deposit self against PRE-deposit neighbours. Mid
stroke that reads "I tower over bare canvas" when the neighbour was being
painted in the same instant, and how wrong it is depends on how much paint the
frame was carrying. Hence one scale per frame at exactly the frame's travel.

**The budget was not the fault.** Capping the movement by total film rather than
by the frame's own deposit measured 0.03987 with a 32-cell repeat — no better.
`laid * 0.8` is in fact the frame-INVARIANT term: summed over a stroke it is
proportional to the paint laid, so it is the same total however the stroke is
cut up. It was kept.

**The fix.** The levelling moved to its own pass, `level_fresh.wgsl`, dispatched
immediately after the deposit and before the appliers, reading post-deposit film
for BOTH sides of every comparison. The deposit publishes what it laid and how
hard the hairs pressed through a new `fresh` buffer, because the new pass cannot
recompute either without redoing the segment loop four times over. It adds into
the same outflow ledger the shove uses, under one shared ceiling, so the single
conservative applier still moves everything.

| Oil, full pipeline | before | after |
|---|---:|---:|
| 4 reports/frame | 0.04549 | **0.02987** |
| 1 report/frame | 0.01288 | 0.01316 |
| frame dependence | 3.53x | **2.27x** |

Conservation holds: total film 536.21051 -> 536.20437 at deposit and
536.24539 -> 536.27535 finished, differences of about 0.005%, which is paint
levelling off the sheet edge slightly differently. Watercolour is byte-identical
(0.01266 / 0.03641 / 0.05135 / 0.00000 / west face 0.00679857) — the new pass
returns immediately for any zero-yield medium.

**What is still wrong, stated plainly.** A 34% reduction at the default
bundling, not a cure. Frame dependence is 2.27x, not 1x. The remaining mechanism
is understood and is NOT the stale comparison: **the levelling runs once per
frame, so a frame carrying four stylus reports gets one smoothing step where
four single-report frames get four.** The deposit itself is frame-invariant —
proved above, since with levelling off it returns the CPU footprint's figure at
any bundling — so this is the last term.

Two ways to close it, and both are cost decisions rather than corrections:

1. **Iterate** `level_fresh` + the appliers once per brush solve step in the
   frame, each with `laid * 0.8 / steps`. Costs that many extra applier passes
   per frame.
2. **Chunk the deposit per solve step**, so the GPU never sees a bundle. Cleanest
   in principle and the most expensive: resampling puts roughly one solve step
   per cell of travel, so a 16-cell frame becomes ~16 submits instead of one.

Neither should be chosen without timing it against the D7 budget on the bench.
**Do not reach for "submit smaller frames" as the fix** — that is a
frame-rate-dependent mark, where the same stroke looks different on a fast
machine and a slow one, and it is what the diagnostic deliberately exploits.

**Not yet verified.** `?full-check` could not be run: the pickup and banding
suites must run on a VISIBLE page (E5a trap), and this session's browser pane is
hidden. Oil stacking and brush holding are therefore unmeasured against this
change. Run them before trusting it beyond the fish-scale numbers.

### E8 — the fast/slow gap closed: levelling sweeps follow the paint (2026-08-29, Claude)

**The artist's test confirmed the diagnosis by eye.** Asked to paint the same
mark slow and fast, Bartford reported slow strokes visibly cleaner and the E7
fix "a mild improvement, not enough, right direction". That is what a
frame-locked defect looks like from outside: a slow hand puts less travel in
each frame.

**The remaining term.** E7 fixed WHERE the levelling measured. It did not fix
HOW OFTEN it ran. Levelling is a smoothing sweep, and one sweep over a frame
carrying sixteen cells of travel is not the same as sixteen sweeps over one cell
each — the second is precisely what a slow stroke was getting.

**The fix.** The sweep count follows the paint, not the browser: one per brush
solve step in the chunk (counted on the CPU from `stepId`), capped at
`LEVEL_SWEEP_MAX = 8`, with the per-sweep budget divided by the count used. The
total paint the levelling may move over a stroke is unchanged — still
`laid * 0.8` summed — but delivered in as many small sweeps as the travel
deserves. The brush's shove rides the first sweep only; the ledger is cleared
after each, so later sweeps carry levelling alone.

| Oil, full pipeline, Flat White | value |
|---|---:|
| before any fix | 0.04549 |
| E7, pass moved | 0.02987 |
| **E8, sweeps follow travel** | **0.01424** |

| frame dependence (group 4 vs group 1) | ratio |
|---|---:|
| before | 3.53x |
| E7 | 2.27x |
| **E8** | **1.13x** |

On Cotton Duck, the surface the artist paints on: **0.03520 -> 0.01425**.
Deposit-only 0.01323. Both reproduced across fresh loads.

**In plain terms: a fast stroke now behaves like a slow one.** Group 4 measures
0.01424 against group 1's 0.01608, so the fast case is if anything marginally
the smoother, where it used to be 3.5x worse. The gap the artist photographed is
closed to within noise.

**Cost, measured and honestly approximate.** Oil / Flat Hog / Cotton Duck, the
same 84-input stroke at four reports per frame, timed around
`queue.onSubmittedWorkDone`: about **9.2-9.5 ms per frame with sweeps against
6.4-7.8 ms with the cap forced to 1**. Roughly 2-3 ms, inside the 16.7 ms budget
on the RX 570. Treat as an upper bound and as noisy — JS and submit overhead
included, identical runs varied by 1.4 ms, no timestamp queries under D12.
**`LEVEL_SWEEP_MAX` is the dial if the iPad is tight; a cost ceiling, not a
physical constant.**

**Conservation holds.** Total film 536.15 against HEAD's 536.25, about 0.02%,
which is levelling running off the sheet edge slightly differently. Watercolour
byte-identical (0.01266 / 0.03641 / 0.05135 / 0.00000 / west 0.00679857):
sweeps are 1 for any zero-yield medium and the shader returns at once.

**Still not verified.** `?full-check` has not been run against E7 or E8 — the
pickup and banding suites need a VISIBLE page. Oil stacking and brush holding
are unmeasured against both.

### E9 — four tuning attempts, three failures, and where the residue actually is (2026-08-29, Claude)

**The artist's verdict on E8:** "Not yet... it's getting better." The harsh
dashes are gone and the fast/slow gap is closed; what remains reads as slower
tonal banding in the stroke BODY rather than scalloped edges.

**Where the residue is, measured.** Oil / Flat Hog / Cotton Duck, group 4:

| | edge | shape | volume |
|---|---:|---:|---:|
| CPU brush footprint (the floor) | 0.00312 | 0.00273 | 0.00455 |
| stored, levelling OFF | 0.00312 | — | — |
| stored, shipped E8 | 0.01425 | 0.01113 | 0.00679 |

With the levelling off the GPU reproduces the brush footprint exactly. So **all
of the remaining residue is the levelling itself** — and it cannot simply be
removed, because it is what stops a paste keeping the raw comb of hair ridges.
Volume is already near the floor (1.5x); edge and shape are ~4x.

It is no longer frame-locked (group 4 measures 0.01425 against group 1's
0.01608) and no longer surface-dependent (Flat White 0.01424, Cotton Duck
0.01425 — identical). Whatever is left is intrinsic to the deposit/levelling
pair.

**Four attempts. Keep the first, discard three.**

1. **Sweep cap 8 -> 32.** No change at all: 0.01425 either way, deposit-only
   0.01323 either way. The cap is not binding at ordinary bundling. Left at 8,
   which is the cheaper number.
2. **Levelling share, swept.** **NOT MONOTONIC — this is the important finding.**
   0.8 -> 0.01425. **1.3 -> 0.05027**, with the frame-locked 16-cell pattern
   fully restored at r 0.95. 2.0 -> 0.01201, better on edge but the
   cross-section twice as rough (shape 0.02538 against 0.01113). Above 1.0 a
   cell may be asked to give away more than it just laid, which pulls at paint
   the design treats as set. **Do not treat `share` as a smooth knob and do not
   interpolate between measured values.**
3. **Stop levelling into bare canvas.** Physically better motivated — levelling
   is redistribution among cells that have paint, and paint advancing onto dry
   canvas is the mark growing, which the yield stress should govern. Measured
   null: 0.01425 -> 0.01423. Reverted, since it buys nothing and the fence says
   unmeasured complexity does not go in.
4. **Budget by the 3x3 mean fresh deposit instead of the cell's own.** The
   obvious next idea, since per-cell `laid` carries the comb and using it as the
   amount allowed to move means a smoothing step modulated by the texture it is
   smoothing. Measured **much worse: 0.04882, 16-cell pattern back at r 0.88**,
   for the same reason as (2) — a cell allowed more than it laid pulls at set
   paint. **The per-cell budget is load-bearing, not incidental.**

**What was kept.** Two URL dials, defaulting to exactly the shipped values so
nothing changes unless asked: `?levelSweeps=N` (cost ceiling) and
`?levelShare=X` (how completely the comb is squeezed flat). They exist so the
artist can tune by eye without a rebuild — with the warning above attached.

**What this says about the next step.** The knobs are at a local optimum; three
of four attempts made it worse or did nothing. Turning them further is not the
route. Two directions that have NOT been tried:

- **A better instrument.** Edge-width ripple in the stored film may no longer
  track what the eye sees; the artist is describing tonal banding in the body of
  the mark. Measure the RENDERED image along the stroke, not `wet0.y` across it,
  before tuning anything else.
- **A different smoother.** The levelling is a 4-neighbour Jacobi step on a
  ridge pattern that is strongly anisotropic (the comb runs ALONG the stroke).
  A von Neumann stencil on anisotropic structure is a known source of striping.
  An 8-neighbour or separable smooth is untried and is the one mechanism change
  with a reason behind it rather than a knob.
