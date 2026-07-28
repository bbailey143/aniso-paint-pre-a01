# CARD 9 — Acceptance Criteria

Pass/fail. The app is held against these. From the GUIDE and the evidence base.

## The five-minute proof tests

Run these the moment anything renders:

1. **Blue + yellow.** RGB gives grey; Kubelka-Munk gives green. The entire product
   thesis in one swatch. (MB21 Fig. 1 / A26's stated open problem.)
2. **Yellow ochre + prussian blue.** Linear RGB wrongly predicts brown; KM gives a
   deep green. (B04 Fig. 10.)
3. **Tint ramps.** Real paints *gain* saturation and shift hue mixed with white —
   phthalo shifts purple → turquoise as white is added. (MB21 Fig. 4.)
4. **Conservation readout.** Total water and total pigment, held steady with the
   brush lifted. Run the same scene twice — identical numbers (Card 0 method rule).

## Watercolour behavioural targets

Wet-in-wet fluid capillary diffusion with soft feathered blooms and **zero brush-mark
retention**; wet-on-dry razor-sharp edges; edge darkening; backruns; granulation into
paper valleys; broken-tooth drybrush skipping; optical glazing with lower layers
permanently visible; **reactivatable with water**; **zero body** — brush marks collapse
flat on drying.

## Drying — value shift

| Medium | Shift | Finish |
|---|---|---|
| Watercolour | **lighter, 10–30 %** | matte, paper-texture sheen |
| Gouache `[future]` | **inversion** — darks lighter, lights darker | ultra-matte chalk |
| Acrylic `[future]` | **darker** (milky emulsion cures clear) | gloss/satin/matte |
| Oil `[future]` | zero to minimal | naturally glossy/satin |

## Drying — open times (the slider must span four orders of magnitude)

| Medium | Open time |
|---|---|
| Watercolour | 1–5 min |
| Gouache | 2–10 min |
| Acrylic | 5–15 min (~1 hr with retarder) |
| Oil | 2–7 days dry-to-touch, 6–12 mo full cure |

## Substrate behaviour

Rapid strokes on rough paper → rough, broken strokes. Slow deliberate strokes → more
media lands, smooth connected strokes. Hot-press → hard-edge washes. Rough → drybrush
skip and granulation into valleys. This is the tooth + velocity + absorption
interaction, visible and correct.

## Dry media behaviour

Pencil: hardness reads (4H faint, catches peaks; 6B dark, fills valleys); fast strokes
on rough paper break up. Ballpoint: consistent thin line, near-flat pressure response.

## `[REQUIREMENT]` Reactivity

Watercolour re-wets; lifting removes pigment entirely. B04's architecture makes drying
a one-way door — this build must break it for water media: dried pigment (`a[8]`)
returns to the wet layer (`g[8]`) on re-wet. Acrylic and oil keep the one-way door.

## Reference plates — the method

Paint the real thing: one wet-in-wet bloom, one hard edge, one glaze over dry, one
granulating wash. Photograph, load into the app, compare side by side. This was the
Rebelle developer's actual method — being an artist is the advantage here, not a gap.

---

## P7 — dry media, measured

`cov` is the fraction of the line that is continuous; `mean` is pigment laid per
cell. Pressure 0.7 throughout, so the only variables are speed, grade, and sheet.

**Measure DIAGONAL strokes.** The first version of this table was taken on
horizontal ones, which sit squarely on the cell rows and hid a 99 % beading
artefact that was plainly visible on screen. A horizontal acceptance stroke
proves almost nothing about rasterisation.

| stroke | rough `cov` / `mean` | hot press `cov` / `mean` |
|---|---|---|
| HB, slow | 78 % / 0.136 | 100 % / 0.286 |
| HB, **fast** | **49 %** / 0.047 | 100 % / 0.166 |
| 6B, slow | 90 % / 0.436 | 100 % / 0.694 |
| 6B, fast | 87 % / 0.249 | 100 % / 0.429 |
| 4H, slow | **20 %** / 0.011 | 100 % / 0.096 |
| ballpoint, fast | 100 % / 0.370 | 100 % / 0.385 |

Every target behaviour falls out of the parameter rows, not special cases:

- **Fast on rough breaks up; slow on smooth stays connected.** 78 % → 49 % on
  rough for the same pencil at a higher speed; 100 % throughout on hot press.
  This is the headline requirement and it is now measurable, not just visible.
- **A soft lead resists break-up.** 6B loses 3 points to speed (90 → 87) where
  HB loses 29 (78 → 49). Soft graphite crumbles onto the sheet whatever the hand
  is doing.
- **A hard lead barely marks rough paper** (20 %) but draws a continuous, very
  light line on smooth (100 % at 0.096 — a seventh of a 6B). That is a 4H.
- **A ballpoint ignores both.** 0.370 rough vs 0.385 smooth, 100 % either way.
  Flatness is the point of a biro.
- **Tilt draws with the flank.** A 6B at 70° lays a 6.9–8.0 cell band against
  1.7–2.0 upright.

## Beading — the check that has to be on every stroke test

A stroke narrower than a grid cell cannot be drawn narrower; it can only be
drawn fainter. Measure **ripple** along a diagonal — `(max − min) / max` of the
laid amount, sampled cell by cell down the path:

| | before | after |
|---|---|---|
| ballpoint, size 0.4 / 0.5 / 1.0 | 99 % | **12 %** |
| round sable, one stroke, start → 100 → 300 cells | 2.603 → 0.211 → **0.004** | 0.432 → 0.317 → **0.132** |

The two had different causes and neither was what it looked like. The dry one
was sub-cell aliasing, fixed with analytic coverage plus a minimum contact
width. The wet one was not beading at all — the brush was emptying 650× over one
stroke because `downRate` was charged per solve step rather than per unit
distance, which invariant 2 forbids. Below about 0.01 laid, ordinary cell-to-cell
variation reads as specks.

Renders as `rgb(55,57,61)` on `rgb(223,223,223)` paper — graphite grey, through
the same Kubelka-Munk chain as the paint, with no dry-media special case.

## Watercolour over ballpoint — the mixed-media bar

Bartford's bar, in his words: *"we're gonna' have to prove that we can get
watercolour to talk to ballpoint pen correctly. Artists will know it's wrong just
like I noticed."* The ink band runs at 2048 while the fluid stays at 512, so this
is also the test that the two grids share one canvas rather than becoming Fresco's
"live" and "pixel" layers that cannot see each other.

A black biro line, then a hansa-yellow wash laid straight across it. Cross-section
down the wash, sampled every 4 document pixels:

| document y | reads | what it is |
|---|---|---|
| 380–388 | `223,223,223` | bare paper |
| 392 | `221,217,175` | the wash's soft edge |
| 396 | `231,220,90` | yellow wash on paper |
| **400** | **`83,103,63`** | **the ink line, seen through the wash** |
| 404 | `231,221,102` | yellow again |
| 408+ | `223,223,223` | paper |

Reproduced twice, identical to the last digit. The three things that had to be true:

- **The ink stays thin.** It is still a hairline inside a wash fifteen fluid cells
  wide — it did not swell to a cell, because it never left its own grid.
- **The wash is a film over it, not a replacement.** Black under yellow reads
  `83,103,63`, a warm dark olive. That is subtractive layering through the same
  Kubelka-Munk chain the paint uses. RGB compositing would give a flat grey-green.
- **Nothing leaked either way.** Ink total held at 2871.05 before and after the
  wash; the wash held 198.1423 across 300 settling frames.
