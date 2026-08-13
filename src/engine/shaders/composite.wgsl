// Composite + Light (P3).
//
// Per pixel: gather the cell's 8 pigment amounts, mix K/S linearly in
// concentration space (Duncan), run finite-thickness Kubelka-Munk (C97 Form 1)
// over the paper reflectance, apply the Saunderson gloss correction, integrate
// the 38-band spectrum to XYZ (observer x D65) and convert to sRGB. Then relief-
// light the paper tooth from its height gradient. Mirrors src/color/km.ts.
//
// The library stores behaviour (K/S per pigment per band); the cell stores
// amounts; a per-document slot->library-id map connects them.

const N_BANDS: i32 = 38;

struct Comp {
  view: vec2f,        // viewport size in px
  doc: vec2f,         // document size in px
  slotA: vec4i,       // library ids for slots 0..3 (-1 = empty)
  slotB: vec4i,       // library ids for slots 4..7
  thickScale: f32,    // maps total pigment amount -> optical thickness
  relief: f32,        // paper relief lighting strength
  kInstrument: f32,   // gloss dial (1 matte .. 0 gloss)
  valueShift: f32,    // + dries lighter, - dries darker, 0 unchanged

  // 0 = paint. 1 = the water view: show where the water is instead of the
  // colour. Buffer is 112 bytes; canvas.ts must agree.
  waterView: f32,
  /** 1 = the whole sheet fits the window. 4 = four times closer. */
  zoom: f32,
  /** Document-space point held at the centre of the window, in doc px. */
  panX: f32,
  panY: f32,

  // The active sheet's grain parameters, so the paper relief can be evaluated
  // at SCREEN resolution instead of stretched up from the 512 texture. This is
  // what keeps a zoomed view crisp — see `grain_h`.
  pTooth: f32,
  pFreq: f32,
  pSeed: f32,
  grainKind: f32,   // 0 = watercolor grain, 1 = shared fibrous pastel tooth

  // Display tone for the active sheet. This is deliberately separate from the
  // physical paper texture: every medium still reads the shared paper rows.
  paperTone: vec3f,

  // Diagnostic: 0 skips the paper relief lighting entirely. The relief costs
  // four `grain_h` evaluations per fragment and each is an fBm of sine-hashed
  // value noise, so it is paid on every pixel of the sheet whether or not any
  // paint is there. Switching it off is how you find out what share of a slow
  // frame is the tooth. Display only — the solver reads the baked paper
  // texture, which this never touches.
  reliefOn: f32,
};
@group(0) @binding(0) var<uniform> C: Comp;
@group(0) @binding(1) var<storage, read> ks: array<vec2f>;      // (K,S) pigment-major, per band
@group(0) @binding(2) var<storage, read> cie: array<vec4f>;     // [X,Y,Z,0] per band
@group(0) @binding(3) var<uniform> col: vec4f;                  // k1, k2, kInsDefault, pigCount
@group(0) @binding(4) var pigA: texture_2d<f32>;                // g[0..3] suspended
@group(0) @binding(5) var pigB: texture_2d<f32>;                // g[4..7] suspended
@group(0) @binding(6) var paper: texture_2d<f32>;
@group(0) @binding(7) var samp: sampler;
@group(0) @binding(8) var setA: texture_2d<f32>;                // d[0..3] settled
@group(0) @binding(9) var setB: texture_2d<f32>;                // d[4..7] settled
@group(0) @binding(10) var wet0: texture_2d<f32>;               // M, h_f, u, v
@group(0) @binding(11) var wet5: texture_2d<f32>;               // s, w, h_p, flags
@group(0) @binding(12) var dry1a: texture_2d<f32>;              // newest dried layer
@group(0) @binding(13) var dry1b: texture_2d<f32>;
@group(0) @binding(14) var dry2a: texture_2d<f32>;              // everything older
@group(0) @binding(15) var dry2b: texture_2d<f32>;
// Dry-media band. It is deliberately finer than the fluid grid so a pen nib
// can be smaller than a water-simulation cell without becoming a pale block.
@group(0) @binding(16) var inkA: texture_2d<f32>;
@group(0) @binding(17) var inkB: texture_2d<f32>;
// The dry-media band's paper. Same (h, c, sizing, rc) layout as `paper`, baked
// from the same function at four times the resolution — see `setPaper`. Bound
// here so the relief lighting can READ the tooth instead of recomputing it.
@group(0) @binding(18) var inkPaper: texture_2d<f32>;

