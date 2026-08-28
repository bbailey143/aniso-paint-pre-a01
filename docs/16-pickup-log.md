# 16 — Brush pickup log

**Opened 2026-08-25 by Claude (Opus 5), on `D:\aniso-paint-pre-a01`, branch
`tuft-fill`, Windows 11, GPU amd / gcn-4.** Everything here is measured in the
running app against the real GPU passes; none of it can be driven from node.

**Why this log exists.** The artist sent in an oil painting — blue strokes with
orange dragged across them — with the note: *"The orange paint simply lays on
top, it doesn't pick up bottom layers almost at all. While there should be some
resistance to that, it shouldn't be a ton."*

**The standing setup** unless a card says otherwise: Oil, Flat Hog, load 0.75,
mouse pressure 0.65, 512 grid. A blue stripe is laid down the sheet at x=256,
then an orange stroke is pulled left to right across it at y=250. Pigment is
read straight out of `wet1` by `fluid.dump`, summed over the rows the stroke
covers (y 230..270) at each x. Slot 0 is blue, slot 1 orange.

---

### E1 — The brush could not pick anything up, and never could (2026-08-25)

**Purpose.** Establish what "doesn't pick up bottom layers almost at all"
actually measures, before changing anything.

**Method.** The standing setup, at the code as it shipped. Two identical runs.

**Raw result.** Blue pigment along the orange trail, both runs identical to four
decimal places:

```
x           250    256    258    260    262    265    270    275    285    300+
blue before  0.05   6.90   1.58   0.60   0     0      0      0      0      0
blue after   0.08   6.34   3.53   1.07   0.19  0.013  0.0001 0      0      0
```

**What it proves.** Blue reaches six cells past the crossing and then stops
dead. The stroke is 290 cells long, so the paint travels about two per cent of
it. What little movement there is comes from the smear shoving one neighbour at
a time — the brush is not carrying anything, because there is no mechanism by
which it could. `Reservoir.upRate` was marked `[NOT WIRED]` in the source from
the day the schema was written: nothing read it.

**What it does NOT prove.** Nothing about watercolour, which was never measured
here. Nothing about how it should look — six cells is the wrong answer, but this
does not say what the right one is.

---

### E2 — The brush→sheet deposit is not one-for-one (2026-08-25)

**Purpose.** Find an instrument for conservation before building anything, since
Invariant 1 makes conservation the axiom.

**Method.** Charge the brush, record `reservoir.totals().pigment`, lay one
stroke, record it again, and compare the drop against `sampleGauges().pigment`.
Pickup entirely off, so this is the code as it shipped.

**Raw result.**

```
brush lost      95.757
sheet gained   223.577
```

**What it proves.** The obvious instrument does not work. A hair's withdrawal is
laid into every cell it covers, so the deposit multiplies what leaves the brush
by the coverage of its footprint — here by about 2.3. This is pre-existing and
has nothing to do with pickup, but it rules out "brush lost = sheet gained" as a
check, and it invalidated three of the measurements attempted before it was
found.

**What it does NOT prove.** That the deposit is wrong. It may well be the
intended reading of coverage. It is recorded because it defeats a whole class of
tests, not because it has been judged.

---

### E3 — What leaves the sheet is exactly what reaches the brush (2026-08-25)

**Purpose.** The pickup subtracts on the GPU and credits on the CPU, a frame or
more later. Show the two are the same number.

**Method.** Isolate pickup as the only thing that can move pigment. Lay the blue
stripe with `upRate` at 0 so no tally can be in flight when the window opens;
rinse the brush so it carries no colour; then switch `upRate` to 0.42 and scrub
the stripe twice with the rinsed brush, counting every credit the engine hands
over. A rinsed brush lays no pigment, so the sheet can only lose. Driven one
engine step per task. Two identical runs.

**Raw result.**

```
                    run A      run B
sheet before      223.5211   223.5762
sheet lost        110.5026   110.4025
credited to brush 110.5026   110.4025
shortfall           0.0000     0.0000
```

