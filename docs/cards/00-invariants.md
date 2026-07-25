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
