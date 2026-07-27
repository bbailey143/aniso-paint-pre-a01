#!/usr/bin/env python3
"""Build the 12-pigment Kubelka-Munk library for aniso-paint (P2).

Source of K & S: Berns, Artist Paint Spectral Database (BE16), the RIT
"Final_artist_database.xlsx", sheet "k and s data" — measured Golden Heavy Body
acrylics, 38 bands (380-750 nm @ 10 nm). Saunderson constants from the same sheet
(k1=0.03, k2=0.65, k_instrument=1.0 SPIN).

CIE 1931 2 deg observer and D65 SPD come from colour-science (canonical CIE data).

Design note: spectral K/S lives only in this small library buffer (12*38*2 floats
~= 3.6 KB) and the composite pass runs once per display frame, so we keep the FULL
38 measured bands — no lossy band reduction, no reduction error. (An earlier attempt
to bin down to 8 bands gave dE2000 ~8 on the yellows; validated as too coarse and
abandoned. The schema's "8" is pigment SLOTS per cell, not spectral bands.)

Everything this script writes traces to measured data or canonical CIE tables.
Nothing is invented (the fence).

Usage:  python tools/build_pigments.py path/to/Final_artist_database.xlsx
Writes: src/color/pigments.ts
"""
import sys, json, numpy as np, openpyxl, colour

# (sheet column index 0-based, display name, C.I., slug, temperature hint)
PALETTE = [
    (25, "Titanium White",       "PW6",    "titanium-white",       "neutral"),
    (3,  "Hansa Yellow",         "PY74",   "hansa-yellow",         "cool"),
    (4,  "Diarylide Yellow",     "PY83",   "diarylide-yellow",     "warm"),
    (5,  "Cadmium Orange",       "PO20",   "cadmium-orange",       "warm"),
    (8,  "Pyrrole Red",          "PR254",  "pyrrole-red",          "warm"),
    (9,  "Quinacridone Red",     "PV19",   "quinacridone-red",     "cool"),
    (10, "Quinacridone Magenta", "PR122",  "quinacridone-magenta", "cool"),
    (11, "Dioxazine Purple",     "PV23",   "dioxazine-purple",     "cool"),
    (12, "Ultramarine Blue",     "PB29",   "ultramarine-blue",     "warm"),
    (16, "Phthalo Blue (GS)",    "PB15:4", "phthalo-blue-gs",      "cool"),
    (17, "Phthalo Green (BS)",   "PG7",    "phthalo-green-bs",     "cool"),
    (2,  "Bone Black",           "PBk9",   "bone-black",           "neutral"),
]

K_ROW0, S_ROW0, N_WL = 5, 44, 38   # 0-based data rows; 380..750 @10nm

