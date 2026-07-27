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

**Still open:** water is created in the flux group — 60 units on a blank sheet over
400 steps, ~190 % on a painted one. Now deterministic and bounded, which makes it a
tractable next step rather than a ghost hunt. The next move is to dump `flux` itself
(synced) immediately after `flux_compute` on a blank sheet and find the entries that
are not zero.

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
