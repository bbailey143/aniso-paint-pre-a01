// Generate the static PAPER substrate texture (Card 8).
//
// C97 models paper as a height field h in (0,1) plus a fluid-capacity field
// c = h*(c_max - c_min) + c_min, from a pseudo-random process. Tooth (peak-to-
// valley amplitude and feature scale), sizing, and capillary radius r_c are the
// per-sheet parameters — hot press is fine and shallow, rough is coarse and deep.
//
// Output PAPER = (h, c, sizing, effective r_c). Written once when the sheet is
// chosen. The last lane includes the sheet's water appetite, so the shared fluid
// pass can distinguish a thirsty dry sheet without a medium-specific route.

struct PaperParams {
  toothAmp: f32,     // 0..1 peak-to-valley amplitude of the tooth
  featureFreq: f32,  // base spatial frequency of the grain (cells across the sheet)
  sizing: f32,       // 0 unsized .. 1 fully gelatin-sized
  rc: f32,           // capillary radius (absorptiveness dial)
  cMin: f32,
  cMax: f32,
  seed: f32,
  grainKind: f32,    // 0 = watercolor noise, 1 = pastel fibre, 2 = woven canvas, 3 = flat
  waterUptake: f32, // 1 = ordinary watercolour response; >1 drinks faster
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

// A softly felted paper: long fibres with a quieter cross-fibre weave. This is
// deliberately a height-field source, not a photographic layer, so the dry
// deposit pass and the visible sheet agree on where a tool catches.
fn pastel_fibre(p: vec2f) -> f32 {
  let long = vnoise(vec2f(p.x * 0.72 + p.y * 0.18, p.y * 4.6 - p.x * 0.09));
  let cross = vnoise(vec2f(p.x * 5.1 + p.y * 0.08, p.y * 0.58));
  return clamp(0.5 + (long - 0.5) * 0.78 + (cross - 0.5) * 0.22, 0.0, 1.0);
}

/**
 * A plain woven ground.
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
fn canvas_weave(p: vec2f) -> f32 {
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
  let slub = vnoise(p * 2.7) - 0.5;
  return clamp(0.12 + 0.76 * max(warp, weft) + slub * 0.16, 0.0, 1.0);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(dst);
  if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  let uv = (vec2f(f32(gid.x), f32(gid.y)) + 0.5) / vec2f(f32(dim.x), f32(dim.y));

  // Anisotropic weave: stretch the grain slightly so streaks read as fibres.
  let p = vec2f(uv.x * P.featureFreq, uv.y * P.featureFreq * 1.15);
  // Keep watercolour byte-for-byte on its established fBm route. Pastel
  // replaces its source with the common felted fibre field; canvas is woven and
  // shares nothing with either.
  var grain = 0.0;
  if (P.grainKind > 2.5) {
    // Flat. Not a shallow tooth — none. Everything below centres on 0.5, so
    // this is the surface with the character taken out rather than turned down.
    grain = 0.5;
  } else if (P.grainKind > 1.5) {
    grain = canvas_weave(p);
  } else {
    grain = fbm(p);
    if (P.grainKind > 0.5) { grain = mix(grain, pastel_fibre(p), 0.68); }
  }
  // Contrast the grain by the tooth amplitude; keep it centred around 0.5.
  var h = 0.5 + (grain - 0.5) * (0.4 + P.toothAmp * 1.6);
  h = clamp(h, 0.02, 0.98);

  let c = h * (P.cMax - P.cMin) + P.cMin;
  textureStore(dst, vec2i(gid.xy), vec4f(h, c, P.sizing, P.rc * P.waterUptake));
}
