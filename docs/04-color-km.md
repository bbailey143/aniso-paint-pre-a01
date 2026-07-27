# CARD 4 — Colour & Kubelka-Munk

Colour is **subtractive**, from pigment concentrations — never RGB blending. Blue +
yellow makes green. This card is the whole colour engine.

## The data

12 mixable pigments, each stored as `K[8]` (absorption) and `S[8]` (scattering)
over 8 spectral bands.

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

`[UNVERIFIED — provenance TODO]` The 12-row `K[8]/S[8]` table must be produced from
BE16/B22 measured spectra by the B04 reduction. Until that fetch + reduction is done
and checked, any values shipped are placeholders and are marked as such in the table
file. **No K/S number is invented silently** (Card 0, the fence). The pigment set is
chosen both to exist in the dataset and to form a usable 12-well palette: Titanium
White, a warm + cool yellow, a warm + cool red, a warm + cool blue, phthalo green,
and earth tones (ochre, sienna, umber) — final list recorded when the data lands.

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

## Traps to plan for

- `[TRAP]` **Gamut.** BE16 shows yellows/reds outside sRGB; sRGB also clips some
  cyans. Some real mixtures cannot be displayed. Plan for it, don't discover it.
- `[TRAP]` **Overmixing.** Real paint muds when overmixed — KM working correctly.
  Digital mixing is frictionless, so people overmix far more than with real paint.
  Consider a limited-palette affordance as a kindness. (I19's flower study scored
  <5/10 for exactly this.)
