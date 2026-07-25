## 7. Layers — the reservation

**D6.** The schema carries a layer index (in `WET5` flags and per-tile metadata), defaulting to 0. Nothing else is built now. When layers ship, the design is already implied by this contract:

- A layer = one full canvas-state instance as defined here. **Only one layer is Wet at a time** — the one being painted. All others are fully dried/baked, which the pipeline in §5 already produces. Memory therefore stays flat regardless of layer count.
- Inter-layer compositing is the KM layer equation (§5) — the same math, applied per layer instead of per glaze.
- **Physical coupling (the differentiator):** the active layer's fluid and deposition passes read the *combined* `h_floor` of all layers beneath as their relief. Paint on layer 3 pools in the valleys of layer 1's impasto. This is what "layers" means in a physically honest app, and it falls out of fields already in the schema. A texture-stamp app cannot do this.
- What is explicitly not promised: two simultaneously wet layers (physically incoherent — two wet sheets cannot occupy the same space), per-layer opacity hacks that bypass KM.

Cost of the reservation today: one field, default 0, and the discipline that no pass may assume "the canvas" is singular in its function signatures — pass the canvas-state handle, don't reference a global.

---
