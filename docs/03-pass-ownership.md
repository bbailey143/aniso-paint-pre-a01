# CARD 3 — Pass Ownership

Who touches what. An engine may **read** anything; **write** access is exclusive
per pass. This split is the contract — keep it.

## Per-frame pass order

| Pass | Engine | Writes |
|---|---|---|
| BrushContact + Transfer | Brush | `h_f`, `g[8]`, `h_p`, `M` (and the brush reservoir) |
| MoveWater (UpdateVel → RelaxDivergence → FlowOutward) | Fluid | `u, v, h_f, M` |
| MovePigment | Fluid | `g[8]` |
| TransferPigment | Pigment | `g[8] ↔ d[8]` |
| CapillaryFlow | Fluid | `s`, `M` (expansion) |
| BodyFlow (oil/acrylic route, future) | Fluid | `h_p`, `u, v` |
| DryTick | Canvas | `w`, `h_f`, `s`; triggers dry/bake/re-wet transitions |
| ReWet | Canvas | `a[8] → g[8]`, layer bits |
| Bake | Canvas | dry2 → `R_floor`, `h_floor` |
| DryDeposit (dry media) | Dry-media | `d[8]` (and dry layer), gated by tooth + velocity |
| Composite + Light | Render | display only — writes nothing in this schema |

## Rules

- **The Canvas engine owns all state *transitions*** (dry, push-down, bake, re-wet,
  tile promotion/demotion, undo snapshots). Other engines own state *evolution*
  within a band. That is the split.
- **Evaporation belongs to DryTick and nothing else.** It is the only pass permitted
  to *remove* water, decrementing `h_f` and `s` as `w` falls. The Fluid engine moves
  water; DryTick evaporates it; no other pass may destroy it. Otherwise the
  conservation readout — the one gauge trusted to catch every leak — becomes the leak.
- **Dry media bypass the fluid passes.** DryDeposit writes settled pigment directly,
  modulated by the static `PAPER` tooth and the stroke velocity. No water is involved.
- `MoveWater`, `MovePigment`, `BodyFlow`, and `CapillaryFlow` additionally **read**
  the global tilt block ([`02-cell-schema.md`](02-cell-schema.md)); none writes it —
  only the board-tilt tool does.

## Stability notes carried from the bench

- **Relaxation uses the C97 gather form, not a pressure-Poisson iteration.** The
  naive `u -= ξ∇p; p -= ξ∇·u` is unconditionally unstable (eigenvalues `1 ± iξ√λ`,
  magnitude > 1). C97 solves no Poisson equation: it takes a cell's divergence and
  pushes its four faces to cancel it. The GPU gather form is algebraically identical
  — a shared face is pushed by both cells: `u_face += δ(this) − δ(east)`. The operator
  on divergence is `(1 − ξL)`, eigenvalues in `[0, 8]`, stable for `ξ < 0.25`; at
  C97's `ξ = 0.1` the worst mode damps to 0.2/iteration. See [`05-fluid.md`](05-fluid.md).
- **Staggered grid is mandatory.** Collocated velocities give odd-even (checkerboard)
  pressure decoupling that a central-difference gradient cannot see, so it grows
  unopposed. The bench hit this and confirmed the schema's staggered requirement.
- **Adaptive relaxation count.** C97 allows up to 50 iterations with early exit under
  `τ = 0.01`. The bench settled at ~2 in a gentle regime (3.78 ms/frame vs a 16.7 ms
  budget) by sizing next frame's count from this frame's residual. Re-measure against
  a sharp brush load — a real stroke slamming water onto dry paper injects far higher
  divergence and the controller should climb.
