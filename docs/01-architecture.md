# CARD 1 — Architecture

The organizing idea, stated once: **media are separated from brushes; each is a
class in a hierarchy with shared ancestry.** A medium is a *data row of physical
parameters* that plugs into *shared functional equations* (the GPU passes). Adding
a medium later is a new row, not a new code path.

This is the same principle the evidence base already proved: **the library stores
behaviour, cells store amounts.** Never blur that line.

## Three hierarchies

### Media — what is deposited

```
Medium (abstract: optical + transfer + drying interface)
├── WetMedium            fluid dynamics, applied via a Brush, KM optics, may have body
│   ├── WaterMedium      solvent = water, re-wettable, capillary absorption
│   │   ├── Watercolor   [BUILD]  zero body, transparent, lightens on dry
│   │   ├── Gouache      [future] chalky body, opaque, value inversion on dry
│   │   └── Acrylic      [future] body, dries darker + waterproof (one-way door)
│   └── OilMedium        [future] solvent = oil, non-absorbing substrate, slow cure, impasto
└── DryMedium            deposition-based, tooth-driven, no fluid pass
    ├── GranularDry
    │   ├── Graphite     [BUILD]  pencil; hardness (H..B) scales deposition + tooth catch
    │   ├── Charcoal     [future]
    │   └── Pastel       [future]
    └── InkMedium
        ├── Ballpoint    [BUILD]  viscous paste, near pressure-flat, consistent line
        ├── FountainPen  [future] liquid ink, feathering; may be treated as a brush
        └── GelPen       [future]
```

Every `Medium` exposes the **same property surface** (the shared ancestry). See
[`07-media.md`](07-media.md) for the full list. A subclass overrides values, never
methods. That is what lets a future user build tempera by tweaking numbers already
present on `WaterMedium`.

### Brushes — what manipulates fluid / deposits media

```
Brush (geometry + dynamics; a data row, not a code path)
├── RoundSable [BUILD]  single kinematic spine
└── FlatSable  [BUILD]  two spines (spreading, scratching)
```

Per-brush data: segment count, taper (decreasing length toward tip), spring
constants (decreasing toward tip), per-segment rest angles, reservoir capacity
field, anisotropic-friction lobe. Sponge, rigger, fan, mop are future *rows*. See
[`06-brush.md`](06-brush.md).

### Substrates — what the media land on

```
Substrate (a data row: tooth, sizing, weight, fiber, capillary radius r_c)
├── HotPress    [BUILD]  smooth, hard-edge washes
├── ColdPress   [BUILD]  moderate tooth
├── Rough       [BUILD]  high tooth, drybrush skip, granulation valleys
└── Canvas      [future] r_c = 0, no absorption (oil/acrylic)
```

See [`08-substrate.md`](08-substrate.md).

## The shared engine

The three hierarchies meet at the **canvas state** (per-cell textures,
[`02-cell-schema.md`](02-cell-schema.md)) and the **GPU passes**
([`03-pass-ownership.md`](03-pass-ownership.md)). The passes are generic; the medium,
brush, and substrate supply the constants they read.

- **Wet media** flow through the full pass list: a Brush deposits into the wet film,
  the Fluid engine moves water and pigment, the Pigment engine handles settling and
  granulation, Capillary flow absorbs into paper, DryTick evaporates and shifts
  value. Colour renders through Kubelka-Munk.
- **Dry media** bypass the fluid passes. They deposit directly to the settled/dry
  layer, modulated by paper tooth (a height threshold) and stroke velocity — which
  is what makes fast strokes on rough paper break up and slow strokes lay smooth.

## Why this shape

The whole point of the specialist/library split is extensibility with a fixed code
surface. New media, brushes, and papers are content. The equations are the product.
When you are tempted to add a code path for a medium, add a parameter instead and
ask what physical quantity it represents — if none, it does not belong (the fence).