**What it proves.** Exact, to four decimal places, twice. Nothing is created and
nothing is destroyed in the exchange.

**Earlier, and struck.** ~~The first version tallied a rounded-down copy of a
full-precision subtraction.~~ That measured a shortfall of **0.91 %** of
everything lifted — twice, to three decimals — which is paint ceasing to exist.
The fix is to quantise first and subtract exactly what was reported (`lift()` in
`deposit.wgsl`). Recorded rather than deleted because "the tally is only a
report, it cannot affect the physics" was the wrong instinct and worth
remembering.

**What it does NOT prove.** Nothing about the brush→sheet direction, which E2
shows is not one-for-one. This measures only the sheet→brush half.

---

### E4 — The readback does not lag (2026-08-25)

**Purpose.** Card 6 deferred this work on the grounds that it "needs canvas
state read back to the CPU (a GPU→CPU path with a frame of lag)". Measure the
lag.

**Method.** Count engine steps between the first step that could pick anything
up and the first credit arriving. Driven one step per task, which is how a real
frame runs. A rinsed brush scrubbed across wet paint for 120 steps.

**Raw result.**

```
first step that lifts     261
first credit arrives      261
lag                         0 steps
credits over 120 steps    100
```

**What it proves.** At one step per frame the credit lands on the same step,
and a drain completes on about five frames in six. The deferral's stated
blocker is not one in practice.

**What it does NOT prove.** This is a desktop discrete GPU. An iPad may map
buffers more slowly, and nothing here has been run on one.

**A trap this exposed.** Driven the way a bench script drives it — hundreds of
`step()` calls with no yield — the queue goes deep and credits arrive in one
lump near the end of the stroke. Two earlier measurements in this session were
read that way and said the brush only goes dirty at the end of a stroke. It is
the harness, not the engine. Yield between steps or the readback timing is
fiction.

---

### E5 — The brush now carries colour the length of the stroke (2026-08-25)

**Purpose.** The artist's actual question.

**Method.** The standing setup, driven one step per task, with `upRate` at 0 and
then at 0.42. Two identical runs of the second.

**Raw result.** Blue pigment along the orange trail (the crossing is x=256):

```
x              200    240     256     265     280     300     340     380     420
no pickup      0      0       7.706   0.0028  0       0       0       0       0
with pickup    0      0.0002  3.957   0.0198  0.0201  0.0175  0.0141  0.0127  0.0089
orange there   0.79   0.65    0.59    0.67    0.69    0.63    0.58    0.59    0.48
```

Blue on the brush: **0.0000 at the dip**, 0.0166 at the end of the stroke.

**What it proves.** Blue now runs the whole 164 cells from the crossing to the
end of the stroke and fades as it goes, where before it was exactly zero past
nine cells. The brush leaves the crossing carrying colour it did not dip in.
Roughly 3 % of the trail's pigment is blue.

The 0.0000 at the dip matters as much as the rest: it says a fresh dip discards
what the brush was holding. Before `discardPickup`, an orange stroke came out
carrying blue from its first cell — the *previous* stroke's blue, arriving late.

**What it does NOT prove.** Whether 3 % looks right. That is the artist's call
and the two rows that set it (`ReservoirDef.upRate` per brush,
`MediumPhysics.upRate` per material) are where to move it.

---

### E6 — A stroke lays about a sixth less paint than it did (2026-08-25)

**Purpose.** Pickup does not wait for a second stroke. A brush lifts its own
paint back off as the tuft trails over ground its leading edge just covered, so
turning this on changes every mark, not only crossings.

**Method.** E5's runs, reading the orange trail before it reaches the crossing.

**Raw result.**

```
x            200     240
no pickup    0.946   0.686
with pickup  0.788   0.656
                -17 %   -4 %
```

Whole-sheet, one stroke: 223.6 with pickup off, 178.7 with it on — **20 % less
paint down**.

**What it proves.** This is a change to the feel of every stroke, not only to
what happens over existing paint, and it is worth saying out loud rather than
letting it be discovered as "my strokes got thinner".

