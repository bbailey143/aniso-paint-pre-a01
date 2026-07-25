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
