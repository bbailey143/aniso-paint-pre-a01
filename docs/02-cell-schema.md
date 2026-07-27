# CARD 2 — Cell Schema

One cell is a vertical core sample through the paint film and the paper beneath it.
Adopted from the `main` canvas contract, which the bench validated. RGBA16F
throughout (Card 0, invariant 3).

## Per-cell state, bottom to top

### Baked floor (always present, may be empty)

Everything older than the two live dry layers, collapsed. Optically complete,
physically inert, **not liftable**. Stored *spectrally* so relighting still works;
only un-mixing/lifting is lost at this depth.

| Field | Count | Notes |
|---|---|---|
| `R_floor[8]` | 8 | 8-band spectral reflectance. Paper folded in at bake via KM compositing. |
| `h_floor` | 1 | Sum of baked layer thickness; contributes to relief. |
| flags | 1 | Medium of topmost baked layer, sealed bit, spare. |

### Live dry layers (2 slots: `dry1` newer, `dry2` older)

Dried applications that still remember their pigment. Liftable for water media.

| Field | Count | Notes |
|---|---|---|
| `a[8]` | 8 | Pigment amounts, aligned to the cell's 8 slots. |
| `t` | 1 | Thickness / height contribution. |
| meta | 1 | Medium id, dryness fraction, reactivatable bit. |

### Wet film (only on wet tiles — where fluid/pigment/brush spend the frame)

| Field | Count | Notes |
|---|---|---|
| `M` | 1 | Wet mask (1 if wet). Gates the fluid pass. |
| `h_f` | 1 | Fluid height (water + vehicle standing on the surface). |
| `u, v` | 2 | Velocity, staggered (stored at cell boundaries). |
| `g[8]` | 8 | Suspended pigment (floats in the fluid, moves with flow). |
| `d[8]` | 8 | Settled pigment (adsorbed onto the surface). g↔d *is* granulation and lifting. |
| `s` | 1 | Capillary saturation (water inside the paper). Drives backruns/creeping edges. |
| `w` | 1 | Wetness/dryness continuum. Governs value shift, re-wet eligibility, bloom↔backrun. |
| `h_p` | 1 | Body height (paint standing above the surface). ~0 for watercolour; load-bearing for oil/acrylic. Conserved exactly. |
| flags/layer | 1 | Active-medium id; layer index (reserved, default 0). |

### Substrate (static, shared, read-only)

Not per-cell dynamic state. `PAPER` texture holds height `h`, capacity `c`, sizing,
and capillary radius `r_c`. Generated or loaded once; every engine reads, none writes.

### Global frame state (not per-cell)

Board orientation is one small uniform block per document: gravity vector
`g⃗ = (gx, gy)` (downhill in canvas space, zero when flat) and tilt cosine `cos α`
(scales diffusion; at vertical it reaches zero so pigment follows flow instead of
smearing). **View rotation never writes this block** — turning the canvas for wrist
comfort is a render-side transform only; tipping the board is a separate tool.

## Texture layout — RGBA16F, per wet tile

| Texture | R | G | B | A |
|---|---|---|---|---|
| `WET0` | `M` | `h_f` | `u` | `v` |
| `WET1` | `g1` | `g2` | `g3` | `g4` |
| `WET2` | `g5` | `g6` | `g7` | `g8` |
| `WET3` | `d1` | `d2` | `d3` | `d4` |
| `WET4` | `d5` | `d6` | `d7` | `d8` |
| `WET5` | `s` | `w` | `h_p` | flags/layer |
| `DRY1A/B` | `a1..a4` / `a5..a8` | | | |
| `DRY2A/B` | (same shape) | | | |
| `DRYM` | `t1` | `meta1` | `t2` | `meta2` |
| `FLOOR0/1` | `R1..R4` / `R5..R8` | | | |
| `FLOOR2` | `h_floor` | flags | spare | spare |
| `PAPER` (static, canvas-wide) | `h` | `c` | sizing | `r_c` |

**Alignment note.** `WET1/2`, `WET3/4`, `DRY*A/B`, and the brush reservoir's two
pigment textures are all the same 2×RGBA shape. Brush↔canvas and wet↔dry transfers
are slot-for-slot moves with no translation layer. This is deliberate; preserve it.

The **pigment library** (12 rows of `K[8], S[8]` + per-medium constants) lives in
small uniform/lookup buffers, referenced by a slot→library-id map held per document.
Cells store amounts; the library stores behaviour ([`04-color-km.md`](04-color-km.md)).

## Counts and memory

Wet film 24 half-floats + dry1 10 + dry2 10 + floor 10 = **54 half-floats =
108 bytes/cell** (logical). The bench found every wet field needs read/write
separation (a pass can't read neighbours and overwrite itself in one dispatch), so
the **working figure is ~2× the logical** — ~96 MB at 1024² wet. Comfortable on
target hardware. Only *wet* tiles carry all 54.
