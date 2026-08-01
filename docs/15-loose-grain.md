# CARD 15 — Loose grain

The design behind **D14**. Written before any code, because it adds state to the
sheet and that is not a thing to improvise.

## The observation it comes from

Bartford, on conté:

> *"As you draw and rub the crayon back and forth, little pieces of
> material/medium rub off onto the paper from the crayon, leaving behind gritty
> pieces that are easily broken down to a fine, smooth powder that creates
> gradient blends effortlessly without having to separately smudge."*

And the decisive one: conté is **gritty even on smooth sketch paper**.

That last observation rules out the existing model on its own. Today all dry
grit comes from gating against the paper height field —
`gate = smoothstep(need - 0.18, need + 0.18, ride)` in `dry_deposit.wgsl`. On hot
press `toothAmp` is small, `ride` sits near 1, the gate opens almost everywhere,
and the mark comes out too clean. **No amount of tuning fixes that**, because
the grit being described is not the paper catching pigment — it is *the crayon
crumbling*. Different mechanism, different place in the model.

## What is decided

**Loose grain is material that has left the tool but is not yet bound to the
paper.** It sits on the surface. It is visible as grit. Contact crushes it, and
crushing turns it into ordinary bound pigment.

That single rule produces the whole described behaviour:

| What the artist does | What the model does |
|---|---|
| Draws a stroke | Tool sheds loose grain; grit is visible immediately, on any paper |
| Rubs back and forth | Contact crushes grain → smooth blended tone, **with no smudge tool** |
| Deliberately smudges | The same crush-and-move mechanic, aimed on purpose |
| Blows/knocks the paper | (Not modelled. Recorded as out of scope.) |

**It is a transient state, not a new permanent layer.** Grain is shed, lives
briefly as grit, and is crushed into the bound ink band. That matters for the
cost, below — only the fraction of the sheet currently holding uncrushed grain
needs to carry it.

## Where it lives — the schema question

**On the ink grid, not the wet band.** Dry media already live at `inkRes`
(`sim × INK_SCALE`, 2048² at the default), and Card 2's wet film is for fluid.
Grit is sub-cell detail; the ink grid is the finest thing available.

It reuses the **same 8-slot pigment space** as the bound ink, so two colours of
conté blend when crushed together. That is the point of the medium and it is not
negotiable — inheriting colour from whatever is underneath would make blending
impossible.

| Field | Count | Notes |
|---|---|---|
| `lg[8]` | 8 | Loose grain amount per slot, aligned to the same slot map as `ink[8]`. Slot-for-slot with the bound band, per Card 2's alignment note. |
| `coarse` | 1 | How far from crushed. 1 = freshly shed grit, 0 = powder. Drives how visible it is and how readily it crushes further. |

### The cost, stated honestly

Two more RGBA16F textures at 2048² is **~67 MB**, and ping-ponged it is ~134 MB.
Against WebGPU core's 256 MB single-buffer ceiling (D1) and the D7 budget, **the
naive allocation does not fit** and this card does not pretend otherwise.

**Resolution: loose grain is budgeted, exactly as wet cells are.** D7 is already
"a wetness budget, not a canvas size"; this is the same idea applied to a second
scarce resource. Only tiles currently holding uncrushed grain allocate. Since
grain is transient — crushed within a stroke or two of being laid — the live set
is a small fraction of the sheet, and a drawing that exceeds the budget crushes
its oldest grain early rather than failing.

**The `coarse` channel is not yet placed.** Options are a third texture (wasteful
— one channel of four), packing it against a future dry-media scalar, or
deriving it from a per-medium constant plus a per-cell crush counter. This is
the one genuinely open sub-question and it is deliberately left open rather than
guessed at.

## Interactions — the part that must not be improvised

- **Water.** Loose grain hit by water should disperse into suspension. That is a
  transfer **between grids**, and `fluid.ts` already carries the warning: *"no
  material ever moves between grids… charcoal and pastel, which genuinely do
  lift into water, will need that bridge — and a conservation test around it."*
  **Decided: out of scope for D14.** Until the bridge and its conservation test
  exist, water crushes grain into the bound band in place. Recorded so nobody
  builds the bridge accidentally as part of this.
- **Baking (D4).** Bake crushes any remaining grain first. Grain must never
  reach the floor uncrushed, or it is silently lost.
- **Undo (D5, D10).** Grain is part of the tile snapshot like any other cell
  state. No special case.
- **Conservation.** Shed + crushed must equal laid. `inkPigment` is already a
  separate ledger from the wet band for good reason (the `[TRAP]` note in
  `fluid.ts`); loose grain joins **that** ledger, and the two must be checked as
  a sum once grain exists.

## Pass ownership

Two new responsibilities, both in the dry path, neither touching the fluid:

- **Shed** — inside dry deposition. Splits what leaves the tool into bound and
  loose according to the medium's row.
- **Crush** — driven by contact. Converts loose → bound, reduces `coarse`, and
  moves a fraction along the direction of travel. This *is* smudging; Phase 2 of
  [Card 14](14-dry-media-route.md) becomes a tool that runs this pass without
  shedding, rather than a separate mechanic.

## Row parameters

`[UNVERIFIED]` — shapes, not measured values.

| Property | Meaning | From Bartford's ingredients |
|---|---|---|
| `shedRate` | Fraction of what leaves the tool that lands loose rather than bound | Softer clay sheds more |
| `grainCoarseness` | `coarse` of freshly shed grain | Bake time → fineness |
| `crushRate` | How readily contact converts loose → bound | Kaolin is soft, so conté crushes easily |
| `grainCling` | How much resists being moved along | Binder — wax or oil clings, cellulose ether less |

Bartford's note that **bake time sets fineness** is a shared axis, not a conté
one: chalk, pastel and charcoal all want it. It belongs in Card 7's shared
physical-medium vector, not in the conté row.

## What this does NOT decide

- The `coarse` channel's home (above).
- The water bridge (deferred, deliberately).
- **Sepia.** Conté's defining colour is a natural iron oxide and D5's twelve
  pigments are all modern synthetics — there is no earth in the library, and an
  earth's spectral curve is not reachable by mixing from that set. Adding one
  needs measured K/S data and is a **D5 amendment**, tracked separately. Today's
  conté row is `bone-black`, which is why it is not sepia.
- **Angular contact shapes.** `contactProfile` is `'round' | 'chisel'`; conté is
  square, triangular or worn, and "always angular in some degree". Separate,
  cheaper, and independent of grain.
