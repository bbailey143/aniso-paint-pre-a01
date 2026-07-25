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
