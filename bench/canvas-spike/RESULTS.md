# Feasibility bench — first results

Run July 2026. Hardware: **Radeon RX 570** (Polaris, 4 GB), Vulkan, Windows.
Deliberately a modest card — roughly iPad-class, and well below the RTX 3080 Ti
laptop that A26's published timings came from. Numbers here are conservative
against the real target rather than flattering.

Scope: the wet band only. No brush, no render, no dry/bake pipeline. Bots paint
for 240 frames to build a live wet canvas, then lift off; every gauge is read
with hands off.

---

## Verdict: PASS

At the D7 budget — 1024² simultaneously wet cells — with C97's full 50
relaxation iterations:

| | ms |
|---|---|
| median frame | **12.43** |
| p95 | 12.99 |
| worst | 13.32 |
| budget | 16.70 |

About 25% headroom on a card that is not the target. The 54-number cell fits.

---

## 1. Relaxation is the entire performance story

| Pass | ms/frame | share |
|---|---|---|
| **relax_divergence** | **8.876** | **71.4 %** |
| flow_outward | 1.238 | 10.0 % |
| reduce (gauges) | 0.547 | 4.4 % |
| transfer_pigment | 0.369 | 3.0 % |
| flux_apply_pigment | 0.359 | 2.9 % |
| brush_bots | 0.315 | 2.5 % |
| flux_apply_water | 0.201 | 1.6 % |
| capillary_flow | 0.191 | 1.5 % |
| dry_tick | 0.153 | 1.2 % |
| flux_compute | 0.124 | 1.0 % |
| update_velocities | 0.121 | 1.0 % |

Everything that is not divergence relaxation costs 3.5 ms combined. Sweeping the
iteration count:

| relax iterations | frame (ms) | relax pass (ms) |
|---|---|---|
| 50 (C97 max) | 12.24 | 8.696 |
| 30 | 8.70 | 5.084 |
| 20 | 6.98 | 3.384 |
| 10 | 5.28 | 1.683 |
| 5 | 4.43 | 0.840 |

**Recommendation:** treat 50 as a ceiling, not a setting. C97 specifies *up to*
N = 50 with an early exit at divergence tolerance τ = 0.01, which this bench does
not yet implement — it always runs the full count. Adding the early exit is
likely worth more than any other optimisation available, and 20 iterations
already leaves nearly 10 ms of headroom for the brush, render, and dry passes
that are not in this bench.

---

## 2. The flux formulation is exactly conservative

Run identically at full 32-bit float, bots off, evaporation zero:

```
water   (film + paper)   1154.24 -> 1154.24   drift -0.0000 %
pigment (susp + settled)  519.41 ->  519.41   drift -0.0000 %
body     h_p              230.85 ->  230.85   drift +0.0000 %
```

§8.1 holds. Clamped edge fluxes, computed identically from both sides, neither
create nor destroy. This is the part that had to be right.

---

## 3. `[FOUND AND FIXED]` Capillary diffusion was asymmetric

The first run lost **12.3 % of its water in fifty frames** with nobody painting.

Cause: `capillary_flow` absorbed film into saturation and *then* diffused, so
each cell diffused using its own post-absorption value while its neighbours were
still reading pre-absorption values from the input texture. The exchange across
a cell pair stopped being equal and opposite. Fixed by computing both absorption
and diffusion against the input state and summing at the end. Water drift fell
from −12.3 % to −1.7 %.

The gauge caught this on the first run. Without it the leak would have looked
like "washes dry a bit fast", and would have been tuned around rather than fixed.

---

## 4. `[DECISION OWED]` Half-float alone loses ~2 % of the sheet per second

With the flux maths proven exact, all remaining drift is D8's storage precision.
At 1024², 360 frames hands-off, evaporation at zero:

| gauge | start | end | drift |
|---|---|---|---|
| water (film + paper) | 29871.42 | 26552.56 | **−11.11 %** |
| pigment (susp + settled) | 13403.62 | 12156.73 | **−9.30 %** |
| body `h_p` | 6223.80 | 6223.80 | +0.0000 % |

Per-slot pigment loss is uniform (−8.1 % to −10.4 %), so no slot is special —
this is systematic rounding, not a bug in one path.

Why body is immune: nothing moves `h_p` in this bench, so it is stored once and
never re-accumulated. That is the tell. The loss comes from repeated
read-modify-write, where increments smaller than the f16 ULP at the current
magnitude vanish. Values around 0.01 have a half-float ULP near 1e-5, and the
per-step fluxes are right at that scale.

**This conflicts with a ratified decision.** At roughly 1.8 %/second, a wash
loses itself in under a minute with the drying clock switched off. That is a
second, invisible drying mechanism — which is precisely what the single-drying-
clock rule (D3, §5) exists to forbid. The artist would set a five-minute open
time and watch the paint leave in fifty seconds.

Cost of the obvious fix: full f32 ran **1.6×** slower (0.43 → 0.69 ms at 256²),
and doubles the wet band's memory.

Options, none yet chosen:

1. **f32 for `h_f` and `s` only**, half-float for everything else. The two water
   fields are the ones that accumulate; pigment drifts because it is scaled *by*
   water. Cheapest targeted fix, and preserves most of D8's memory win.
2. **Compensated summation** in the flux apply passes (Kahan). Keeps f16
   storage, costs arithmetic rather than bandwidth.
3. **Periodic renormalisation** against a running f32 ledger. Hides the symptom;
   would mask a real leak later.
4. **Accept and re-tune the drying clock.** Rejected here — it makes drying
   depend on frame rate, which cross-cutting invariant 2 explicitly forbids.

Option 1 looks strongest and is cheap to test on this bench.

---

## 5. Memory: read/write separation doubles the wet band

| | 1024² | 1448² | 2048² |
|---|---|---|---|
| contract count (24 half-floats/cell) | 48 MB | 96 MB | 192 MB |
| **actually allocated** | **96 MB** | **192 MB** | **384 MB** |
| median frame @ relax 20 | 6.90 ms | 14.96 ms | 27.07 ms |

Every wet field needs read/write separation — a pass cannot read its neighbours
and overwrite itself in the same dispatch. §2.6's 113 MB figure is the logical
cell count; the working figure is twice that. Not a problem at D7, but the
number to plan against.

**Practical ceiling on this GPU: about 1448² wet at 20 relax iterations.** 2048²
is out of reach here, which matches the contract's framing of D7 as a wetness
budget rather than a canvas size.

---

## 6. Visible in the snapshot: the stroke-resampling trap

`wet_field.png` shows the bot paths beading into discrete dots where the bots
move fastest, rather than laying continuous strokes. That is Card 5's
`[TRAP]` — stylus samples are far sparser than simulation steps, and the path
must be resampled with the full contact-and-transfer sequence run at each
interpolated position. B04 says the same from the other side: never move more
than one cell per step.

The bots here deposit once per frame at their instantaneous position, so the
bench reproduces the artefact faithfully. Worth keeping as a regression check —
when the brush engine lands, those beads should become strokes.

---

## Carried forward

- Implement C97's early exit (τ = 0.01) in relaxation and re-measure. Expected to
  be the single biggest win available.
- Choose a fix for the half-float accumulation drift (§4 above).
- `flow_outward` at 1.24 ms is second-largest and is a 9×9 box blur every frame;
  a separable two-pass blur should cut it substantially.
- Bench does not yet cover: tile promotion/demotion, the dry/bake pipeline,
  undo snapshots, or the §10 acceptance tests beyond conservation.
