# Canvas Contract — Specification

**The fifth engine. Canvas State.**
Drafted July 2026. Companion to `watercolor-engine-spec.md`, `oil-engine-spec.md`, `brush-engine-spec.md`, and the Physics Reference Cards. This document is the contract those three specs have been pointing at: it defines what the canvas *is*, what a cell stores, who may touch it, and what must remain true at all times.

Everything here is either (a) a finding from the reference cards, cited by card, or (b) a **[DECISION]** made by the artist and recorded with its reason. Nothing else enters.

---

## 0. Purpose and scope

The four other engines are verbs — the brush contacts, the fluid flows, the pigment settles, the paper absorbs. The canvas is the noun they all act on. This contract defines:

1. The per-cell state schema (the "core sample")
2. The texture layout that realizes it in half-float GPU memory
3. The tile system: activation, budget, paging
4. The drying pipeline: wet → live dry → baked floor
5. Undo semantics
6. The layer reservation
7. Conservation invariants and bench readouts
8. Pass ownership: which engine reads and writes which field

Out of scope: brush internals (brush spec), fluid solver internals (watercolor/oil specs), UI. This document is the *interface between* those things.

---

## 1. Ratified decisions

These were made deliberately, with reasons. Do not reopen them casually; if one must change, every section below it changes too.

| # | Decision | Choice | Reason |
|---|---|---|---|
| D1 | **Per-cell pigment slots** | **8** (suspended and settled each carry 8) | Real paint rarely has more than ~4 distinct pigments at one spot. 8 gives headroom, matches the brush reservoir width (VL: 2 textures × 4 pigments), and keeps the cell affordable. The *library* (24–48 pigments) is unaffected — it is shared lookup data and costs nothing per cell. |
| D2 | **Slot overflow rule** | Merge the two most spectrally similar pigments into one combined amount | The app never refuses a brushstroke. Merging near-identical pigments is visually invisible; dropping the oldest would visibly change existing paint. |
| D3 | **Re-wettability depth** | **Two live dry layers**, everything older auto-bakes | Artist ruling: lifting more than two dried applications deep would tear real paper and mud the work; two is the honest physical limit and it bounds the cell to a fixed size. Applies to water media only (watercolor, gouache); acrylic and oil dry layers are chemically sealed regardless of position (CHART). |
| D4 | **Baking** | Automatic and invisible. When a third dry layer forms, the oldest live dry layer collapses into the baked floor | Memory stays flat over any session length. The artist never manages this. |
| D5 | **Undo unit** | **The brush stroke** (pen-down to pen-up), not the physics that follows it | Digital-native expectation. Implemented as dirty-tile snapshots (B04). See §6 for the seam wrinkle and its mitigation. |
| D6 | **Layers** | Single-layer system now; **layer index field reserved in the schema, default 0** | Adding the field now costs nothing; adding it later touches every buffer and pass signature in five engines. No layer UI, no reordering, no panel — just the slot. See §7. |
| D7 | **Simulation budget** | ~1024² cells of *simultaneously wet* canvas | Derived from A26 performance table scaled to iPad-class GPU, times the ~54-number cell. This is a wetness budget, not a canvas size — see §4. |
| D8 | **Precision** | Half-float (16-bit) throughout, RGBA16F textures | Forced by mobile texture format support (A26); confirmed sufficient by B04. |

**[OPEN — UI decision, does not block]** Whether the 8-slot palette is fixed per document (pick pigments before painting, like filling pans) or claimed dynamically as colors are used. Fixed is simpler and enables precomputation; dynamic is friendlier to non-planners. The schema below is identical either way.

---

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

### 2.5 The count

| Band | Numbers |
|---|---|
| Wet film | 24 |
| Dry layer 1 | 10 |
| Dry layer 2 | 10 |
| Baked floor | 10 |
| **Total** | **54 half-floats = 108 bytes/cell** |

