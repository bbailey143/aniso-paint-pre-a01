# CARD 7 — Acceptance Criteria

From CHART. These are pass/fail; the bench gets held against them.

## Drying — open times

| Medium | Open time | Full cure |
|---|---|---|
| Watercolor | 1–5 min | — |
| Gouache | 2–10 min | — |
| Acrylic | 5–15 min (~1 hr with retarder) | — |
| Oil | 2–7 days dry-to-touch | 6–12 months |

**Four orders of magnitude.** That's the range your artist-adjustable drying slider must cover.

## Drying — value shift

| Medium | Shift | Finish |
|---|---|---|
| Watercolor | **lighter, 10–30%** | matte, paper-texture sheen |
| Gouache | **inversion** — darks dry lighter, lights dry darker | ultra-matte, velvety chalk |
| Acrylic | **darker** (milky emulsion cures clear) | gloss/satin/matte, customizable |
| Oil | **zero to minimal** | naturally glossy/satin |

`[UNVERIFIED]` Proposed unified mechanism: **wetness modulates scattering.** Wet paper has water filling the gaps between fibers → less internal scattering → deeper, more saturated. Drying returns air to those gaps → scattering rises → value lifts. Acrylic runs the opposite way (binder starts milky, cures clear → scattering falls → darkens). Oil neither absorbs nor evaporates → nothing changes. Likely combined with the K_instrument gloss change. **Test on the bench; gouache's inversion does not fall out of this cleanly and needs measurement.**

## Behavioral targets

**Watercolor:** wet-in-wet fluid capillary diffusion with soft feathered blooms and zero brush-mark retention; wet-on-dry razor-sharp edges; edge darkening; backruns; granulation into paper valleys; broken-tooth drybrush skipping; optical glazing with lower layers permanently visible; **reactivatable with water**; zero body — brush marks collapse flat on drying.

**Gouache:** soft opaque blending, less explosive diffusion than watercolor due to chalk body; opaque coverative layering (light over dark); low body, cracks above ~1mm; **reactivatable**, lifts instantly.

**Acrylic:** mechanical homogenization *and* marbling; 3D plastic impasto retaining wet geometry with minor shrink; cured layers impervious to those above; **permanent, waterproof**.

**Oil:** alla prima infinite feathering with razor-smooth gradients and lost-and-found edges; **benchmark impasto** retaining 100% of wet peak height, buttery knife facets, crisp bristle valleys, no volume loss; multi-day open time; **permanent**, solvent-reactivatable only.

## `[REQUIREMENT]` Reactivity

Watercolor and gouache re-wet. Acrylic and oil do not. **B04's architecture makes drying a one-way door** — this breaks it. Dried pigment must be able to return to the wet layer for water media, and lifting must remove it entirely. Structural requirement on canvas state; no paper in the pile addresses it.

## The five-minute proof tests

Run these the moment the bench renders anything:

1. **Blue + yellow.** MB21 Figure 1 / A26's stated limitation. RGB gives gray; Kubelka-Munk gives green. Your entire product thesis in one swatch.
2. **Yellow ochre + prussian blue.** B04 Figure 10. Linear RGB blending wrongly predicts brown.
3. **Tint ramps.** MB21 Figure 4: real paints *gain* saturation and shift hue when mixed with white. Quinacridone Magenta and Phthalo Blue are the demonstrators — phthalo shifts purple → turquoise as white is added.
4. **Conservation readout.** Total water and total pigment, held steady with the brush lifted.

## Reference plates

Paint the real thing. One wet-in-wet bloom, one hard edge, one glaze over dry, one granulating wash. Photograph them, load into the bench, compare side by side. **This was the Rebelle developer's actual method**, and it's where being an artist is an advantage rather than a gap.

---
