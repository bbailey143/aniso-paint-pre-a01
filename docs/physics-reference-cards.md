# Physics Reference Cards

**Natural-media painting engine — research harvest**
Compiled July 2026. Everything below was extracted from primary sources; each entry names where it came from.

---

## How to use this document

This is the fence. It exists so that no future session has to re-read the papers, and so that no AI session can quietly invent a number.

- **Paste the relevant card** into a session working on that engine. Not the whole file.
- **Nothing enters an engine that isn't on a card**, or explicitly marked as a decision you made.
- **Anything marked `[UNVERIFIED]`** is reasoning, not a finding. Test it on the bench before trusting it.
- **Anything marked `[TYPO]` or `[TRAP]`** cost someone else time. It shouldn't cost you any.

---

## Source register

| # | Source | Good for |
|---|---|---|
| **C97** | Curtis, Anderson, Seims, Fleischer, Salesin. *Computer-Generated Watercolor.* SIGGRAPH '97, 421–430. | The spine. Three-layer model, edge darkening, backruns, granulation, drybrush, pigment transport params. |
| **B04** | Baxter, Wendt, Lin. *IMPaSTo: A Realistic, Interactive Model for Paint.* NPAR '04, 45–56. | Oil/thick paint. Conservative advection, brush transfer, layer storage, undo, spectral KM. |
| **A26** | Herson, Paris, Michel (Adobe). *Dripping Thin Films for Real-time Digital Painting.* Eurographics 2026, CGF 45(2). **Open access, CC-BY.** | Modern fluid. Validated dripping, principled params, bias mapping, performance budget. |
| **D15** | Ďurikovič & Páleníková. *Real-time Watercolor Simulation with Fluid Vorticity within Brush Stroke.* Comenius Univ. Bratislava. | Navier-Stokes projection route, vorticity confinement. Old hardware, useful admissions. |
| **VL** | Van Laerhoven & Van Reeth. *Brush Up Your Painting Skills.* The Visual Computer. | The brush engine. FFD decoupling, reservoir schema, anisotropic friction. |
| **BE16** | Berns. *Artist Paint Spectral Database.* CIC24, 2016. | **Measured pigment data.** 19 Golden acrylics, K & S, Saunderson constants. |
| **MB21** | Sochorová & Jamriška. *Practical Pigment Mixing for Digital Painting.* TOG 40(6), 2021. (Mixbox) | Mixing law, KM chain, gamut warnings. Method itself does not apply. |
| **Y13** | You, Jang, Cha, Kim, Noh. *Realistic paint simulation based on fluidity, diffusion, and absorption.* CAVW 24:297–306, 2013. | Lucas-Washburn absorption, von Mises yield, four-material model. Offline SPH — physics transfers, method doesn't. |
| **I19** | Ishibashi. *Digital scratch art painting interface.* IWAIT 2019, SPIE 11049. | Saunderson constants, substrate-form KM, overmixing warning. Otherwise shelved. |
| **CHART** | Your own Media Technical Reference Chart. | Acceptance criteria. The only document that says what "right" looks like. |

**Shelved after triage:** *High Relief from Brush Painting* (TVCG 2019) — recovers relief from flat images, backwards from what you do. *Interaction Concepts for Digital Concept Sketching* (Nijboer et al. 2009) — border gestures only. *David Li, Fluid Paint* (david.li/paint) — not a paper; a feel target and proof that bristle simulation fits in a browser.

---

## Cross-cutting invariants

These apply to every engine. Violating any one of them is how the project goes wrong.

### 1. Conservation is the axiom

Three independent teams arrived at this and built their entire numerical scheme around it:

- **B04** lists "paint is conserved, neither created nor destroyed" as founding principle #2. The conservative advection scheme exists for no other reason.
- **A26** clamps **fluxes between cells**, not heights per pixel — because clamping the shared flow across an edge preserves total mass, and clamping per-pixel doesn't.
- **C97** moves pigment by distributing from each cell to its neighbours in proportion to fluid outflow.

**Consequence:** the bench displays total water and total pigment permanently. Paint a stroke, stop touching it, watch the numbers hold. Semi-Lagrangian advection (the textbook default) quietly *loses* mass — tolerable for watercolor, fatal for impasto, where the height field slowly deflates and you never find out why.

### 2. Parameters must be dimensionless or normalized

The single most important lesson from the pile.

- **B04's** constants are fractions of paint and cells-per-timestep. They survive any resolution change.
- **D15's** constants are raw per-frame amounts tied to one grid size and one frame rate. Vorticity strength 5.0 literally multiplies by Δx. Drying rate 0.00001 is subtracted once per frame, so at 120fps it dries twice as fast as at 60. **These do not port. Not to your machine, not to a different canvas size, not even to a different frame rate on the same machine.**
- **A26** rebuilt the whole thin-film equation into dimensionless space specifically to fix this.

**Rule for your own parameters:** express everything as a fraction, a ratio, or a rate-per-unit-time. Never as a per-frame delta. Never in units of "one grid cell."

### 3. Precision

