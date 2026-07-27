// MoveWater 2 — C97 RelaxDivergence, staggered, gather form.
//
// C97 solves NO pressure-Poisson equation (that form is an unconditional
// amplifier, eigenvalues 1 +/- i*xi*sqrt(lambda)). It pushes each cell's four
// faces to cancel its own divergence. The GPU gather form is identical: a face
// shared by two cells is pushed by both — u_face += delta(this) - delta(east).
// Operator (1 - xi*L), eigenvalues [0,8], stable for xi < 0.25; high-frequency
// divergence (what a stroke injects) dies fastest. The bench proved the two
// alternatives unstable; start here.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var wet0_out: texture_storage_2d<rgba32float, write>;

const XI: f32 = 0.1;   // C97 redistribution factor; must stay under 0.25

fn dv(c: vec2<i32>, n: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  let t = textureLoad(wet0_in, c, 0);
  if (t.x < 0.5) { return 0.0; }
  var uw = 0.0;
  var vn = 0.0;
  let l = vec2<i32>(c.x - 1, c.y);
  let u_ = vec2<i32>(c.x, c.y - 1);
  if (!oob(l, n))  { uw = textureLoad(wet0_in, l, 0).z; }
  if (!oob(u_, n)) { vn = textureLoad(wet0_in, u_, 0).w; }
  return (t.z - uw) + (t.w - vn);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  let w0 = textureLoad(wet0_in, c, 0);
  if (w0.x < 0.5) { textureStore(wet0_out, c, w0); return; }

  let delta_c = -XI * dv(c, n);
  let delta_e = -XI * dv(vec2<i32>(c.x + 1, c.y), n);
  let delta_s = -XI * dv(vec2<i32>(c.x, c.y + 1), n);

  let nu = w0.z + (delta_c - delta_e);
  let nv = w0.w + (delta_c - delta_s);
  textureStore(wet0_out, c, vec4<f32>(w0.x, w0.y, clamp(nu, -1.0, 1.0), clamp(nv, -1.0, 1.0)));
}
