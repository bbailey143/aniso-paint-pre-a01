# Feasibility bench — results

Hardware: **Radeon RX 570** (Polaris, 4 GB), Vulkan, Windows. Deliberately a
modest card — roughly iPad-class, and well below the RTX 3080 Ti laptop A26's
published timings came from. Conservative against the real target.

Scope: the wet band only. No brush, no render, no dry/bake pipeline. Bots paint
for 240 frames to build a live wet canvas, then lift off; every gauge is read
with hands off and evaporation at zero, where the numbers must hold flat.

---

## Headline

**Performance: PASS, with room to spare.**

| configuration | frame | relax iterations |
|---|---|---|
| C97's full 50 iterations | 10.09 ms | 50 |
| **adaptive iteration count** | **3.78 ms** | **2** |
| budget | 16.70 ms | |

**Conservation: the flux algebra is exact. The dynamics are not yet stable.**
That second half is the real result of this bench, and it changes the
recommendation I would have given after the first run.

---

## 1. Adaptive relaxation — 10.09 ms to 3.78 ms

Relaxation was 71 % of the frame. C97 specifies *up to* 50 iterations with an
early exit once divergence falls under τ = 0.01; the first bench always ran the
full count.

A true within-frame early exit needs an indirect dispatch driven by a GPU-side
reduction. Instead the bench now measures the divergence residual each frame and
sizes the next frame's count from it. The field is continuous between frames, so
a one-frame lag costs nothing — and unlike a fixed count it responds when the
artist floods the sheet.

Result: the controller settles at **2 iterations**, and the residual stays at
0.0013 against a τ of 0.01 — comfortably converged. Fifty iterations were buying
nothing in this regime.

| relax iterations | frame (ms) |
|---|---|
| 50 | 10.09 |
| 20 | 6.98 |
| 10 | 5.28 |
| adaptive (settles at 2) | **3.78** |

`[CAVEAT]` The synthetic bots deposit gently over a 14-cell radius. A real brush
slamming water onto dry paper injects far sharper divergence, and the controller
should climb in response. That is what it is built to do, but it has not been
tested against a load that actually demands high iteration counts. **Re-measure
when the brush engine lands.**

Separately, splitting the pressure field out of the relaxation pass (see §3)
removed a whole texture write from the hot loop — that alone took the fixed-50
case from 12.43 ms to 10.09 ms.

---

## 2. `[FOUND AND FIXED]` Capillary diffusion was asymmetric

The first run lost **12.3 % of its water in fifty frames** with nobody painting.

`capillary_flow` absorbed film into saturation and *then* diffused, so each cell
diffused using its own post-absorption value while its neighbours still read
pre-absorption values from the input texture. The exchange across a cell pair
stopped being equal and opposite. Fixed by computing absorption and diffusion
both against the input state and summing at the end.

---

## 3. `[FOUND AND FIXED TWICE]` The relaxation was an amplifier

**Attempt 1 — collocated velocities.** u and v stored at cell centres, with
central differences for both divergence and pressure gradient. Textbook odd-even
decoupling: a checkerboard pressure pattern is invisible to a central-difference
gradient, so it grows unopposed. §2.3 of the contract already specified a
staggered grid, citing C97 and A26. It was right, and this is why.

**Attempt 2 — staggered, but still a pressure-Poisson iteration.**

```
u -= xi * grad(p_old)
p -= xi * div(u_old)
```

This is unconditionally unstable. Its eigenvalues are `1 ± i·xi·√λ`, magnitude
strictly greater than one for any non-zero xi. Divergence went from 0.00015 to
0.086 and the sheet gained 753 % of its water.

**Attempt 3 — what C97 actually does.** C97 solves no pressure Poisson equation
at all. It takes a cell's divergence and pushes that cell's four faces directly
to cancel it. That is a scatter, which a GPU cannot do under ping-pong, but the
gather form is algebraically identical: a face shared by two cells is pushed by
both, so `u_face += delta(this cell) − delta(east neighbour)`. The resulting
operator on divergence is `(1 − xi·L)` with L the 5-point Laplacian, eigenvalues
in [0, 8] — stable for xi < 0.25, and at C97's 0.1 the worst mode damps to 0.2
per iteration. High-frequency divergence, exactly what a brush stroke injects,
dies fastest.

Divergence now holds at 0.00016 through 50 iterations instead of growing.

---

## 4. `[BLOCKING]` The film dynamics are unstable, and half-float was hiding it

This is the finding that matters, and it reverses what the first run suggested.

Run at full f32, hands off, evaporation zero, the sheet **gains** water — by
200 %, by 1500 %, and in some configurations it overflows to 1e33 outright. Run
the identical setup at half-float and it quietly **loses** about 19 %.

