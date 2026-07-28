// MovePigment — suspended pigment rides the water fluxes. MUST run before
// flux_apply_water: the fraction leaving is (water leaving / water present
// BEFORE the move). Both cells sharing an edge derive the carried amount from
// the same flux entry, so the ledger balances.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var wet1_in: texture_2d<f32>;
@group(0) @binding(3) var wet2_in: texture_2d<f32>;
@group(0) @binding(4) var<storage, read> flux: array<vec4<f32>>;
@group(0) @binding(5) var wet1_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var wet2_out: texture_storage_2d<rgba32float, write>;

fn flux_at(c: vec2<i32>, n: i32) -> vec4<f32> {
  if (oob(c, n)) { return vec4<f32>(0.0); }
  return flux[u32(c.y * n + c.x)];
}
fn hf_at(c: vec2<i32>, n: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  return textureLoad(wet0_in, c, 0).y;
}
fn g_at(c: vec2<i32>, n: i32, k: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  let a = textureLoad(wet1_in, c, 0);
  let b = textureLoad(wet2_in, c, 0);
  var arr = array<f32, 8>(a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w);
  return arr[k];
}
fn conc(c: vec2<i32>, n: i32, k: i32) -> f32 {
  let h = hf_at(c, n);
  if (h <= WET_EPS) { return 0.0; }
  return g_at(c, n, k) / h;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  let glo = textureLoad(wet1_in, c, 0);
  let ghi = textureLoad(wet2_in, c, 0);
  var g = array<f32, 8>(glo.x, glo.y, glo.z, glo.w, ghi.x, ghi.y, ghi.z, ghi.w);

  let h = hf_at(c, n);
  let f = flux_at(c, n);
  let tot_out = f.x + f.y + f.z + f.w;
  var leaving = 0.0;
  if (h > WET_EPS) { leaving = clamp(tot_out / h, 0.0, 1.0); }

  let l = vec2<i32>(c.x - 1, c.y);
  let r = vec2<i32>(c.x + 1, c.y);
  let up = vec2<i32>(c.x, c.y - 1);
  let dn = vec2<i32>(c.x, c.y + 1);

  let inL = flux_at(l, n).x;
  let inR = flux_at(r, n).y;
  let inU = flux_at(up, n).z;
  let inD = flux_at(dn, n).w;

  for (var k = 0; k < 8; k = k + 1) {
    var gk = g[k] * (1.0 - leaving);
    gk = gk + conc(l, n, k)  * inL;
    gk = gk + conc(r, n, k)  * inR;
    gk = gk + conc(up, n, k) * inU;
    gk = gk + conc(dn, n, k) * inD;
    g[k] = max(gk, 0.0);
  }

  // Containment (see `sane` in common.wgsl). This pass writes EVERY cell every
  // frame, so it is the scrub as well as the barrier: a seed that lands
  // anywhere is cleared here before the advection can carry it to a neighbour.
  // That is what stops one cell becoming a spreading blob.
  textureStore(wet1_out, c, sane4(vec4<f32>(g[0], g[1], g[2], g[3]), PIG_LIM));
  textureStore(wet2_out, c, sane4(vec4<f32>(g[4], g[5], g[6], g[7]), PIG_LIM));
}