def load_ks(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["k and s data"]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    k1, k2, kins = float(rows[1][1]), float(rows[1][2]), float(rows[1][3])
    wl = np.array([float(rows[K_ROW0 + i][1]) for i in range(N_WL)])
    assert wl[0] == 380 and wl[-1] == 750, wl
    pig = []
    for col, name, ci, slug, temp in PALETTE:
        K = np.array([float(rows[K_ROW0 + i][col]) for i in range(N_WL)])
        S = np.array([float(rows[S_ROW0 + i][col]) for i in range(N_WL)])
        pig.append(dict(name=name, ci=ci, slug=slug, temp=temp, K=K, S=S))
    return wl, pig, (k1, k2, kins)

def cie_weights(_wl):
    """Per-wavelength [X,Y,Z] weights = observer * D65, normalised so a perfect
    reflector integrates to Y = 1."""
    shape = colour.SpectralShape(380, 750, 10)
    cmfs = colour.MSDS_CMFS["CIE 1931 2 Degree Standard Observer"].copy().align(shape)
    d65 = colour.SDS_ILLUMINANTS["D65"].copy().align(shape)
    W = cmfs.values * d65.values[:, None]
    return W / np.sum(W[:, 1])

def km_reflectance(K, S, k1, k2, kins):
    """Opaque KM internal reflectance + Saunderson forward to external R."""
    S = np.maximum(S, 1e-6)
    ks = K / S
    r_int = 1.0 + ks - np.sqrt(ks * ks + 2.0 * ks)
    r_ext = kins * k1 + (1 - k1) * (1 - k2) * r_int / (1 - k2 * r_int)
    return np.clip(r_ext, 0.0, 1.0)

def to_hex(R, W):
    rgb = np.clip(colour.XYZ_to_sRGB(R @ W), 0, 1)
    return "#%02x%02x%02x" % tuple(int(round(c * 255)) for c in rgb)

def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "artist_db.xlsx"
    wl, pig, (k1, k2, kins) = load_ks(path)
    W = cie_weights(wl)

    print(f"Saunderson: k1={k1} k2={k2} k_instrument={kins}   bands={N_WL} (380-750@10nm)\n")
    for p in pig:
        p["hex"] = to_hex(km_reflectance(p["K"], p["S"], k1, k2, kins), W)
        print(f"  {p['name']:22} {p['ci']:7} {p['hex']}")

    # --- The proof: subtractive mixing. Blue + yellow must make green. --------
    def mix_hex(a, b, ca=0.5):
        pa = next(x for x in pig if x["slug"] == a)
        pb = next(x for x in pig if x["slug"] == b)
        K = ca * pa["K"] + (1 - ca) * pb["K"]
        S = ca * pa["S"] + (1 - ca) * pb["S"]
        return to_hex(km_reflectance(K, S, k1, k2, kins), W)
    print("\nMixing proof (Duncan linear K/S, then KM):")
    for a, b in [("phthalo-blue-gs", "hansa-yellow"),
                 ("ultramarine-blue", "diarylide-yellow"),
                 ("hansa-yellow", "quinacridone-magenta")]:
        print(f"  {a:18} + {b:20} = {mix_hex(a, b)}")

    emit_ts(pig, wl, W, (k1, k2, kins))

def emit_ts(pig, wl, W, saund):
    k1, k2, kins = saund
    lib = [dict(name=p["name"], ci=p["ci"], slug=p["slug"], temp=p["temp"],
                K=[round(float(x), 6) for x in p["K"]],
                S=[round(float(x), 6) for x in p["S"]],
                hex=p["hex"]) for p in pig]
    cie = [[round(float(x), 8) for x in row] for row in W]
    out = f"""// AUTO-GENERATED by tools/build_pigments.py — do not edit by hand.
// Source: Berns Artist Paint Spectral Database (BE16), RIT Final_artist_database.xlsx,
// sheet "k and s data" (measured Golden Heavy Body acrylics, 380-750nm @10nm).
// CIE 1931 2-deg observer x D65 from colour-science. Full 38 measured bands, no
// lossy reduction. The fence: every K/S value is measured; nothing here is invented.

export const N_BANDS = {N_WL} as const;

/** Band wavelengths (nm), 380..750 @10nm. */
export const WAVELENGTHS_NM = {json.dumps([int(x) for x in wl])} as const;

/** Saunderson correction constants (BE16). kInstrument is the per-medium gloss dial
 * at render time (1 = matte/SPIN as measured, 0 = glossy/varnished). */
export const SAUNDERSON = {{ k1: {k1}, k2: {k2}, kInstrumentDefault: {kins} }} as const;

/** Per-band CIE weight rows [X,Y,Z] = observer*D65, normalised so a perfect
 * reflector integrates to Y=1. XYZ = sum_b R[b] * CIE_BANDS[b]. */
export const CIE_BANDS: readonly (readonly [number, number, number])[] = {json.dumps(cie)};

export interface Pigment {{
  name: string;
  ci: string;      // Colour Index
  slug: string;
  temp: string;    // 'warm' | 'cool' | 'neutral' — palette-organisation hint
  K: number[];     // absorption, 38 bands
  S: number[];     // scattering, 38 bands
  hex: string;     // sRGB masstone swatch (matte), for the UI
}}

export const PIGMENTS: Pigment[] = {json.dumps(lib, indent=2)};
"""
    with open("src/color/pigments.ts", "w", encoding="utf-8") as f:
        f.write(out)
    print("\nwrote src/color/pigments.ts")

if __name__ == "__main__":
    main()
