## 3. Texture schema

RGBA16F throughout (D8). Per **wet tile**:

| Texture | R | G | B | A |
|---|---|---|---|---|
| `WET0` | `M` | `h_f` | `u` | `v` |
| `WET1` | `g1` | `g2` | `g3` | `g4` |
| `WET2` | `g5` | `g6` | `g7` | `g8` |
| `WET3` | `d1` | `d2` | `d3` | `d4` |
| `WET4` | `d5` | `d6` | `d7` | `d8` |
| `WET5` | `s` | `w` | `h_p` | flags/layer |
| `DRY1A` | `a1` | `a2` | `a3` | `a4` |
| `DRY1B` | `a5` | `a6` | `a7` | `a8` |
| `DRY2A/B` | (same shape as DRY1) | | | |
| `DRYM` | `t1` | `meta1` | `t2` | `meta2` |
| `FLOOR0` | `R1` | `R2` | `R3` | `R4` |
| `FLOOR1` | `R5` | `R6` | `R7` | `R8` |
| `FLOOR2` | `h_floor` | flags | spare | spare |
| `PAPER` (static, canvas-wide) | `h` | `c` | sizing | `r_c` |

Alignment note: `WET1/2`, `WET3/4`, `DRY*A/B`, and the brush reservoir's two pigment textures (VL Table 1) are all the same 2×RGBA shape. Brush↔canvas transfer and wet↔dry transfer are slot-for-slot moves with no translation layer. This is deliberate; preserve it.

The shared **pigment library** (24–48 rows of K[8], S[8], ρ, ω, γ per Card 2 + Card 3, with S=1 pinned for Titanium White per B04) and per-medium constants (k₁, k₂, K_instrument, drying curve, shrink factor) live in small uniform/lookup buffers. They are referenced by slot→library-id mapping held per document (or per tile region if D-open resolves to dynamic palettes). **Cells store amounts. The library stores behavior. Never blur this line.**

---
