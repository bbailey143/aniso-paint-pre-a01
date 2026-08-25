# 14 — Tuft geometry log

**Opened 2026-08-24 by Claude (Opus 5), on `D:\aniso-paint-pre-a01`, Windows 11,
GPU amd / gcn-4.** None of these entries touched the GPU: the spine solver, the
tuft geometry and the reservoir are plain TypeScript and were driven directly.

**Why this log exists.** Bartford has spent a week on marks that read as a stamp
skipped across the canvas rather than hairs pulled through paint, plus a periodic
lattice that keeps reappearing in accumulated paint. On 2026-08-24 he set the
direction for this log:

> "These tufts, especially on the flat brushes, need some form of randomness. I
> don't think two splines is enough either and the hollow brush design is full of
> flaws. My impression of what tufts are is that they are bundles of brushes, so
> you don't have to render each one. But at the same time, they should still fill
> the shape of the brush."

He also **withdrew VL as the standard**: "Hm, methinks the VL standard is not my
standard. Many of it's principles have been the primary cause of pain points with
the brushes, so we're going to push away from that document." VL (Van Laerhoven &
Van Reeth) may still be cited as a source of a specific claim, but its pass/fail
tests are no longer the bar, and "VL found X buys nothing" is no longer an argument.
Several comments in `src/brush/*.ts` still appeal to VL as authority; they are now
stale in tone and should be reworded as they are touched.

**Method note for every entry below.** A carrier file is recorded with
`node tools/brush-bench.mjs tuft`: 49 frames of hover -> press -> pull -> release ->
settle, per brush, storing only the solved spine joints and the straight rest line
the solver resets to. Hairs are deliberately **not** recorded, because the hairs are
the thing under review. Tools and the comparison page are in `tools/tuft/`.

---

### E1 — The two spines of a flat brush are the same curve (2026-08-24)

**Purpose.** `Brush` builds two `Spine` objects for a flat brush, and the whole
flat-brush story ("two spines are what let a flat brush spread and scratch") rests
on them behaving differently. Test whether they ever do.

**Method.** Record the carrier for `flat-sable` and `flat-hog`. For all 49 frames,
take joint-by-joint `|x0 - x1|` and `|z0 - z1|` between spine 0 and spine 1 and
report the maximum. Repeat the whole recording a second time and diff the file.

**Raw result.**

```
flat-sable   over all 49 frames:  max |x0-x1| = 0.000000   max |z0-z1| = 0.000000
flat-hog     over all 49 frames:  max |x0-x1| = 0.000000   max |z0-z1| = 0.000000
RUN 2: identical; the carrier file reproduces byte-for-byte.
```

They differ only in `y`, by exactly the fixed `+/- halfWidth` they were placed at.

**What it proves.** A flat brush in this engine has **one** spine's worth of
behaviour. Both spines are handed the same ferrule motion, the same drag vector, the
same preferred-direction axis and the same floor, so they relax to the same solution
every step. Consequently the deformation lattice between them is always a straight
ruled sheet: no corner can lead, nothing can buckle, the blade cannot twist. Any
explanation of a flat-brush mark that appeals to the two spines diverging is false.

**What it does NOT prove.** It does not prove that two spines *cannot* diverge — only
that nothing in the current `solve()` gives them anything to diverge about. It also
says nothing about whether divergence would improve the mark; that is E5, unwritten.
The second run is a determinism check on the pipeline, not an independent sample.

---

### E2 — The flats' hair tracks are exactly evenly spaced (2026-08-24)

**Purpose.** Bartford has repeatedly reported a periodic lattice in accumulated
paint. A perfectly regular comb dragged over a textured surface is a standard way to
manufacture a periodic pattern. Test how regular the tuft actually is.

**Method.** At frame 20 (full press) take every hair point inside the contact slab,
collect its across-stroke coordinate, sort, take gaps between neighbouring distinct
tracks, and report the coefficient of variation. `tools/tuft/tuft-regular.mjs`.

**Raw result.**

```
Round Sable   now  69 distinct tracks, gap spread  72%
Flat Sable    now  34 distinct tracks, gap spread   0%
Flat Hog      now  22 distinct tracks, gap spread   0%
```

