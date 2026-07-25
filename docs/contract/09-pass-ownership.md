## 9. Pass ownership

Who touches what. An engine may read anything; write access is exclusive per pass.

| Pass (order per frame) | Engine | Writes |
|---|---|---|
| BrushContact + Transfer | Brush | `h_f`, `g[8]`, `h_p`, `M` (and the brush reservoir) |
| MoveWater | Fluid | `u, v, h_f, M` |
| MovePigment | Fluid | `g[8]` |
| TransferPigment | Pigment | `g[8] ↔ d[8]` |
| CapillaryFlow | Fluid | `s`, `M` (expansion) |
| BodyFlow (oil/acrylic route) | Fluid | `h_p`, `u, v` |
| DryTick | Canvas | `w`, `h_f`, `s`; triggers §5 transitions |
| ReWet | Canvas | `a[8] → g[8]`, layer bits |
| Bake | Canvas | dry2 → `R_floor`, `h_floor` |
| Composite + Light | Render | display only — writes nothing in this schema |

The Canvas engine owns all state *transitions* (dry, push-down, bake, re-wet, tile promotion/demotion, undo snapshots). Other engines own state *evolution* within a band. This split is the contract.

**Evaporation belongs to DryTick, and to nothing else.** It is the only pass permitted to *remove* water from the system, decrementing `h_f` and `s` as `w` falls. The Fluid engine moves water; DryTick evaporates it; no other pass may destroy it. Without this the §8 conservation readout drifts on its own — and the one gauge trusted to catch every other leak becomes the leak.

`MoveWater`, `MovePigment`, `BodyFlow`, and `CapillaryFlow` additionally **read** the global tilt block (§2.5). None of them writes it; only the board-tilt tool does.

---