struct VsOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(-1.0, 1.0), vec2f(3.0, 1.0));
  let xy = p[vi];
  var o: VsOut;
  o.pos = vec4f(xy, 0.0, 1.0);
  o.uv = vec2f(xy.x * 0.5 + 0.5, 1.0 - (xy.y * 0.5 + 0.5)); // y-down screen uv
  return o;
}

/**
 * Water-view brightness: log ramp over four decades, 1e-5 .. 1e-1 per cell.
 * The bottom of that range is WET_EPS, the point below which the solver stops
 * treating a cell as holding water at all — so the ramp fades to nothing at
 * exactly the moment the paint stops being workable, which is the moment the
 * artist actually wants to see. Display only; see the note at the call site.
 */
fn fn_ramp(v: f32, decades: f32) -> f32 {
  return clamp(log2(max(v, 0.0) * 1.0e5 + 1.0) / decades, 0.0, 1.0);
}

fn sinh_(x: f32) -> f32 { let e = exp(x); return (e - 1.0 / e) * 0.5; }
fn cosh_(x: f32) -> f32 { let e = exp(x); return (e + 1.0 / e) * 0.5; }

// Manual bilinear fetch. The wet band is rgba32float (it accumulates, and half
// floats ground 6.5% of the pigment away every 200 frames — see fluid.ts), and
// 32-bit float textures are not filterable in WebGPU core, so we interpolate by
// hand rather than take a dependency on the float32-filterable feature (D1).
fn biload(t: texture_2d<f32>, uv: vec2f) -> vec4f {
  let dim = vec2f(textureDimensions(t));
  let p = uv * dim - 0.5;
  let base = floor(p);
  let f = p - base;
  let hi = vec2i(dim) - vec2i(1, 1);
  let c00 = clamp(vec2i(base), vec2i(0, 0), hi);
  let c11 = clamp(vec2i(base) + vec2i(1, 1), vec2i(0, 0), hi);
  let t00 = textureLoad(t, vec2i(c00.x, c00.y), 0);
  let t10 = textureLoad(t, vec2i(c11.x, c00.y), 0);
  let t01 = textureLoad(t, vec2i(c00.x, c11.y), 0);
  let t11 = textureLoad(t, vec2i(c11.x, c11.y), 0);
  return mix(mix(t00, t10, f.x), mix(t01, t11, f.x), f.y);
}

/**
 * Catmull-Rom, one axis. Used to magnify the paint field without the diamond
 * creases bilinear leaves once one simulation cell covers many screen pixels.
 *
 * It does NOT add resolution — the paint field is 512 cells and nothing here
 * invents detail that was never simulated. It removes an artifact of the
 * interpolation, which is a different and smaller claim.
 */
fn cr_w(x: f32) -> vec4f {
  let x2 = x * x;
  let x3 = x2 * x;
  return vec4f(
    -0.5 * x3 + x2 - 0.5 * x,
    1.5 * x3 - 2.5 * x2 + 1.0,
    -1.5 * x3 + 2.0 * x2 + 0.5 * x,
    0.5 * x3 - 0.5 * x2,
  );
}

fn bicubic(t: texture_2d<f32>, uv: vec2f) -> vec4f {
  let dim = vec2f(textureDimensions(t));
  let hi = vec2i(dim) - vec2i(1, 1);
  let p = uv * dim - 0.5;
  let base = floor(p);
  let f = p - base;
  let wx = cr_w(f.x);
  let wy = cr_w(f.y);
  var acc = vec4f(0.0);
  for (var j = 0; j < 4; j = j + 1) {
    var row = vec4f(0.0);
    let cy = clamp(i32(base.y) + j - 1, 0, hi.y);
    for (var i = 0; i < 4; i = i + 1) {
      let cx = clamp(i32(base.x) + i - 1, 0, hi.x);
      row = row + textureLoad(t, vec2i(cx, cy), 0) * wx[i];
    }
    acc = acc + row * wy[j];
  }
  return acc;
}