**What it does NOT prove.** That 20 % is wrong. A brush dragging through its own
wet paint genuinely does take some back.

---

### E7 — Pickup eats the painting, and it is charged on the wrong clock (2026-08-25)

**Purpose.** Bartford, same day, on a stacked oil painting: *"This chattered look
— with white mixed in with blue — is after a stack of layers being laid down.
It's acting as if there is no paint on the surface, and instead skipping along
the canvas. If I pull slowly enough, it does look brush-like, but otherwise it
chatters."* Find out what the white is.

**Method, part 1 — is the white bare canvas or a highlight?** On his own painting
as it stood, composite the sheet and read mean screen brightness with sheen at
its setting, then at 0, then with relief off, then with `hidesGround` off.

**Raw result.**

```
as painted                 mean 176.88
sheen off                  mean 172.95
relief off                 mean 192.09
hidesGround off            mean 192.75
```

**What it proves.** The white is **not** sheen — switching the highlight off
moves the picture by four units in 255, and *darker*, not lighter. It is the
sheet showing through thin paint. (Relief off going lighter is the furrow
shadows disappearing; separate, and expected.)

**Method, part 2 — how deep is the paint?** Same painting: for every cell holding
pigment, compare film height against the sheet's tooth (`toothAmp` 0.3), which is
the depth the deposit's `bridged` term needs before it stops treating a hair as
touching bare paper.

**Raw result.**

```
painted cells        49,120
mean film             0.0327     (tooth is 0.30)
fully bridged              6 cells
barely bridged        98.7 %
```

**What it proves.** After a whole session of stacking, the paint is about a tenth
as deep as the weave it sits in. Nothing is filling the canvas.

**Method, part 3 — is that the pickup?** Six overlapping strokes, oil, flat hog,
Flow 3x (his setting), load 0.6, with pickup off and on. Repeated at two hand
speeds: the same path and the same sub-steps, split into either one frame per
point (a slow hand) or one frame per twelve (a fast one).

**Raw result.**

```
                        mean film    brush ends holding   (tuft capacity 317)
pickup off, slow          0.25595            19.9
pickup on,  slow          0.06603           502.1
pickup off, fast          0.24979            19.9
pickup on,  fast          0.13778           400.5
```

**What it proves.** Two separate faults, both in the pickup added earlier today.

1. **Far too greedy.** With it off, film builds to **0.25** — nearly the 0.30 it
   needs to bury the weave, which is exactly what stacking ought to do. With it
   on, film lands at **0.066–0.138**: roughly **three quarters of the paint is
   taken straight back off the sheet**. The tuft finishes at **158 %** of its own
   capacity. A brush ending a stroke holding half again as much as it can hold is
   not picking up, it is hoovering.

2. **Charged per FRAME, not per cell travelled** — Invariant 2 in as plain a form
   as it gets. The same stroke removes **twice** as much when split into twelve
   times as many frames. The cause: `cover` already sums every hair segment that
   crossed the cell this frame, so it *already* carries how far the brush moved;
   multiplying by `dist` on top counts the speed twice. `dist` does not belong in
   that expression at all.

**What it does NOT prove.** How much of the excess is mine. These numbers were
taken on the running page, which had **Codex's uncommitted amplification of the
same expression** live in it — `sqrt(cover)`, the per-frame ceiling raised from
0.5 to 0.9, and `max(C.brushTake, …)` bypassing the tuft's room clamp entirely.
Two of us are pulling opposite ways on one number. The split has NOT been
measured and must not be guessed at.

**What it also does not explain.** Bartford reports slow strokes look right and
fast ones chatter. Part 3 measures the *opposite* sense — more frames per cell
removes more. So the per-frame fault is real but it is not the whole of what he
is seeing, and the rest is unaccounted for. Do not construct a story for it.

---

### E8 — Fixing it, and two wrong fixes on the way (2026-08-25)

**Purpose.** Stop the pickup emptying the sheet (E7), without losing the carrying
that E5 measured.

