## 2. The cell — state inventory

One cell is a vertical core sample through the paint film and the paper beneath it. Reading bottom to top:

### 2.1 Baked floor (1 per cell, always present, may be empty)

Everything older than the two live dry layers, collapsed. Optically complete, physically inert, **not liftable**.

| Field | Count | Notes |
|---|---|---|
| Spectral reflectance `R_floor[8]` | 8 | 8-band (Card 2: band count closed). Paper reflectance is folded in at bake time via KM compositing (C97 §5.2). Because it is stored *spectrally*, relighting under a different illuminant still works — what is lost is only un-mixing/lifting, which D3 already forbids at this depth. |
| Combined height `h_floor` | 1 | Sum of all baked layers' thickness. Contributes to the relief the lighting pass and the flow-over-relief term read. |
| Flags | 1 | Medium of topmost baked layer, sealed bit, spare bits. |

### 2.2 Live dry layers (2 slots: `dry1` newer, `dry2` older)

Dried applications that still remember their pigment. Liftable for water media (D3). Kept per-pigment for lifting *and* for relighting (B04 requirement).

Per layer:

| Field | Count | Notes |
|---|---|---|
| Pigment amounts `a[8]` | 8 | Aligned to the cell's 8 slots. |
| Thickness `t` | 1 | Height contribution. |
| Meta | 1 | Medium id, dryness fraction (supports B04 fractional drying — a layer can be partially dry), reactivatable bit. |

### 2.3 Wet film

The volatile band. Only exists on wet tiles; this is where the fluid, pigment, and brush engines spend their frame.

| Field | Count | Notes |
|---|---|---|
| Wet mask `M` | 1 | 1 if wet (C97). Gates the entire fluid pass. |
| Fluid height `h_f` | 1 | Water + vehicle standing on the surface. |
| Velocity `u, v` | 2 | Staggered grid — stored at cell boundaries per C97/A26; the texture schema notes the offset. |
| Suspended pigment `g[8]` | 8 | Floating in the fluid. Moves with flow (C97 MovePigment). |
| Settled pigment `d[8]` | 8 | Adsorbed onto the surface (C97 TransferPigment). Distinct from suspended — this distinction *is* granulation and lifting. |
| Capillary saturation `s` | 1 | Water inside the paper (C97 capillary layer). Drives backruns and creeping edges. |
| Wetness/dryness `w` | 1 | The continuum parameter. Governs value shift, re-wet eligibility, and the bloom↔backrun behavior spectrum (C97's 29-year open problem — this field is the thesis). |
| Body height `h_p` | 1 | Paint standing above the surface (B04). Near zero for watercolor; load-bearing for oil/acrylic. Conserved exactly — see §8. |
| Layer index + flags | 1 | **D6 reservation.** Default 0. Also carries active-medium id. |

### 2.4 Substrate (static, shared, read-only)

Not per-cell dynamic state. The paper engine's height field `h`, capacity `c`, sizing, and capillary radius `r_c` (Card 6) are canvas-wide static textures, generated or loaded once. Every engine reads them; none writes them.

### 2.5 Global frame state (not per-cell)

**D11.** Board orientation is one small uniform block per document, not a field in the cell:

| Field | Count | Notes |
|---|---|---|
| Gravity vector `g⃗ = (gx, gy)` | 2 | Downhill direction in canvas space. Zero when the board lies flat. |
| Tilt cosine `cos α` | 1 | Scales diffusion (A26). At vertical it reaches zero, so pigment purely follows the flow instead of smearing into mush. |

Costs nothing per cell. `MoveWater` and `BodyFlow` add the gravity term; `MovePigment` and `CapillaryFlow` scale diffusion by `cos α`; the per-pixel local-gravity rotation (A26) happens inside `MoveWater`, perturbing `g⃗` by `∇h` read from the static `PAPER` texture. Paint pooling in the grain therefore falls out of physics, not a texture overlay.

**View rotation never writes this block.** Turning the canvas for a better wrist angle is a render-side transform only. Tipping the board is a separate, deliberate tool.

### 2.6 The count

| Band | Numbers |
|---|---|
| Wet film | 24 |
| Dry layer 1 | 10 |
| Dry layer 2 | 10 |
| Baked floor | 10 |
| **Total** | **54 half-floats = 108 bytes/cell** |

At the D7 wetness budget of 1024² fully-live cells: **~113 MB** of maximally-wet canvas. Comfortable on target hardware. Note that only *wet* tiles carry all 54; see §4 for what dry and blank tiles actually cost.

---
