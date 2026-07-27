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

Reproduced twice, identical to three decimals. `cov` is the fraction of the line
that is continuous; `mean` is pigment laid per cell. Pressure 0.7 throughout, so
the only variables are speed, grade, and sheet.

| stroke | rough `cov` / `mean` | hot press `cov` / `mean` |
|---|---|---|
| HB, slow | 62 % / 0.086 | 100 % / 0.189 |
| HB, **fast** | **36 %** / 0.025 | 100 % / 0.121 |
| 6B, slow | 88 % / 0.302 | 100 % / 0.457 |
| 6B, fast | 83 % / 0.186 | 100 % / 0.311 |
| 4H, slow | **7 %** / 0.004 | 100 % / 0.065 |
| ballpoint, fast | 100 % / 0.221 | 100 % / 0.230 |

Every target behaviour falls out of the parameter rows, not special cases:

- **Fast on rough breaks up; slow on smooth stays connected.** 62 % → 36 % on
  rough for the same pencil at a higher speed; 100 % throughout on hot press.
  This is the headline requirement and it is now measurable, not just visible.
- **A soft lead resists break-up.** 6B loses 5 points to speed (88 → 83) where
  HB loses 26 (62 → 36). Soft graphite crumbles onto the sheet whatever the hand
  is doing.
- **A hard lead barely marks rough paper** (7 %) but draws a continuous, very
  light line on smooth (100 % at 0.065 — a seventh of a 6B). That is a 4H.
- **A ballpoint ignores both.** 0.221 rough vs 0.230 smooth, 100 % either way.
  Flatness is the point of a biro.
- **Tilt draws with the flank.** A 6B at 70° lays a 6.9–8.0 cell band against
  1.7–2.0 upright.

Renders as `rgb(55,57,61)` on `rgb(223,223,223)` paper — graphite grey, through
the same Kubelka-Munk chain as the paint, with no dry-media special case.
