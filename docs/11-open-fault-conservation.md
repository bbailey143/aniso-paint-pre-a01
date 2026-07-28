# Round 8 — "clear sheet" had stopped clearing, and it took the watercolour with it

**Read this first. Rounds 7 and 6 follow.**

Bartford's report was *"it really broke wet watercolour painting"*. It had, and the
cause is one line in a shader nobody was looking at.

## The fault

`clear()` did **nothing**. Not "cleared partially" — nothing at all:

| | water | pigment |
|---|---|---|
| dirty sheet | 195.0820 | 325.1366 |
| after `clear()` | **195.0820** | **325.1366** |
| second trial | identical | identical |

So every wipe left the previous painting in the buffers and the next one went on
top of it. Two strokes measured 99.67 → 195.08 water, 166.12 → 325.14 pigment. The
sheet only ever got wetter and dirtier, which is precisely what watercolour that has
"broken" looks like from the outside.

## The cause — `layout: 'auto'`, for the third time

The fine ink band arrived at 2048 while the fluid stays at 512, so the ink variant of
the zero-fill shader was built by string-replacing `let n = i32(P.grid);` with
`textureDimensions(dst)`. That left `Params` **declared but never statically used**.

`layout: 'auto'` drops a binding the shader does not use. Binding it anyway is a
validation error, caught on the wire:

```
In entries[0], binding index 0 not present in the bind group layout.
Expected layout: [{ binding: 1, ... RGBA16Float ... }]
```

An invalid bind group invalidates the encoder, and **every wet zero-fill shared that
one encoder with the ink ones**. Two ink dispatches took eleven wet textures down
with them, silently, with no console error in the app.

This is the same trap that made `reduce_final` return zeros. Both times the shape was
identical: a uniform left declared after the code that read it was edited away.

## The fix

Not a special case for the ink variant — the trap is removed. `zero_fill.wgsl` no
longer takes `Params` at all; the extent a clear should cover is a property of the
texture being cleared, so it asks the texture. One binding, one layout, both
resolutions, nothing left for `layout: 'auto'` to drop. The ink variant now differs
by storage format alone.

Verified, twice: no validation error, and water · pigment · ink all read exactly
`0.000000` after a wipe.

**A sweep of all 22 shaders for declared-but-unused bindings now comes back clean.**
Run it whenever a shader is built by string substitution.

## Two more things found in the same review

**The ink total had been folded into `pigment`, and that blinds invariant 1.**
The two are not commensurable: ink is summed over 2048² cells and its amount is a
concentration, so one ballpoint line reads **2871** against a whole watercolour
wash's **159**. Merged, the conservation meter jumps eighteenfold the moment you
pick up a pen, and a five-percent leak in the wet band disappears inside the
rounding of the larger number. Ink now has its own lane (`inkPigment`) and its own
row in the readout. Nothing moves between the grids, so the two ledgers are
independent and each holds on its own — when charcoal and pastel arrive they *will*
cross, and that bridge needs its own test, at which point these must be checked as a
sum.

**The idle GPU load was the ink reducer, and it is now measured.** The ink band has
no physics: nothing moves in it between deposits, so its total cannot change unless a
dry tool wrote there. Reducing four million texels every frame to re-derive an
unchanged number cost:

| | ms per idle frame |
|---|---|
| reduce every frame | 16.669 · 16.062 |
| reduce only when the ink band changed | **5.879 · 5.652** |

Two trials each. That is 10.5 ms a frame given back — on its own, the difference
between fitting a 60 Hz budget and not.

## What was checked and found NOT broken

Measured twice each, on the fixed base:

- **Wet conservation.** One stroke, 300 hands-off frames: pigment drift 0.000000 and
  −0.000031. Water holds.
- **The drying handoff.** 159.0177 laid → wet 158.1811 / dry 0.8366 → wet 0.0002 /
  dry 159.0175. Total **exactly 159.0177 at every mark**.
- **The water charge.** 0 → 165.51 pigment · 99.30 water; 0.5 → 79.51 · 127.21;
  1.0 → **0 pigment** · 165.51 water. A clean-water brush is clean.
- **Ballpoint under a watercolour glaze.** See `09-acceptance.md`.

## Not a fault, but worth knowing

