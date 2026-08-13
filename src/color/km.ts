// Kubelka-Munk colour on the CPU — for the mixing tray and swatches (P2).
//
// Subtractive: mixing is linear in concentration space (Duncan 1940 via MB21),
// K_mix = Sum c_i K_i, S_mix = Sum c_i S_i. Reflectance is opaque KM with the
// Saunderson correction (BE16). Spectrum -> XYZ uses the per-band CIE weights
// baked by tools/build_pigments.py; XYZ -> sRGB is the standard D65 matrix.
//
// The GPU composite pass (P3) mirrors this exact math in WGSL. Keep them in step.

import { CIE_BANDS, SAUNDERSON, N_BANDS, type Pigment } from './pigments';
import { PIGMENTS } from './pigment-palette';

export const PIGMENT_BY_SLUG: Map<string, Pigment> = new Map(
  PIGMENTS.map((p) => [p.slug, p]),
);

/** A recipe: how many "parts" of each pigment (by slug). Normalised at mix time. */
export type Recipe = Map<string, number>;

export interface Spectral {
  K: Float64Array; // absorption, N_BANDS
  S: Float64Array; // scattering, N_BANDS
}

/** The canvas compositor's pigment-loading scale. Palette previews use this
 * same established value, so the colour in hand matches the colour on paper. */
export const WATERCOLOUR_THICKNESS_SCALE = 5.0;

/** Duncan linear mix in concentration space. Empty/zero recipe -> null. */
export function mixSpectral(recipe: Recipe): Spectral | null {
  let total = 0;
  for (const v of recipe.values()) total += Math.max(0, v);
  if (total <= 0) return null;

  const K = new Float64Array(N_BANDS);
  const S = new Float64Array(N_BANDS);
  for (const [slug, parts] of recipe) {
    const c = Math.max(0, parts) / total;
    if (c === 0) continue;
    const p = PIGMENT_BY_SLUG.get(slug);
    if (!p) continue;
    for (let b = 0; b < N_BANDS; b++) {
      K[b] += c * p.K[b];
      S[b] += c * p.S[b];
    }
  }
  return { K, S };
}

/** Opaque KM internal reflectance + Saunderson forward to external reflectance.
 * kInstrument: 1 = matte (as measured), 0 = glossy/varnished. */
export function reflectance(sp: Spectral, kInstrument: number = SAUNDERSON.kInstrumentDefault): Float64Array {
  const { k1, k2 } = SAUNDERSON;
  const R = new Float64Array(N_BANDS);
  for (let b = 0; b < N_BANDS; b++) {
    const S = Math.max(sp.S[b], 1e-6);
    const ks = sp.K[b] / S;
    const rInt = 1 + ks - Math.sqrt(ks * ks + 2 * ks);
    let r = kInstrument * k1 + ((1 - k1) * (1 - k2) * rInt) / (1 - k2 * rInt);
    R[b] = Math.min(1, Math.max(0, r));
  }
  return R;
}

/**
 * Finite-thickness Kubelka-Munk over a white ceramic or paper ground.
 *
 * This mirrors `overLayer` in `composite.wgsl`. Opaque reflectance is useful
 * for a dry pan, but misleading for a watercolour puddle: a thin wash lets the
 * white surface keep contributing light.
 */
