## 4. Tiles — the canvas is bigger than the physics

### 4.1 Structure

The canvas is divided into **64×64-cell tiles** (B04). A tile is always in exactly one state:

| State | Carries | Cost |
|---|---|---|
| **Blank** | Nothing — not allocated | ~0 |
| **Dry** | Floor textures + any live dry layers present | ~30–40 bytes/cell |
| **Wet** | Everything in §3 | 108 bytes/cell |

Tiles are allocated on first paint contact, promoted to Wet when water arrives, demoted to Dry when `w` crosses the dry threshold everywhere in the tile, and are eligible for **disk paging** when off-screen and Dry.

### 4.2 The wetness budget

**D7: ~1024² cells (≈256 tiles of 64²) may be Wet simultaneously.** The fluid, pigment, and capillary passes run *only* on Wet tiles. Canvas size is therefore limited by dry storage and paging, not by the solver — 4096² and 8192² canvases (≈13"–27" at 300 DPI) are legitimate targets.

The wet set must include a **one-tile halo**: capillary creep (C97) and the mobility function (A26) let fluid enter neighboring dry cells, so any Dry tile adjacent to a Wet tile is promoted speculatively and demoted if nothing arrives.

`[UNVERIFIED — bench early]` **Full-sheet wet-in-wet** (artist soaks the entire large canvas) exceeds the budget by design. Proposed handling: the simulation grid coarsens as the wet area grows, on the reasoning that a large open wash carries its interesting behavior at its edges, not in its flat interior. This is untested and is exactly the kind of thing that either looks right or obviously wrong. Build the bench case before the architecture hardens around it.

### 4.3 Display vs simulation

Per the cross-cutting invariant: coarse simulation under fine display (D15 ratio 2.0; B04's 250–500 DPI argument). The display/compositing layer runs at canvas resolution; physics runs at the wet-tile grid. The contract's fields are simulation-grid fields; the render pass upsamples using the paper height field for sub-cell detail.

---