**First — a correction to E7.** Part 3 of E7 used a harness that did not assert
which medium was selected, and the pickup-off baseline it reported (film 0.256)
came from a state I can no longer vouch for. Re-run with the medium asserted and
each condition run twice, the same comparison is **starker**, not weaker:

```
                        mean film   % of cells burying the weave   tuft holds
pickup off                 0.9299              55.0 %                  8 %
pickup on  (1 frame/pt)    0.0634               0.0 %                516 %
pickup on  (1 frame/12)    0.0912              11.0 %                504 %
```

E7's conclusion stands. Its part-3 figures should not be quoted.

**Method.** Six overlapping strokes, oil, flat hog, Flow 3x, load 0.6, medium
asserted before and during every run, every condition run twice. Cross-run
comparison is NOT valid here — only rows inside one page load may be compared,
which is what caught the fault below.

**Wrong fix 1.** ~~Drop `dist`, keep `r * clamp(cover,0,1)`.~~ Film recovered,
but the same stroke still gave 0.317 at one frame per point and 0.271 at one per
twelve. Multiplying cannot be frame-independent: a slow hand simply gets more
frames, each saturating the clamp.

**Wrong fix 2, which looked right and was far worse.** ~~`1 - pow(1 - r,
cover)`.~~ Compounding was the right idea applied to the wrong quantity. `cover`
is not a distance — it sums one 0..1 coverage per hair track, and the flat hog
lays **154 segments across 61 cells in a single frame at one cell of travel**,
so a cell carries 2 to 6 tracks. Raised to that power it stripped 93 % of the
film every frame: the stack came out at **0.063** against **0.930** with pickup
off, and the tuft finished at **516 %** of its own capacity.

**The fix.** Compound over TRAVEL, and let `cover` keep its ordinary meaning:

```wgsl
let dist = clamp(length(vec2<f32>(C.travelX, C.travelY)), 0.0, 16.0);
let r    = clamp(C.upRate * C.brushTake * clamp(cover, 0.0, 1.0) * loose, 0.0, 0.9);
let up   = 1.0 - pow(1.0 - r, dist);
```

`roomFraction` also had its 0.3 floor removed, so a full tuft now takes nothing
and the brush cannot fill past its own capacity.

**Raw result.** All six rows, both runs of each identical to four decimals:

```
                        mean film   % burying the weave   tuft holds
pickup off                 0.2545          33.3 %             6 %
pickup on  (1 frame/pt)    0.3176          66.5 %            51 %
pickup on  (1 frame/12)    0.2678          25.8 %            68 %
```

And the carrying from E5 survives — blue along the orange trail past the
crossing, two runs agreeing to three decimals:

```
x            265     300     340     380     420
pickup off  1.019   0       0       0       0
pickup on   1.290   0.0208  0.0190  0.0173  0.0162
```

**What it proves.** The sheet fills again — a third to two thirds of painted
cells now bury the weave, against **none at all** before the fix — and the tuft
stays between half and two thirds full instead of five times over. The brush
still carries colour the length of a stroke.

**What it does NOT prove.** Frame-independence is much better but not exact:
0.318 against 0.268 across a twelvefold change in frame chunking, about 16 %.
Some of that is the tuft solve and the deposit itself behaving differently when
a stroke is chunked, not the pickup. Not chased further.

**What it does NOT explain.** Still nothing on why Bartford sees slow strokes
read as brush-like and fast ones chatter. Both wrong fixes and the right one
leave that unaccounted for. Do not invent a mechanism for it.

**A harness lesson, which cost most of the time here.** The pickup-off baseline
read 0.2545 in one page load and 0.9299 in another, both with oil asserted and
both internally reproducible to four decimals. Something else differs across
loads and has not been identified. Compare rows WITHIN one load only, assert
every precondition inside the harness, and run every condition twice — three
readings in this session were nonsense until that was done.

---

### E9 — docs/17 executed; the stroke pulls the layer beneath it (2026-08-27)