- **B04** used half-precision float for all textures except small intermediates. Confirmed sufficient.
- **A26** notes many mobile GPUs and browsers don't support 32-bit float RGBA. **Design for 16-bit half-float from the start.** [Source: A26 limitations / Evergine WebGPU notes.]

### 4. Resolution strategy

Run a **coarse simulation grid under a finer display grid**.

- **D15** ran 320×240 sim under 640×480 display (ratio 2.0) on a 2008 laptop GPU.
- **B04** notes real paint needs 250 DPI minimum, ~500 DPI for adequate Nyquist sampling (a bristle is ~80 microns).

These aren't in conflict: the *visual* layer wants high resolution, the *physics* doesn't need it.

---

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

# CARD 2 — Pigment & Optical Engine

## The data

**Primary source: BE16 — Berns, Artist Paint Spectral Database, CIC24 2016.**

- **19 Golden Artist Colors Heavy Body acrylic dispersion paints.** Full list with Colour Index numbers in their Table I.
- Measured **380–750 nm at 10 nm increments = 38 bands.**
- Macbeth MS7000 integrating sphere spectrophotometer, SPIN geometry, 4 measurements averaged.
- 770 spectra total: 23 hues plus one gray scale.
- **Data is downloadable as an Excel spreadsheet** from RIT's Studio for Scientific Imaging and Archiving of Cultural Heritage page — spectra, colorimetry, eigenvectors, and optical (K and S) data.
- The same page hosts a **Gamblin Conservation Colors inpainting spreadsheet** implementing two-constant KM with Saunderson, including a sheet for producing optical data from your own paint measurements.

**Bigger, newer:** Berns, *Artist Acrylic Paint Spectral, Colorimetric, and Image Dataset* (Archiving 2022, hosted at grayskyimaging.com) — Golden supplied measurement data for 68 Heavy Body acrylics, filtered to **58 single-pigment paints**, masstones and 10% titanium white tints. This exceeds your 24–48 pigment target.

**Do not read Okumura's 192-page thesis.** BE16 is his reference [16] and carries the constants forward. Superseded.

**Notable in the 19:** the list includes *both* Phthalo Blue (Red Shade) PB15:1 and Phthalo Blue (Green Shade) PB15:4 — warm and cool of the same pigment. Mixbox could never do this with four slots. You can.

### `[CAVEAT]` These are acrylics

Same pigment index numbers exist in watercolor, but K and S differ with binder and grind. MB21 flags the consequence directly: acrylic coefficients are glossy, so applying them to watercolor **oversaturates**. Their suggested remedy is a desaturating post-process; they didn't find it necessary in practice. Your better remedy is the gloss dial below.

## The mixing law

**Duncan 1940** (via MB21). Mixing is **linear in concentration space**:

```
K_mix(λ) = Σᵢ cᵢ · Kᵢ(λ)
S_mix(λ) = Σᵢ cᵢ · Sᵢ(λ)
```
with `cᵢ ≥ 0` and `Σcᵢ = 1`.

This is the whole ballgame for you. Your engine already stores per-pixel concentrations, so mixing is a weighted sum — no solver, no latent space, no lookup tables. **Everything Mixbox builds exists to work around not being able to store concentrations. You can. Skip it.**

## Kubelka-Munk — three forms, use the right one

`[TYPO — CONFIRMED]` **D15's reflectance equation is wrong.** It prints `R₁ = sinh(bSh₁)` with no denominator, while `T₁ = b/c`. C97 §5.2 gives the correct form with the `/c`. Cross-checked and confirmed. **Use C97's version.**

**Form 1 — finite thickness over a substrate (C97 §5.2).** Use this for washes and glazes.
```
R = sinh(bSx) / c
T = b / c
where c = a·sinh(bSx) + b·cosh(bSx),  a = 1 + K/S,  b = √(a² − 1)
```

**Form 2 — B04's GPU form.** Same physics, different arrangement; cross-check against Form 1.
```
b = √((K/S)(K/S + 2))
R = 1 / (1 + K/S + b·coth(bSd))
T = b·R·sinh(bSd)
```

**Form 3 — opaque, infinite thickness (MB21 eq. 2).** Cheaper. Only for thick paint that fully hides the substrate.
```
R∞ = 1 + K/S − √((K/S)² + 2K/S)
```

**Form 4 — with substrate reflectance ξ folded in (I19 eq. 1).** One-shot when you already know what's underneath; avoids a separate compositing pass. Worth benchmarking against Form 1 + compositing.

