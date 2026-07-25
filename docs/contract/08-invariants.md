## 8. Invariants and bench readouts

Non-negotiable, from the cross-cutting cards. The bench displays these permanently.

1. **Conservation.** Total water (`Σ h_f + Σ s`), total pigment per slot (`Σ g + Σ d + Σ a(dry1,dry2) + floor-baked ledger`), and total body volume (`Σ h_p + Σ t + Σ h_floor`) are displayed live. Paint a stroke, lift the brush, watch the numbers hold (minus explicit evaporation, which is metered separately). All inter-cell movement is implemented as **clamped fluxes between cells** (A26), never per-cell height clamps. No semi-Lagrangian advection anywhere in the wet passes — it silently loses mass, tolerable never, fatal for impasto.
2. **The Teflon clamp.** Advection and pickup leave a parameter-defined minimum `h_p`/`d` behind (B04). That one clamp *is* paint adhesion; it is a per-medium tunable, not a bug guard.
3. **Dimensionless parameters.** Every constant in every pass over this state is a fraction, ratio, or rate-per-unit-time (B04, A26). Never per-frame deltas, never units of one grid cell. D15's non-portable constants are the cautionary tale.
4. **Half-float everywhere** (D8). Any intermediate needing more precision is small and named.
5. **One quote of truth for pigment behavior:** the library. If a pass needs a pigment property, it looks it up; it never caches per-cell copies.

---
