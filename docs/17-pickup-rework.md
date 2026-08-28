# 17 — Why a stroke cannot pull the layer beneath it, and the rework that would let it

Written 2026-08-27 for the next implementing session. Everything here is either
measured on the live engine (each condition run twice, agreeing to every digit)
or read from the source with file:line anchors. Nothing below is committed code;
this is the review and the plan.

**The artist's standard, verbatim (2026-08-25):** "Paint strokes need to pick
each other up, mix each other around, blend on the canvas, leave ridges behind -
all that fun stuff. The orange paint simply lays on top, it doesn't pick up
bottom layers almost at all. While there should be some resistance to that, it
shouldn't be a ton."

**Current state:** `SURFACE_EXCHANGE = 0.35` (`src/brush/reservoir.ts:44`,
commit `1643d2a`) measures 29.8 % of the lower layer lifted where the brush
touches — and the artist reports **no visible change**. Both are true, and this
document is the explanation: what is lifted is destroyed as a *visible* thing by
three dilutions in series. Raising the floor further cannot fix the second and
third.

---

## 1. The pipeline as it stands — three dilutions in series

A loaded yellow Flat Hog crosses a wet blue Oil band. Follow the blue.

### Dilution 1 — the take is a product of three fractions

`deposit.wgsl:420`:

```
r  = clamp(C.upRate * C.brushTake * cover * loose, 0.0, 0.9)   // per cell travelled
up = 1 - (1 - r)^dist                                          // compounded over travel
```

`C.upRate` is the material's row (oil **0.42**, `media/library.ts`).
`C.brushTake` is `reservoir.upRate × roomFraction()` (`stroke.ts:254`) — the
Flat Hog's **0.34** (`brush/library.ts`) times the room floor **0.35**
(`reservoir.ts:44`).

So per cell travelled: 0.42 × 0.34 × 0.35 × cover ≈ **0.05**. A crossing holds
the brush over any one blue cell for roughly 2–4 cells of travel, so each
contacted cell loses **10–30 %** of its suspended blue. Measured: 29.8 % on a
heavy band, 10.7 % on a light one.

Three legitimate-looking fractions multiplied together produce a number none of
them intended. Each is defensible alone; the product is why pickup has been
weak on every branch of this project.

### Dilution 2 — the credit is spread across the whole tuft

`reservoir.ts:367` `pickUp()` spreads what was lifted across every reservoir
cell in proportion to room. A charged hog holds ~317 units of pigment; the
crossing lifts ~2.4. The brush comes out **0.5–0.9 % blue**. The E5 trail the
artist accepted as feeling right was ~3 %; this is a fifth of that, flat.

### Dilution 3 — the laid colour is the whole-tuft average (the scalar bottleneck)

This is the one nobody had written down, and it is why even a perfect fix to
dilutions 1–2 would not show up on the sheet:

- `withdraw()` (`reservoir.ts:248`) hands each hair a per-slot vector, but the
  footprint segment stores only a **scalar** pigment amount
  (`brush.ts` ~:404, `pig` summed over slots).
- The deposit shader re-splits that scalar by the **global mix weights**:
  `glo += mix[0] * pig` (`deposit.wgsl` deposit block), and those weights are
  `reservoir.composition()` — the average of the *entire tuft*
  (`stroke.ts:237` `get brushMix`).

So even if one hair withdrew pure blue, the sheet receives it re-coloured as
99 %-yellow. Per-hair colour identity is destroyed at the segment boundary.
**Any fix that leaves this in place is invisible by construction.**

### Also verified, so nobody re-checks them

- Bodied Oil stays **100 % suspended** — `wet3`/`wet4` (settled) hold zero even
  after 300 idle steps, and the deposit pass does not bind them anyway. Pickup
  lifts the right field.
- The credit path works: `onPickUp` → `stroke.pickUp` → `reservoir.pickUp` is
  wired (`main.ts:349`). Note `CanvasEngine.onPickUp` is a **setter with no
  getter** — reading it returns undefined and proves nothing.
- Overfill does not recur: six scrubs through wet paint with no recharge,
  holding peaked at 97.5 / 98.1 / 98.9 % at floors 0 / 0.2 / 0.5. The 158 % /
  516 % disaster belonged to the per-frame charging bug fixed in `5cf482c`.

---

## 2. The rework, in three parts

Ordered so each part is testable alone. Watercolour must come out
byte-identical everywhere: every change below is gated on `workableBody`, which
is `select(0.0, clamp(w5.y,0,1), P.yieldStress > 0.0)` (`deposit.wgsl:380`) and
therefore already 0 for every water medium.

### Part A — treat contact as an exchange, not room-gated intake

**Where:** `deposit.wgsl:420` (and `stroke.ts` must send the ungated grab —
`reservoir.upRate` alone — alongside `brushTake`; Ctl lane 10 was used for
exactly this once already and is spare again).

**The idea:** the room gate exists to stop the brush over-filling. But a brush
laying paint into a cell while dragging through it is *swapping*, and a swap
needs no room. For fully workable body paint, bypass the room term and drop one
factor from the product:

```
r_intake   = clamp(C.upRate * C.brushTake * cover * loose, 0.0, 0.9)   // as today
r_exchange = clamp(C.upRate * cover * loose * workableBody, 0.0, 0.9)  // no room, no brush factor
r          = max(r_intake, r_exchange)
```

At workableBody 1 that is 0.42 per cell travelled → **~66 % of the contacted
blue over a 2-cell contact**, which is the order that visibly breaks a band.

