# CARD 3 — Pigment Transport & Deposition

**This is C97's territory and nothing else in the pile covers it.**

## The parameters that make pigments differ

BE16 gives you optical properties. It gives you **nothing** about how pigment moves. Those three parameters are C97's:

| Symbol | Name | Controls |
|---|---|---|
| ρ | density | how long a pigment stays suspended; heavier settles sooner |
| ω | staining power | tendency to adhere to / coat paper fibers |
| γ | granulation | how strongly paper height affects adsorption/desorption |

**One pigment row = BE16 optical (K, S across 38 bands) + C97 physical (ρ, ω, γ).** That's your schema.

C97's values were, in their own words, from *"fairly casual observations"* — but they track reality. From their Figure 5 table: French Ultramarine carries the highest granulation in the set (γ = 0.91), which any watercolorist would confirm. Burnt Umber (ω = 9.3) and Indian Red (ω = 7.0) top the staining column. Quinacridone Rose follows (ω = 5.5). Brilliant Orange and Hansa Yellow sit at the low-granulation end (γ = 0.14 and 0.08).

**Discard their K and S columns** — three eyeballed RGB channels, superseded by BE16's 38 measured bands.

**Overlap between the two sources:** quinacridone, cadmium yellow, cadmium red, cerulean, hansa yellow, phthalo green, ultramarine. Pair measured spectra with transport parameters directly for a solid starting palette.

## Transfer between water and paper

C97's `TransferPigment`, per pigment k, per wet cell:
```
down = g^k · (1 − h·γ^k) · ρ^k
up   = d^k · (1 + (h − 1)·γ^k) · ρ^k / ω^k
```
with clamps so neither `d + down` nor `g + up` exceeds 1. Then `d ← d + down − up`, `g ← g + up − down`.

Note how paper height `h` enters through γ — that's granulation: pigment settling into the hollows of rough paper.

## Movement within the shallow-water layer

Pigment is distributed to the four neighbours in proportion to fluid outflow, with `Δt = 1/ceil(max|u|,|v|)` so nothing moves more than one cell per step. Grid concentrations, not particles — avoids D15's clumping problem.

## Backruns — the capillary layer

Backruns occur *only* when a puddle spreads slowly into a region that is drying but still damp. In damp paper the only water present is inside the pores, so flow is dominated by capillary action rather than momentum — which is why this needs its own layer.

Water is absorbed from the shallow-water layer at rate α and diffuses through the capillary layer. Each cell transfers to its four neighbours until they reach capacity `c`. When a cell's saturation exceeds threshold ε, **the wet-area mask expands to include it** — that's how a puddle creeps. The pixel-to-pixel variation in capacity produces the irregular branching pattern.

Additional parameters: δ (minimum saturation before a cell can diffuse), σ (saturation below which a cell won't receive).

## `[OPEN PROBLEM — 29 years old]`

C97's own future work:

> Our model treats backruns and wet-in-wet flow patterns as two separate processes. In real watercolor, however, they are just two extremes of a continuum of effects, the difference between them being simply the degree of wetness of the paper. A model that could integrate these two effects, parametrized by wetness, would be a significant improvement.

Still open. Also **exactly your thesis** — one physical model, behavior emerging from state rather than mode switches. If you unify these under a wetness parameter, that isn't catching up to the literature.

## `[OPEN PROBLEM]` Resolution independence

C97 §4.3.1: the staggered-grid discretization makes their solution resolution-dependent, and they name generalizing past it as *"an important goal for future work."* Same problem D15 has. Yours to solve, and it's the reason to define parameters dimensionlessly from day one.

---