At the D7 wetness budget of 1024² fully-live cells: **~113 MB** of maximally-wet canvas. Comfortable on target hardware. Note that only *wet* tiles carry all 54; see §4 for what dry and blank tiles actually cost.

---

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

## 5. The drying pipeline

The one-way door is replaced by a conveyor with a two-stop liftable zone (D3, D4):

```
wet film ──dry──▶ dry1 ──(new layer arrives)──▶ dry2 ──(another arrives)──▶ baked into floor
   ▲                │                              │
   └──── re-wet ────┴───────── re-wet ─────────────┘        (water media only)
```

**Drying** (wet → dry1): driven by `w` under the artist-adjustable drying clock (Card 7: four orders of magnitude across media). Settled pigment `d[8]` and remaining suspended pigment transfer into `dry1.a[8]`; body height `h_p` transfers into `dry1.t`, applying the per-medium **shrink factor** (oil: 0%, CHART benchmark; acrylic: minor; water media: near-total collapse). Supports fractional drying (B04): dry the bottom fraction, leave the top wet.

**Push-down** (dry1 → dry2 → floor): when a new application dries over existing dry1, dry1's contents move to dry2; old dry2 is composited into the floor: its 8-band reflectance is computed from its pigments (KM Form 1, C97 §5.2) and layered onto `R_floor` via Kubelka's compositing equations; its `t` adds to `h_floor`. Its per-pigment identity is gone — by ruling D3, nothing ever needed it again.

**Re-wetting** (dry1/dry2 → wet): water media only, gated by the layer's reactivatable bit. Water arriving on the cell moves pigment from `a[8]` back into suspended `g[8]` at a per-medium rate (gouache lifts near-instantly, watercolor gradually — CHART). Lifting *removes* it: the amounts genuinely leave the dry layer. Acrylic/oil layers ignore water entirely; oil responds only to the solvent tool (future).

**Sealing:** an acrylic or oil layer drying over water-media dry layers seals them — their reactivatable bits clear (CHART: cured acrylic is impervious to layers above).

---

## 6. Undo

**D5: the unit is the stroke.** Pen-down opens an undo record; pen-up closes it.

Mechanism (B04, still correct in 2026): before a stroke first touches a tile, that tile's textures are copied into a dedicated GPU undo texture pool via texture-to-texture copies — never through system memory readback. Undo restores the snapshots; redo re-copies forward.

**The seam wrinkle.** Restoring a tile rewinds *everything* in it, including autonomous wash motion since the snapshot. Undoing seconds after pen-up is invisible; undoing after thirty seconds of bloom spread would snap the stroke's footprint back to an older wetness state than its surroundings — a visible seam.

**Mitigation (required):** the stroke's dirty-tile set is not frozen at pen-up. As long as wetness that the stroke introduced continues to spread, newly-reached tiles are snapshotted *on first contact by that spread* and appended to the stroke's undo record. The record closes when the spread settles or the next stroke begins. Undo then restores a consistent region. Bench test: stroke into a wet wash, wait 30 s, undo — no seam.

Undo depth, persistence across sessions, and memory ceiling for the undo pool are implementation-time tunables, not contract items.

---

## 7. Layers — the reservation

**D6.** The schema carries a layer index (in `WET5` flags and per-tile metadata), defaulting to 0. Nothing else is built now. When layers ship, the design is already implied by this contract:

- A layer = one full canvas-state instance as defined here. **Only one layer is Wet at a time** — the one being painted. All others are fully dried/baked, which the pipeline in §5 already produces. Memory therefore stays flat regardless of layer count.
- Inter-layer compositing is the KM layer equation (§5) — the same math, applied per layer instead of per glaze.
- **Physical coupling (the differentiator):** the active layer's fluid and deposition passes read the *combined* `h_floor` of all layers beneath as their relief. Paint on layer 3 pools in the valleys of layer 1's impasto. This is what "layers" means in a physically honest app, and it falls out of fields already in the schema. A texture-stamp app cannot do this.
- What is explicitly not promised: two simultaneously wet layers (physically incoherent — two wet sheets cannot occupy the same space), per-layer opacity hacks that bypass KM.

