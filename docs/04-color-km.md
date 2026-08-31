# CARD 4 — Colour & Kubelka-Munk

Colour is **subtractive**, from pigment concentrations — never RGB blending. Blue +
yellow makes green. This card is the whole colour engine.

## The data

12 mixable pigments, each stored as `K[38]` (absorption) and `S[38]` (scattering)
over the **full 38 measured bands** (380–750 nm @10 nm).

`[DECISION — band count, superseding the old 8-band figure]` The evidence base
ratified "8 spectral bands," justified by PCA *dimensionality*. But when the 12
measured pigments were binned into 8 contiguous bands and rendered, the yellows
came back at **dE2000 ≈ 8** — block-averaging smears their sharp reflectance edge
and KM is nonlinear within a wide band. 12 uniform bands got under dE 3; but the
pigment library is a **tiny buffer** (12 × 38 × 2 ≈ 3.6 KB) and the Composite pass
runs **once per display frame**, so there is no cost reason to reduce at all.
**The library and the live render use all 38 measured bands — zero reduction
error.** The "8" in the schema is **8 pigment slots per cell**, a different axis.
Band reduction returns only for the **baked-floor per-cell reflectance** (`R_floor`,
[`02-cell-schema.md`](02-cell-schema.md)), which is stored per cell and inert — a
storage-driven choice made when baking lands (P3+), where a small dE is imperceptible
and un-liftable anyway. Generated + validated by `tools/build_pigments.py`.

`[CORRECTED 2026-08-30]` This paragraph used to say the 12 were *all* the
single-pigment columns in BE16. **They are not.** BE16 is **nineteen** Golden Heavy
Body paints (Berns, CIC24 2016, Table I) and seven were left behind: Bismuth
Vanadate Yellow PY184, Pyrrole Orange PO73, **C.P. Cadmium Red Light PR108**, Cobalt
Blue PB28, Cerulean Blue Chromium PB36:1, Phthalo Blue (Red Shade) PB15:1, Phthalo
Green (Yellow Shade) PG36. The *other* half of the old claim holds and is now
confirmed against Table I: **there are no earth pigments in BE16** — no ochre, no
sienna, no umber, no red oxide — so this is a high-chroma modern set.

The 12 pigments taken: Titanium
White (PW6), Hansa Yellow (PY74), Diarylide Yellow (PY83), Cadmium Orange (PO20),
Pyrrole Red (PR254), Quinacridone Red (PV19), Quinacridone Magenta (PR122),
Dioxazine Purple (PV23), Ultramarine Blue (PB29), Phthalo Blue GS (PB15:4), Phthalo
Green BS (PG7), Bone Black (PBk9).

- **Measured source: BE16 / B22** (Berns spectral databases). Real Golden acrylic
  measurements, 380–750 nm at 10 nm = 38 bands, downloadable from RIT.
- **Band reduction 38 → 8: B04's method** — Gaussian quadrature weighted by the CIE
  XYZ observer × illuminant spectrum. Both halves of the pipeline are in hand.
- **8 bands is justified, closed.** BE16 PCA on 770 spectra: 3 eigenvectors = 97.5 %
  variance, 8 comfortably covers it. B04 independently matched 101 samples with 8
  wavelengths by Gaussian quadrature. Two unrelated methods agree these spectra are
  low-dimensional. Stop revisiting it.

`[CAVEAT]` BE16 are acrylics — glossy K/S. Applied to watercolour they oversaturate.
The remedy is the gloss dial (`K_instrument`, below), not a separate desaturation.

`[CAVEAT]` Use PCA only to *reassure yourself about band count*. B22 found PCA-based
primaries poorly approximate the 58 pigments — do **not** use PCA to compress the
palette itself.

## Provenance status for this build

`[RESOLVED]` The 12-row `K[38]/S[38]` table is built from the **real measured**
BE16 spreadsheet (`Final_artist_database.xlsx`, sheet "k and s data"). Every K/S
value is measured; the CIE observer × D65 weights are canonical. Nothing here is
invented.

`[TRAP — the spreadsheet is gone, 2026-08-30]` It was retrieved via the Internet
Archive once already, after the RIT link went stale. It is now lost from disk, and
**both** upstream links are dead: RIT's, and the grayskyimaging one that hosts
Berns's later 58-pigment dataset (that page states outright that the spectral
database "is no longer available"). For a while the library was therefore a
generated file with **no reproducible input** — the one thing the fence is supposed
to make impossible.

**Fixed.** The K/S table was read back out of the generated `pigments.ts` verbatim
into [`data/be16-ks.csv`](../data/be16-ks.csv), which is now the default input to
`tools/build_pigments.py` and **the provenance of record for the library**. It is
keyed by pigment slug, not by spreadsheet column, so it cannot silently shift a
pigment by one column. Verified: regenerating from the CSV reproduces
`src/color/pigments.ts` **byte-identical** to the committed file, twice.

