# CARD 2 — Pigment & Optical Engine

## The data

**Primary source: BE16 — Berns, Artist Paint Spectral Database, CIC24 2016.**

- **19 Golden Artist Colors Heavy Body acrylic dispersion paints.** Full list with Colour Index numbers in their Table I.
- Measured **380–750 nm at 10 nm increments = 38 bands.**
- Macbeth MS7000 integrating sphere spectrophotometer, SPIN geometry, 4 measurements averaged.
- 770 spectra total: 23 hues plus one gray scale.
- **Data is downloadable as an Excel spreadsheet** from RIT's Studio for Scientific Imaging and Archiving of Cultural Heritage page — spectra, colorimetry, eigenvectors, and optical (K and S) data.
- The same page hosts a **Gamblin Conservation Colors inpainting spreadsheet** implementing two-constant KM with Saunderson, including a sheet for producing optical data from your own paint measurements.

**Bigger, newer:** Berns, *Artist Acrylic Paint Spectral, Colorimetric, and Image Dataset* (Archiving 2022, hosted at grayskyimaging.com) — Golden supplied measurement data for 68 Heavy Body acrylics, filtered to **58 single-pigment paints**, masstones and 10% titanium white tints. This exceeds your 24–48 pigment target.

**Do not read Okumura's 192-page thesis.** BE16 is his reference [16] and carries the constants forward. Superseded.

**Notable in the 19:** the list includes *both* Phthalo Blue (Red Shade) PB15:1 and Phthalo Blue (Green Shade) PB15:4 — warm and cool of the same pigment. Mixbox could never do this with four slots. You can.

### `[CAVEAT]` These are acrylics

Same pigment index numbers exist in watercolor, but K and S differ with binder and grind. MB21 flags the consequence directly: acrylic coefficients are glossy, so applying them to watercolor **oversaturates**. Their suggested remedy is a desaturating post-process; they didn't find it necessary in practice. Your better remedy is the gloss dial below.

## The mixing law

**Duncan 1940** (via MB21). Mixing is **linear in concentration space**:

```
K_mix(λ) = Σᵢ cᵢ · Kᵢ(λ)
S_mix(λ) = Σᵢ cᵢ · Sᵢ(λ)
```
with `cᵢ ≥ 0` and `Σcᵢ = 1`.

This is the whole ballgame for you. Your engine already stores per-pixel concentrations, so mixing is a weighted sum — no solver, no latent space, no lookup tables. **Everything Mixbox builds exists to work around not being able to store concentrations. You can. Skip it.**

## Kubelka-Munk — three forms, use the right one

`[TYPO — CONFIRMED]` **D15's reflectance equation is wrong.** It prints `R₁ = sinh(bSh₁)` with no denominator, while `T₁ = b/c`. C97 §5.2 gives the correct form with the `/c`. Cross-checked and confirmed. **Use C97's version.**

**Form 1 — finite thickness over a substrate (C97 §5.2).** Use this for washes and glazes.
```
R = sinh(bSx) / c
T = b / c
where c = a·sinh(bSx) + b·cosh(bSx),  a = 1 + K/S,  b = √(a² − 1)
```

**Form 2 — B04's GPU form.** Same physics, different arrangement; cross-check against Form 1.
```
b = √((K/S)(K/S + 2))
R = 1 / (1 + K/S + b·coth(bSd))
T = b·R·sinh(bSd)
```

**Form 3 — opaque, infinite thickness (MB21 eq. 2).** Cheaper. Only for thick paint that fully hides the substrate.
```
R∞ = 1 + K/S − √((K/S)² + 2K/S)
```

**Form 4 — with substrate reflectance ξ folded in (I19 eq. 1).** One-shot when you already know what's underneath; avoids a separate compositing pass. Worth benchmarking against Form 1 + compositing.

