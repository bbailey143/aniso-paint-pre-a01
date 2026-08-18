# CARD 5 — Fluid Engine

Water movement over paper. Watercolour's whole vocabulary lives here: edge
darkening, backruns, capillary absorption, granulation. Route: **C97 shallow-water
spine**, with A26's dimensionless params and stability fixes grafted on. The bench
validated this WGSL — the flux algebra is exact.

## C97 three-layer model

| Layer | Contents |
|---|---|
| Shallow-water | water + pigment flowing above the paper |
| Pigment-deposition | pigment adsorbed onto / desorbed from paper |
| Capillary | water absorbed into paper, diffused by capillary action (backruns) |

**Main loop:**
```
MoveWater(M, u, v)           = UpdateVelocities → RelaxDivergence → FlowOutward
MovePigment(M, u, v, g[8])
TransferPigment(g[8], d[8])
CapillaryFlow(M, s)
```

**The six conditions the flow must satisfy** (C97's own list — acceptance criteria):
1. Water stays within the wet mask.
2. Surplus water flows outward into nearby regions.
3. Flow is damped to minimize oscillating waves.
4. Flow is perturbed by paper texture → streaks parallel to flow.
5. Local changes have global effects.
6. Outward flow toward the edges (this produces edge darkening).

## Parameters (C97 — dimensionless, port these)

| Parameter | Value | Note |
|---|---|---|
| Viscosity μ | 0.1 | |
| Viscous drag κ | 0.01 | |
| Δt | `1 / ceil(max(|u|,|v|))` | adaptive — velocity never exceeds 1 px/step |
| RelaxDivergence N | 50 | max iterations (adaptive controller sizes it down) |
| RelaxDivergence τ | 0.01 | divergence tolerance |
| RelaxDivergence ξ | 0.1 | redistribution factor (stable for ξ < 0.25) |
| Edge-darkening kernel K | 10 | Gaussian blur on wet mask |
| Edge-darkening η | 0.01 – 0.05 | |
| Paper capacity | `c = h(c_max − c_min) + c_min` | from height field |

## Stability — what the bench learned (do not relearn it)

- **Relaxation is the C97 gather form, not a pressure-Poisson iteration.** The naive
  `u -= ξ∇p; p -= ξ∇·u` is unconditionally unstable. C97 pushes each cell's four
  faces to cancel its own divergence; the GPU gather form is identical:
  `u_face += δ(this) − δ(neighbour)`, operator `(1 − ξL)`, eigenvalues `[0, 8]`.
  High-frequency divergence (what a brush injects) dies fastest. This took three
  wrong attempts on the bench; start here.
- **Staggered grid, always.** Collocated velocities → checkerboard pressure the
  gradient can't see → unbounded growth.
- **Capillary diffusion must read input state, not post-absorption state.** The first
  bench lost 12.3 % of its water because `capillary_flow` absorbed then diffused, so
  each cell diffused against its own updated value while neighbours read the old one —
  the cross-pair exchange stopped being equal and opposite. Compute absorption and
  diffusion both against the input and sum at the end.
- **Zero-init every wet texture at startup.** Don't trust lazy-init. Uninitialised
  reads produced a phantom "instability" that survived rounds of analysis.

### `[MEASURED — P4]` Half-float cannot hold the accumulating fields

The `main` bench left this open: after its zero-init fix, half-float still lost
**6.4 % of the sheet over 200 hands-off frames, reproducibly**, and it recorded
that *"whether that is rounding or another latent bug … has not been established."*

**Established.** This build reproduced it (water −6.3 %/−7.1 %, pigment −6.5 % per
200 frames at f16) and localised it with two discriminators:

| Test | Result | Reads as |
|---|---|---|
| `cosAlpha = 0` (zeroes capillary diffusion) | water drift → **0.000 %** | water loss lives in capillary diffusion |
| pigment across a **16× range** of paint quantity | −6.5 % / −6.6 % / −6.7 % | **scale-invariant** ⇒ floating-point *relative* rounding, not a threshold or an asymmetric formula |

Cause: capillary diffusion and `TransferPigment` both add a small delta to a
larger stored value every frame, and the give/receive halves round independently
at a 10-bit mantissa. No formula change fixes that.

**Fix: the wet band runs at `rgba32float`.** Conservation then reads
**0.0000 % over 200 frames and −0.0000 % over 1000**, reproduced. 32-bit float
textures are not filterable in WebGPU core, so the composite interpolates them by
hand (`biload`) rather than depend on the optional `float32-filterable` feature.

`[OPEN — P6]` Evaporation is gated on the wet mask, so a thin sub-threshold damp
halo spread by capillary diffusion never dries; total water stalls at a small
residue. A drying-semantics question, not a conservation break — settle it with
the drying pipeline.

## Edge darkening (coffee-ring / Deegan)

Physically: in an evaporating drop with a pinned contact line, liquid evaporating at
the boundary is replenished from the interior → outward flow carrying pigment. C97
implements it by lowering water pressure near the mask edges: Gaussian-blur the wet
mask with a K×K kernel, then `p ← p − η(1 − M′)M`.

## A26 grafts

- **`cos(α)` diffusion factor.** Multiply diffusion by the cosine of canvas tilt; at
  vertical, diffusion → 0 and pigment purely follows flow (stops a vertical wash
  smearing into mush).
- **Mobility fix.** `[TRAP]` The standard mobility goes to zero if *either*
  neighbour is dry — dry paper then acts as a wall and paint can't drip onto it. A26:
  `M(h₁,h₂) = ((h₁+h₂)/2)³`, nonzero whenever either cell has fluid. Real walls are
  modelled by cancelling flow terms at wall edges explicitly.
- **Local gravity from relief.** Rotate the gravity vector per pixel using the paper
  height map, so paint pools in the grain's low points — granulation from physics,
  not a texture overlay.
- **Domino relaxation.** Split each step into passes over non-overlapping cell pairs
  (A26 uses a random permutation of 4 passes) to avoid neighbouring GPU threads
  fighting over shared edges.

## Drybrush

Exclude from the wet mask any pixel whose paper height is below a user threshold.
That is the whole implementation. [C97 §4.7]

## Performance envelope (A26, RTX 3080 Ti Laptop)

256²: 88 μs/step. 4096²: 3.1 ms/step. Linear in cell count; 10 steps/frame. The
`main` bench measured 3.78 ms/frame at 1024² on an RX 570 (iPad-class) with adaptive
relaxation — PASS against a 16.7 ms budget. `[UNVERIFIED]` iPad ≈ 4–8× slower than
that laptop; 1024² is in reach, 2048² a stretch. Verify on hardware.


---

## Stability ceiling: viscosity ≤ 0.25 (found 2026-08-13)

`update_velocities.wgsl` diffuses velocity **explicitly** on the five-point stencil:

```
du += viscosity * (uL + uR + uU + uD - 4*centre)
nu  = (centre + dt*du) * (1 - drag)
```

Explicit diffusion is stable only while `coefficient * dt / dx² ≤ 1/4`. `dx` is one
cell and `dt` is `1.0`, so **the ceiling is `viscosity = 0.25`.** Watercolour ships at
`0.10`.

**Past it, the grid shows through.** Each step overcorrects, neighbours flip past each
other, and error grows along the four stencil directions — visible as axis-aligned
stippling, needles and repeated cell bands. Bartford photographed it while turning up
thickness in the medium studio.

**It hides from every gauge**, which is what makes it expensive to find. `nu`/`nv` are
clamped to one cell per step, so what should be a blow-up becomes a STANDING
CHECKERBOARD instead. Nothing is created or destroyed, so water and pigment stay
conserved, `mean |div|` stays under `tau`, and the adaptive relaxation sees no reason
to work harder. Readings: `mean |div| 0.00489`, `relax 12` of a possible `50` — the
controller was winding effort *down* while the picture was visibly wrong.

**A hypothesis that was wrong, recorded so it is not retried:** that the divergence
gauge was averaging away a localised fault, fixable with a peak-divergence readout.
Plausible, and false. The fault is not divergence at all.

**The coefficient is clamped in the shader, not the artist's dial.** Thickness above
the ceiling still thickens the paint through the other route — `flux_compute` resists
flow by `viscosity * drag`, which is not a diffusion term and is stable at any value.
So a heavy medium is built by **resisting flow**, not by cranking thickness past what
the maths can integrate. Every preset in `studio/medium-presets.ts` obeys this.

Same symptom family as E8 in `13-water-paper-behavior-log.md` — the water field driven
hard at cell scale — reached by a different route.
