// TransferPigment (C97, Card 3). Exchange between pigment floating in the water
// (g) and pigment adsorbed onto paper (d). This distinction IS granulation and
// lifting — collapse the two and both behaviours vanish. Paper height enters
// through gamma, so heavy pigments settle into the hollows of rough paper. Only
// this pass crosses the g/d boundary, so per-slot (g+d) is conserved exactly.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var wet1_in: texture_2d<f32>;
@group(0) @binding(3) var wet2_in: texture_2d<f32>;
@group(0) @binding(4) var wet3_in: texture_2d<f32>;
@group(0) @binding(5) var wet4_in: texture_2d<f32>;
@group(0) @binding(6) var paper: texture_2d<f32>;
@group(0) @binding(7) var wet1_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(8) var wet2_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(9) var wet3_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(10) var wet4_out: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  let glo = textureLoad(wet1_in, c, 0);
  let ghi = textureLoad(wet2_in, c, 0);
  let dlo = textureLoad(wet3_in, c, 0);
  let dhi = textureLoad(wet4_in, c, 0);
  var g = array<f32, 8>(glo.x, glo.y, glo.z, glo.w, ghi.x, ghi.y, ghi.z, ghi.w);
  var d = array<f32, 8>(dlo.x, dlo.y, dlo.z, dlo.w, dhi.x, dhi.y, dhi.z, dhi.w);

  let wet = textureLoad(wet0_in, c, 0).x;
  if (wet >= 0.5) {
    let h = textureLoad(paper, c, 0).x;
    for (var k = 0; k < 8; k = k + 1) {
      let rho   = P.pig[k].x;
      let omega = max(P.pig[k].y, 1e-3);
      let gamma = P.pig[k].z;

      var down = g[k] * (1.0 - h * gamma) * rho * P.dt;
      var up   = d[k] * (1.0 + (h - 1.0) * gamma) * rho / omega * P.dt;
      down = max(down, 0.0);
      up   = max(up, 0.0);
      if (d[k] + down > 1.0) { down = max(1.0 - d[k], 0.0); }
      if (g[k] + up   > 1.0) { up   = max(1.0 - g[k], 0.0); }
      down = min(down, g[k]);
      up   = min(up, d[k]);
      d[k] = d[k] + down - up;
      g[k] = g[k] + up - down;
    }
  }

  textureStore(wet1_out, c, vec4<f32>(g[0], g[1], g[2], g[3]));
  textureStore(wet2_out, c, vec4<f32>(g[4], g[5], g[6], g[7]));
  textureStore(wet3_out, c, vec4<f32>(d[0], d[1], d[2], d[3]));
  textureStore(wet4_out, c, vec4<f32>(d[4], d[5], d[6], d[7]));
}