Isolation runs:

| change | water drift, f32, 900 frames |
|---|---|
| baseline (relax 20) | +10.9 % … +420 % (grows with run length) |
| capillary diffusion off (`KDIFF = 0`) | **−0.0000 %** |
| absorption off (`ALPHA = 0`) | +2e33 % |
| absorption raised to 0.80 | +128 % |
| relaxation off (`--relax 0`) | +5e35 % |
| relaxation 2 / 5 / 20 | +856 % / +326 % / +11 % |
| `--dt` 1.0 / 0.5 / 0.25 | +217 % / +420 % / +292 % |

What these say:

- **The flux algebra itself is exact.** With diffusion disabled the mask stays
  put, the film stays thin, and conservation reads −0.0000 %. Clamped edge
  fluxes computed identically from both sides neither create nor destroy. §8.1
  holds.
- **The instability is in the film dynamics, not the ledger.** More relaxation
  makes it *better*, not worse — so relaxation is acting as the damper, and
  removing it is catastrophic. Absorption also damps it, by draining the film
  before it can oscillate. Diffusion feeds it, by expanding the wet mask so
  there is more standing film to go unstable.
- **It is not a timestep problem.** Cutting dt does not help, so this is not a
  simple CFL violation.
- **Half-float rounding was the missing damping.** At f16 the oscillation is
  quenched by rounding error — which also eats about 19 % of the sheet. The
  system only *appeared* stable because two errors were cancelling.

**Consequence for D8.** Half-float is currently load-bearing for stability. That
is a dangerous thing to depend on: it means the engine is tuned to a specific
rounding behaviour, and any precision change, driver change, or GPU that rounds
differently could destabilise it. It also means the earlier recommendation —
"promote h_f and s to f32 to fix the drift" — is **wrong as stated**. Doing that
alone removes the accidental damping and makes things worse.

**Correct order of work:**

1. Make the film dynamics unconditionally stable at f32. Prime suspect is the
   coupling between the height-gradient forcing in `update_velocities` and the
   flux application, which currently has no explicit damping beyond C97's drag
   term of 0.01. Candidates: proper semi-implicit treatment of the height
   gradient, a stability-preserving limiter on the gradient forcing, or A26's
   flux-level clamping applied to the velocity update as well as the transport.
2. **Only then** choose a storage precision, and re-measure drift against a
   system that is stable on its own merits.
3. Re-test the split-precision idea. It may well be right — but it cannot be
   evaluated while rounding error is doing structural work.

Until step 1 lands, treat the conservation numbers as measuring the bug, not the
schema.

---

## 5. Memory: read/write separation doubles the wet band

| | 1024² | 1448² | 2048² |
|---|---|---|---|
| logical (24 half-floats/cell) | 48 MB | 96 MB | 192 MB |
| **actually allocated** | **96 MB** | **192 MB** | **384 MB** |
| median frame @ relax 20 | 6.98 ms | 14.96 ms | 27.07 ms |

Every wet field needs read/write separation — a pass cannot read its neighbours
and overwrite itself in the same dispatch. §2.6's 113 MB is the logical cell
count; the working figure is twice that.

Split precision (water f32, pigment f16) costs 128 MB at 1024²; full f32 costs
192 MB.

**Practical ceiling on this GPU: about 1448² wet at 20 relax iterations.** That
matches the contract's framing of D7 as a wetness budget rather than a canvas
size.

---

## 6. Visible in the snapshot: the stroke-resampling trap

`wet_field.png` shows the bot paths beading into discrete dots where the bots
move fastest, rather than laying continuous strokes. That is Card 5's `[TRAP]` —
stylus samples are far sparser than simulation steps, and the path must be
resampled with the full contact-and-transfer sequence run at each interpolated
position. B04 says the same from the other direction: never move more than one
cell per step.

The bots deposit once per frame at their instantaneous position, so the bench
reproduces the artefact faithfully. Worth keeping as a regression check — when
the brush engine lands, those beads should become strokes.

---

## Carried forward

1. **Stabilise the film dynamics at f32.** Blocks everything in §4. Nothing about
   precision can be settled until this is done.
2. Re-measure the adaptive controller against a sharp brush load, not gentle
   bots — the current test never demands high iteration counts.
3. `flow_outward` at 1.24 ms is a 9×9 box blur every frame; separable two-pass
   should cut it substantially.
4. True within-frame early exit via indirect dispatch, if the adaptive
   controller proves insufficient under real strokes.
5. Not yet covered by the bench: tile promotion/demotion, the dry/bake pipeline,
   undo snapshots, and the §10 acceptance tests beyond conservation.