**Purpose.** Run `docs/17-pickup-rework.md` end to end and record what the three
parts actually bought, plus what is still wrong. Written at the artist's request
before he stepped away: *"take note of what you think is wrong ... so we can
pick up where we left off."*

**Method.** The asserting bench, `src/bench/pickup-bench.ts` (`55a57f0`), not
console probes. Oil / Flat Hog / **cotton duck** verified against `fluid.params`
(`yieldStress === 0.34`, `hasCurrent === false`) — the run throws if the engine
is not what the harness claims. Blue band, charged yellow crossing at pressure
0.7, tilt 35°. Removal is over **contacted cells only**. Every condition twice.

**Raw result.**

| condition | contacted blue lifted | blue in the trail, 10 cells past |
|---|---|---|
| step 0 — the build the artist tested | 24.5 % | 1.6 % |
| Part A alone (`8e4b0d9`) | 57.5 % | 0.8 % |
| A + B + C (`fe57146`) | 33–37 % | 44–50 % |

Step 0 reproduces the artist's null result: `SURFACE_EXCHANGE` 0 vs 0.35 are
visually indistinguishable, so the 29.8 % figure that closed the last session
was real and invisible, exactly as the baton feared.

**What it proves.** The three dilutions named in docs/17 were all real and all
load-bearing. Part A alone lifts more than twice as much blue but shows *less*
of it in the trail — because the third dilution (`brushMix`, the whole-tuft
average) was still throwing the lift away at the scalar bottleneck. Only with C
does the lift reach the canvas. Artist confirmed by eye: yellow enters pure,
crosses, comes out green, carries the green forward, and the blue band is
visibly thinned where crossed. **The mechanism works.**

---

**Three things are still wrong. None is tuned; all are handed forward.**

**(1) The carried colour never fades.** Target was ≥ 10 % blue decaying over
~20 cells. Measured: 44–50 % and **flat** out past 10 cells. A real brush spends
what it picks up within a few inches. This one does not.

**[UNVERIFIED] hypothesis, and the discriminator that settles it.** The trail
number is a *ratio*, and a ratio rises either because the blue rose or because
the yellow fell. `withdraw` now draws surface-first: for the cells right after a
crossing the brush may be laying mostly *film*, and the film is mostly blue —
which would produce ~45 % without any extra blue being lifted at all, and would
stay flat for as long as the film keeps being topped up by the cells still being
crossed. It also fits the shape of the table: removal went **down** from Part A
(57.5 % → 35 %) while the trail went **up** 50×. That is not more blue arriving;
that is less yellow arriving.

To settle it, measure two things per cell past the crossing, not one:
the film's own blue fraction, and the **absolute** blue and yellow laid. If the
film decays but the trail ratio does not, the fault is downstream in `brushMix`.
If the absolute yellow is what collapsed, the surface-first rule in `withdraw`
is starving the body of the tuft and needs a blend, not a priority.

**(2) It almost certainly picks up far too much.** The artist's carry verdict of
**"3 % feels correct"** (2026-08-26, on record in HANDOFF Part B) still stands as
the only accepted number, and 45 % is fifteen times past it. He has since said
the lower layers are *"behaving far better"*, so his eye may well have moved —
but nobody has asked. **Do not tune this to a number.** Show him a crossing and
take the verdict. `SURFACE_SHARE` (`reservoir.ts:105`, 0.08) is the dial if he
wants it weaker; it interacts with (1) and should be judged after (1) is
understood, not before.

**(3) The brush ends a scrub holding 100.7 %, against a 100.5 % guard.** Six
no-recharge scrubs, no recharge, and it finishes with more than it started.
Small, but paint is being created, and this class of fault grows. **[UNVERIFIED]**
first place to look: the surface film's capacity is `SURFACE_SHARE` × the tuft
capacity but may not be *subtracted* from the rooms' capacity, so
credit-to-film + overflow-to-rooms can together exceed 100 %. Check
`Reservoir.surfaceCapacity` against `totals()`. This is a bug, not a dial.

