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
  _pad: f32,
};
@group(0) @binding(0) var<uniform> C: Comp;
@group(0) @binding(1) var<storage, read> ks: array<vec2f>;      // (K,S) pigment-major, per band
@group(0) @binding(2) var<storage, read> cie: array<vec4f>;     // [X,Y,Z,0] per band
@group(0) @binding(3) var<uniform> col: vec4f;                  // k1, k2, kInsDefault, pigCount
@group(0) @binding(4) var pigA: texture_2d<f32>;
@group(0) @binding(5) var pigB: texture_2d<f32>;
@group(0) @binding(6) var paper: texture_2d<f32>;
@group(0) @binding(7) var samp: sampler;

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

fn sinh_(x: f32) -> f32 { let e = exp(x); return (e - 1.0 / e) * 0.5; }
fn cosh_(x: f32) -> f32 { let e = exp(x); return (e + 1.0 / e) * 0.5; }

fn slotId(i: i32) -> i32 {
  if (i < 4) { return C.slotA[i]; }
  return C.slotB[i - 4];
}

fn srgb_encode(c: f32) -> f32 {
  let v = clamp(c, 0.0, 1.0);
  if (v <= 0.0031308) { return 12.92 * v; }
  return 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let bg = vec3f(0.043, 0.047, 0.055);

  // Screen px -> document uv, "contain" fit, centred.
  let fragPx = in.uv * C.view;
  let scale = min(C.view.x / C.doc.x, C.view.y / C.doc.y);
  let shown = C.doc * scale;
  let offset = (C.view - shown) * 0.5;
  let docPx = (fragPx - offset) / scale;
  let uv = docPx / C.doc;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4f(bg, 1.0);
  }

  // Cell contents.
  let a0 = textureSampleLevel(pigA, samp, uv, 0.0);
  let a1 = textureSampleLevel(pigB, samp, uv, 0.0);
  let amt = array<f32, 8>(a0.x, a0.y, a0.z, a0.w, a1.x, a1.y, a1.z, a1.w);
  var total = 0.0;
  for (var i = 0; i < 8; i = i + 1) { total = total + max(amt[i], 0.0); }

  // Paper: (h, c, sizing, rc). Near-white reflectance, dulled a touch by sizing.
  let pap = textureSampleLevel(paper, samp, uv, 0.0);
  let Rpaper = mix(0.93, 0.88, pap.z);   // sized paper sits slightly less brilliant

  var XYZ = vec3f(0.0);
  if (total < 1e-4) {
    // Bare paper.
    for (var b = 0; b < N_BANDS; b = b + 1) { XYZ = XYZ + Rpaper * cie[b].xyz; }
  } else {
    let inv = 1.0 / total;
    let thickness = total * C.thickScale;
    let k1 = col.x; let k2 = col.y;
    for (var b = 0; b < N_BANDS; b = b + 1) {
      // Duncan linear mix of K and S over the active slots.
      var K = 0.0; var S = 0.0;
      for (var s = 0; s < 8; s = s + 1) {
        let id = slotId(s);
        if (id < 0) { continue; }
        let c = max(amt[s], 0.0) * inv;
        if (c <= 0.0) { continue; }
        let v = ks[id * N_BANDS + b];
        K = K + c * v.x;
        S = S + c * v.y;
      }
      S = max(S, 1e-4);
      let ratio = K / S;
      let A = 1.0 + ratio;
      let Bc = sqrt(max(ratio * ratio + 2.0 * ratio, 0.0));
      let bSx = clamp(Bc * S * thickness, 0.0, 40.0);
      let sh = sinh_(bSx);
      let ch = cosh_(bSx);
      let denom = A * sh + Bc * ch;
      let Rlayer = sh / denom;
      let Tlayer = Bc / denom;
      // Composite the transparent layer over the paper (Kubelka).
      var R = Rlayer + (Tlayer * Tlayer * Rpaper) / (1.0 - Rlayer * Rpaper);
      // Saunderson forward (internal -> external), gloss via kInstrument.
      R = C.kInstrument * k1 + ((1.0 - k1) * (1.0 - k2) * R) / (1.0 - k2 * R);
      R = clamp(R, 0.0, 1.0);
      XYZ = XYZ + R * cie[b].xyz;
    }
  }

  // XYZ (D65) -> linear sRGB.
  var rgb = vec3f(
    3.2406 * XYZ.x - 1.5372 * XYZ.y - 0.4986 * XYZ.z,
    -0.9689 * XYZ.x + 1.8758 * XYZ.y + 0.0415 * XYZ.z,
    0.0557 * XYZ.x - 0.2040 * XYZ.y + 1.0570 * XYZ.z,
  );

  // Relief lighting from the paper height gradient (tooth catches the light).
  let texel = 1.0 / C.doc;
  let hL = textureSampleLevel(paper, samp, uv - vec2f(texel.x, 0.0), 0.0).x;
  let hR = textureSampleLevel(paper, samp, uv + vec2f(texel.x, 0.0), 0.0).x;
  let hU = textureSampleLevel(paper, samp, uv - vec2f(0.0, texel.y), 0.0).x;
  let hD = textureSampleLevel(paper, samp, uv + vec2f(0.0, texel.y), 0.0).x;
  let n = normalize(vec3f(-(hR - hL) * C.relief, -(hD - hU) * C.relief, 1.0));
  let lightDir = normalize(vec3f(-0.35, -0.5, 0.78));
  let lambert = clamp(dot(n, lightDir), 0.0, 1.0);
  let shade = 0.82 + 0.18 * lambert;      // subtle; paper is not shiny
  rgb = rgb * shade;

  return vec4f(srgb_encode(rgb.r), srgb_encode(rgb.g), srgb_encode(rgb.b), 1.0);
}