**What the CSV cannot do:** it only rescued the 12 columns already built. The other
seven BE16 paints — Cadmium Red Light among them — are not recoverable from it.
Adding any of them still needs the original spreadsheet or an equivalent measured
source. See [`20-oil-from-zero.md`](20-oil-from-zero.md) §9.

## The mixing law — Duncan 1940 (via MB21)

Mixing is **linear in concentration space**:

```
K_mix(λ) = Σᵢ cᵢ · Kᵢ(λ)
S_mix(λ) = Σᵢ cᵢ · Sᵢ(λ)      with cᵢ ≥ 0, Σcᵢ = 1
```

The engine stores per-cell concentrations, so mixing is a weighted sum — no solver,
no latent space, no lookup tables. Everything Mixbox builds exists to work around
*not* being able to store concentrations. We can. Skip it.

## Kubelka-Munk reflectance — use the right form

`[TYPO — CONFIRMED]` D15's `R₁ = sinh(bSh₁)` has no denominator and is wrong. Use
C97 §5.2's form with the `/c`.

**Form 1 — finite thickness over a substrate (C97 §5.2).** Washes and glazes:
```
R = sinh(bSx) / c ,   T = b / c
c = a·sinh(bSx) + b·cosh(bSx) ,   a = 1 + K/S ,   b = √(a² − 1)
```

**Form 3 — opaque, infinite thickness (MB21 eq. 2).** Cheaper; only for thick paint
that fully hides the substrate:
```
R∞ = 1 + K/S − √((K/S)² + 2K/S)
```

**Layer compositing (Kubelka's equations), bottom to top per glaze:**
```
R_total = R₁ + T₁²R₂ / (1 − R₁R₂)
T_total = T₁T₂ / (1 − R₁R₂)
```

## Saunderson correction — and the gloss dial

Accounts for light reflecting off the paint *surface* before reaching pigment:
```
R′ = (1 − k₁)(1 − k₂)R / (1 − k₂R)
```
| Source | k₁ | k₂ |
|---|---|---|
| BE16 | 0.03 (collimated) | 0.65 (diffuse) |
| I19 | 0.04 | 0.60 |

`[KEY]` **`K_instrument` is the matte/gloss control.** BE16 sets it to 1.0 for
specular-included measurement and to 0 to make a surface glossy/varnished — verified
against Golden MSA varnish. It is literally *how much surface reflection reaches the
eye*: matte scatters white back from every angle (washes colour out); varnish
redirects it away (colour reads deep). This is why varnishing makes a painting "come
back." Store `k₁, k₂, K_instrument` **per medium**, not per pigment.

`[UNVERIFIED]` Likely also the dominant wet→dry value-shift mechanism: wet paper
carries a glossy water film (low `K_instrument`); drying removes it (matte, high).
Test on the bench.

## Normalization anchor

`[KEY]` K and S only ever appear as a **ratio**; one value must be pinned or the
system is unconstrained. **B04 fixes S = 1 for Titanium White** and solves everything
else relative to it. Build the table without this and the numbers are meaningless in
a way that is very hard to diagnose.

## Rendering chain

Spectrum → XYZ (integrate against CIE observer × illuminant, D65 white point) →
sRGB matrix → display. [MB21 eqs. 3–7]

### GPU composite (P3, `composite.wgsl`)

Per pixel: gather the cell's 8 pigment amounts, Duncan-mix K/S, run **finite-
thickness KM (Form 1)** with optical thickness ∝ total pigment loading, composite
the resulting layer over the paper reflectance (Kubelka's layer equations),
Saunderson-correct with the medium's `K_instrument`, integrate 38 bands to XYZ, and
convert to sRGB. Bare cells (amount ≈ 0) render the paper straight through — which
is why a thin wash reads lighter (more paper) and a heavy load reads deep, from one
mechanism. Paper tooth is relief-lit from the `PAPER` height gradient. Verified on
the RX 570: bare paper `[238,238,238]`, blue+yellow wash `#006144`, thin wash
`#009770`. The CPU tray (`km.ts`) and this shader are kept in lockstep.

`[NOTE]` P3 uses a fixed 1024² document, "contain"-fit into the viewport, and a
uniform flat-fill test deposit (not a brush — wet media get their real deposit from
the brush + fluid engines). Paper reflectance is a scalar near-white for now; a
spectral paper white can replace it once measured.

## Traps to plan for

- `[TRAP]` **Gamut.** BE16 shows yellows/reds outside sRGB; sRGB also clips some
  cyans. Some real mixtures cannot be displayed. Plan for it, don't discover it.
- `[TRAP]` **Overmixing.** Real paint muds when overmixed — KM working correctly.
  Digital mixing is frictionless, so people overmix far more than with real paint.
  Consider a limited-palette affordance as a kindness. (I19's flower study scored
  <5/10 for exactly this.)