**What it proves.** The flat brushes lay a mathematically perfect grating — not
approximately even, exactly even, to every decimal place, identically on every stroke
ever painted. `bristlePoint` interpolates `u = b / (B-1)` linearly between the two
spines, and E1 shows those spines are a rigid pair, so the spacing cannot vary. The
round sable's 72% is not randomness either: it is the fixed consequence of projecting
an evenly-spaced ring onto a line, and it too is identical every stroke.

**What it does NOT prove.** It does **not** prove this is the cause of the lattice
Bartford sees. That lattice only appears with accumulated paint and a single stroke
showed no periodic structure at any density reached (0.23 against his 0.64) — see the
open item in the baton. This entry establishes a perfectly periodic source exists in
the brush; connecting it to the observed artefact is unfinished work.

---

### E3 — One of the round brush's 28 bristles is a duplicate (2026-08-24)

**Purpose.** Incidental, found while drawing the ferrule section.

**Method.** Evaluate `bristlePoint`'s ring placement for `round-sable`:
`u = b / (B-1)`, angle `u * 2*PI`, and count distinct positions.

**Raw result.** `B = 28`, radius at the belly `3.259`, **distinct positions = 27**.
Hair 0 lands at angle 0; hair 27 lands at angle `2*PI`. Same point, to the last digit.

**What it proves.** One bristle of every round brush is drawn twice, deposits paint
twice, and costs twice, on every step of every stroke. The fix is `u = b / B` for a
closed ring (or `B` roots from a filled section, which is E4).

**What it does NOT prove.** The magnitude is small — one hair in 28 — and this has
not been shown to cause any visible artefact.

---

### E4 — A filled bundle inks the inside of its own mark; a shell inks a rim (2026-08-24)

**Purpose.** Bartford's request: "The brush shape needs to be filled in - not hollow.
You decide the numbers." Quantify what filling the section actually buys, rather than
asserting it.

**Method.** Keep the recorded spines. Replace the hair placement with
`tools/tuft/tuft-fill.js`: roots drawn on a Vogel spiral through a filled section
(circle for a round, superellipse `n = 3` for a chisel), jittered off that lattice,
with per-hair length, per-hair stiffness (the hair's rest line is blended toward the
solved spine, and the blend may run past 1 so a soft hair lies over further than the
spine does), per-hair convergence, and a stray fraction. A drawn hair stands for a
bundle, so its radius follows the packing (`bundleRadius`), not the count.

Coverage metric: rasterise every in-slab contact point as a disc at 0.15 cells, take
the convex hull of the contact points, and count only inked cells **inside** that
hull — the outward rim band otherwise reads as over 100% and measures the brush's
edge rather than whether its middle is hollow. `tools/tuft/tuft-measure.mjs`.

**Raw result.** Coverage of the mark's own outline:

```
                    press f20 (p 0.90)     pull f25 (p 0.90)     light f8 (p 0.375)
Round Sable   now        26%                    17%                    34%
              filled     88%                    78%                    94%
Flat Sable    now        30%                    23%                    79%
              filled     76%                    60%                    83%
Flat Hog      now        39%                    25%                    60%
              filled     80%                    73%                    57%

Hair count / radius:  round 28 @ r0.45 -> 96 @ r0.46
                      flat sable 34 @ r0.45 -> 120 @ r0.48
                      flat hog 22 @ r0.53 -> 72 @ r0.81
Footprint cost:       168 -> 576, 204 -> 720, 132 -> 432 segments per step (~3.4x)
```

Hair-count sweep at fixed packing, 40 through 180 hairs, both flats and the round:
coverage stayed inside **65%–90% at every count**, because the bundle radius shrinks
as the count rises.

**What it proves.** The hollow is a real and large effect on how much paint one touch
lays: a round sable currently inks about a quarter of the area its own mark covers.
And **hair count is not the lever** — coverage is set by the packing, so count is a
cost-and-fineness decision, while the hollow is fixed by where the roots sit. That
was contrary to expectation and is the most useful number in the entry.

