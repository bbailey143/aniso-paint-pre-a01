// SimulateCapillaryFlow (C97). Water leaves the standing film into the paper,
// then creeps through the fibres — the layer that produces backruns and the
// ragged creeping edge. Diffusion is computed from the INPUT field on both
// sides of every edge (the bench lost 12% of its water when it read a
// post-absorption value on one side), so the exchange stays antisymmetric.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var wet5_in: texture_2d<f32>;
@group(0) @binding(3) var paper: texture_2d<f32>;
@group(0) @binding(4) var wet0_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var wet5_out: texture_storage_2d<rgba32float, write>;

const ALPHA: f32 = 0.35;    // absorption rate into the sheet
const KDIFF: f32 = 0.18;    // capillary spread, must stay under 0.25
const EPS_WET: f32 = 0.004; // saturation at which the mask expands

fn sat_at(c: vec2<i32>, n: i32, fallback: f32) -> f32 {
  if (oob(c, n)) { return fallback; }
  return textureLoad(wet5_in, c, 0).x;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  let w0 = textureLoad(wet0_in, c, 0);
  let w5 = textureLoad(wet5_in, c, 0);
  let cap = textureLoad(paper, c, 0).y;

  let s_in = w5.x;
  let hf_in = w0.y;

  let k = KDIFF * P.cosAlpha;   // A26: diffusion stops at a vertical board
  let sl = sat_at(vec2<i32>(c.x - 1, c.y), n, s_in);
  let sr = sat_at(vec2<i32>(c.x + 1, c.y), n, s_in);
  let su = sat_at(vec2<i32>(c.x, c.y - 1), n, s_in);
  let sd = sat_at(vec2<i32>(c.x, c.y + 1), n, s_in);
  let ddiff = k * ((sl - s_in) + (sr - s_in) + (su - s_in) + (sd - s_in));

  let room = max(cap - s_in, 0.0);
  let take = min(min(ALPHA * P.dt * hf_in, hf_in), room);

  let hf = max(hf_in - take, 0.0);
  let s = max(s_in + ddiff + take, 0.0);

  var m = w0.x;
  if (s > EPS_WET) { m = 1.0; }

  // Containment (see `sane` in common.wgsl). Every pass that writes an
  // accumulating field guards it, because the meter and the eye both see the
  // LAST writer of a frame — guarding only the entry point let the seed
  // through anywhere downstream of it.
  textureStore(wet0_out, c, vec4<f32>(m, sane(hf, WATER_LIM), w0.z, w0.w));
  textureStore(wet5_out, c, vec4<f32>(sane(s, WATER_LIM), w5.y, w5.z, w5.w));
}