export function finiteLayerReflectance(
  sp: Spectral,
  thickness: number,
  substrateReflectance = 1,
  kInstrument: number = SAUNDERSON.kInstrumentDefault,
): Float64Array {
  const { k1, k2 } = SAUNDERSON;
  const R = new Float64Array(N_BANDS);
  for (let b = 0; b < N_BANDS; b++) {
    const S = Math.max(sp.S[b], 1e-6);
    const ratio = sp.K[b] / S;
    const A = 1 + ratio;
    const B = Math.sqrt(Math.max(ratio * ratio + 2 * ratio, 0));
    // Mirrors the compositor's established guard against runaway sinh/cosh.
    const bsx = Math.min(Math.max(B * S * thickness, 0), 40);
    const sh = Math.sinh(bsx);
    const ch = Math.cosh(bsx);
    const denominator = A * sh + B * ch;
    const Rlayer = denominator > 1e-12 ? sh / denominator : 0;
    const Tlayer = denominator > 1e-12 ? B / denominator : 1;
    const internal = Rlayer + (Tlayer * Tlayer * substrateReflectance)
      / Math.max(1 - Rlayer * substrateReflectance, 1e-12);
    const external = kInstrument * k1
      + ((1 - k1) * (1 - k2) * internal) / (1 - k2 * internal);
    R[b] = Math.min(1, Math.max(0, external));
  }
  return R;
}

/** Reflectance spectrum -> CIE XYZ (Y=1 for a perfect reflector under D65). */
export function reflectanceToXYZ(R: Float64Array): [number, number, number] {
  let X = 0, Y = 0, Z = 0;
  for (let b = 0; b < N_BANDS; b++) {
    const w = CIE_BANDS[b];
    X += R[b] * w[0];
    Y += R[b] * w[1];
    Z += R[b] * w[2];
  }
  return [X, Y, Z];
}

/** CIE XYZ (D65) -> gamma-encoded sRGB in [0,1], clipped to gamut. */
export function xyzToSRGB([X, Y, Z]: [number, number, number]): [number, number, number] {
  const rl = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  const gl = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  const bl = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  const enc = (v: number) => {
    const c = Math.min(1, Math.max(0, v));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };
  return [enc(rl), enc(gl), enc(bl)];
}

export function srgbToHex([r, g, b]: [number, number, number]): string {
  const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Convenience: recipe -> displayable hex via the full KM chain. */
export function recipeToHex(recipe: Recipe, kInstrument?: number): string | null {
  const sp = mixSpectral(recipe);
  if (!sp) return null;
  return srgbToHex(xyzToSRGB(reflectanceToXYZ(reflectance(sp, kInstrument))));
}

/** Visible watercolour on white ceramic or paper. Unlike `recipeToHex`, this
 * preserves the white ground through a thin wet layer instead of showing the
 * opaque masstone. */
export function recipeToLayerHex(recipe: Recipe, thickness: number): string | null {
  const sp = mixSpectral(recipe);
  if (!sp) return null;
  return srgbToHex(xyzToSRGB(reflectanceToXYZ(finiteLayerReflectance(sp, thickness))));
}

/** A pigment as a tint: `fraction` parts pigment + rest Titanium White, through
 * the KM chain. Painters recognise a pigment by its tint/undertone, not its dark
 * masstone — this is what a well swatch should show for the hue to read true. */
export function tintHex(slug: string, fraction: number): string | null {
  const r: Recipe = new Map([
    [slug, fraction],
    ['titanium-white', 1 - fraction],
  ]);
  return recipeToHex(r);
}

/** The "wrong" answer for contrast: naive linear-RGB average of the pigment
 * masstone swatches, weighted by parts. This is what RGB blending would give —
 * blue + yellow -> grey/brown instead of green. */
export function recipeToNaiveRGBHex(recipe: Recipe): string | null {
  let total = 0;
  for (const v of recipe.values()) total += Math.max(0, v);
  if (total <= 0) return null;
  let r = 0, g = 0, b = 0;
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  for (const [slug, parts] of recipe) {
    const p = PIGMENT_BY_SLUG.get(slug);
    if (!p || parts <= 0) continue;
    const c = parts / total;
    const hex = p.hex;
    r += c * lin(parseInt(hex.slice(1, 3), 16) / 255);
    g += c * lin(parseInt(hex.slice(3, 5), 16) / 255);
    b += c * lin(parseInt(hex.slice(5, 7), 16) / 255);
  }
  const enc = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  return srgbToHex([enc(r), enc(g), enc(b)]);
}
