// Conservation pass. All inter-cell movement is a clamped flux between cells,
// never a per-cell height clamp. Each cell computes the four amounts it gives
// away; the neighbour derives the same number from its side, so what leaves one
// arrives whole in the next. Nothing created, nothing lost.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var press_in: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> flux: array<vec4<f32>>;

fn pr(c: vec2<i32>, n: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  return textureLoad(press_in, c, 0).x;
}

fn height_at(c: vec2<i32>, n: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  return sane(textureLoad(wet0_in, c, 0).y, WATER_LIM);
}

/**
 * A26 thin-film mobility on one cell face.
 *
 * The average is deliberately allowed to include a dry neighbour. This is the
 * documented fix that makes dry paper a resistive destination rather than an
 * artificial wall. Dividing by mobility + viscous resistance maps the physical
 * mobility to a stable 0..1 response without a new threshold or magic speed.
 */
fn face_response(h1: f32, h2: f32) -> f32 {
  let mean_h = 0.5 * (h1 + h2);
  let mobility = mean_h * mean_h * mean_h;
  let resistance = max(P.viscosity * P.drag, WET_EPS);
  return mobility / (mobility + resistance);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }
  let idx = u32(c.y * n + c.x);

  let w0 = textureLoad(wet0_in, c, 0);
  let h = w0.y;
  if (w0.x < 0.5 || h <= WET_EPS) { flux[idx] = vec4<f32>(0.0); return; }

  let l = vec2<i32>(c.x - 1, c.y);
  let r = vec2<i32>(c.x + 1, c.y);
  let up = vec2<i32>(c.x, c.y - 1);
  let dn = vec2<i32>(c.x, c.y + 1);

  let p_here = pr(c, n);
  let uE = clamp(w0.z - (pr(r, n) - p_here), -1.0, 1.0);
  let vS = clamp(w0.w - (pr(dn, n) - p_here), -1.0, 1.0);

  var uW = 0.0;
  var vN = 0.0;
  if (!oob(l, n))  { let wl = textureLoad(wet0_in, l, 0);  uW = clamp(wl.z - (p_here - pr(l, n)), -1.0, 1.0); }
  if (!oob(up, n)) { let wu = textureLoad(wet0_in, up, 0); vN = clamp(wu.w - (p_here - pr(up, n)), -1.0, 1.0); }

  var o = vec4<f32>(
    max(uE, 0.0) * h * face_response(h, height_at(r, n)) * P.dt,
    max(-uW, 0.0) * h * face_response(h, height_at(l, n)) * P.dt,
    max(vS, 0.0) * h * face_response(h, height_at(dn, n)) * P.dt,
    max(-vN, 0.0) * h * face_response(h, height_at(up, n)) * P.dt,
  );

  if (c.x >= n - 1) { o.x = 0.0; }
  if (c.x <= 0)     { o.y = 0.0; }
  if (c.y >= n - 1) { o.z = 0.0; }
  if (c.y <= 0)     { o.w = 0.0; }

  let tot = o.x + o.y + o.z + o.w;
  let cap = h * 0.9;
  if (tot > cap && tot > 0.0) { o = o * (cap / tot); }

  flux[idx] = o;
}
