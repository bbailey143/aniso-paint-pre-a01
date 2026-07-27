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