**Layer compositing (C97 §5.2, Kubelka's equations):**
```
R_total = R₁ + T₁²R₂ / (1 − R₁R₂)
T_total = T₁T₂ / (1 − R₁R₂)
```
Repeat bottom to top for each glaze.

## Saunderson correction — and the gloss dial

Accounts for light reflecting off the paint *surface* before it reaches any pigment. C97 lists the refractive-index discontinuity as its **first violated KM assumption**, notes a correction exists, and declines to implement it. You can implement it on day one.

```
R′ = (1 − k₁)(1 − k₂)R / (1 − k₂R)
```

| Source | k₁ | k₂ | Notes |
|---|---|---|---|
| **BE16** | 0.03 (collimated) | 0.65 (diffuse) | plus `K_instrument` — see below |
| **I19** | 0.04 | 0.60 | independent, close agreement |

k₁ ≈ 0.03–0.04 is the fraction of light reflecting off a smooth surface at refractive index ~1.5 — glass, varnish, acrylic binder, oil. These are your **glossy** defaults.

### `[KEY FINDING]` K_instrument is the matte/gloss control

BE16 sets `K_instrument = 1.0` for their specular-included (SPIN) measurements, and **sets it to 0 to make a surface glossy or varnished computationally** — verified experimentally against Pyrrole Orange with actual Golden MSA glossy varnish.

That term is literally *how much surface reflection reaches the eye*. A matte surface scatters white surface reflection back at you from every angle, washing out the color. A varnish redirects it away, so you see the body color clean and deep. This is why varnishing makes a painting "come back."

`[UNVERIFIED — my extension, test it]` Mapping to your media:

| Medium | K_instrument | From CHART |
|---|---|---|
| Gouache | maximum | "ultra-matte, velvety, flat chalk finish" |
| Watercolor, dry | high | "matte, non-glossy, paper-texture sheen" |
| Acrylic | mid, user-exposed | "Gloss, Satin, or Matte (customizable)" |
| Oil | low | "naturally glossy/satin; uniform luster restored with varnish" |

Same pigment data, four media, one parameter. Store k₁, k₂, K_instrument as **per-medium** properties, not per-pigment.

`[UNVERIFIED]` This may also be the dominant mechanism for the wet→dry value shift: wet paper carries a water film (glossy, low K_instrument); drying removes it (matte, high K_instrument). Likely with a scattering change on top. Test both on the bench.

## Band count — question closed

**BE16 PCA on 770 spectra:**

| Eigenvectors | Cumulative variance |
|---|---|
| 1 | 73.9% |
| 2 | 89.6% |
| 3 | 97.5% |
| 4 | 98.9% |
| 5 | 99.5% |
| 10 | 99.9% |

**B04** independently showed 8 wavelengths chosen by Gaussian quadrature matching 101 samples almost exactly.

Two unrelated methods agreeing these spectra are low-dimensional. **8 bands is comfortably justified. Stop revisiting it.**

`[CAVEAT]` Berns 2022 found that *PCA-based primaries poorly approximated the 58 pigments*. Use PCA to reassure yourself about band count — **do not** use it to compress the palette itself.

**Pipeline:** BE16 gives 38 bands. B04 gives the reduction method (Gaussian quadrature weighted by CIE XYZ observer × illuminant spectrum). 38 → 8. Both halves in hand.

**Decision owed:** B04 re-chooses the 8 wavelengths *at runtime* from the current light spectrum (light the canvas blue, the bands shift blue). Your spec assumes fixed bands. Fixed lets you precompute pigment tables; adaptive is more accurate under varied lighting. **Choose deliberately.**

## Normalization anchor

`[KEY]` K and S only ever appear as a **ratio**. One value must be pinned arbitrarily or the system is unconstrained. **B04 fixes S = 1 for Titanium White** and solves everything else relative to it. Build your pigment table without knowing this and your numbers are meaningless in a way that is very hard to diagnose.

## Rendering chain

Spectrum → XYZ by integrating against CIE standard observer functions and the illuminant (D65 for sRGB white point) → sRGB matrix → display. [MB21 eqs. 3–7]

## `[TRAP]` Gamut

BE16's plots show **yellows and reds falling outside sRGB, AdobeRGB and eciRGBv2**; sRGB additionally clips cyans. Some real paint mixtures simply cannot be displayed. Plan for it rather than discovering it as a bug report.

## `[TRAP]` Overmixing

I19's user study: their flower test scored under 5/10 because participants mixed repeatedly and everything went dark.

**That is Kubelka-Munk working correctly.** Real paint muds when overmixed — it's why every painting teacher preaches a limited palette. But digital mixing is frictionless and free, so people do it far more than they ever would with real paint. Analog artists will recognize mud instantly. Consider a limited-palette affordance as a kindness rather than a restriction.

---

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

# CARD 4 — Oil / Viscous Engine

## Architectural fork

**Route A — B04's heuristic. No fluid solve at all.**

Velocity comes directly from the brush:
- Paint touching the brush moves at brush speed; paint touching the canvas is stationary; the layer between averages to **½ the brush's tangential velocity**.
- Plus a "squish" term: press the brush into the paint height field, compute penetration depth `p`, and add pressure-driven velocity `v_p = −c∇p` — paint flows down the slope of the penetration.
- Clamp final x,y velocity components to [−1, 1].
- CFL: move the brush no more than one cell width per step.

No pressure Poisson solve. No Jacobi iterations. This produced the convincing Munch and Van Gogh studies in B04's figures, on 2004 hardware.

**Route B — real viscoplastic rheology.** Yield stress is what makes a knife facet hold its edge instead of relaxing into pudding. More honest, more expensive.

**Recommendation:** build Route A first behind the same pass boundary, swap Route B in later. That's precisely what the pass-list architecture buys you.

## Y13 — von Mises yield formulation

The closest thing in the pile to a yield-stress model. From Y13 Appendix A (SPH form — the *concept* transfers, the method doesn't):

- Total strain decomposed into **elastic** and **plastic** components.
- Plasticity onset determined by the **von Mises criterion**.
- `α` = material's elastic decay rate. `γ` = yield point. Uses the Frobenius norm of the deviatoric elastic strain tensor.
- Governing equation adds a viscoelastic force term `μ_e ∇·ε` to the standard momentum equation, alongside viscosity `μ_v`.

Their values: Pollock-style acrylic `μ_v = 80.0, μ_e = 1000.0`; watery `μ_v = 10.0, μ_e = 0.0`. High viscosity and elasticity forced a timestep of 0.0002.

`[CAVEAT]` **Y13 is offline: 57–130 seconds per frame.** SPH particles, 3D, C++/OpenMP on a Xeon. The physics transfers; the method absolutely does not.

## B04 — brush ↔ canvas paint transfer

**The five governing principles** (B04 Table 1) — good acceptance criteria:
1. Paint moves in the direction pushed
2. Paint is conserved (neither created nor destroyed)
3. Brush-canvas transfer requires physical contact and is greater when the brush is moving
4. The more paint loaded on the brush, the more is deposited
5. The more paint on the canvas, the more is picked up by the brush

**Algorithm 1 constants — normalized, therefore portable:**

| Constant | Value |
|---|---|
| `XFER_FRACTION` | 0.1 |
| `MAX_XFER_QUANTITY` | 0.001 |
| `EQUAL_PAINT_CUTOFF` | 1/30 |
| velocity cutoff | `smoothstep(0.2, 0.3, ‖v‖)` |

**Scale anchors:** paint thickness for a thin painting ≈ **0.001 units**; for a thick style ≈ **0.1**. Velocity is in cells per timestep, so **1.0 is the maximum possible**.

**Three heuristics, each fixing a specific ugly:**
- **Equal-paint cutoff** — transfer is gently cut to zero when canvas and brush amounts are nearly equal, preventing paint sloshing back and forth in unstable oscillation.
- **Velocity cutoff** — transfer ramps off below a speed threshold, accounting for the sliding friction needed to pull paint out of the bristles. Without it, *the brush oozes paint unnaturally while sitting still.*
- **Transfer clamp** — caps the amount per step, making deposition more even.

Transfer is **unidirectional per cell** — at any given cell, paint is either depositing or loading, never both. But different parts of the brush can do different things simultaneously.

`[TRAP]` **The Teflon problem.** Advection can strip a cell completely bare, making the canvas behave like *"a material like Teflon."* Fix: clamp the computed flux to leave at least a parameter-defined minimum quantity behind. That one line is paint adhesion.

## Layers, storage and undo

**B04's model:** one active wet layer, **unlimited dry layers**, each represented as a height field.

- Dry layers are static, so only their **combined thickness** and **combined reflectance** need to be maintained — computed once at drying time.
- Pigment data for dry layers must still be kept, for relighting under a different spectrum.
- **Fractional drying:** dry the bottom X% of the wet layer into a new dry layer, leaving the rest wet.

**Tiling & undo:** 64×64 tiles with dirty-tile tracking. Undo data goes into a **dedicated GPU texture**, allocated as tiles, using fast texture-to-texture copies — *not* system memory, because readback from the GPU is punishingly slow. Still true in 2026.

`[DECISION OWED]` **B04's drying is a one-way door.** Your CHART says watercolor and gouache **re-wet** — dried pigment must be able to return to the wet layer, and lifting must remove it entirely. This is a structural requirement on canvas state and none of the papers address it.

## Resolution target

B04: a bristle is ~80 microns wide → **250 DPI bare minimum, 500 DPI for adequate Nyquist sampling** of real paint's fine structure. Another vote for coarse sim under fine display.

---

# CARD 5 — Brush Engine

## The founding decision

**Dynamics at spine resolution. Footprint at bristle resolution.**

VL's central move: solve one or two kinematic spines. Hundreds of bristles are *geometry only*, riding a deformation lattice, never simulated. But the footprint is produced by **rasterizing the actual bristle geometry**, so the mark on the canvas carries per-hair structure that nothing per-hair computed.

You get streaks without paying for them.

`[CEILING]` Splay is geometric, not emergent. Bristles fan because the lattice stretches, not because each hair found its own path around a paper ridge. If you eventually want that, it's WetBrush territory.

## Geometry decoupled from solver — the FFD lattice

1. Model the tuft as an ordinary polygon mesh (VL used Blender) in its undeformed state.
2. Enclose it in a **free-form deformation lattice**.
3. Drive the lattice control points from the kinematic spine(s).
4. The mesh inherits whatever the spines do.

**Proof it works:** their **sponge** — no bristles, not a brush at all — runs in the same framework on a single spine. Shape becomes an asset, not a code path. This is your `BrushFile` schema validated.

**Spine count findings:**
- Single spine → round brushes. **Cannot spread bristles.**
- Two spines → flat-brush spreading and scratching. Each drives one side of the lattice.
- More than two → *"did not result in noticeably better looking results."* **Two is your budget.**

## Bristle representation & dynamics

A bristle is a **kinematic chain**. Each segment has a predefined length and two angles θ, φ (fixed XYZ convention). Twist is assumed zero.

Bend angle: `β = cos⁻¹(cos θ · cos φ)`

**Energy function minimized:**
```
C = Σ_joints E_spring + E_friction
E_spring = (k/2)(180° − β)²
```

`[KEY]` The rest angle is 180° *"when assuming straight bristles."* **Make rest angle a per-segment field in the brush file** and you get: worn/splayed brushes; plasticity (Chu's method nudges the target angle as the wet tuft deforms, so the brush remembers its splay through a stroke and recovers slowly); and shaped tools like fan brushes as configuration rather than code.

**Taper:** at least 4 segments, **decreasing lengths toward the tip**, and **spring constants decrease toward the tip**. Stiff at the ferrule where bristles are packed, flexible at the tip. This is what lets a large round brush draw a hairline.

## Anisotropic friction

VL's observation from watching painters: **the brush is essentially always pulled, almost never pushed**, except for small details like dots.

```
E_friction = μ · Σ_contact (1 − η) · |N| · ‖d‖
η = C_η · max(0, d_p · d/‖d‖)^k
```
where `d_p` is the preferred drag direction, and `0 ≤ C_η ≤ 1` and `k` shape the anisotropic cone. Friction goes to near-zero along the pull direction, stays high sideways or pushing.

`[REQUIREMENT]` The formulation is deliberately **C1-continuous** — required by the optimizer. A hard directional if/else will make any solver chatter. **Use a smooth lobe.**

`[CONNECTION]` Apple Pencil Pro barrel roll rotates the tuft → rotates `d_p` → changes how the brush resists. A real physical consequence of a real input, not a mapped parameter.

## `[TRAP]` Solver traps

**Bristles jumping off the canvas.** With a pure inequality non-penetration constraint (`Plane_z − p_z ≥ 0`), the optimizer can decide that lifting a joint costs less energy than paying the friction to drag it — and the bristle hops across the canvas. **Fix:** for any joint violating the constraint in the current step, replace it with an **equality** constraint pinning it to the surface.

**Don't compute the normal force properly.** VL approximates `N` as constant, re-estimated each timestep, stating plainly that computing it from the full spring configuration is *"tedious and it does not noticeably improve results."* Permission slip — take it.

**Resample the stroke path.** Stylus samples are far sparser than simulation steps. Interpolate positions between samples and run the full contact-and-transfer sequence at each. B04 says the same from the other direction: never move more than one cell per step. Two independent sources, one requirement.

## The reservoir — schema

VL Table 1, effectively liftable:

| Texture | Contents |
|---|---|
| 1 | active pigment set 1: `[p₁, p₂, p₃, p₄]` |
| 2 | active pigment set 2: `[p₅, p₆, p₇, p₈]` |
| 3 | `[water, capacity, unused, unused]` |
| 4 | footprint: `[on/off, tx, ty, unused]` |

`[KEY]` **Per-cell capacity** — the belly of a mop holds more than its tip. That's data, not code.

**Bidirectional transfer** (VL Table 2), per contacting (reservoirCell, canvasCell) pair:
```
toCanvas    = downRate × reservoirQuantity
toReservoir = upRate   × canvasQuantity
```
clamped on both sides against remaining capacity, then applied symmetrically so mass is conserved. Simpler than B04's Algorithm 1, and bidirectional per cell where B04's is unidirectional.

`[PAYOFF]` **Their sponge is just large capacity + high upRate.** Not a special tool — a row in the table. Which means the **lifting and scrubbing** behavior your CHART demands for watercolor and gouache is a brush parameter, not a separate eraser mode.

## The contact slab — footprint generation

Render the tuft from the **canvas's viewpoint**, orthographic projection, with the **near plane just below the paper surface and the far plane just above**. Everything caught in that thin slab is the footprint.

A fragment shader carries the tuft's own 2D texture coordinates `(tx, ty)` through into the footprint, so every footprint cell knows which reservoir cell it came from — that's what makes the reverse update (canvas → brush) possible.

The brush **hovers slightly** above the canvas, and the lattice control points are allowed to penetrate even when the mesh barely does. **Contact depth is a tunable, not a binary.** Setting it is also how you get drybrush.

## Where it runs

Four segments × two spines ≈ **sixteen numbers of state for the whole brush.**

VL split it CPU solver / GPU geometry and canvas. That's still right. Your fluid canvas is millions of cells and belongs in compute shaders; the brush is a pocket calculator. **Solve it in plain Rust on the CPU every frame.**

Consequence: the brush engine can be built and tuned **before the fluid engine works at all.**

## `[OPEN QUESTION]` Quasi-static vs dynamic

VL **rejects time-stepping integration** for bristles, arguing that a stiff, heavily damped system integrated with semi-implicit springs goes inaccurate or unstable, and citing dAb's inability to handle bristle splitting. They solve for **static equilibrium** directly — no dynamics — producing the "snappy" behavior of a real bristle regaining shape the instant it lifts.

XPBD is a fair answer: built precisely to stay stable with stiff constraints, and it maps to a GPU where their SQP optimizer (donlp2) does not — they ran the optimization on the CPU.

**But the observation is testable and free.** Push damping and iteration count toward equilibrium in your XPBD solve and see whether it looks *more* like a brush. If it does, you've found both a look and a saving.

## `[GAPS THEY ADMIT]`

VL skipped **plasticity** (a wet tuft holding its splayed shape through internal friction) and **pore resistance** (bristles catching in surface irregularities). Both are Chu & Tai's. Both matter to you — **pore resistance is dry-brush skip and paper tooth**, straight out of your CHART.

## The canon — you can stop hunting

| Year | Who | Contribution |
|---|---|---|
| 1986 | Strassmann, *Hairy Brushes* | 1D array of idealized bristles, each carrying ink. The origin. |
| 1997 | Lee | First physically-based 3D brush, elastic bristles via Hooke's law |
| 1999/2000 | Saito & Nakajima | Energy optimization instead of integration |
| 2001 | Baxter et al., *dAb* | Haptic spring-mass brush, subdivision surface |
| 2002 | Xu et al. | NURBS "writing primitives" |
| 2002/2004 | Chu & Tai | Anisotropic friction, lateral spine nodes, bristle spreading, **pore resistance, plasticity**, child tufts |
| 2004 | Baxter & Lin | Multi-spine for Western brushes |
| 2015 | Chen, Kim, Ito, Wang, *WetBrush* | Bristle-level GPU 3D painting |

## Test plan — already written for you

**VL Figure 2 — six archetypes:** Chinese calligraphy, flat, round, rigger, fan, mop. Your starting library and coverage matrix.

**VL Figure 7 — eleven named behaviors** to hit: smearing with a clean round brush, scratchy fan strokes, bristle spreading with black ink, sponge deposit and pickup, mixing with a round brush, flat-brush strokes, and **drawing a very fine stroke with the flexible tip of a large round brush**.

**Two pass/fail criteria from the paper:**
1. The tuft must **snap back instantly** when lifted.
2. Experienced artists in their evaluation needed *almost no instruction* — natural strokes appeared within seconds. **If someone has to be told how your brush works, it isn't done.**

## Hardware note

VL got all of this from a **5-DOF tablet: position, pressure, tilt**. That's your Huion. The entire brush engine, including tuning it until it feels right, is buildable on hardware already on your desk. Barrel roll and squeeze are later additions, not prerequisites.

---

# CARD 6 — Paper & Substrate Engine

## Parameter set (from CHART, structured)

| Parameter | Range | Physical meaning | Drives |
|---|---|---|---|
| **Tooth** | hot press / cold press / rough | surface peak-to-valley amplitude | height field amplitude; drybrush skip; where heavy pigment settles |
| **Sizing** | gelatin sized ↔ unsized | cellulose barrier slowing absorption | absorption rate; whether pigment sits up brilliant or sinks in dull |
| **Weight** | 90 / 140 / 300 lb | fiber mass, water capacity | how long the sheet stays workable; buckling |
| **Fiber** | 100% cotton rag ↔ wood pulp | fiber length and strength | whether scrubbing and lifting work or tear |
| **Capillary radius `r_c`** | 0 (canvas) → 2.5e-4 (absorbent paper) | pore size | absorption speed, via Lucas-Washburn |

**Four to five numbers per surface. Every paper and canvas becomes a data row, exactly like `BrushFile`.**

## Lucas-Washburn absorption [Y13 §4.3]

Penetration of liquid into porous material:
```
dl/dt = (P_h + P_c) / (8μl) × (r_c² + 4r_c)
P_c   = (2γ / r_c) · cos θ
```
`l` = capillary length penetrated, `r_c` = capillary radius, `P_h` = hydrostatic pressure, `P_c` = capillary pressure, `μ` = viscosity, `γ` = surface tension, `θ` = contact angle.

`[KEY]` **`r_c` is the single absorptiveness dial.** Y13 sets `r_c = 0` for canvas (no absorption — oil/acrylic) and `2.5e-5` to `2.5e-4` for watercolor paper. That's hot press vs rough, and paper vs canvas, as one physical parameter.

Because the equation computes velocity **explicitly**, it integrates cleanly and transfers from their SPH scheme to your grid.

## Size exclusion — why granulation happens [Y13 §3]

Three things reach the paper surface and separate **by particle size**:

- **Solvent** — smallest, penetrates deepest and fastest.
- **Binder** — less absorbable than solvent; some remains on the surface, *and that remaining binder is what gives the painting its rough texture*.
- **Pigment** — grains are 0.001–0.002 mm, **larger than the paper's pores**, so pigment stays on the surface.

That's a physical explanation of granulation, better than any heuristic. C97 corroborates: watercolor pigments are milled to 0.05–0.5 microns, can penetrate the paper but *"once in the paper they tend not to migrate far."*

## Paper structure [C97 §2.1, §4.1]

- Watercolor paper is linen or cotton rags pounded into fibers — **mostly air**, laced with a microscopic web of tangled fibers.
- **Sizing** (usually cellulose) is impregnated into it to slow absorption and diffusion. Applied sparingly: it coats the fibers and fills some pores while leaving the surface rough.
- C97 models paper as a **height field + fluid capacity field**, with `c = h(c_max − c_min) + c_min` and h generated by pseudo-random processes, scaled to 0 < h < 1.
- The height field's **slope** modifies fluid velocity in the dynamics.

## `[IDEA]` Buckling

CHART: lightweight (90 lb) paper *"buckles and warps instantly upon contact with water, creating deep troughs where wash pools."*

`[UNVERIFIED]` That's A26's local-gravity trick with a physical cause — the paper's own deformation becoming the height field that gravity reads. Every watercolorist knows this behavior; no simulator appears to model it.

## `[NOT YET OBTAINED]`

**Van Laerhoven & Van Reeth (2005), *Real-time simulation of watery paint*, CAVW 16(3–4):429–439** — VL's companion canvas paper, their reference [23]. Three layers: fluid, **surface** (pigment settling into surface irregularities), and **capillary** (paper interior). That's granulation and sizing absorption, from the same team whose brush paper you're building on. Highest-priority remaining fetch.

---

# CARD 7 — Acceptance Criteria

From CHART. These are pass/fail; the bench gets held against them.

## Drying — open times

| Medium | Open time | Full cure |
|---|---|---|
| Watercolor | 1–5 min | — |
| Gouache | 2–10 min | — |
| Acrylic | 5–15 min (~1 hr with retarder) | — |
| Oil | 2–7 days dry-to-touch | 6–12 months |

**Four orders of magnitude.** That's the range your artist-adjustable drying slider must cover.

## Drying — value shift

| Medium | Shift | Finish |
|---|---|---|
| Watercolor | **lighter, 10–30%** | matte, paper-texture sheen |
| Gouache | **inversion** — darks dry lighter, lights dry darker | ultra-matte, velvety chalk |
| Acrylic | **darker** (milky emulsion cures clear) | gloss/satin/matte, customizable |
| Oil | **zero to minimal** | naturally glossy/satin |

`[UNVERIFIED]` Proposed unified mechanism: **wetness modulates scattering.** Wet paper has water filling the gaps between fibers → less internal scattering → deeper, more saturated. Drying returns air to those gaps → scattering rises → value lifts. Acrylic runs the opposite way (binder starts milky, cures clear → scattering falls → darkens). Oil neither absorbs nor evaporates → nothing changes. Likely combined with the K_instrument gloss change. **Test on the bench; gouache's inversion does not fall out of this cleanly and needs measurement.**

## Behavioral targets

**Watercolor:** wet-in-wet fluid capillary diffusion with soft feathered blooms and zero brush-mark retention; wet-on-dry razor-sharp edges; edge darkening; backruns; granulation into paper valleys; broken-tooth drybrush skipping; optical glazing with lower layers permanently visible; **reactivatable with water**; zero body — brush marks collapse flat on drying.

**Gouache:** soft opaque blending, less explosive diffusion than watercolor due to chalk body; opaque coverative layering (light over dark); low body, cracks above ~1mm; **reactivatable**, lifts instantly.

**Acrylic:** mechanical homogenization *and* marbling; 3D plastic impasto retaining wet geometry with minor shrink; cured layers impervious to those above; **permanent, waterproof**.

**Oil:** alla prima infinite feathering with razor-smooth gradients and lost-and-found edges; **benchmark impasto** retaining 100% of wet peak height, buttery knife facets, crisp bristle valleys, no volume loss; multi-day open time; **permanent**, solvent-reactivatable only.

## `[REQUIREMENT]` Reactivity

Watercolor and gouache re-wet. Acrylic and oil do not. **B04's architecture makes drying a one-way door** — this breaks it. Dried pigment must be able to return to the wet layer for water media, and lifting must remove it entirely. Structural requirement on canvas state; no paper in the pile addresses it.

## The five-minute proof tests

Run these the moment the bench renders anything:

1. **Blue + yellow.** MB21 Figure 1 / A26's stated limitation. RGB gives gray; Kubelka-Munk gives green. Your entire product thesis in one swatch.
2. **Yellow ochre + prussian blue.** B04 Figure 10. Linear RGB blending wrongly predicts brown.
3. **Tint ramps.** MB21 Figure 4: real paints *gain* saturation and shift hue when mixed with white. Quinacridone Magenta and Phthalo Blue are the demonstrators — phthalo shifts purple → turquoise as white is added.
4. **Conservation readout.** Total water and total pigment, held steady with the brush lifted.

## Reference plates

Paint the real thing. One wet-in-wet bloom, one hard edge, one glaze over dry, one granulating wash. Photograph them, load into the bench, compare side by side. **This was the Rebelle developer's actual method**, and it's where being an artist is an advantage rather than a gap.

---

# CARD 8 — Decisions You Owe Yourself

No paper will make these. Record the answer and the reason.

| # | Decision | Options | Notes |
|---|---|---|---|
| 1 | **Reactivity model** | one-way drying (B04) vs re-wettable | CHART demands re-wettable for water media. Affects canvas state structurally. |
| 2 | **Spectral bands** | fixed 8 vs adaptive (B04 re-chooses at runtime from the light spectrum) | Fixed allows precomputed pigment tables; adaptive is more accurate under varied lighting. |
| 3 | **Pigment count** | 19 (BE16) / 58 (Berns 2022) / your own subset | Sizes your buffers. You have no invertibility constraint, so you're not capped at 4 like Mixbox. |
| 4 | **Fluid route** | shallow water (C97) vs thin film (A26) vs hybrid | C97 has paper interaction; A26 has validated gravity and drips. |
| 5 | **Oil route** | B04 heuristic (brush *is* the velocity field) vs yield-stress rheology | Ship A, swap B behind the same pass boundary. |
| 6 | **Precision** | half-float throughout | Effectively forced by mobile texture format limits. |
| 7 | **Simulation vs display resolution** | ratio | D15 used 2.0. Revisit against A26's performance table. |
| 8 | **Undo model** | B04's dirty 64×64 tiles + GPU undo texture | Constrains how the wet sheet is stored — decide before writing the contract. |
| 9 | **Rotate-view vs tilt-board** | separate actions or one | See below. |

---

# CARD 9 — Untested Proposals

**These are mine, not findings.** Reasoning that may be sound but has been tested by nobody. Treat as bench experiments.

1. **Wetness modulates scattering** as the unified mechanism for drying value shift across all media. (Card 7.)
2. **K_instrument as the per-medium gloss dial.** BE16 validates the *mechanism* experimentally; the mapping to gouache/watercolor/acrylic/oil is my extension. (Card 2.)
3. **Rotate-view vs tilt-board as separate actions.** In a sketching app, rotating the canvas is a pure view change. In yours it might not be — A26 gives you real gravity, and watercolorists rotate and tip the board *deliberately* to steer a wash. Conflate them and you either infuriate people (washes run every time they turn the page) or lose a real technique. Separate them and board tilt becomes a tool nobody else offers.
4. **Removal as a first-class category.** You have a true height field and a real dry-layer stack, so a scratch/scrape tool is deposition with the sign flipped — subtract height, and what's beneath is already there with its own correct reflectance. Sgraffito, tonking, knife-scraping, and watercolor lifting all fall out. A texture-stamp app has to fake this with an eraser and a guess.
5. **Quasi-static XPBD.** Push damping and iteration count toward equilibrium and check whether the brush looks *more* real, per VL's argument. (Card 5.)
6. **3D-print / raking-light export.** You have the true height field the TVCG relief paper spent 15 minutes per painting trying to *recover*. Export and relighting are nearly free for you. Bench feature and premium feature from the same code.

---

# CARD 10 — Not Yet Obtained

Ranked by value.

1. **Van Laerhoven & Van Reeth (2005)**, *Real-time simulation of watery paint*, CAVW 16(3–4):429–439. The three-layer canvas model — fluid, surface, capillary. Granulation and sizing. Companion to the brush paper.
2. **Chen, Kim, Ito & Wang (2015)**, *WetBrush: GPU-based 3D Painting Simulation at the Bristle Level*, TOG 34(6) Art. 200. True per-bristle simulation. A26 explicitly suggests their fluid work and WetBrush's brush work would combine well.
3. **Chu & Tai (2002, 2004)**. **Plasticity** and **pore resistance** — the two gaps VL admits skipping. Pore resistance is your drybrush skip.
4. **Berns (2022)**, *Artist Acrylic Paint Spectral, Colorimetric, and Image Dataset*, Archiving 2022 — 58 single-pigment paints. grayskyimaging.com.
5. **Deegan et al. (1996)**, *Contact line deposits in an evaporating drop*. The coffee-ring physics under edge darkening, from fluid dynamics rather than graphics.
6. **Vreugdenhil**, *Numerical Methods for Shallow-Water Flow*, Kluwer 1994. C97's numerics source, if you need to go deeper than the paper.
7. **Ashbaugh, Berns, Darling & Taplin (2009)**, *Artist Material BRDF Database for Computer Graphics Rendering*, CIC 2009. Surface/gloss data for artist materials — relevant to impasto lighting and the gloss dial.
8. **Girshick (2004)**, *Simulating Chinese Brush Painting: The Parametric Hairy Brush*, SIGGRAPH Posters.
9. **Sochorová & Jamriška's** pigment-mixing repository, if the unmix routine is ever wanted for the eyedropper. `[Check licensing — Mixbox is a commercial product.]`

---

## Licensing notes

- **A26** is open access under Creative Commons Attribution. Freely usable with citation.
- **Kubelka-Munk, Duncan's mixing law, Saunderson, Lucas-Washburn, von Mises, Navier-Stokes** — all published science, decades old, nobody owns them.
- **BE16** data is published for download by RIT. Check terms of use on the page before shipping it in a product.
- **Mixbox** is a commercial product with its own licensing. Its *method* is theirs. You don't need it — see Card 2.
- I'm not a lawyer. Verify anything you plan to ship.

---

## Search tip

Search paper **titles in quotes**, not author-plus-year. `"Computer-Generated Watercolor"` matches exactly one paper. `Curtis 1997` matches a hygiene researcher.

---

*End of harvest. Next artifact: the canvas contract.*