Cost of the reservation today: one field, default 0, and the discipline that no pass may assume "the canvas" is singular in its function signatures — pass the canvas-state handle, don't reference a global.

---

## 8. Invariants and bench readouts

Non-negotiable, from the cross-cutting cards. The bench displays these permanently.

1. **Conservation.** Total water (`Σ h_f + Σ s`), total pigment per slot (`Σ g + Σ d + Σ a(dry1,dry2) + floor-baked ledger`), and total body volume (`Σ h_p + Σ t + Σ h_floor`) are displayed live. Paint a stroke, lift the brush, watch the numbers hold (minus explicit evaporation, which is metered separately). All inter-cell movement is implemented as **clamped fluxes between cells** (A26), never per-cell height clamps. No semi-Lagrangian advection anywhere in the wet passes — it silently loses mass, tolerable never, fatal for impasto.
2. **The Teflon clamp.** Advection and pickup leave a parameter-defined minimum `h_p`/`d` behind (B04). That one clamp *is* paint adhesion; it is a per-medium tunable, not a bug guard.
3. **Dimensionless parameters.** Every constant in every pass over this state is a fraction, ratio, or rate-per-unit-time (B04, A26). Never per-frame deltas, never units of one grid cell. D15's non-portable constants are the cautionary tale.
4. **Half-float everywhere** (D8). Any intermediate needing more precision is small and named.
5. **One quote of truth for pigment behavior:** the library. If a pass needs a pigment property, it looks it up; it never caches per-cell copies.

---

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
| DryTick | Canvas | `w`; triggers §5 transitions |
| ReWet | Canvas | `a[8] → g[8]`, layer bits |
| Bake | Canvas | dry2 → `R_floor`, `h_floor` |
| Composite + Light | Render | display only — writes nothing in this schema |

The Canvas engine owns all state *transitions* (dry, push-down, bake, re-wet, tile promotion/demotion, undo snapshots). Other engines own state *evolution* within a band. This split is the contract.

---

## 10. Acceptance tests

Beyond Card 7's media targets and the five-minute proofs, this contract adds:

1. **Conservation soak:** heavy impasto stroke, hands off, 60 s — total body volume drifts zero. Wet wash, hands off — water declines only by the metered evaporation rate.
2. **Slot overflow:** paint 9 distinct pigments onto one spot — no refusal, no visible pop at the merge.
3. **Lift depth:** three dried watercolor applications; damp brush lifts the top two, cannot reach the third. Gouache lifts instantly; acrylic ignores water.
4. **Seal:** acrylic over dried watercolor; water no longer lifts the watercolor.
5. **Undo seam:** stroke into live wash, wait 30 s, undo — consistent region, no seam.
6. **Session flatness:** six hours of layered painting on one region — cell memory identical to minute ten.
7. **Big canvas:** 4096² document, small wet working area — frame time indistinguishable from a 1024² document.
8. **Halo creep:** wash spreads across a tile boundary via capillary action without a visible grid artifact.

---

## 11. Open items carried forward

- Full-sheet wet-wash coarsening strategy `[UNVERIFIED]` — bench before hardening (§4.2).
- Fixed vs dynamic palette — UI-stage decision; schema is agnostic.
- Undo depth / persistence tunables (§6).
- Solvent tool for oil re-working — future; the reactivatable-bit machinery in §5 is where it plugs in.
- Spectral bands fixed vs adaptive (Card 8 #2) — floor storage assumes fixed 8; if adaptive is ever chosen, `R_floor` must store band *identities* too. Flagging the coupling so the choice is made knowingly.

---

*End of contract. The five engines now all have a spec. Next: performance feasibility bench, then the Dart/GPU port plan.*