**What it does NOT prove.** Coverage is a geometry measure taken on contact points; it
is **not** a measure of laid paint. Nothing here has been through the deposit pass,
the reservoir, or the fluid engine, so it does not predict opacity, and it does not
show the mark looks better. The flat hog's light-touch figure went *down* (60% -> 57%)
because length and stiffness scatter deliberately spread its light contact over ten
times the area (21.6 -> 184.8 cells); a convex-hull coverage number stops being
meaningful for a deliberately scattered mark. The proposed rows are **chosen, not
measured** `[UNVERIFIED]`, the same standing as the existing rows in
`src/brush/library.ts`. And the fill does not address E1: every hair is still a blend
of the same one or two identical curves.

**Artist verdict.** Delivered as a live comparison page on 2026-08-24
(`tools/tuft/tuft-build.mjs`). **Not yet judged.** No number here is accepted until
Bartford has looked at it.

---

## CORRECTION to E1 (2026-08-24, same day)

**E1 above says "A flat brush in this engine has one spine's worth of
behaviour." That is overstated, and I wrote it from a single stroke direction.**

E1 was measured only on the `tuft` film, which is a dead-straight pull with zero
tilt and zero twist. When the five-pose probe was built (E5) and the pre-change
code was run through it with a placement-free metric, the arc take showed the two
spines reaching shapes **21.86 cells apart** for a flat sable. So they were never
literally locked together; they differed on a turn, through the per-joint friction
memory in `Spine.applyFloor`, which remembers where each contacting joint was and
holds it back.

The correct statement is narrower and still damning:

- On a straight pull, tilted or not, rolled or not: **0.000000**, always.
- On a turn: non-zero — but measured at pressure 0.9, which E8 shows is inside
  the regime where the chain buckles chaotically. Two spines placed 1.42 cells
  apart land 22 cells apart there. So the pre-change arc difference cannot be
  called blade behaviour either; it is the crumple lottery.

This is the second time this week I have measured one stroke direction and
reported it as general. The first was the hair-angle claim, which was fine at 0
degrees and 37 degrees wrong at 90. The lesson is now a rule for this log: **any
claim about brush behaviour is measured across a sweep of directions, tilts and
rolls, or it is not written down.**

---

### E5 — The blade axis had no third dimension (2026-08-24)

**Purpose.** Bartford: "I think the problem has to do with the brush needing to
bend and pull. Right now with the flat I believe only the tip is touching the
canvas as if the pencil is being held at 90 degrees at all times." Test whether a
leaning flat brush has a low edge and a high edge at all.

**Method.** Five poses, three that should treat the two edges of a blade
differently and two that should genuinely leave it symmetric:
`straight`, `arc`, `tiltBroad` (leaned, blade square to the lean), `tiltEdge`
(leaned, blade along the lean), `roll` (barrel-rolled while pressed).
`node tools/brush-bench.mjs spines`. Differences are taken with each chain
relative to its own ferrule, because the spines are PLACED half a blade apart and
that offset swings into x under roll — comparing raw positions reports the blade's
own width, 22.8 cells, as divergence on a take where the two chains are in fact
identical. First metric I wrote did exactly that and had to be thrown away.

**Raw result.** Flat sable, ferrule height difference across the blade:

```
take         before      after      what it should be
straight     0.000000    0.000000   0        (symmetric, and must stay so)
tiltBroad    0.000000    0.000000   0        (blade square to the lean)
tiltEdge     0.000000   17.465813   22.8 * sin(50 deg) = 17.4658
```

Flat hog `tiltEdge`: 0.000000 -> 17.695627, against 23.1 * sin(50) = 17.6956.

Live, in the running app on `webgpu: amd / gcn-4`, mid-stroke at pressure 0.75,
the five ferrules of a flat sable:

```
upright              7.20  7.20  7.20  7.20  7.20    spread  0.00   15 joints down
tilt 50 broadside    4.63  4.63  4.63  4.63  4.63    spread  0.00   15 joints down
tilt 50 edge-on      4.63  8.99 13.36 17.73 22.09    spread 17.46    7 joints down
```

