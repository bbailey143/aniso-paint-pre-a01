# 15 — Paste flow log

**Opened 2026-08-24 by Claude (Opus 5), on `D:\aniso-paint-pre-a01`, branch
`tuft-fill`, Windows 11, GPU amd / gcn-4.** Everything here is measured in the
running app against the real GPU passes; none of it can be driven from node.

**Why this log exists.** The artist sent in a painting covered in right-angled
traces — an L-shaped, axis-aligned maze over the whole sheet, looking like a
circuit board etched into the paint — with the note that it appears when Body is
turned down.

---

### E1 — Paint is conserved, before anything was touched (2026-08-24)

**Purpose.** The fix under consideration changes how paint moves between cells.
The bookkeeping that guarantees paint is neither created nor destroyed is built
around that movement, and `docs/11-open-fault-conservation.md` exists because
this has gone wrong before. So: establish what conservation reads BEFORE
touching it, or there is no way to tell a new leak from an old one.

**Method.** `window.__paintTotals` in the running app. Lay an oil blob, set
`evapRate` and `edgeEvaporation` to zero so nothing may legitimately leave, take
the gauges, run N steps with no brush input, take them again. Pigment is summed
as wet-band plus dry-band, because paint moving between bands is not a leak and
the gauges split them for exactly this reason.

**Raw result.** 800 steps, no input, nothing evaporating:

```
                                water drift   pigment drift   spread into
Body as oil ships (0.34)          0.0000%       0.0000%       0 new cells
Body almost off (0.004)           0.0000%      -0.0001%     155 new cells
```

**What it proves.** Paint holds to about one part in a million across 800 steps
of the flow running hard. At the shipped Body nothing moves at all, which is the
gate being shut, not the pass being idle — the second row moved 155 cells' worth.

**What it does NOT prove.** The render loop is demand-driven and steps on its
own while this runs, so 800 is a floor on the step count, not the exact number.
It also says nothing about the OTHER passes; only that the flow does not leak.

---

### E2 — A round pile of paint slumps into a diamond (2026-08-24)

**Purpose.** Explain the artist's right-angled maze.

**Reading the code first.** The paste branch of `flux_compute.wgsl` asked four
separate questions — am I taller than my right neighbour, my left, my up, my
down, each by more than the yield — and answered each on its own. So paint could
only ever leave a cell along a grid axis. And `fluid.ts` skips both
`update_velocities` and the pressure relaxation for a yielding material, on the
good grounds that a stiff paste has no flowing current and those are the two most
expensive passes in the frame. Those two passes are also the only thing that
evens out direction for water. Paste has neither, so whatever direction the flux
pass picks is the only direction paint has.

**Method.** Lay a round pile — shrinking circles with a round sable, so its shape
owes nothing to the flow — then run the flow with Body almost off and measure the
outline. Two numbers, both taken on the paint mask after flood-filling the
outside so the canvas weave cannot contribute:

- `boxFill`  — paint area over its bounding box.
- `straightEdge` — share of the outline lying within 10 degrees of an axis.

**Calibrating the instrument.** The first version of `straightEdge` walked every
edge inside the bounding box and was measuring the woven canvas showing through
the paint, not the blob. The second version was better but I had asserted "a
circle reads about 0.22", which is wrong: a thresholded outline is made of pixel
stair-steps, so much of any curve is locally axis-aligned. Measured against
shapes with known answers:

```
                boxFill   straightEdge
perfect circle    0.793      0.547
perfect square    1.000      0.994
perfect diamond   0.500      0.004
```

**Raw result.** The same round pile, same steps, same Body, on the old flow and
the new one:

```
                        area    boxFill   straightEdge
OLD  as laid           10569     0.815       0.636
OLD  after 2500        12772     0.759       0.548
OLD  after 5000        13505     0.726       0.492
OLD  after 7500        13772     0.718       0.456     <- and stalling
NEW  after ~7500       15653     0.750       0.563
(a circle)                       0.793       0.547
(a diamond)                      0.500       0.004
```

**What it proves.** The old flow walks a round pile steadily toward a DIAMOND —
both numbers fall away from the circle, monotonically, and keep going. That is
the signature of a front that can only advance along four directions: it spreads
as a Manhattan-distance ball, which is a diamond. The right-angled maze in the
artist's painting is many such fronts overlapping. It also stalls: the area
plateaus near 13800 while the new flow is still spreading at 15653, because a
hard yield gate freezes into a locked pattern once each cell has handed enough
to its neighbours to drop everyone below the line.

The new flow sits at 0.750 / 0.563 against a circle's 0.793 / 0.547 — round, to
within what this measurement can resolve — while having spread FURTHER.

**What it does NOT prove.** These are single runs of one pile at one Body value
`[1 RUN ONLY]`. And "rounder" is not "correct": nothing here says a slumping
pile of oil should be circular, only that it should not be a diamond.

---

### E3 — The fix, and that it did not cost conservation (2026-08-24)

**What changed.** In the paste branch of `flux_compute.wgsl`:

1. The direction is taken ONCE, from a Sobel gradient over all eight neighbours,
   plus gravity as a body force rather than a per-face bias. The amount is then
   split across the four faces the pass already owns, in proportion to that
   direction. A pile running north-east gives half north and half east in the
   same step instead of stepping around the corner over two.
2. The yield gate opens over a band instead of at a line
   (`YIELD_BAND`, `YIELD_FLOOR`, both `[UNVERIFIED]`), because a real paste is a
   suspension with a spread of yield values, and because a hard gate freezes
   into the thin connected filaments visible in the artist's photograph.
3. `slump` is retired; what remains of it is `face_cap`, which only stops a face
   giving away enough to drop this cell below the neighbour it is giving to.

**Deliberately NOT changed.** The flux buffer is still four faces and the two
apply passes are untouched. A cell still gives away exactly the sum of its own
four faces and its four neighbours still receive exactly those. Adding diagonal
faces would have meant rewriting that sum, which is the one part of this that
has a fault log of its own.

Sobel over a 3x3 returns the same magnitude for a straight ramp that the old
one-sided difference did, so `Body` still means what it meant and the dial does
not have to be relearned.

**Raw result.** The E1 harness re-run on the changed code, same blob, same steps:

```
                                water drift   pigment drift   spread into
Body as oil ships (0.34)          0.0000%       0.0000%         0 new cells
Body almost off (0.004)           0.0000%      -0.0001%       937 new cells
```

Identical drift to the baseline, to every digit reported. The paint spreads six
times further in the same number of steps, which is the gate opening and the
flow no longer stalling.

**What it does NOT prove.** Conservation was checked for the paste path only.
Water takes the other branch, which was not touched, and was not re-measured.
And no artist judgement has been given on any of this.
