# CARD 1 — Fluid Engine

## Architectural fork

You have two validated, complete routes. Pick deliberately.

**Route A — Shallow water (C97, D15).** Gives you edge darkening, backruns, capillary absorption into paper, granulation. The full watercolor vocabulary. Resolution-dependent as published.

**Route B — Thin film (A26).** Lubrication approximation. Physically validated against laboratory dripping experiments. Gives you real gravity behavior and drips. **Does not give you** edge darkening, backruns, or paper absorption. Breaks for thick paint.

These are complementary, not competing. C97 has what A26 lacks and vice versa. The pass-list architecture is what makes grafting terms from one onto the other cheap later.

## C97 — three-layer model

| Layer | Contents |
|---|---|
| Shallow-water | water and pigment flowing above the paper |
| Pigment-deposition | pigment adsorbed onto / desorbed from paper |
| Capillary | water absorbed into paper, diffused by capillary action (used for backruns) |

Independently confirmed by **VL's** companion canvas paper, which uses fluid / surface / capillary. Two teams, eight years apart, same decomposition. **Use it.**

**Quantities:** wet-area mask `M` (1 if wet), velocity `u,v`, pressure `p`, pigment concentration `g^k` per pigment, deposited pigment `d^k` per pigment, paper height `h` and its slope `∇h`, paper fluid capacity `c`, water saturation `s`.

**Main loop order:**
```
MoveWater(M, u, v, p)
MovePigment(M, u, v, g¹..gⁿ)
TransferPigment(g¹..gⁿ, d¹..dⁿ)
SimulateCapillaryFlow(M, s)
```
`MoveWater` = `UpdateVelocities` → `RelaxDivergence` → `FlowOutward`

