// Generate the static PAPER substrate texture (Card 8).
//
// C97 models paper as a height field h in (0,1) plus a fluid-capacity field
// c = h*(c_max - c_min) + c_min, from a pseudo-random process. Tooth (peak-to-
// valley amplitude and feature scale), sizing, and capillary radius r_c are the
// per-sheet parameters — hot press is fine and shallow, rough is coarse and deep.
//
// Output PAPER = (h, c, sizing, r_c). Written once when the sheet is chosen.

struct PaperParams {
  toothAmp: f32,     // 0..1 peak-to-valley amplitude of the tooth
  featureFreq: f32,  // base spatial frequency of the grain (cells across the sheet)
  sizing: f32,       // 0 unsized .. 1 fully gelatin-sized
  rc: f32,           // capillary radius (absorptiveness dial)
  cMin: f32,
  cMax: f32,
  seed: f32,
  _pad: f32,
};
@group(0) @binding(0) var<uniform> P: PaperParams;
@group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;

// --- value noise ---------------------------------------------------------
fn hash2(p: vec2f) -> f32 {
  let h = dot(p, vec2f(127.1, 311.7)) + P.seed * 57.0;
  return fract(sin(h) * 43758.5453123);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);       // smoothstep interpolation
  let a = hash2(i + vec2f(0.0, 0.0));
  let b = hash2(i + vec2f(1.0, 0.0));
  let c = hash2(i + vec2f(0.0, 1.0));
  let d = hash2(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// A few octaves of fBm for a fibrous grain.
fn fbm(p: vec2f) -> f32 {
  var v = 0.0;
  var amp = 0.5;
  var freq = 1.0;
  for (var o = 0; o < 4; o = o + 1) {
    v = v + amp * vnoise(p * freq);
    freq = freq * 2.03;
    amp = amp * 0.5;
  }
  return v; // ~0..1
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(dst);
  if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  let uv = (vec2f(f32(gid.x), f32(gid.y)) + 0.5) / vec2f(f32(dim.x), f32(dim.y));

  // Anisotropic weave: stretch the grain slightly so streaks read as fibres.
  let p = vec2f(uv.x * P.featureFreq, uv.y * P.featureFreq * 1.15);
  var h = fbm(p);
  // Contrast the grain by the tooth amplitude; keep it centred around 0.5.
  h = 0.5 + (h - 0.5) * (0.4 + P.toothAmp * 1.6);
  h = clamp(h, 0.02, 0.98);

  let c = h * (P.cMax - P.cMin) + P.cMin;
  textureStore(dst, vec2i(gid.xy), vec4f(h, c, P.sizing, P.rc));
}