**[UNVERIFIED]** whether dropping the brush's own 0.34 as well as the room term
is too much. The fallback formulation keeps it:
`r_exchange = C.upRate * s.upRate-per-segment * cover * loose * workableBody`
≈ 0.14/cell → ~35 % over a crossing. Bench both; the artist's "some resistance,
not a ton" decides.

**Safety, measured and to re-measure:** the six-scrub holding test was run up
to floor 0.5 (r ≈ 0.07/cell) and never exceeded 100 %. At r ≈ 0.42/cell it is
**untested**. Re-run it first thing. If holding exceeds 100 %, cap the exchange
per cell at the volume the brush deposited into that same cell this frame (both
are known inside the same shader invocation) — a true swap can only trade what
it gave, and that cap needs no new constant. Do not cap on the `pickUp` side:
refused paint is paint destroyed (`reservoir.ts`, stated at `roomFraction`).

### Part B — a surface layer on the reservoir, so lifted paint stays concentrated

**Where:** `reservoir.ts`.

**The idea:** what a bristle scrapes up rides on its *surface*; it does not
soak evenly through the tuft. Add a small dirty-layer store — `surfaceWater`
plus `surfacePig[8]`, one set for the whole tuft — with capacity a small
fraction of the tuft's (**[UNVERIFIED]** start ~8 %, it is a feel dial):

- `pickUp()` credits the surface layer first; overflow falls through to the
  existing room-proportional spread. (This also shrinks the overfill surface:
  the tuft body is untouched until the surface spills.)
- `withdraw()` drains the surface first: after computing the packet as today,
  substitute surface holdings into `out` up to the surface's share, before
  drawing the cell's own stores. Fresh pickings come back out within the next
  few tens of cells and then fade — which is "drag colour through colour".
- `charge()` and `rinse()` clear it. `totals()` includes it, so `roomFraction`
  and the gauges stay honest. The async credit arriving a frame late needs no
  special handling — it is a deposit into a store like any other.

### Part C — the laid colour must be the colour of what was withdrawn (the bottleneck fix)

**Where:** `stroke.ts` + `brush.ts` + the existing mix plumbing. **No shader
change.**

**The idea:** stop feeding the shader the whole-tuft average. Accumulate the
per-slot sum of everything `withdraw()` handed out *this frame* (the `draw`
vectors are already in hand at `brush.ts` ~:404 — add them into a
`laidThisFrame[8]` on the brush), and have `get brushMix` (`stroke.ts:237`)
return the normalised `laidThisFrame` whenever its total is non-trivial,
falling back to `composition()` for the first touch of a stroke.

This is not a hack; it is the honest statement: *the colour of the mark is the
colour of the paint that left the brush.* With Part B draining blue into the
withdrawals right after a crossing, the mix weights go visibly green exactly
where the hand carries the paint, and fade as the surface layer empties.

**Trap:** the deposit is chunked (`fluid.ts` ~:686, MAX_SEGS) and the mix buffer
is written once per chunk submission. `laidThisFrame` is per-frame, coarser
than per-chunk — acceptable, and still infinitely finer than per-tuft-lifetime.

---

## 3. Bench and acceptance — build the instrument before touching the dials

The baton's stop sign stands: **six** measurements went wrong in one session
(list at the head of Part B in `HANDOFF.md`). Build the bench first.

A command beside `tools/brush-bench.mjs` that:

1. **Asserts its setup** — oil + flat-hog + cotton-duck, checked against
   `fluid.params` (`yieldStress === 0.34`, `hasCurrent === false`), not against
   UI labels. A run that is not what it claims fails loudly.
2. Lays the standard crossing (blue band, charged yellow crossing at pressure
   0.7) and reports, per condition, **with a PNG beside every number**:
   - % of suspended blue + film removed, **contacted cells only** (a region
     measure understates 20×);
   - trail composition vs distance past the crossing (blue share per 10 cells);
   - brush holding series across six no-recharge scrubs (must never exceed
     100 %);
   - watercolour control: identical stroke, `yieldStress 0`, must be
     byte-identical to the pre-change build.

**Step 0, before any code:** render the crossing at `SURFACE_EXCHANGE` 0 vs
0.35 side by side. Expected: indistinguishable — confirming the artist's null
result was real and not a stale page, and giving the "before" images the whole
rework is judged against.

**Acceptance targets** (**[UNVERIFIED]** — bench numbers to converge on; the
artist's eye is the actual test):

- ≥ 60 % of contacted suspended blue + film removed at pressure 0.7, one pass —
  the band visibly breaks where crossed.
- Trail ≥ 10 % blue in the first ~20 cells past the crossing, decaying — the
  stroke turns green, then recovers to yellow.
- Untouched blue does not move. Holding never exceeds 100 %. Watercolour
  byte-identical.

## 4. The dials, in one place

| dial | value today | where |
|---|---|---|
| material upRate (oil) | 0.42 | `media/library.ts` |
| brush upRate (Flat Hog) | 0.34 | `brush/library.ts` |
| room floor `SURFACE_EXCHANGE` | 0.35 | `reservoir.ts:44` |
| per-frame lift ceiling | 0.9 | `deposit.wgsl:420` |
| adhesion floor `teflonMin` (oil) | 0.18, released by wetness | `media/library.ts`, `deposit.wgsl:376` |
| surface-layer capacity (Part B) | — new, start ~8 % | `reservoir.ts` |

The product of the first three is the whole story of dilution 1. If Part A
lands, `SURFACE_EXCHANGE` stops being the load-bearing number and can likely
return to a small value or go entirely; retire it deliberately, not by leaving
it to confuse the next reader.