/**
 * Sample the paint field. Bilinear when the sheet is at or below fit, bicubic
 * once magnified — the sharper filter costs 16 taps instead of 4 and there is
 * nothing for it to do until one cell is bigger than one screen pixel.
 */
fn paint(t: texture_2d<f32>, uv: vec2f) -> vec4f {
  if (C.zoom > 1.05) { return bicubic(t, uv); }
  return biload(t, uv);
}

/**
 * The paper's tooth height, evaluated procedurally at the requested document
 * point rather than read from the baked 512 texture.
 *
 * This is the whole reason a zoomed sheet can stay crisp. The grain is noise,
 * not a photograph, so it has a value at every real-numbered point — magnifying
 * it costs nothing and loses nothing, while stretching the baked texture would
 * turn the tooth into soft blobs at exactly the magnification where the artist
 * is trying to judge a pigment.
 *
 * MUST stay in step with `paper.wgsl`, which bakes the same function into the
 * texture the SOLVER reads. If the two drift, the paper you see stops being the
 * paper the water is running over.
 */
fn grain_hash(p: vec2f) -> f32 {
  let h = dot(p, vec2f(127.1, 311.7)) + C.pSeed * 57.0;
  return fract(sin(h) * 43758.5453123);
}
fn grain_vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = grain_hash(i + vec2f(0.0, 0.0));
  let b = grain_hash(i + vec2f(1.0, 0.0));
  let c = grain_hash(i + vec2f(0.0, 1.0));
  let d = grain_hash(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// Must mirror `pastel_fibre` in paper.wgsl: this is visible relief from the
// very same height field the solver and dry-media tooth gate read.
fn grain_pastel_fibre(p: vec2f) -> f32 {
  let long = grain_vnoise(vec2f(p.x * 0.72 + p.y * 0.18, p.y * 4.6 - p.x * 0.09));
  let cross = grain_vnoise(vec2f(p.x * 5.1 + p.y * 0.08, p.y * 0.58));
  return clamp(0.5 + (long - 0.5) * 0.78 + (cross - 0.5) * 0.22, 0.0, 1.0);
}
fn grain_h(uv: vec2f) -> f32 {
  let p = vec2f(uv.x * C.pFreq, uv.y * C.pFreq * 1.15);
  var v = 0.0;
  var amp = 0.5;
  var freq = 1.0;

  // Four octaves is what paper.wgsl bakes, and four octaves magnified is soft
  // blobs — measured: adjacent-pixel detail fell from 2.20 at fit to 0.15 at
  // 16x, because an fBm that stops at a fixed frequency has nothing finer to
  // show. Add octaves as the view closes in, so the sheet keeps offering fibre
  // at whatever scale is being looked at. THAT is the "smooth scaling" claim.
  //
  // Honesty about what the extra octaves are: they are strictly FINER than one
  // simulation cell, so they are paper fibre the water cannot feel and does not
  // respond to. The first four octaves are the sheet the solver actually reads;
  // the rest is sub-cell detail, shown because real paper has it. The dry-media
  // band already does exactly this, evaluating the same sheet at 4x resolution
  // so a pen nib is not a fat cell — see `setPaper` in canvas.ts.
  let extra = clamp(i32(floor(log2(max(C.zoom, 1.0)))), 0, 3);
  let octaves = 4 + extra;
  for (var o = 0; o < octaves; o = o + 1) {
    v = v + amp * grain_vnoise(p * freq);
    freq = freq * 2.03;
    amp = amp * 0.5;
  }
  var grain = v;
  // Watercolour retains the established fBm output. The pastel branch uses one
  // quiet fibre family for both its visible texture and physical tooth.
  if (C.grainKind > 0.5) {
    grain = mix(grain, grain_pastel_fibre(p), 0.68);
  }
  var h = 0.5 + (grain - 0.5) * (0.4 + C.pTooth * 1.6);
  return clamp(h, 0.02, 0.98);
}

fn slotId(i: i32) -> i32 {
  if (i < 4) { return C.slotA[i]; }
  return C.slotB[i - 4];
}

/** Duncan linear mix of K and S for one band, over the cell's active slots.
 * Mixing is linear in CONCENTRATION space — that is the whole subtractive law. */
fn mixKS(amt: array<f32, 8>, invTotal: f32, b: i32) -> vec2f {
  var K = 0.0;
  var S = 0.0;
  var a = amt;
  for (var s = 0; s < 8; s = s + 1) {
    let id = slotId(s);
    if (id < 0) { continue; }
    let c = max(a[s], 0.0) * invTotal;
    if (c <= 0.0) { continue; }
    let v = ks[id * N_BANDS + b];
    K = K + c * v.x;
    S = S + c * v.y;
  }
  return vec2f(K, max(S, 1e-4));
}

/** Lay one finite-thickness KM film over a substrate of reflectance Rsub and
 * return the combined reflectance (C97 Form 1 + Kubelka's layer equations).
 * This is what makes glazing work: the layer below stays visible through it. */
fn overLayer(Rsub: f32, KS: vec2f, thickness: f32) -> f32 {
  let ratio = KS.x / KS.y;
  let A = 1.0 + ratio;
  let Bc = sqrt(max(ratio * ratio + 2.0 * ratio, 0.0));
  let bSx = clamp(Bc * KS.y * thickness, 0.0, 40.0);
  // sinh and cosh of the SAME argument, so take the exponential once and read
  // both off it. Identical arithmetic; this runs 38 bands deep on every layer
  // of every painted pixel. The compiler may already fold it — measure before
  // believing this bought anything.
  let ex = exp(bSx);
  let inv = 1.0 / ex;
  let sh = (ex - inv) * 0.5;
  let ch = (ex + inv) * 0.5;
  let denom = A * sh + Bc * ch;
  let Rl = sh / denom;
  let Tl = Bc / denom;
  return Rl + (Tl * Tl * Rsub) / (1.0 - Rl * Rsub);
}

fn srgb_encode(c: f32) -> f32 {
  let v = clamp(c, 0.0, 1.0);
  if (v <= 0.0031308) { return 12.92 * v; }
  return 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}

// Paper rows store the artist's familiar sRGB sheet colour. Convert it before
// multiplying it into the physically linear composite, then encode once at the
// end as usual. Without this, a charcoal sheet (#373436) is shown as mid-grey.
fn srgb_decode(c: f32) -> f32 {
  let v = clamp(c, 0.0, 1.0);
  if (v <= 0.04045) { return v / 12.92; }
  return pow((v + 0.055) / 1.055, 2.4);
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let bg = vec3f(0.043, 0.047, 0.055);
  let sheetTone = vec3f(srgb_decode(C.paperTone.r), srgb_decode(C.paperTone.g), srgb_decode(C.paperTone.b));

  // Screen px -> document px -> document uv.
  //
  // `fit` is the "contain" scale that puts the whole sheet in the window; zoom
  // multiplies it, and (panX, panY) is the document point held at the centre of
  // the window. At zoom 1 with the pan at the sheet's middle this is exactly the
  // old centred contain fit, which is the regression path.
  //
  // `toGrid()` in src/main.ts INVERTS this. Change one and you must change the
  // other, or paint stops landing under the cursor.
  let fragPx = in.uv * C.view;
  let scale = min(C.view.x / C.doc.x, C.view.y / C.doc.y) * C.zoom;
  let docPx = (fragPx - C.view * 0.5) / scale + vec2f(C.panX, C.panY);
  let uv = docPx / C.doc;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4f(bg, 1.0);
  }

  // Cell contents. What the eye sees is suspended pigment (floating in the
  // film) plus settled pigment (adsorbed on the paper) — the g/d split IS
  // granulation and lifting, but optically both absorb light, so both count.
  let g0 = paint(pigA, uv);
  let g1 = paint(pigB, uv);
  let d0 = paint(setA, uv);
  let d1 = paint(setB, uv);
  let a0 = g0 + d0;
  let a1 = g1 + d1;
  let amt = array<f32, 8>(a0.x, a0.y, a0.z, a0.w, a1.x, a1.y, a1.z, a1.w);
  var total = 0.0;
  for (var i = 0; i < 8; i = i + 1) { total = total + max(amt[i], 0.0); }

  // The dried layers below. Glazing: each is optically its own film, composited
  // over what is beneath it, so a wash laid over a dry one lets the lower colour
  // show through instead of replacing it. Layer order is floor -> dry1 -> wet.
  let e2a = paint(dry2a, uv);
  let e2b = paint(dry2b, uv);
  let i0 = paint(inkA, uv);
  let i1 = paint(inkB, uv);
  let e1a = paint(dry1a, uv);
  let e1b = paint(dry1b, uv);
  // Ink occupies the same permanent floor as graphite did before the finer
  // grid arrived. It stays beneath later watercolour glazes, but keeps its own
  // small-scale edge instead of being resampled into the 512-cell dry floor.
  let floorA = e2a + i0;
  let floorB = e2b + i1;
  let amt2 = array<f32, 8>(floorA.x, floorA.y, floorA.z, floorA.w, floorB.x, floorB.y, floorB.z, floorB.w);
  let amt1 = array<f32, 8>(e1a.x, e1a.y, e1a.z, e1a.w, e1b.x, e1b.y, e1b.z, e1b.w);
  var total2 = 0.0;
  var total1 = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    total2 = total2 + max(amt2[i], 0.0);
    total1 = total1 + max(amt1[i], 0.0);
  }

  // Paper: (h, c, sizing, effective capillary radius). Near-white reflectance,
  // dulled a touch by sizing.
  let pap = textureSampleLevel(paper, samp, uv, 0.0);
  let baseRpaper = mix(0.93, 0.88, pap.z);   // sized paper sits slightly less brilliant

  // Wet state drives the gloss dial. A standing water film is specular (low
  // k_instrument -> deep, saturated); as it dries the surface goes matte and the
  // value lifts. This is the wet->dry shift falling out of one mechanism rather
  // than a post-process. [UNVERIFIED — Card 4; bench it against real swatches.]
  let w0v = paint(wet0, uv);
  let w5v = paint(wet5, uv);
  // A surface film and water bound in paper fibre are not the same thing. Only
  // the former is glossy and strongly deepens the wash. Fibre-bound water keeps
  // a quiet damp darkening, but reads matte.
  let filmWetness = clamp(w0v.y * 6.0, 0.0, 1.0);
  let fibreDamp = clamp(w5v.x / max(pap.y, 1.0e-4), 0.0, 1.0);
  let wetness = max(filmWetness, fibreDamp * 0.22);
  let kIns = mix(C.kInstrument, 0.0, filmWetness);
  let Rpaper = baseRpaper * mix(1.0, 0.94, fibreDamp);

  // ---- Water view -----------------------------------------------------------
  //
  // A debug display, not a render mode: it answers "where is the water, and how
  // much" while a wash dries. Deep blue is a lot, pale blue is a little, and
  // watching it fade IS watching the sheet dry. Nothing here feeds back into the
  // simulation — it reads the same two textures the paint path already reads.
  //
  // The two kinds of water are shown differently on purpose, because telling
  // them apart is the whole point of having this:
  //
  //   STANDING FILM (wet0.y) — water sitting on top of the paper, the stuff that
  //   can still flow and carry pigment. Drawn in strong blue.
  //
  //   SOAKED IN (wet5.x) — water taken up into the fibres. It no longer flows
  //   like a film but it keeps the paper workable. Drawn in a duller teal.
  //
  // Both scales are display-only and carry no physics.
  if (C.waterView > 0.5) {
    let film = max(w0v.y, 0.0);
    let soak = max(w5v.x, 0.0);

    // Dry paper reads as the paper, dimmed, so the sheet's tooth still gives a
    // sense of place instead of the mark floating on flat grey.
    let paperValue = 0.72 + 0.16 * pap.x;
    var out = sheetTone * paperValue;

    // The amount of water in a drying wash spans about four decades: a fresh
    // flooded stroke carries ~0.08 per cell, and it is still visibly damp at
    // ~0.0001. A linear ramp spends its whole range on the first moment and
    // then shows flat nothing for the entire rest of the dry, which is exactly
    // the part worth watching. So this is a LOG ramp over 1e-5 .. 1e-1.
    //
    // Consequence to keep in mind when reading it: equal steps of colour are
    // equal RATIOS of water, not equal amounts. Deep blue is not "twice" pale
    // blue. Nothing here is a measurement — use the CONSERVATION readout for
    // numbers and this for where and when.
    let decades = log2(1.0e4);
    let ramp = fn_ramp(film, decades);
    let soakAmt = fn_ramp(soak, decades);

    // Soaked-in water first: it lies under the standing film. When a thirsty
    // sheet has both, leave the teal visible instead of letting surface blue
    // completely hide the absorbed-water signal.
    out = mix(out, vec3f(0.36, 0.62, 0.66), soakAmt * 0.9);
    let visibleFilm = ramp * (1.0 - soakAmt * 0.62);
    out = mix(out, vec3f(0.05, 0.24, 0.72), visibleFilm);

    // The wet mask boundary, drawn as a faint line. This is the contact line —
    // the thing the drying rate is keyed to, and the thing whose behaviour the
    // rim work turns on. Being able to SEE it is most of why this view exists.
    let mHere = w0v.x;
    let e = 1.0 / vec2f(textureDimensions(wet0));
    let mR = biload(wet0, uv + vec2f(e.x, 0.0)).x;
    let mD = biload(wet0, uv + vec2f(0.0, e.y)).x;
    let onEdge = clamp(abs(mR - mHere) + abs(mD - mHere), 0.0, 1.0);
    out = mix(out, vec3f(0.98, 0.85, 0.30), onEdge * 0.55);

    return vec4f(srgb_encode(out.r), srgb_encode(out.g), srgb_encode(out.b), 1.0);
  }

  let k1 = col.x;
  let k2 = col.y;
  let has2 = total2 >= 1e-4;
  let has1 = total1 >= 1e-4;
  let hasW = total >= 1e-4;
  let inv2 = select(0.0, 1.0 / total2, has2);
  let inv1 = select(0.0, 1.0 / total1, has1);
  let invW = select(0.0, 1.0 / total, hasW);

  var XYZ = vec3f(0.0);
  for (var b = 0; b < N_BANDS; b = b + 1) {
    // Start at the sheet and build upward, one glaze at a time.
    var R = Rpaper;

    if (has2) {
      let ks2 = mixKS(amt2, inv2, b);
      R = overLayer(R, ks2, total2 * C.thickScale);
    }
    if (has1) {
      let ks1 = mixKS(amt1, inv1, b);
      R = overLayer(R, ks1, total1 * C.thickScale);
    }
    if (hasW) {
      let ksw = mixKS(amt, invW, b);
      R = overLayer(R, ksw, total * C.thickScale);
    }

    // Saunderson forward (internal -> external), gloss via kInstrument.
    R = kIns * k1 + ((1.0 - k1) * (1.0 - k2) * R) / (1.0 - k2 * R);
    XYZ = XYZ + clamp(R, 0.0, 1.0) * cie[b].xyz;
  }

  // XYZ (D65) -> linear sRGB.
  var rgb = vec3f(
    3.2406 * XYZ.x - 1.5372 * XYZ.y - 0.4986 * XYZ.z,
    -0.9689 * XYZ.x + 1.8758 * XYZ.y + 0.0415 * XYZ.z,
    0.0557 * XYZ.x - 0.2040 * XYZ.y + 1.0570 * XYZ.z,
  );

  // Shared wet-fibre scattering response (Card 7), expressed by the medium's
  // existing valueShift. Positive watercolor is deeper while wet and returns
  // lighter as air replaces water; negative acrylic is milky while wet and
  // cures darker; oil uses zero. This scales outgoing spectral light without
  // deleting or diluting pigment, and keeps the row value artist-legible:
  // valueShift 0.18 produces an 18% wet-state value difference.
  rgb = rgb * max(1.0 - C.valueShift * wetness, 0.1);

  // Relief lighting from the paper height gradient (tooth catches the light).
  //
  // The gradient is taken one SCREEN pixel apart, not one texel of the baked
  // paper texture, and the heights come from `grain_h` — the same noise the
  // solver's paper was baked from, evaluated fresh at this exact point. That is
  // what makes zooming in show finer grain instead of bigger blobs: the tooth is
  // a function, so it has detail at every scale, and stepping by a screen pixel
  // asks it for exactly the detail this magnification can show.
  //
  // At or below fit, one screen pixel is coarser than one paper texel and this
  // reduces to what the baked texture would have given.
  var shade = 1.0;
  if (C.reliefOn > 0.5) {
    let scaleNow = min(C.view.x / C.doc.x, C.view.y / C.doc.y) * C.zoom;
    let texel = vec2f(1.0 / max(scaleNow, 1.0e-4)) / C.doc;

    // The tooth is STATIC. It changes when the sheet changes and at no other
    // time, yet the four `grain_h` calls below re-derive it on every fragment
    // of every frame — four fBm evaluations, ~64 sine-hashes, paid on every
    // pixel of the sheet whether or not any paint is there. On an iPad that
    // measured as ten times the missed frames.
    //
    // `inkPaper` already holds exactly this field: same hash constants, same
    // seed term, same four octaves, same tooth transform as `grain_h` — see
    // paper.wgsl, which the two are required to keep in step anyway. So
    // whenever the bake already holds every detail this magnification can
    // show — one screen pixel at least as coarse as one baked texel — read it
    // instead of recomputing it.
    //
    // Past that the screen out-resolves the bake and the procedural path takes
    // over, which is the whole reason it exists: a magnified sheet keeps
    // offering finer fibre instead of turning into soft blobs.
    let bakeTexelDoc = C.doc.x / f32(textureDimensions(inkPaper).x);
    let screenDoc = 1.0 / max(scaleNow, 1.0e-4);
    var hL: f32; var hR: f32; var hU: f32; var hD: f32;
    if (screenDoc >= bakeTexelDoc) {
      // Uniform across the draw — it depends only on uniforms and the baked
      // texture's size — so this branch costs no divergence.
      hL = textureSampleLevel(inkPaper, samp, uv - vec2f(texel.x, 0.0), 0.0).x;
      hR = textureSampleLevel(inkPaper, samp, uv + vec2f(texel.x, 0.0), 0.0).x;
      hU = textureSampleLevel(inkPaper, samp, uv - vec2f(0.0, texel.y), 0.0).x;
      hD = textureSampleLevel(inkPaper, samp, uv + vec2f(0.0, texel.y), 0.0).x;
    } else {
      hL = grain_h(uv - vec2f(texel.x, 0.0));
      hR = grain_h(uv + vec2f(texel.x, 0.0));
      hU = grain_h(uv - vec2f(0.0, texel.y));
      hD = grain_h(uv + vec2f(0.0, texel.y));
    }
    let n = normalize(vec3f(-(hR - hL) * C.relief, -(hD - hU) * C.relief, 1.0));
    let lightDir = normalize(vec3f(-0.35, -0.5, 0.78));
    let lambert = clamp(dot(n, lightDir), 0.0, 1.0);
    shade = 0.82 + 0.18 * lambert;        // subtle; paper is not shiny
  }
  rgb = rgb * sheetTone * shade;

  return vec4f(srgb_encode(rgb.r), srgb_encode(rgb.g), srgb_encode(rgb.b), 1.0);
}