**A harness limit that bounds everything above.** Numbers spread ~10 % run to
run because the GPU pickup tally returns asynchronously and a frame's credit can
land a frame late. The bench cannot resolve a difference smaller than that.
Do not read meaning into a 5 % move.

---

### E10 — the brush was eating its own stroke, and the film had a monopoly (2026-08-27)

**Purpose.** Run the `docs/18` order of attack: measure whether pickup is what
stops oil building body, and fix it if so.

**Method.** `stacking()` added to `src/bench/pickup-bench.ts`. Four passes laid
on the SAME line with the brush RECHARGED before each (both deliberate — offset
passes measure coverage, and a tuft running dry explains a flat curve for free).
Film summed over a FIXED corridor. Oil / Flat Hog / cotton duck asserted from
`fluid.params`. Every condition twice; all pairs below agreed to three decimals.

**[TRAP] Mass is a SUM over a fixed corridor, never a mean over wetted cells.**
The first version of this bench averaged over cells with film, and read a
saturating curve — while peak film climbed dead linearly through the very same
run (0.0363, 0.0418, 0.0472, 0.0529). Each pass also wets more thin edge cells,
and those drag the average down while the pile is still growing. A mean over a
changing denominator is not a measure of how much paint is there. E10's earlier
stacking numbers in `HANDOFF.md` Part B were means, so this supersedes them.

#### The discriminator — docs/18 §2, confirmed outright

| | pass 1 | 2 | 3 | 4 | last gain / first |
|---|---|---|---|---|---|
| pickup OFF (`upRate` 0) | 47.2 | 94.6 | 142.1 | 189.6 | **1.007** |
| pickup ON, as shipped | 24.2 | 31.6 | 36.8 | 41.0 | **0.174** |

With pickup shut, oil builds **dead linearly** and reaches a peak film of 0.268
against a canvas tooth of 0.30 — it buries the weave, which is what the artist
has asked for since 2026-08-24. With pickup on, the FIRST pass already loses
half its paint, and by pass four the peak is 0.053. The exchange had no notion
of LIKE paint, so a loaded brush restating its own colour lifted what it was
laying in the same invocation. **Nothing was wrong with the deposit.**

#### Four changes, in the order they were found

**1. `Reservoir.totals()` was reporting a ratio of two different things.** The
surface film's contents were counted in `water`/`pigment` while `capacity`
stayed the sum of the rooms alone, so any brush carrying pickings read over
100 % by construction. That is docs/16 E9 fault 3, and **no paint was ever being
created** — the ledger was wrong, not the physics. Holding now reads 92.6 % peak
across six scrubs and the guard has kept its teeth (`pickUp` clamps the film at
its own capacity, but the no-room-anywhere branch can still overfill the rooms).

**2. The exchange is scaled by how UNLIKE the two paints are** (`deposit.wgsl`),
total-variation distance between the cell's normalised composition and the
brush's. Same on same collapses to pure addition, which is what stacking paint
IS; a crossing keeps the full exchange docs/17 was built for.

**3. [MEASURED] The surface film was a tuft-wide pool offered whole to every
segment.** `surfacePig` is one 8-vector for the whole brush, but `withdraw` runs
once per hair segment and a flat hog puts ~150 segments down per frame. The film
won every contest. Probed along a crossing, what LEFT the brush went to **94 %
blue by ten cells past the band and was still 94 % blue eighty cells later**,
while the tuft's own load read **100 % yellow the whole way**. It also drove a
self-sustaining loop: the brush laid blue below the band, its own wide footprint
re-lifted that blue into the film, and it laid it again. A pool shared by the
tuft must be rationed by each segment's share of it. Within its ration the film
still goes first — that is Part B's real claim.

**This is docs/16 E9 faults 1 and 2, and they were one fault.**

**4. Pickings work INWARD, through `wick`.** Even rationed, the blue leaving the
brush still CLIMBED with distance (14.6 % at ten cells to 29.9 % at eighty) on
bare canvas with no blue left to take. The film was a sealed compartment:
`pickUp` credited it, `withdraw` spent it, and nothing ever diluted it into the
tuft's own colour. A real bristle does not hold its pickings on the outside for
ever. The bleed is conservative and rides the existing wick rate.

