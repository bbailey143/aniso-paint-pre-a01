# CARD 7 — Media Property Surface

The shared ancestry. Every `Medium` is a row of these properties; the passes read
them. A subclass overrides values, never methods. This is what lets a future user
add tempera or casein by tweaking numbers already present on `WaterMedium`.

## Shared properties (every medium)

| Property | Meaning | Reads into |
|---|---|---|
| `pigmentSlots` | which library rows are active (up to 8) | KM render, mixing |
| `k1, k2` | Saunderson surface-reflection constants | Composite+Light |
| `K_instrument` | gloss dial (0 glossy … 1 matte) | Composite+Light |
| `hasBody` | stands as `h_p` vs collapses flat | BrushContact, DryTick |
| `bodyShrink` | fraction of wet height retained on dry | DryTick |
| `downRate, upRate` | brush↔canvas transfer rates | Transfer |
| `teflonMin` | minimum left behind by advection/pickup (adhesion) | MovePigment, Transfer |
| `openTime` | how long it stays workable | DryTick |
| `valueShift` | wet→dry lightness change (see below) | DryTick, Composite |
| `reactivatable` | re-wets with water | ReWet |
| `oneWayDoor` | drying is permanent (no re-wet) | DryTick, Bake |

## Unified physical medium vector (every medium)

These are normalised material quantities carried by every row, whether it is
currently painted through the dry-contact path or the wet-film path. The cell
stores only pigment amount; the library keeps these characteristics, so the same
equations can be reused by future charcoal, pencils, crayons, and pens.

| Property | Meaning | Current reader |
|---|---|---|
| `pigmentParticleSize` | fine particles seat in tooth; large particles bridge it | DryDeposit |
| `binderViscosity` | 0 flows freely; 1 is effectively dry and immobile | material row, future wet/dry bridge |
| `mediumHardness` | resistance to crushing; hard contact can compress fibres | DryTool contact stress |
| `shearRate` | how readily friction releases material | DryTool contact stress |
| `adhesionStrength` | fraction of sheared material that remains on the sheet | DryTool deposit |
| `compressiveYield` | stress threshold before hard contact begins fibre compression | DryTool contact stress |
| `specularPotential` | capacity for a smooth reflective deposit | material row, future retained surface layer |
| `microReflectance` | fine-scale surface reflection | material row, future retained surface layer |
| `refractiveIndex` | optical-density control of the material | material row, future retained surface layer |

The three surface-lighting fields are deliberately defined now but are not yet
written into a per-mark surface layer. Applying one selected tool's gloss to all
old marks would be wrong; that upgrade needs retained material data per pixel.

## Wet-medium properties (adds)

| Property | Meaning | Reads into |
|---|---|---|
| `solvent` | water \| oil | CapillaryFlow, DryTick |
| `viscosity μ` | resistance to flow | MoveWater |
| `drag κ` | ordinary surface-flow resistance | MoveWater |
| `gravityResponse` | how strongly this material answers the shared board tilt | MoveWater |
| `wetLayerDrag` | added resistance from liquid already held below the surface | MoveWater |
| `edgeDarkening` | evaporation-fed outward flow toward a pinned edge | FlowOutward |
| `evapRate` | rate `w` falls (dimensionless, per unit time) | DryTick |
| `absorptionCoupling` | how strongly it soaks via Lucas-Washburn | CapillaryFlow |
| `pigmentBoost ζ` | weight incoming pigment over resident (A26) | MovePigment |

## Dry-medium properties (adds)

| Property | Meaning | Reads into |
|---|---|---|
| `toothThreshold` | paper height above which it deposits | DryDeposit |
| `velocityCoupling` | how fast strokes break the line up | DryDeposit |
| `hardness` | H..B; scales deposition + how much tooth it catches | DryDeposit |
| `particleSize` | granulation / settling into valleys | DryDeposit |
| `tiltStart` | upright-to-side-contact angle | DryDeposit |
| `tiltAspect` | broadside contact length along pen lean | DryDeposit |

## The build rows

`[BUILD]` Values here are the *shape* of each row; the numeric `K_instrument`,
`valueShift`, and rate constants are tuned on the bench against
[`09-acceptance.md`](09-acceptance.md) and marked `[UNVERIFIED]` until they are.

### Watercolor (`WaterMedium`)
Zero body (`hasBody = false`), transparent, high `absorptionCoupling`, `reactivatable
= true`, `oneWayDoor = false`. `valueShift`: **lighter, 10–30 %** on dry; finish
matte (`K_instrument` high). Behaviour: wet-in-wet soft blooms with zero brush-mark
retention; wet-on-dry razor edges; edge darkening; backruns; granulation into paper
valleys; drybrush skip; optical glazing with lower layers permanently visible.

### Graphite pencil (`GranularDry`)
`toothThreshold` from paper; `physics.mediumHardness` and `shearRate` set deposition
and tooth catch (a hard 2H lays little and catches peaks; a soft 9B fills valleys).
`velocityCoupling`
breaks the line on fast strokes over rough paper. A laid-over lead changes from a
round point to an oval contact patch aligned with the direction of lean; the row
sets when that happens and how broad it becomes. No fluid.

