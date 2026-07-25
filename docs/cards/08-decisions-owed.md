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