Two identical strokes do **not** lay identical paint — they alternate, exactly, in a
period of two (99.3039 / 95.4106 / 99.3039 / 95.4106 …). That is `Brush.end()`
calling `spine.recover(0.5)`, which relaxes the tuft's *plastic memory* halfway
rather than fully, so a stroke starts from the splay the previous one left. It is
modelled behaviour (`spine.ts`: "it remembers splay through a stroke and recovers
slowly"), reproducible, and independent of frame count — padding idle frames between
strokes changes nothing. Flagged because a 4 % stroke-to-stroke swing will confuse
any future measurement that assumes strokes repeat.

---

# P6 restored on the new base — the handoff was never the problem either

**Round 7. Then the round-6 section below it.**

P6 (drying handoff, re-wet, glazing) is re-applied on top of the fixed gauge, and
`handoffEnabled` is back **ON**. Its blocking finding — *"the handoff CREATES
pigment, 52–94 %, reproducibly"* — **does not reproduce.** Measured through the
two-stage gauge:

| test | total pigment | wet band | dry band |
|---|---|---|---|
| stroke laid | 124.142 | 124.142 | 0 |
| dried to zero wet cells | **124.142** | 0.0008 | 124.141 |
| clean water laid on top | **124.142** | 5.027 | 119.115 |
| +180 frames | **124.142** | 5.028 | 119.114 |

Exact through the whole wet → dry → re-wet cycle. A second run held 119.3877 flat
across four drying marks. That is the **third of four** confident diagnoses in this
hunt to die on re-test; the handoff shaders were correct as written.

**Glazing works, and it is the P6 headline.** A yellow wash dried to `rgb(223,204,0)`;
blue laid over the *dry* layer renders `rgb(0,64,58)` — a deep green, through
layered Kubelka-Munk over dried paint, not RGB blending. Totals stayed exactly
additive (121.233 + 121.242 = 242.475).

## Two findings that stay open

**1. Re-wetting is far too weak. `[MEASURED]`** Only ~4 % of a dried wash comes back.
The cause is located, not guessed: `rewet.wgsl` scales its rate by standing film
`h_f / REF_DEPTH`, and the paper drinks the film to zero within about twenty frames
(measured: film `9.9e-4 → 2.4e-9 → 1.4e-20 → 4.3e-35`, while saturation `s` holds at
71.63). So the water is all *in* the paper, where re-wetting cannot see it. The
pigment is in the right place — 98.8 % sits in the re-wettable `dry1` layer, not the
baked `dry2` — so this is a gate problem, not a storage one. The obvious move is to
let `s` drive re-wetting as well as `h_f`, but no card supplies that coupling, so it
is **not** invented here.

**2. An intermittent garbage reading in the WATER lanes. `[OPEN]`** With evaporation
on, one run reported `saturation = 3.555e16` and `film = 1.022e-36`, frozen across
three samples 60 frames apart, while the pigment lanes stayed perfect. A direct dump
of `wet5` on a later run summed `s = 1.4823` — clean — and a stage-1-vs-stage-2 A/B
agreed to 1e-9 with no partial above 1e6. **It has not reproduced on demand, so it
is not diagnosed and no story is offered.** Consequence: pigment conservation is
established, **water conservation with evaporation on is not**. Do not quote a water
figure until this is characterised.

---

# CLOSED — the engine conserves. Round 5's diagnosis is RETRACTED.

**Round 6 is the one to read. The rest is the trail, kept because the wrong turns
are the useful part.**

## What is true, and reproduced

Two-stage GPU reduction is wired in (`reduce_final.wgsl`), so a reading now crosses
to the host as **64 bytes** instead of ~53 KB. Measured through it:

| test | result |
|---|---|
| blank sheet, twice | **0.000000 water · 0.000000 pigment · 0 wet cells** |
| one stroke, 200 hands-off frames, ×2 runs | **0.0000 % drift**, water and pigment |
| one stroke, 1000 hands-off frames | water **−1.6e-5** (−0.00002 %) · pigment **+4.6e-5** (+0.000034 %) |

The 1000-frame residuals move in steps of exactly 1.526e-5 — **one ULP of an f32
holding 134.6**. That is the reduction's own summation rounding, not the physics.
Meanwhile wet cells go 2272 → 6346: the water really is spreading the whole time,
and the total holds while it does. **Invariant 1 passes.**

## The retraction

Round 5 concluded that the CPU copy-and-map path corrupts, planting `2.0` at
x = 241 of every row, and wrote that up as solved on the strength of one sitting.
**It does not reproduce.** Re-tested today:

| test | trials | entries equal to 2.0 |
|---|---|---|
| fresh device, fresh buffer, clear → copy → map | 6 | **0** |
| app's own device, fresh buffer | 4 | **0** |
| the engine's real flux ledger via `dumpFlux()` | 4 | **0** |
| old 53 KB readback vs new 64-byte path, same partials, same frame | 4 | **0**, and the two paths agree to ~1e-8 relative |

So the corruption story is withdrawn. It was written up after a single session and
broke [the branch's own rule](../CLAUDE.md): *run it twice before believing it.*
That rule exists because this hunt has now produced **four** confident diagnoses of
one symptom, and this is the second to die on re-test.

## So what actually fixed it?

Honest answer: **I don't know which of the two real fixes closed it**, and the
symptom is gone, so there is nothing left to bisect against. The candidates, both
committed and both independently justified:

1. **The flux ledger is cleared every frame** (`COPY_DST` + `clearBuffer`). It was
   uninitialised, and two passes read it. That alone seeded exactly 1.0 into cells
   on a blank sheet.
2. **The wet band moved to `rgba32float`** (D6 amended). At half-float the sheet
   lost 6.5 % of its pigment per 200 frames to mantissa rounding.

Either could account for growth on an empty sheet. What is measurable now is that
there is none.

## What was genuinely wrong, and stays fixed

The *instrument* was broken four separate ways, and every one of them produced a
confident wrong answer before it was caught:

1. `readings` lags unboundedly — it skips any frame with a map in flight. Fine for
   a HUD, useless for measurement. Use `sampleGauges()`.
2. The sampler shared its partials buffer with the per-frame readout, so a reading
   could blend two frames. It has its own buffer now, plus `pauseReadback`.
3. `dump()` is only valid after a GPU sync.
4. `reduce_final` itself shipped with two silent bugs, and the second is worth
   remembering: it declared a `Params` uniform it never read. Under `layout: 'auto'`
   an unused binding is **dropped from the generated layout**, so binding it is a
   validation error, the pass is discarded, and the totals are simply never
   written — which reads back as a perfectly plausible row of zeros. That is what
   "returns all zeros" meant. (The other bug: `NQ` was 15 here and 13 in
   `reduce.wgsl`.)

### Next, in order

1. Re-run the P4/P5 conservation claims through the two-stage gauge and correct
   those commit messages where they overstate.
2. Restore the P6 stash (`git stash` entry `p6-wip`) — drying, re-wet, glazing —
   and verify it against the gauge that now tells the truth.
3. Confirm on a second machine before trusting any of this as machine-independent.

---

# OPEN FAULT — conservation, and the instrument that hid it

**Status: open. P6 is not done. Read this before trusting any conservation number
in this repo, including the ones in the P4 and P5 commit messages.**

## Round 2 — the instrument, then the localisation

**Progress: the corruption is gone, a bounded fault remains.**

Three things had to be fixed before any measurement meant anything. Each one had
produced a confident, wrong conclusion first:

1. **`readings` lags** (see below). Fixed with `sampleGauges()`.
2. **The sampler shared its partials buffer with the per-frame readout**, so a
   measurement could overwrite the partials another read was still copying and
   return a blend of two frames. The sampler now has its own buffer, and
   `pauseReadback` stops the per-frame path during measurement.
3. **`dump()` is only valid after a GPU sync.** Dumping straight after `clear()`
   showed scattered cells holding `M = 2.0` — a mask value nothing writes — always
   at local lane (1,4) of an 8×8 workgroup. With a sync first, the same dump reads
   exactly zero. The texture was always fine; the readback was not.

With all three fixed, the bisect finally means something. Cumulative, blank sheet,
200 steps, nothing painted:

| passes enabled | water | pigment |
|---|---|---|
| none · vel · +relax · +outward | **0** | **0** |
| **+flux** | **66** | **14** |
| +transfer, +capillary, +dry | 58–87 | 18–36 |

**The flux group is where mass enters.** Everything upstream of it is exactly zero.

**Fix applied:** the flux ledger is now cleared *every frame* before anything reads
it, not just at `clear()`. `flux_compute` is supposed to write every cell, so this
should be redundant — it is not. That change alone:

- removed the overflows entirely (no more ~1e33 runs);
- took blank-sheet **pigment** creation to **0**;
- turned the remaining water fault from wildly nondeterministic into
  **repeatable**: +195 % / +190 % / +182 % over 600 hands-off steps.

## Round 3 — the seed event, caught

Stepping a blank sheet one frame at a time and sampling after each, the moment of
creation is now on record. Nothing had been painted; no deposit ran.

```
first dirty step: 43
one cell:  x = 242, y = 266
           M = 1     h_f = 1.313     s = 0.6875     u = v = 0
           g[8] = 0  d[8] = 0        h_f + s = 2.0000
```

**One cell receives exactly 2.0 units of water out of nothing.** It carries no
pigment, which rules out the deposit path entirely. The film/saturation split is
just capillary absorption acting on it after the fact.

### The position is the tell

Seed x-coordinates, over many runs and two different grid sizes:

| sim grid | seed x values |
|---|---|
| 512 | 239, 240, 240, 240, 241, 241, 241, 242, 242 |
| 384 | 114, 242, 242, 370 |

Every one satisfies **x ≡ ~114 (mod 128)**. y is uniformly random. 128 cells ×
16 bytes = **a 2048-byte stride**: the seed lands at a fixed offset inside a
repeating memory span, and that span does not scale with the grid dimension.

Frequency: **9 runs in 10** produce at least one seed within 60 steps. Always
exactly 2.0. Never accompanied by pigment.

### What that points at

A fixed offset in a repeating memory stride, a constant value, random in time and
in y, indifferent to grid size — that is the shape of **memory aliasing or a
driver-level fault**, not of the shallow-water maths. No pass computes 2.0, and the
same value showed up earlier as a phantom `M = 2.0` in unsynced reads.

`[UNVERIFIED — this is reasoning, not a finding]` The physics is likely innocent.
Do not rewrite the solver on the strength of it.

### Next experiments, in order

1. **Try the DX12 backend instead of Vulkan** (`--use-angle`/Dawn backend flag).
   The `main` bench listed exactly this as a cheap discriminator for its own
   nondeterminism and never ran it. If the seed disappears, it is the driver.
2. **Vary the texture usage flags** (`COPY_SRC`/`COPY_DST` change tiling on some
   drivers) and the format, and see whether the 2048-byte period moves.
3. **Test on a second GPU.** The whole history here is on one RX 570.
4. Only if all three come back clean: audit `flux_compute`'s write coverage with a
   sentinel pattern written before each frame and checked after.

## Round 4 — down to one pass, and the value comes from outside the physics

Four experiments, each reproducible:

**1. It is exactly one pass.** Cumulative bisect with the flux group split into its
three dispatches, blank sheet, 80 steps, 3 reps each:

| enabled | dirty |
|---|---|
| vel · +relax · +outward · +fluxCompute · **+fluxPig** | **0/3** |
| **+fluxWater** | **3/3** |

`flux_apply_water` is the only pass that exposes it. `flux_apply_pigment` reads the
same ledger with the same neighbour pattern and stays clean — because it multiplies
by concentration, which is zero on a blank sheet. It *cannot* reveal a bad ledger.
`flux_apply_water` adds the neighbour terms straight into `h_f`, so it does.

**2. The ledger really is corrupt.** Patch `h_new` to ignore the flux buffer
entirely: **0/5 dirty**. The texture read/write path is innocent.

**3. The value arrives with no water anywhere.** With that patch still in — so water
can never appear — the flux buffer *still* spontaneously acquires **2.0**, at
(241, 74), while total water on the sheet is exactly 0. So it is not the solver
amplifying anything; a constant is landing in memory the physics never wrote.

**4. The bare pattern does not reproduce it.** A standalone harness with no
aniso-paint code — allocate a storage buffer, `clearBuffer`, dispatch a shader that
writes `vec4(0)` to every cell with the same 8×8 groups and indexing, read back — is
clean **60/60**. A plain clear + readback is clean **40/40**. Whatever it is needs
the surrounding engine, not just this access pattern.

### Also ruled out

- **Backend.** This is Chrome/Dawn on Windows, which is **D3D12**; `main`'s bench was
  Rust/wgpu on **Vulkan**. Both show it. The "try DX12" experiment is therefore
  already answered, and a single driver is not the explanation.
- **Mixed storage access types.** The ledger is `read_write` in `flux_compute` and
  `read` in the two consumers, in one compute pass — a plausible hazard-tracking
  gap. Declaring all three `read_write` changed nothing: still **10/10 dirty**.
  Reverted.

### Next step, and it is now bounded

Grow the clean standalone harness toward the engine one element at a time — add the
wet0 ping-pong textures, then `update_velocities`, then relaxation, then the real
`flux_compute` — until it fires. The corrupting *interaction* is then isolated with
no physics in the way. That is a short, mechanical hunt, unlike everything before it.

## Where it stands

- Corruption and overflows: **gone** (per-frame flux clear).
- Blank-sheet pigment creation: **gone**.
- Water creation: **open**, localised to one pass, one buffer, one constant, and a
  fixed memory stride. Reproducible on demand.

---

## The headline

The conservation gauge used through P4 and P5 **lags by an unbounded number of
frames**, and the "0.0000 %" results reported in those commits were read from it.
They are not evidence. When the same scenarios are measured with a gauge that
reads the current state, the sheet **gains** water and pigment.

This is the failure the invariants exist to catch, and it went unnoticed because
the gauge — the one instrument trusted to catch every other leak — was itself the
leak. The bench on `main` wrote down the lesson in almost these words. It applied
here and was still missed.

## What the gauge did wrong

`FluidEngine.readings` is filled by an asynchronous readback that is skipped
whenever a previous map is still in flight. Under a tight stepping loop nearly
every frame is skipped, so the value can describe a state many frames — or an
entire earlier experiment — old. Sampling it as a *baseline* immediately after a
stroke reads low, and the later comparison then shows a gain that never happened.

An entire pass-by-pass bisect was run against this stale instrument and produced a
confident, completely wrong localisation.

**Fix (implemented, in the stash):** `sampleGauges()` — runs the reduction over the
current state, copies, and awaits the map. Anything interpreting conservation must
use it. `readings` is for the HUD only.

## What is actually wrong

With a trustworthy gauge, measured at the **P5 commit** (so this predates the P6
work):

| scenario | result |
|---|---|
| blank sheet, 200 steps, nothing painted | **gains ~26 water, ~2 pigment**, 1689 cells become wet |
| one stroke, 600 hands-off steps, evaporation off | water **+165 %**, pigment **+11 %** |
| identical repeat of the same run | water **+3.9e33 %**, pigment **+40 %** |

Character: reproducible in kind, **nondeterministic in magnitude**, and the seed
values are whole numbers (cells arriving at exactly 1.0). Runs sometimes overflow
to ~1e33. Per the bench's own discriminator, a value that is simply *there* rather
than ramping points at memory rather than at the solver — but some runs do ramp,
so both may be in play.

## Found and fixed along the way

- **The flux ledger was never zero-initialised.** `fluxBuf` is written by
  `flux_compute` and read by two passes after it; created with `STORAGE` only, it
  could never be cleared. On a blank sheet two cells picked up exactly 1.0 around
  frame three and the wet region spread from there. Now created with `COPY_DST`
  and cleared in `clear()`. This is a genuine bug and a genuine fix — it removed
  one seed, but **not** the fault above.
- **Pigment slots were reassigned per stroke.** A cell stores amounts; a
  per-document map says what those amounts are *made of*. Reassigning per mix
  silently repaints history — lay a blue wash, pick up yellow, and the blue
  re-renders as yellow. Now sticky per document, with a ninth pigment refused
  rather than evicting a slot that existing paint depends on.

## Ruled out

Checked pass by pass and eliminated: binding order in every fluid shader; pass
order; ping-pong parity; `clear()` (verified it zeroes — 229.59 → 0); the drying
handoff (it is exactly conservative when measured properly); evaporation
specifically (drying via `dryRate` alone shows the same gain). No WebGPU
validation errors are raised at any point.

`[NOTE]` Disabling a pass to bisect is **not** conservation-neutral: it removes
that pass's ping-pong flips and changes which buffer every later pass reads. Skip
results can only be compared for *character*, never as conservation numbers.

## What P6 built, and where it is

Written, compiling, and **stashed** (`git stash` entry `p6-wip`), not committed,
because it cannot be verified until the fault above is fixed:

- three-step drying handoff (wet → dry1 → dry2), split that way because WebGPU
  core allows only four storage textures per stage and the whole move writes ten;
- `rewet` — dried pigment returning to suspension, the reactivatability the
  evidence base flags as structurally unaddressed;
- multi-layer KM glazing in the composite (floor → dry1 → wet), so a wash laid
  over a dry one lets the lower colour through;
- drybrush: deposition gated on the paper's height field against how deep each
  hair reaches, so light or fast strokes break up on rough paper;
- a wet/dry pigment split in the gauge, which is what tells a real leak apart from
  paint merely changing band.

## The order of work

1. **Fix the conservation fault.** Everything else waits on it; a canvas that
   invents paint cannot be tuned, and no behavioural target can be judged.
2. Re-measure P4 and P5's claims with `sampleGauges()` and correct the record.
3. Only then restore the P6 stash and verify drying, re-wetting and glazing.
