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
  grainKind: f32,   // 0 = watercolor noise, 1 = pastel fibre, 2 = woven canvas, 3 = flat

  // Display tone for the active sheet. This is deliberately separate from the
  // physical paper texture: every medium still reads the shared paper rows.
  paperTone: vec3f,
  // How far the sheet is turned, in radians, document -> screen. It rides in
  // the 4 bytes a vec3f already reserves for alignment.
  rot: f32,

  // How completely the material covers what is under it. 0 = a stain and the
  // sheet always shows; 1 = paint that hides the ground. Buffer is 128 bytes;
  // canvas.ts must agree.
  hidesGround: f32,
  /** How far the paint film stands off the sheet. 0 = a stain, and the relief
   * below reduces to exactly the paper tooth it always was. */
  paintRelief: f32,
  /** How far a STANDING FILM of this material's own vehicle drags it toward
   * mirror-wet, 0..1.
   *
   * A puddle of water really is glassy, so watercolour sits at 1 and behaves
   * exactly as it always did — and its film is gone in ninety seconds, so the
   * effect expires on its own.
   *
   * Oil is the case this exists for: its film leaves 1920x slower than
   * watercolour's, because real oil cures rather than dries, so the override
   * never lifts on its own. And an oil film IS the paint, not a layer of
   * solvent lying on top of it, so reading it as a wet puddle is wrong in
   * principle whatever it measures.
   *
   * ~~That is the "shines like jelly" the artist reported.~~ **RETRACTED
   * 2026-08-24, the same day, before it was believed.** Measured on a real oil
   * stroke the film averages 0.018 per wet cell, so filmWetness comes out
   * around 0.11 - nowhere near the 1.0 that would pin the gloss. Turning this
   * row from 1 to 0.15 changed the painted result by ONE unit of blue in 255
   * and nothing else. The jelly is the SHEEN below, not this. Kept because the
   * principle is right and it will matter for a flooded film; do not credit it
   * with fixing anything.
   */
  filmGloss: f32,
  /** How bright the highlight on a ridge of paint is. */
  sheenStrength: f32,
  /** How broad it is. 0 is a tight hot spot — varnish, or plastic. 1 is a wide
   * soft one, which is what an oil surface gives, because up close it is full
   * of hair furrows scattering the light rather than a polished plane. */
  sheenWidth: f32,
  // Separate floats, NOT a vec3f. A vec3f aligns to 16 in WGSL, so it would
  // land at 128 rather than 116 and make this struct larger than the buffer —
  // the bind group is then invalid and the sheet does not draw at all, with no
  // error thrown. Scalars align to 4 and pack where they are put.
  //
  // Buffer is 144 bytes now; canvas.ts must agree. A uniform struct is rounded
  // up to a multiple of 16, so these three pads are not optional: without them
  // WGSL still reports 144 but there is nothing saying so out loud.
  _pad3: f32,
  _pad4: f32,
  _pad5: f32,
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
/**
 * A plain woven ground. Must stay in step with `canvas_weave` in paper.wgsl.
 *
 * Warp and weft cross over and under: at every other crossing the warp is the
 * thread on top, and at the ones between it dips beneath the weft. That
 * alternation is the whole reason this is its own function and not another
 * grade of tooth - no amount of noise produces an over-under, and without it
 * canvas just reads as coarse paper.
 *
 * The over-under has to be built from something SMOOTH. A thread rises and
 * falls along its length; it does not teleport from over to under at the edge
 * of a crossing. Deciding it by the parity of the crossing is arithmetically
 * correct and visually wrong, and it puts a hard step across the whole sheet
 * at every thread line.
 */