**What it proves.** The blade direction was built in plan only — `(cos, sin)` of
azimuth plus roll, with no z — so both ends of the ferrule sat at the same height
however the pen leaned. It is now built as a genuine 3D frame square to the pen
axis, and the ferrule spread matches the exact geometric prediction to five
decimal places on both brushes. The two symmetric controls stayed at exactly
zero, so the change did not simply add asymmetry everywhere. In the running app
a leaned edge-on blade now has less than half its joints in contact and paints a
single thin line where it previously painted a full band — that is a flat brush
drawing with its corner, which was not previously possible at any tilt or twist.

A second correction rides on this. Leaning the brush must not also press it
deeper: without the `lift` term, tipping a blade onto its corner drives the whole
ferrule down by half a blade width and reads as pressure the hand never applied.

**What it does NOT prove.** Nothing about whether the marks are better; that is
Bartford's call. The contact model underneath is unchanged and still crude. And
the geometric prediction it matches is the prediction for a RIGID ferrule, which
is right, but it means the agreement tests the frame, not the physics of hair.

---

### E6 — A rolled blade now twists; a straight pull still does not (2026-08-24)

**Purpose.** Both spines were handed the same drag vector — the ferrule's own
translation. Two edges of a blade only travel the same distance when the brush is
going dead straight.

**Method.** Each spine now takes its drag from its own previous contact point.
Same five poses as E5.

**Raw result.** Worst shape difference between the outermost spines, flat sable:

```
take         before       after
straight     0.000000     0.000000
roll         0.000000    27.139802
arc         21.856696    21.131467
tiltEdge     0.000000     5.021091
```

**What it proves.** Barrel-rolling a pressed blade now twists it; it previously
did nothing at all to the tuft's shape. The straight pull stayed at exactly zero,
which is correct — a flat brush pulled dead straight IS symmetric, and a change
that broke that would be adding noise rather than behaviour. The leading corner
comes out of the friction that was already there rather than a new term.

**What it does NOT prove.** The arc number barely moved, and it was already
non-zero for the reason set out in the E1 correction. It does not show the arc
case is now right — only that it is now driven by something principled as well.

---

### E7 — Five spines is the knee (2026-08-24)

**Purpose.** Bartford: "I don't think two splines is enough either." Choose the
count by measurement rather than by taste.

**Method.** Hairs between spines are interpolated straight, so a fan of N spines
draws a bowed blade as N-1 chords. Solve a 90-degree arc with a dense 17-spine
reference, then ask where a coarse fan's interpolation would have put each of
those positions. `node tools/brush-bench.mjs fan 0.25`.

**Raw result.** Worst gap between the chords and the blade, in cells:

```
              flat sable    flat hog
 2 spines        5.980        4.397
 3 spines        3.221        3.489
 5 spines        1.283        3.033
 9 spines        1.192        2.729
```

Set to 5 for both flats. Cost is five chain relaxations instead of two: about 90
numbers, all CPU, no change to bristle count and therefore none to footprint
segments.

**What it proves.** Two spines miss about six cells of blade on a turning stroke,
and they miss it structurally: a ruled sheet between two curves has zero bow by
construction, so the middle of the blade can only ever do the average of what the
two edges do. Five is where the return collapses.

**What it does NOT prove.** The hog gains much less than the sable (4.40 -> 3.03)
and 3 would have been defensible for it; 5 was chosen for consistency, not from
its own numbers. And the reference is itself a 17-spine fan, not an analytic
blade, so this measures convergence rather than correctness.

---

### E8 — The solver is chaotic above about a quarter of a tuft of over-drive (2026-08-24)

**Purpose.** The E7 numbers refused to converge at working pressure — 9 spines
was no better than 2, and for the hog it was worse. Check the instrument, and the
solver, before believing any of it.

**Method.** Place a dense fan and report the worst SHAPE difference between
NEIGHBOURING spines. If the blade is a curve being sampled, that must fall as the
spines are placed closer together. `node tools/brush-bench.mjs chaos`.

**Raw result.** Flat sable, worst neighbour gap in cells, at the end of an arc:

```
spacing between spines:   11.40    5.70    2.85    1.42
pressure 0.90             20.753  13.861  10.612  22.372     does NOT converge
pressure 0.50             13.913  10.836   5.681   7.523     breaks up
pressure 0.25             11.328   8.713   4.558   2.504     converges
pressure 0.10              5.682   4.525   3.871   3.078     converges
```

**What it proves.** Below roughly quarter pressure the fan samples a genuine
curve and halving the spacing roughly halves the disagreement. At 0.9 it does
not converge at all: two spines placed 1.42 cells apart solve to shapes 22 cells
apart. That is not a blade bowing, it is the chain landing in different buckling
states. The cause is almost certainly the over-drive — `DRIVE = 1.0` means at
pressure 0.9 the ferrule is pushed 0.9 x 24 = 21.6 cells past first touch on a
tuft 24 cells long, and five segments have to absorb that by crumpling. Buckling
has many nearly-degenerate solutions and tiny differences pick different ones.
This is the same fault as the zigzag spine recorded on 2026-08-24 in the release
film (x running 16.2, 11.0, 4.7, **-0.32**, 3.2, 6.5).

**Consequence for the numbers above.** Every figure in E5-E7 taken at pressure
0.9 is inside the chaotic regime and should be read as indicative only. The
exceptions are the ones that are exact: the ferrule spread (a placement, not a
solve) and the zeros in the symmetric controls. E7's fan comparison was
deliberately re-run at 0.25 for this reason.

**What it does NOT prove.** `DRIVE` has not been changed and this does not show
what value it should have. It also does not prove the over-drive is the cause —
that is a strong inference from the depths involved, not a measurement. The test
that would settle it is to vary `DRIVE` directly at fixed pressure and see
whether convergence tracks the drive depth rather than the pressure dial.

**Not fixed by round two.** `node tools/tuft/tuft-regular.mjs` still reports
**0% gap spread** for both flats: on a straight untilted pull all five spines
still solve identically, so the hairs are still a perfectly even comb. Round two
gives the blade a low edge, a twist and a bow; it does nothing at all for the
grating. That is round one's job, and round one is still not wired in.

---

### E9 — The tuft was not pressed too hard, it was started inside the paper (2026-08-24)

**Purpose.** Bartford: "Now fix DRIVE so the tuft stops crumpling." E8 inferred
that the crumpling came from the over-drive but explicitly did not measure it.
Settle the mechanism first, then fix it.

**Method, part 1 — does it track the depth or the dial?** Hold pressure at 0.90
and sweep `DRIVE` instead. `node tools/brush-bench.mjs drive`. If crumpling
follows the depth, the same pressure will behave differently at different drives.

**Raw result, part 1.** Flat sable, pressure 0.90 throughout:

```
drive   depth at p0.9    neighbour gap (17-fan)   kinks
1.00    20.4 cells (85%)         22.372             5
0.80    16.3 cells (68%)         11.781             5
0.60    12.2 cells (51%)          9.117             3
0.40     8.2 cells (34%)          7.996             4
0.25     5.1 cells (21%)          2.615             1
0.15     3.1 cells (13%)          1.594             0
```

**What part 1 proves.** It tracks the DEPTH. The pressure dial never moved and
the disagreement fell by 14x. E8's inference is confirmed.

**Method, part 2 — but the drive was not the whole fault.** Reading
`Spine.resetTo` showed the rest shape is laid straight along the pen axis for
the tuft's whole length, every solve, however deep the ferrule is. At any real
pressure that buries most of the chain below the paper; non-penetration then has
to push all that length back out, and a chain with fixed segment lengths can only
do that by buckling. Buckling has many nearly-equal answers and nothing to choose
between them.

Changed `resetTo` to lay the chain DOWN the pen while it is above the paper and
ALONG the paper once it reaches it, in a direction that trails the stroke while
the brush moves and opens outward across the blade while it does not.