**The six conditions the flow must satisfy** (C97's own list — good acceptance criteria for the fluid pass):
1. Water stays within the wet-area mask
2. Surplus water in one area flows outward into nearby regions
3. Flow is damped to minimize oscillating waves
4. Flow is perturbed by paper texture, causing streaks parallel to flow
5. Local changes have global effects
6. There is outward flow toward the edges (this is what produces edge darkening)

Conditions 1–2 come from the basic shallow-water equations. 3–4 from the viscous drag and paper slope terms. 5–6 from `RelaxDivergence` and `FlowOutward`.

### C97 parameters

| Parameter | Value | Note |
|---|---|---|
| Viscosity μ | 0.1 | all their examples |
| Viscous drag κ | 0.01 | all their examples |
| Δt | `1 / ceil(max(|u|,|v|))` | adaptive — velocities never exceed one pixel per step |
| RelaxDivergence N | 50 | max iterations |
| RelaxDivergence τ | 0.01 | divergence tolerance |
| RelaxDivergence ξ | 0.1 | redistribution factor |
| Edge-darkening kernel K | 10 | Gaussian blur on wet mask |
| Edge-darkening η | 0.01 – 0.05 | range |
| Paper capacity | `c = h(c_max − c_min) + c_min` | derived from height field |
| Paper height h | scaled to 0 < h < 1 | pseudo-random generation |

**Edge darkening mechanism.** Physically this is the coffee-ring effect: in an evaporating drop with a pinned contact line, liquid evaporating at the boundary must be replenished from the interior, producing outward flow that carries pigment. C97 implements it by lowering water pressure near the mask edges: Gaussian-blur the wet mask with a K×K kernel, then `p ← p − η(1 − M′)M`. Underlying physics: Deegan et al., *Contact line deposits in an evaporating drop*.

**Drybrush.** Exclude from the wet-area mask any pixel whose paper height is below a user threshold. That's the whole implementation. [C97 §4.7]

**Grid:** staggered (velocity on cell boundaries, everything else at centers), following Foster. Euler forward with adaptive step.

### D15 — vorticity route

Standard Stable Fluids: semi-Lagrangian advection → Jacobi pressure Poisson → vorticity confinement. No-slip at puddle borders, Neumann BC for pressure.

**Their parameters — MAGNITUDE AND RATIO ONLY. Do not port these values.**

| Parameter | Value |
|---|---|
| Simulation grid | 320×240 |
| Display grid | 640×480 (ratio 2.0) |
| Splat radius | 20 px |
| Fluid per splat | 0.02 |
| Viscosity | 1.0 |
| Vorticity strength | 5.0 |
| Jacobi iterations — pressure | 40 |
| Jacobi iterations — diffusion | 20 |
| Paper influence | 0.1 |
| Drying rate | 0.00001 |
| Divergence clamp d | 0.05 |

**Useful ratio:** pressure solve gets roughly twice the iterations of diffusion.
**Useful magnitude:** vorticity is single digits. Drying is a very small positive nudge.

`[TRAP]` **They omitted the viscous term entirely** — too expensive — and leaned on the diffusion term for damping.

`[TRAP]` **Divergence clamped at 0.05 for stability**, and they admit this makes paper influence *"much weaker than in real life."* Paper behavior is core to your thesis. This is precisely where your hardware surplus should be spent — doing properly what they had to gut.

`[TRAP]` **Particle-based pigment clumps.** GPU threads can't see neighbours, so no inter-particle repulsion, so particles pile up where velocity changes fastest. Documented dead end — a reason to prefer grid concentrations.

## A26 — thin film

Derived from Navier-Stokes via the **lubrication approximation**: (1) fluid height small relative to in-plane scale, (2) normal velocity negligible, (3) low Reynolds number.

### The three principled parameters

The single most transferable idea in the pile — and it's a *design* method, not physics.

Raw physics gives you capillary number, capillary length, scaled cohesion force. Meaningless to a painter. A26 rebuilt the equation around three knobs chosen to be **linear and orthogonal with respect to what the artist sees**:

| Knob | Meaning | Formula |
|---|---|---|
| **T** — drip thickness | apparent thickness of the fingers | `T = √(η / η_max)` |
| **F** — fluidity | flow speed (dimensionless inverse viscosity) | `F = 1 / (3·Ca·η²)` |
| **L** — hydrophoby | vertical length of the fingers | `L = ξ / ξ_max` |

Constants: `η_max = 150` at ε = 0.1; `ξ_max = 10`. Generalized: `η_max = (ε/0.1)^(−3/2) × 150`.

**Their workflow:** pick T first, then set fluidity to the maximum unbiased value `F_max = 1/(3·Ca_min·η²)`, where `Ca_min = 10⁻⁴` at ε = 0.1, generalizing to `Ca_min = (ε/0.1)³ × 10⁻⁴`.

**Apply this method to every engine.** Internal constants never reach the UI. What the artist touches is a small set of sliders, each of which changes exactly one visible thing. Figure 15 of A26 shows each knob swept independently — that's the deliverable shape.

### Bias mapping — how to find where the sim can be trusted

`[METHOD]` This is the technique for validating the parts your eye can't check, and it costs nothing but patience.

1. Run the same setup twice: once at real-time timestep (`Δt = 0.1·tc`, 10 steps/frame, 30,000 steps), once at a slow reference (`Δt = 0.01·tc`, 300,000 steps).
2. Compare resulting wet-area shapes using **Symmetric Difference over Union**, threshold 0.1.
3. Plot across the parameter space. You get three zones: **stable** (valid but boring, fluid too viscous), **fingering** (where the interesting behavior lives), and **biased** (the sim is confidently producing nonsense).

Measured at Δx = 1, initial deposit `h = ½h_c`, `h_max = 1.1h_c`.

**Then clamp your UI sliders to the trustworthy zone before an artist ever wanders into the garbage.**

### `[TRAP]` The mobility function — a bug you would have shipped

The standard mobility function goes to zero if *either* neighbouring cell is dry. Physically defensible; artistically fatal, because **dry paper then acts as a wall and paint cannot drip onto it.**

A26's fix:
```
M(h₁, h₂) = ((h₁ + h₂) / 2)³
```
Nonzero whenever either cell has fluid. They also tested `M′(h₁,h₂) = ½(h₁³ + h₂³)` — works, but produces shorter drips. The first form is preferred.

To model *actual* blocking boundaries (walls), cancel flow terms at wall edges explicitly.

### Numerical scheme

- Staggered grid, fourth-order equation, five-point stencil Laplacian.
- **Flux clamping** for stability and mass: enforce `Δh > −h` and `Δh < h_max − h` at the flux level.
- **Domino relaxation:** split each step into passes over non-overlapping cell pairs. A26 uses a **random permutation of 4 passes** rather than the textbook 8 — cheaper, no significant added bias. This is how you avoid neighbouring GPU threads fighting over shared edges.

### Performance budget — the only modern numbers you have

| Grid | Time per simulation step |
|---|---|
| 256² | 88.0 μs |
| 4096² | 3.1 ms |

Hardware: NVIDIA RTX 3080 Ti Laptop. **Scales linearly with cell count.** They run 10 steps per frame.

**Derived:** at 10 steps/frame on that GPU, 4096² ≈ 31 ms/frame (~32 fps, too tight). 2048² ≈ 8 ms. 1024² ≈ 2 ms.
`[UNVERIFIED]` An iPad GPU is roughly 4–8× slower than that laptop chip, which puts 1024² solidly in reach and 2048² as a stretch — before accounting for the coarse-sim-under-fine-display trick. **Verify on hardware; this is an estimate, not a measurement.**

### Artist-motivated additions from A26

- **`cos(α)` diffusion factor.** Multiply diffusion by the cosine of canvas tilt. At vertical, diffusion goes to zero and pigment purely follows the flow — which is what stops a vertical wash from smearing into mush.
- **Pigment boost ζ.** Weight *incoming* pigment colors over those already present, so running paint layers over rather than politely averaging. They show ζ = 1 vs ζ = 2.
- **Local gravity from canvas relief.** Rather than a potential field, rotate the gravity vector per pixel using the paper height map. Paint pools in the low points of the grain — granulation emerging from physics rather than a texture overlay.
- Diffusion coefficient `D = 5·x_c² / t_c`.

### A26 limitation that is your opportunity

Their own limitations section: *"our pigment mixing remains linear and does not reproduce realistic behavior that artists are used to (i.e., blue and yellow make green)."*

Adobe Research, 2026, listing as an open problem the thing your color model already solves. Pin this somewhere you'll see it.

---