**Layer compositing (C97 §5.2, Kubelka's equations):**
```
R_total = R₁ + T₁²R₂ / (1 − R₁R₂)
T_total = T₁T₂ / (1 − R₁R₂)
```
Repeat bottom to top for each glaze.

## Saunderson correction — and the gloss dial

Accounts for light reflecting off the paint *surface* before it reaches any pigment. C97 lists the refractive-index discontinuity as its **first violated KM assumption**, notes a correction exists, and declines to implement it. You can implement it on day one.

```
R′ = (1 − k₁)(1 − k₂)R / (1 − k₂R)
```

| Source | k₁ | k₂ | Notes |
|---|---|---|---|
| **BE16** | 0.03 (collimated) | 0.65 (diffuse) | plus `K_instrument` — see below |
| **I19** | 0.04 | 0.60 | independent, close agreement |

k₁ ≈ 0.03–0.04 is the fraction of light reflecting off a smooth surface at refractive index ~1.5 — glass, varnish, acrylic binder, oil. These are your **glossy** defaults.

### `[KEY FINDING]` K_instrument is the matte/gloss control

BE16 sets `K_instrument = 1.0` for their specular-included (SPIN) measurements, and **sets it to 0 to make a surface glossy or varnished computationally** — verified experimentally against Pyrrole Orange with actual Golden MSA glossy varnish.

That term is literally *how much surface reflection reaches the eye*. A matte surface scatters white surface reflection back at you from every angle, washing out the color. A varnish redirects it away, so you see the body color clean and deep. This is why varnishing makes a painting "come back."

`[UNVERIFIED — my extension, test it]` Mapping to your media:

| Medium | K_instrument | From CHART |
|---|---|---|
| Gouache | maximum | "ultra-matte, velvety, flat chalk finish" |
| Watercolor, dry | high | "matte, non-glossy, paper-texture sheen" |
| Acrylic | mid, user-exposed | "Gloss, Satin, or Matte (customizable)" |
| Oil | low | "naturally glossy/satin; uniform luster restored with varnish" |

Same pigment data, four media, one parameter. Store k₁, k₂, K_instrument as **per-medium** properties, not per-pigment.

`[UNVERIFIED]` This may also be the dominant mechanism for the wet→dry value shift: wet paper carries a water film (glossy, low K_instrument); drying removes it (matte, high K_instrument). Likely with a scattering change on top. Test both on the bench.

## Band count — question closed

**BE16 PCA on 770 spectra:**

| Eigenvectors | Cumulative variance |
|---|---|
| 1 | 73.9% |
| 2 | 89.6% |
| 3 | 97.5% |
| 4 | 98.9% |
| 5 | 99.5% |
| 10 | 99.9% |

**B04** independently showed 8 wavelengths chosen by Gaussian quadrature matching 101 samples almost exactly.

Two unrelated methods agreeing these spectra are low-dimensional. **8 bands is comfortably justified. Stop revisiting it.**

`[CAVEAT]` Berns 2022 found that *PCA-based primaries poorly approximated the 58 pigments*. Use PCA to reassure yourself about band count — **do not** use it to compress the palette itself.

**Pipeline:** BE16 gives 38 bands. B04 gives the reduction method (Gaussian quadrature weighted by CIE XYZ observer × illuminant spectrum). 38 → 8. Both halves in hand.

**Decision owed:** B04 re-chooses the 8 wavelengths *at runtime* from the current light spectrum (light the canvas blue, the bands shift blue). Your spec assumes fixed bands. Fixed lets you precompute pigment tables; adaptive is more accurate under varied lighting. **Choose deliberately.**

## Normalization anchor

`[KEY]` K and S only ever appear as a **ratio**. One value must be pinned arbitrarily or the system is unconstrained. **B04 fixes S = 1 for Titanium White** and solves everything else relative to it. Build your pigment table without knowing this and your numbers are meaningless in a way that is very hard to diagnose.

## Rendering chain

Spectrum → XYZ by integrating against CIE standard observer functions and the illuminant (D65 for sRGB white point) → sRGB matrix → display. [MB21 eqs. 3–7]

## `[TRAP]` Gamut

BE16's plots show **yellows and reds falling outside sRGB, AdobeRGB and eciRGBv2**; sRGB additionally clips cyans. Some real paint mixtures simply cannot be displayed. Plan for it rather than discovering it as a bug report.

## `[TRAP]` Overmixing

I19's user study: their flower test scored under 5/10 because participants mixed repeatedly and everything went dark.

**That is Kubelka-Munk working correctly.** Real paint muds when overmixed — it's why every painting teacher preaches a limited palette. But digital mixing is frictionless and free, so people do it far more than they ever would with real paint. Analog artists will recognize mud instantly. Consider a limited-palette affordance as a kindness rather than a restriction.

---