**Method, part 3 — a metric that does not flicker.** The first stability metric
counted sign flips in the chain. It read 4 folds at drive 0.35, 0 at 0.20 and 0
at 0.15: a threshold behaving like one, flipping on chains that were marginally
folded. Replaced with the sharpest turn angle anywhere in the tuft, which is
continuous — a bend reads small, a chain doubling back reads near 180.

**Raw result, with both changes in.** Sharpest bend at pressure 0.90:

```
drive    flat sable   flat hog   round sable
1.00       135 deg     134 deg     132 deg
0.80        99          97          76
0.60        84         108          82
0.50        95          97          74
0.35        82          99          90
0.25        91          97          69
```

Convergence of a spine fan at full pressure, flat sable — a blade being sampled
must disagree less as the spines are placed closer:

```
spines placed apart:   11.40   5.70   2.85   1.42
drive 1.00             20.78  20.37  19.37  24.57    no convergence
drive 0.50             18.15  12.17   6.42   9.26    upticks at the end
drive 0.35             14.28   9.81   5.75   5.94    converges
drive 0.25             12.44   9.52   5.24   5.36    converges
```

**Set `DRIVE = 0.35`** (was 1.0). Chosen as the deepest drive whose fan still
converges at full pressure.

**What it proves.** All three brushes fold to about 134 degrees at drive 1.0 and
to 70-100 degrees at anything below 0.8 — a cliff between 0.80 and 1.00, not a
gradient, and it lands in the same place for a soft sable and a stiff hog. At
0.35 the tuft at FULL pressure behaves the way it used to at quarter pressure.
Confirmed live on `webgpu: amd / gcn-4`: strokes at pressure 0.20 / 0.45 / 0.70 /
1.00 gave sharpest bends of 58 / 85 / 57 / 89 degrees, no fold anywhere.

The old value was not arbitrary — it was raised from 0.55 to 1.0 to answer "fix
the depth curve so more of the tuft touches", and it did. The mistake was buying
contact with depth. Contact should come from the tuft lying ALONG the paper,
which is what the reset now starts it doing.

**What it COSTS, and this is a real regression.** The pressure ramp got coarser.
`press` in the footprint is `1 - z/SLAB`, and `applyFloor` pins every contacting
joint to exactly z = 0 — so `press` saturates at 1.000 for every joint that is
down, and pressing harder cannot push a joint that is already down. The dial only
ever brings the NEXT joint down. With six joints per spine that is at most six
steps, and at a shallow drive only three are reachable:

```
water laid, flat sable, pressure 0.10 -> 1.00
drive 1.00   0.21  0.49  0.62  1.22  1.99  2.26  2.42     but folded above 0.65
drive 0.50   0.21  0.21  0.49  0.62  0.62  1.22  1.22
drive 0.35   0.21  0.21  0.21  0.62  0.62  0.62  1.12     dead from 0.10 to 0.35
```

Drive 1.0 was hiding this by having more steps — it was buying ramp resolution
with the very depth that made the tuft fold.

Two candidate fixes, both measured, neither taken:

- **More segments per spine.** At drive 0.35, respreading stiffness so the tip
  softness is held constant: 5 segments gives 3 levels and a worst bend of 82
  degrees; 12 segments gives 7 levels and a worst bend that climbs back to the
  fold. Buys the ramp back by re-introducing exactly the fault this entry
  removed, and costs 442 footprint segments per step against 204.
- **Contact strength that does not saturate.** Would need a per-joint measure of
  how hard a joint is pushed into the surface. That quantity does not exist:
  `applyFloor` pins contacting joints to exactly z = 0, so there is no
  sub-surface depth to read. This is a modelling addition, not a tweak.

**What it does NOT prove.** The fan converges now but to a floor around 5.9 cells
at full pressure rather than to zero — spines 1.42 cells apart still disagree by
almost six cells, and I do not have an explanation for that residual. It is not
the fold (the bend angle is 82 degrees there), so something else is spreading
them. Also: none of this shows the marks are better. And `SPLAY_OUT = 0.45`, the
strength of the outward lean in the lay direction, is chosen, not measured
`[UNVERIFIED]` — it now does the job `splayFromPressure` has been faking with a
multiplier on the section, and the two want reconciling.