### Ballpoint (`InkMedium`)
Viscous paste: near-flat pressure response, consistent thin line, low
`velocityCoupling`, minimal tooth sensitivity. Deposits a dense, dye-like mark. No
fluid in the first build (a future fountain-pen row turns the fluid path back on).

## The extended roadmap (from the GUIDE — parked, not built)

Documented so the property surface is designed to reach it, per Card 0's fence.

| Medium | Distinctive property already in the surface |
|---|---|
| Gouache | `valueShift` = **inversion** (darks dry lighter, lights darker); chalky body, opaque |
| Acrylic | `oneWayDoor = true`, dries **darker** (milky emulsion cures clear → scattering falls) |
| Oil | `solvent = oil`, `bodyShrink ≈ 1` (100 % peak retention), multi-day `openTime`, fat-over-lean viscosity gradient |

`[UNVERIFIED]` Proposed unified value-shift mechanism: **wetness modulates
scattering.** Wet fills gaps between fibres → less internal scattering → deeper,
more saturated; drying returns air → scattering rises → value lifts. Acrylic runs
opposite (binder milky → clear). Oil neither absorbs nor evaporates → no shift.
Gouache's inversion does **not** fall out of this cleanly and needs bench measurement.

---

## Surface shine — the three rows behind "it looks like plastic" (2026-08-24)

**The report.** "The oil's biggest weakness now is that it shines like jelly and
looks like plastic." Two complaints, and they turned out to have one cause, not
the two I first claimed.

**What was there.** Every material already carried `kInstrument`, a gloss value
from 0 (mirror) to 1 (matte) — watercolour at 1, oil at 0.25. Nothing in the UI
reached it, and `CanvasEngine.setGloss` existed and was called by nothing.

### The wrong diagnosis, recorded because it was wrong

The composite has a line that says: however matte a paint claims to be, if a wet
film is standing on it, drag it toward mirror-wet.

```wgsl
let kIns = mix(C.kInstrument, 0.0, filmWetness);
```

That is right for watercolour and expires on its own, because a watercolour film
is gone in ninety seconds. I reasoned that oil's film leaves 1920x slower
(`evapRate 0.0015/1920`, `openTime` 48 hours against 90 seconds) so the override
never lifts, oil is pinned at maximum gloss forever, and its own 0.25 is never
consulted. Built a `filmGloss` row to bound it, per medium.

**Then measured it.** A real oil stroke carries **0.018 of film per wet cell**,
and `filmWetness = clamp(film * 6, 0, 1)` — so the term sits around **0.11**, not
1. Turning the new row from 1 to 0.15 changed the painted result from
`(189, 203, 213)` to `(189, 203, 214)`: **one unit of blue in 255.**

The row is kept, because reading an oil film as a puddle of solvent is wrong in
principle and will matter for a flooded film. It is marked in the code as having
fixed nothing. It should not be cited as the cause of anything.

### The actual cause

The highlight on a ridge of paint:

```wgsl
sheen = pow(dot(ns, half), 48.0) * gloss * 0.55;
```

A tightness of 48 is a small hard hot spot, which is what a polished plane gives.
A paint surface is not a polished plane — up close it is full of hair furrows
scattering light — so its highlight is broad and soft. That hard glint, added as
flat white over a strongly relieved oil surface, is the plastic.

### What was built

Three dials in the paint strip, all `belongsTo: 'paint'`, all live:

| dial | what it is | row it drives |
|---|---|---|
| **Gloss** | how wet the surface reads | `kInstrument`, inverted for the dial |
| **Sheen** | how bright the glint on a ridge is | `sheenStrength` |
| **Sheen Width** | broad and soft, or tight and hard | `sheenWidth` |

Plus `filmGloss` as a material row (not a dial), described above.

Defaults reproduce the previous picture exactly: `sheenStrength` 0.55, and a
`sheenWidth` of 0.632 maps back to the tightness of 48 it replaced. Nothing
changes until a dial moves.

### The Width dial floods unless the energy is held

First version had Width and Sheen fully independent, which is wrong: broadening a
highlight spreads the same shine over far more surface. **[MEASURED]** at Sheen
0.55, winding Width from tight to broad took the share of blown-out white pixels
in an oil stroke from **7% to 86%** — the dial made it worse, not softer, and
would have read as broken.

A `cos^n` lobe carries energy proportional to `1/(n+1)`, so holding the total
steady means scaling by `(n+1)`, normalised against 48 so the default is
untouched. Broad now dims as it widens, which is what a rough surface does.
After the fix, across the whole range of both dials — including Sheen pushed to
1.2 with Width fully broad — **blown-out pixels stayed at 0%**.

Caveat on those two numbers: the 7%/86% pair is one painting compared with
itself and is solid. The post-fix 0% is a different painting, so it is evidence
that the flooding is gone rather than an exact before/after of the same pixels.

**What none of this settles.** Where oil should actually sit. The dials exist so
Bartford can find that by eye; every value in the rows is `[UNVERIFIED]`. And
the oil strokes still read pale, which is a covering-and-density question, not a
shine one.