fn grain_weave(p: vec2f) -> f32 {
  // A ridge down the middle of each thread, falling to zero where two threads
  // meet. This is the shape ACROSS a thread.
  let warpRidge = 0.5 + 0.5 * cos((fract(p.x) - 0.5) * 6.2831853);
  let weftRidge = 0.5 + 0.5 * cos((fract(p.y) - 0.5) * 6.2831853);

  // And this is the shape ALONG it: each thread rises over its neighbour, dips
  // under the next, and does it smoothly, because a thread bends rather than
  // stepping. The two are in antiphase, so where the warp is over, the weft is
  // under — the over-under of a plain weave.
  //
  // [MEASURED] The first version decided over-or-under by the parity of the
  // crossing, which is true of a weave but jumps the height by 0.45 in one
  // step at every whole-numbered thread line. That is a hard edge running the
  // full width and height of the sheet, at every thread — straight, and
  // aligned to the axes, because the grid is. The `floor` here survives only
  // where it is multiplied by a ridge that is already zero, so nothing jumps:
  // the same sweep now measures 0.006, which is the sampling step.
  let warp = warpRidge * (0.5 + 0.5 * cos(3.14159265 * (p.y - floor(p.x) - 0.5)));
  let weft = weftRidge * (0.5 - 0.5 * cos(3.14159265 * (p.x - floor(p.y) - 0.5)));

  // Slub: real thread is not evenly spun, and a perfectly regular weave reads
  // as printed fabric rather than woven cloth.
  let slub = grain_vnoise(p * 2.7) - 0.5;
  return clamp(0.12 + 0.76 * max(warp, weft) + slub * 0.16, 0.0, 1.0);
}

