# CARD 0 — Invariants & Sources

The fence. This exists so no future session re-reads the papers, and none can
quietly invent a number.

## Source register

| # | Source | Good for |
|---|---|---|
| **C97** | Curtis et al. *Computer-Generated Watercolor.* SIGGRAPH '97, 421–430. | The fluid spine. Three-layer model, edge darkening, backruns, granulation, drybrush, pigment transport. |
| **B04** | Baxter, Wendt, Lin. *IMPaSTo.* NPAR '04, 45–56. | Oil/thick paint. Conservative advection, brush transfer, undo, spectral KM, band reduction. |
| **A26** | Herson, Paris, Michel (Adobe). *Dripping Thin Films for Real-time Digital Painting.* Eurographics 2026, CGF 45(2). CC-BY. | Modern fluid. Dimensionless params, mobility fix, domino relaxation, tilt diffusion. |
| **VL** | Van Laerhoven & Van Reeth. *Brush Up Your Painting Skills.* The Visual Computer. | The brush engine. FFD decoupling, reservoir schema, anisotropic friction. |
| **BE16** | Berns. *Artist Paint Spectral Database.* CIC24, 2016. | Measured pigment K & S, Saunderson constants. |
| **B22** | Berns. *Artist Acrylic Paint Spectral, Colorimetric, and Image Dataset.* Archiving 2022. | 58 single-pigment paints, masstones + tints. Exceeds the 12-pigment target. |
| **MB21** | Sochorová & Jamriška. *Practical Pigment Mixing for Digital Painting.* TOG 40(6), 2021 (Mixbox). | Duncan mixing law, KM chain, gamut/overmixing warnings. Method itself does not apply — we store concentrations. |
| **Y13** | You et al. *Realistic paint simulation…* CAVW 24:297–306, 2013. | Lucas-Washburn absorption, size-exclusion granulation. Physics transfers; SPH method does not. |
| **GUIDE** | Bartford's Media Consolidated Physics guide (this build's chart). | Acceptance criteria and the extended-media roadmap. |

## Cross-cutting invariants

Violating any one of these is how the project goes wrong.

### 1. Conservation is the axiom

Three independent teams built their whole numerical scheme around it. **All
inter-cell movement is implemented as clamped fluxes between cells** (A26 clamps
fluxes across edges, not heights per pixel — that is what preserves total mass).
**No semi-Lagrangian advection anywhere in the wet passes** — it silently loses
mass; tolerable never, fatal for body media.

Consequence: the app displays total water and total pigment live. Paint a stroke,
lift off, watch the numbers hold (minus explicit evaporation, metered separately).

### 2. Parameters must be dimensionless or normalized

Every constant is a **fraction, a ratio, or a rate-per-unit-time**. Never a
per-frame delta, never in units of "one grid cell." D15's non-portable constants
(vorticity ×Δx, drying subtracted once per frame → dries twice as fast at 120 fps)
are the cautionary tale. A26 rebuilt its whole equation into dimensionless space to
fix exactly this.

### 3. Precision — half-float everywhere

RGBA16F throughout (many mobile GPUs and browsers lack 32-bit float RGBA; A26).
B04 confirmed half-precision sufficient for all textures except small named
intermediates. Design for it from the start.

### 4. Coarse sim under fine display

The physics grid can be coarser than the display grid. The visual layer wants
resolution; the simulation does not need it.

### 5. One quote of truth for pigment behaviour

The library. If a pass needs a pigment property it looks it up; it never caches a
per-cell copy. Cells store amounts; the library stores behaviour.

### 6. The Teflon clamp

Advection and pickup leave a parameter-defined minimum behind (B04). That one
clamp *is* paint adhesion — a per-medium tunable, not a bug guard.

## The method rule

**Run any conservation, timing, or stability result twice on an identical run
before interpreting it.** On `main`, three rounds of the bench produced three
confident diagnoses of one symptom — precision loss, then instability, then memory
corruption — and only the third survived. The check that would have killed the
first two immediately was running the same command twice. Do that first, always.