#### `SURFACE_BLEED` — a swept decision, not a card

No source gives this number, so it was set by what the paint does. Standard
crossing, two runs per row, blue in the trail at 10/20/30/40/50 cells:

| bleed | lifted | 10 | 20 | 30 | 40 | 50 | |
|---|---|---|---|---|---|---|---|
| 1.0 | 39 % | 2.0 | 1.1 | 1.1 | 1.1 | 1.1 | carry gone — docs/17's original fault |
| **0.1** | **33.5 %** | **12.1** | **8.1** | **4.5** | **2.6** | **1.9** | **chosen** |
| 0.03 | 30.3 % | 23.5 | 18.7 | 14.1 | 10.8 | 8.9 | |
| 0.01 | 29.4 % | 29.1 | 25.5 | 21.4 | 18.2 | 16.2 | |
| 0 | 29.1 % | 32.6 | 30.2 | 26.9 | 24.3 | 22.5 | never recovers |

0.1 is the only row where the stroke turns green and then **recovers to its own
colour**, which is docs/17's stated acceptance and the behaviour the artist has
never had. It is the dial for how LONG a picked-up colour lasts — smaller
carries it further, larger spends it sooner — and it is a different question
from how MUCH is picked up (`SURFACE_SHARE`, and the material's `upRate`).

#### Two wrong turns, both measured, both recorded

**Comparing the cell against the brush's LOAD instead of what it lays.** Tried
because the laid mix was contaminated by the film. It fed back the other way:
the load stayed pure yellow, so a cell the brush had just filled with its own
picked-up blue read as maximally unlike and got lifted at full rate — recycling
blue indefinitely. Lift fell to 12.5 % and the trail sat flat at 93 %. The
plumbing that carried the load to the shader was reverted with it. **The correct
comparand is what the brush is DEPOSITING**, because the question an exchange
asks is "would trading change this cell?"

**Bleeding the film at the full wick rate (0.5).** Drained it almost instantly;
the trail fell to 1.1 %, which is docs/17 step 0 restored. Pickings on the
outside of a bristle work in far more slowly than paint travels along one.

#### [TRAP] A dial set on a dynamically imported module does not reach the app

The first `SURFACE_BLEED` sweep returned **identical numbers for every value,
including 0 vs 1.0** — which is impossible if the dial were connected. It was
not: `await import('/src/brush/reservoir.ts')` from the console returns a
DIFFERENT module instance than the running app's
(`stroke.brush.reservoir.constructor === R` is `false`). Every row silently ran
at the default. Set bench dials on the LIVE object's own constructor, and treat
a flat sweep as a broken instrument before treating it as a finding. That is
trap number seven; the other six are in `HANDOFF.md` Part B.

#### Where it stands — all four docs/17 acceptance tests, plus body

| | before | after |
|---|---|---|
| stacking, last gain / first | 0.174 | **0.897** |
| four-pass peak film (tooth is 0.30) | 0.053 | **0.263** |
| contacted blue lifted | 37.3 % | 33.3 % |
| trail blue, 10 → 50 cells | 44.4 flat | **12.4 → 1.8, decaying** |
| holding peak, six scrubs | 100.7 % (mis-measured) | **92.6 %, passes** |
| watercolour control pigment | 32.9182 | **32.9182, unchanged** |

Confirmed by eye on the rendered crossing: yellow enters pure, turns green
through the band, and **recovers to yellow below it**, with the band visibly
thinned where crossed.

**What this does NOT settle.** Removal is 33 %, still under docs/17's
`[UNVERIFIED]` 60 % target — and that target was never artist-ratified. How
strong pickup should FEEL remains the artist's call and his only accepted number
is still "3 % feels correct" (2026-08-26). Do not tune it to a number; show him
a crossing. `SURFACE_BLEED` and `SURFACE_SHARE` are the two dials, and they
answer different questions.