fn grain_h(uv: vec2f) -> f32 {
  let p = vec2f(uv.x * C.pFreq, uv.y * C.pFreq * 1.15);
  // A weave is analytic — it has an exact value at every real point — so unlike
  // the fBm below it needs no extra octaves to stay sharp as the view closes
  // in, and the octave loop is skipped rather than computed and discarded.
  // Flat: a constant, so its gradient is zero and the lamp finds nothing on the
  // surface at all. Cheapest branch in the shader, and the point of it.
  if (C.grainKind > 2.5) { return 0.5; }
  if (C.grainKind > 1.5) {
    return clamp(0.5 + (grain_weave(p) - 0.5) * (0.4 + C.pTooth * 1.6), 0.02, 0.98);
  }
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
  let sh = sinh_(bSx);
  let ch = cosh_(bSx);
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
  // Screen -> document is the inverse of the view transform, so the rotation
  // runs backwards here: R(-rot) on the offset from the middle of the window.
  //
  // A turned sheet costs nothing in sharpness for the same reason a magnified
  // one does not — this is still one fresh sample of the field per screen
  // pixel, not a bitmap being spun. There is no resampling step to soften.
  let cr = cos(C.rot);
  let sr = sin(C.rot);
  let off = fragPx - C.view * 0.5;
  let docPx = vec2f(off.x * cr + off.y * sr, -off.x * sr + off.y * cr) / scale
    + vec2f(C.panX, C.panY);
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
  /* A bodied, covering paint is optically thicker than the same pigment amount
     suspended in a stain. Use the material's existing Relief and Cover rows so
     loaded Oil can actually bury the ground; Watercolour remains byte-for-byte
     unchanged because both rows are zero. [UNVERIFIED visual mapping — artist
     judgement against the 2026-08-25 cured-impasto references.] */
  let standingBody = max(w0v.y, 0.0) * max(C.paintRelief, 0.0);
  /* Partial body coverage is area, not white paint mixed into the pigment.
     The square-root response lets a thin surviving Oil contact retain more of
     its intrinsic colour while the sharpened deposit gate supplies the truly
     bare gaps. It is display-only and flat media remain unchanged.
     [UNVERIFIED — artist scumble mapping, 2026-08-25.] */
  let opticalBody = 1.0 + max(C.hidesGround, 0.0) * sqrt(standingBody);
  // A surface film and water bound in paper fibre are not the same thing. Only
  // the former is glossy and strongly deepens the wash. Fibre-bound water keeps
  // a quiet damp darkening, but reads matte.
  let filmWetness = clamp(w0v.y * 6.0, 0.0, 1.0);
  let fibreDamp = clamp(w5v.x / max(pap.y, 1.0e-4), 0.0, 1.0);
  let wetness = max(filmWetness, fibreDamp * 0.22);
  // A standing film pulls the surface toward mirror-wet, but only as far as
  // the material says it should. See Comp.filmGloss.
  let kIns = mix(C.kInstrument, 0.0, filmWetness * clamp(C.filmGloss, 0.0, 1.0));
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

  /* Body paint needs more optical weight than a stain, but forcing every
     surviving trace to one fixed opaque thickness erased depletion, tuft
     variation, and visible mixing. Use a square-root response instead: it
     strengthens thin paste without making all nonzero cells identical, and it
     still tends continuously to zero as the brush runs dry. The only scale is
     the material's existing Cover row. Every zero-relief / zero-cover wash
     keeps its exact old thickness. [UNVERIFIED — artist coverage mapping,
     2026-08-25.] */
  let isBodyPaint = C.paintRelief > 0.0 && C.hidesGround > 0.0;
  var thick2 = total2 * C.thickScale * opticalBody;
  var thick1 = total1 * C.thickScale * opticalBody;
  var thickW = total * C.thickScale * opticalBody;
  if (isBodyPaint) {
    thick2 = sqrt(max(thick2, 0.0) * C.hidesGround);
    thick1 = sqrt(max(thick1, 0.0) * C.hidesGround);
    thickW = sqrt(max(thickW, 0.0) * C.hidesGround);
  }

  var XYZ = vec3f(0.0);
  for (var b = 0; b < N_BANDS; b = b + 1) {
    // Start at the sheet and build upward, one glaze at a time.
    var R = Rpaper;

    if (has2) {
      let ks2 = mixKS(amt2, inv2, b);
      R = overLayer(R, ks2, thick2);
    }
    if (has1) {
      let ks1 = mixKS(amt1, inv1, b);
      R = overLayer(R, ks1, thick1);
    }
    if (hasW) {
      let ksw = mixKS(amt, invW, b);
      R = overLayer(R, ksw, thickW);
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

  /* How much of the SHEET still reaches the eye. Needed before the relief
     below, not only for the colour at the end: a tooth buried under paint
     throws no shadow either, so the same term fades the paper's slope out of
     the surface normal. */
  let laid = total + total1 + total2;
  /* Opaque body hides the ground geometrically as well as optically. Previously
     `seen` only knew pigment amount, so the Cotton Duck weave stayed embossed
     through a standing oil ridge. Reuse the existing material's hidesGround
     and relief rows: no new paint constant, and flat/staining media remain
     exactly unchanged because one or both rows are zero. [UNVERIFIED visual
     mapping — compare against the 2026-08-25 cured-impasto references.] */
  let opticalCover = exp(-C.hidesGround * (laid * C.thickScale + standingBody) * 2.0);

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
  let scaleNow = min(C.view.x / C.doc.x, C.view.y / C.doc.y) * C.zoom;
  let texel = vec2f(1.0 / max(scaleNow, 1.0e-4)) / C.doc;
  let hL = grain_h(uv - vec2f(texel.x, 0.0));
  let hR = grain_h(uv + vec2f(texel.x, 0.0));
  let hU = grain_h(uv - vec2f(0.0, texel.y));
  let hD = grain_h(uv + vec2f(0.0, texel.y));

  /* The surface the light finds is the paper PLUS whatever is sitting on it.
   *
   * Until now only the paper had a shape, so a loaded impasto stroke and a thin
   * stain lit identically — both of them flat, both of them showing the weave.
   * The film height is already in the wet band; this reads it as what it is,
   * a surface, and takes its slope the same way the tooth's is taken.
   *
   * The paper's own contribution fades as paint covers it, through the same
   * `seen` term the tone uses: buried tooth throws no shadow. At paintRelief 0
   * the second gradient is zero and the first is unattenuated, so a stain is
   * lit by exactly the arithmetic it always was.
   */
  /* The step for the PAINT is one cell, never one screen pixel.
   *
   * The paper above is sampled a screen pixel apart on purpose: its tooth is a
   * function, so it has real detail at every scale and a finer step asks it a
   * finer question. The paint is not a function. It is a 512-cell field with
   * nothing in it below that, and once the view is closer than a pixel per
   * cell, asking for its slope a screen pixel apart stops asking the paint
   * anything at all — it asks the INTERPOLATION KERNEL. `paint()` switches to
   * Catmull-Rom above zoom 1.05, and Catmull-Rom's slope kinks at every cell
   * boundary. Multiplied by the relief strength, that draws the simulation grid
   * over the whole mark as a lattice of little ridges, square to the cell axes
   * and quite unlike anything a brush does.
   *
   * `max` and not a plain swap: zoomed OUT, a screen pixel is wider than a cell
   * and stepping by a cell would alias instead. Never finer than a cell, never
   * finer than a pixel.
   */
  let cellStep = 1.0 / vec2f(textureDimensions(wet0));
  /* Two cells, not one.
   *
   * [MEASURED] Toggling this term alone, over the same paint: banding across
   * the stroke 5.65 with relief on, 2.24 with it off, while the hair tracks
   * running ALONG the stroke barely moved (3.62 to 4.20). So the lighting was
   * the source of roughly two thirds of the cross-stroke marks — it was not
   * showing paint, it was showing the simulation grid.
   *
   * The lamp should see the shape of the PAINT. A brush ridge is many cells
   * wide; one cell of deposit noise is not a ridge at all, but at relief 26 the
   * lighting turned every one into a bright line square to the grid axes. A
   * central difference taken two cells apart cancels most of what varies from
   * cell to cell and leaves anything broader than that intact — which is every
   * real ridge a bristle makes. Halved to keep the slope the same size, so the
   * dial still means what it meant.
   *
   * Same tap count as before. This is a change of scale, not of cost.
   */
  /* The cured-impasto references read in broad brush planes, not one highlight
     per thread of canvas. Six cells spans the Cotton Duck repeat in the live
     view and leaves the wider tuft ridge for the lamp to find. Divide the
     sampled height by the same distance so Relief keeps its overall scale.
     [UNVERIFIED — artist visual mapping, 2026-08-25.] */
  // Six cells made a loaded stroke read like a smooth tube. Keep the lighting
  // local enough to reveal brush-made ridges and valleys instead of inventing
  // one broad rolling hill across the whole tuft.
  let paintLightSpan = 3.0;
  let ftex = max(texel, cellStep) * paintLightSpan;
  let fL = paint(wet0, uv - vec2f(ftex.x, 0.0)).y / paintLightSpan;
  let fR = paint(wet0, uv + vec2f(ftex.x, 0.0)).y / paintLightSpan;
  let fU = paint(wet0, uv - vec2f(0.0, ftex.y)).y / paintLightSpan;
  let fD = paint(wet0, uv + vec2f(0.0, ftex.y)).y / paintLightSpan;
  /* Cotton Duck is physically coarse, but the old display strength made every
     thread read as polished moulded plastic. Keep the solver's weave untouched;
     this is only how strongly the room light reveals it. [UNVERIFIED — matched
     by eye to the 2026-08-25 primed/cured impasto references.] */
  let isCanvas = C.grainKind > 1.5 && C.grainKind < 2.5;
  let visiblePaperRelief = C.relief * select(1.0, 0.30, isCanvas);
  // Kept apart so the shading below can tell which surface it is looking at.
  // A thin film hides colour optically before it buries the physical tooth.
  // Keep a little of the canvas relief showing until the body is genuinely
  // tall enough to cover it. This is display-only; the paint field is unchanged.
  let toothBurial = 1.0 - exp(-max(standingBody, 0.0) / 0.30);
  let surfaceTooth = mix(1.0, opticalCover, toothBurial);
  let paperGx = (hR - hL) * visiblePaperRelief * surfaceTooth;
  let paperGy = (hD - hU) * visiblePaperRelief * surfaceTooth;
  // On canvas, relief is a restrained surface cue. The paint is still stored
  // at its full physical height; this only prevents it reading like raised
  // canvas or a tube sitting above the cloth.
  let reliefDisplay = C.paintRelief * select(1.0, 0.35, isCanvas);
  let paintGx = (fR - fL) * reliefDisplay;
  let paintGy = (fD - fU) * reliefDisplay;
  let gx = paperGx + paintGx;
  let gy = paperGy + paintGy;
  let n = normalize(vec3f(-gx, -gy, 1.0));
  let lightDir = normalize(vec3f(-0.35, -0.5, 0.78));
  // The lamp is in the room, not on the paper. The tooth is part of the sheet
  // and turns with it, so its normal is carried forward into screen space
  // before it meets a light that stays put — turn the sheet and the grain
  // catches the light differently, the way it does on a real desk.
  //
  // At rot = 0 this is the identity, so the unturned picture is untouched.
  let ns = vec3f(n.x * cr - n.y * sr, n.x * sr + n.y * cr, n.z);
  let lambert = clamp(dot(ns, lightDir), 0.0, 1.0);
  /* How dark a slope facing away from the lamp is allowed to go.
   *
   * 0.82 is a PAPER number — "subtle; paper is not shiny" — and it is right for
   * a weave. But paint relief rides the same term at `relief 26`, so a thick oil
   * ridge was being shaded with a range chosen for canvas threads: it could be
   * lit but it could not be darkened by more than 18%, while `sheen` multiplies
   * brightness up through `(1 + sheen)` with no such limit. The result was a
   * highlight with no shadow beside it, which the eye reads as a white line
   * drawn around the paint instead of as paint standing up.
   * [Bartford, 2026-08-26, on a screenshot of exactly that edge: "should that
   * actually be shadow because that would make the height start to make sense".]
   *
   * So the floor drops for paint and stays put for paper. `paintShare` is how
   * much of this pixel's tilt comes from the paint rather than the weave, so a
   * bare sheet is untouched arithmetic-for-arithmetic, a flat passage keeps the
   * paper floor (it has no slope to shadow anyway), and only an actual ridge
   * gets the deeper range. The medium gate is belt-and-braces: at `relief 0`
   * the paint gradient is already zero, so watercolour cannot reach this.
   *
   * [UNVERIFIED — artist's number, 2026-08-26.] **0.25**, chosen at the easel
   * after seeing the two ends: ~~0.82~~ the original, which could not shadow at
   * all; ~~0.45~~ a first try; ~~0.0~~ the far end, run deliberately so the
   * resting place could be found coming back down from a known extreme rather
   * than guessed upward. At 0.0 the troughs went pure black. 0.82 restores the
   * original picture exactly, and lower is a deeper shadow.
   *
   * There is a second reason to want this range, found the same evening: with
   * Cover up, `seen` multiplies the WEAVE out of the lighting as well as the
   * ground's colour, so a covered passage has only the paint's own surface left
   * to look at. At a floor of 0.82 that surface had a 18% tonal range and the
   * passage read as flat colour — which is why turning Cover off made the paint
   * suddenly look like paint. The deeper this floor, the more the paint's own
   * relief can carry a covered passage on its own. */
  let paintTilt = length(vec2f(paintGx, paintGy));
  let totalTilt = length(vec2f(gx, gy));
  let paintShare = clamp(paintTilt / max(totalTilt, 1.0e-5), 0.0, 1.0)
                 * clamp(C.paintRelief, 0.0, 1.0);
  let shadeFloor = mix(0.82, 0.25, paintShare);
  let shade = shadeFloor + (1.0 - shadeFloor) * lambert;

  /* Sheen. The old result was added as raw white after the paint colour. Across
   * canvas tooth and cell-scale ridges that read as clear gel or moulded plastic.
   * Keep the same gloss/strength/width controls, but use the lobe to lift the
   * paint's own reflected colour instead of painting white over it. */
  let gloss = clamp(1.0 - C.kInstrument, 0.0, 1.0) * clamp(C.paintRelief, 0.0, 1.0);
  var sheen = 0.0;
  if (gloss > 0.0) {
    let half = normalize(lightDir + vec3f(0.0, 0.0, 1.0));
    /* Tightness of the highlight. This was a hard 48, which is a small hot spot
       and is most of why thick paint read as plastic: a polished plane gives a
       tight glint, a paint surface full of brush furrows gives a broad soft
       one. 6 at the wide end is a sheen you can see across a ridge; 120 at the
       narrow end is varnish. The default width reproduces the old 48 exactly,
       so nothing changes until the dial is moved. */
    let tight = mix(120.0, 6.0, clamp(C.sheenWidth, 0.0, 1.0));
    /* Broadening a highlight spreads the same shine over far more surface, so
       without this the Width dial floods the picture instead of softening it.
       [MEASURED 2026-08-24] at full strength, winding Width from tight to broad
       took the share of blown-out white pixels in an oil stroke from 7% to 86%
       - worse, not softer, and the artist would rightly have said the dial was
       broken. A cos^n lobe carries energy proportional to 1/(n+1), so holding
       the total steady means scaling by (n+1). Broad now DIMS as it widens,
       which is what a rough surface does, and Sheen keeps meaning "how much
       shine" whatever shape it is.

       Normalised against 48, the tightness this replaced, so the default dials
       reproduce the old picture exactly. */
    let norm = (tight + 1.0) / 49.0;
    sheen = pow(clamp(dot(ns, half), 0.0, 1.0), tight) * gloss * max(C.sheenStrength, 0.0) * norm;
  }

  // The sheet is something you see THROUGH the paint, so how much of it reaches
  // the eye has to fall as the paint piles up. Both its tone and its tooth are
  // properties of the ground, and both were being applied over the finished
  // colour unconditionally — so no thickness of paint could ever cover the
  // canvas, and the weave came through solid impasto.
  //
  // The Kubelka-Munk stack above already hides the paper's REFLECTANCE, which
  // is why a watercolour glaze correctly deepens rather than covering. This is
  // the same job for the two parts of the sheet that live outside that stack.
  //
  // `hidesGround` is 0 for every staining material, and at 0 this is exp(0) = 1
  // and the line below is exactly what it always was.
  // `shade` already carries both surfaces: the paper's slope faded out by
  // covering, and the paint's added in. Applying it once is applying all of it.
  // A small amount of the ridge's shade is allowed to land on the canvas just
  // beyond its foot. The sample is toward the lamp, so the darkening appears
  // on the far side of a raised mark rather than ringing it on every side.
  // [UNVERIFIED visual mapping] deliberately short and soft; this is a ground
  // cue, not a second outline.
  let shadowStep = cellStep * 2.0;
  let shadowSource = paint(wet0, uv + lightDir.xy * shadowStep).y;
  let shadowHeight = max(shadowSource - paint(wet0, uv).y, 0.0);
  // Only bare canvas receives the spill. The previous inverse factor darkened
  // the paint itself, which made an otherwise unaffected stroke look dirty.
  let groundShadow = clamp(shadowHeight * 3.0, 0.0, 0.10) * opticalCover;
  rgb = rgb * mix(vec3f(1.0), sheetTone, opticalCover) * shade
      * (1.0 - groundShadow) * (1.0 + sheen);

  return vec4f(srgb_encode(rgb.r), srgb_encode(rgb.g), srgb_encode(rgb.b), 1.0);
}
