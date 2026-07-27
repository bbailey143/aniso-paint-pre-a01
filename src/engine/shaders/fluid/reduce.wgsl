// The gauges. Invariant 1 requires conservation displayed permanently: total
// water, total pigment per slot. Paint a stroke, lift the brush, watch them hold.
//
// Each workgroup reduces its 16x16 patch to one partial per quantity; the CPU
// sums the partials. Accumulation is f32 even though storage is f16 — summing a
// million half-floats in half precision would lose the very drift we measure.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var wet1_in: texture_2d<f32>;
@group(0) @binding(3) var wet2_in: texture_2d<f32>;
@group(0) @binding(4) var wet3_in: texture_2d<f32>;
@group(0) @binding(5) var wet4_in: texture_2d<f32>;
@group(0) @binding(6) var wet5_in: texture_2d<f32>;
@group(0) @binding(7) var<storage, read_write> partials: array<f32>;
// The dry layers hold pigment too. Leave them out of the ledger and the gauge
// reports a total collapse the moment a wash dries — a phantom leak that is
// really just paint changing band.
@group(0) @binding(8) var dry1a_in: texture_2d<f32>;
@group(0) @binding(9) var dry1b_in: texture_2d<f32>;
@group(0) @binding(10) var dry2a_in: texture_2d<f32>;
@group(0) @binding(11) var dry2b_in: texture_2d<f32>;

// 0     total film h_f
// 1     total saturation s
// 2..9  per-slot pigment (g + d)
// 10    total body h_p
// 11    wet cell count
// 12    total |divergence| over wet cells — drives the adaptive relax controller
// 13    total wet-band pigment (g + d)
// 14    total dry-band pigment (dry1 + dry2)
//       The split is what tells a real leak apart from paint merely changing band.
const NQ: u32 = 15u;

var<workgroup> scratch: array<f32, 256>;

fn vel(c: vec2<i32>, n: i32) -> vec2<f32> {
  if (oob(c, n)) { return vec2<f32>(0.0, 0.0); }
  let t = textureLoad(wet0_in, c, 0);
  return vec2<f32>(t.z, t.w);
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_index) lid: u32,
        @builtin(workgroup_id) wid: vec3<u32>,
        @builtin(num_workgroups) nwg: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));

  var q: array<f32, 15>;
  for (var i = 0u; i < NQ; i = i + 1u) { q[i] = 0.0; }

  if (!oob(c, n)) {
    let w0 = textureLoad(wet0_in, c, 0);
    let glo = textureLoad(wet1_in, c, 0);
    let ghi = textureLoad(wet2_in, c, 0);
    let dlo = textureLoad(wet3_in, c, 0);
    let dhi = textureLoad(wet4_in, c, 0);
    let w5 = textureLoad(wet5_in, c, 0);

    let r1a = textureLoad(dry1a_in, c, 0);
    let r1b = textureLoad(dry1b_in, c, 0);
    let r2a = textureLoad(dry2a_in, c, 0);
    let r2b = textureLoad(dry2b_in, c, 0);

    q[0] = w0.y;
    q[1] = w5.x;
    // Per slot: suspended + settled + both dry layers. The whole ledger — leave
    // the dry bands out and drying reads as a total loss.
    q[2] = glo.x + dlo.x + r1a.x + r2a.x;
    q[3] = glo.y + dlo.y + r1a.y + r2a.y;
    q[4] = glo.z + dlo.z + r1a.z + r2a.z;
    q[5] = glo.w + dlo.w + r1a.w + r2a.w;
    q[6] = ghi.x + dhi.x + r1b.x + r2b.x;
    q[7] = ghi.y + dhi.y + r1b.y + r2b.y;
    q[8] = ghi.z + dhi.z + r1b.z + r2b.z;
    q[9] = ghi.w + dhi.w + r1b.w + r2b.w;
    q[10] = w5.z;
    let wetPig = (glo.x+glo.y+glo.z+glo.w) + (ghi.x+ghi.y+ghi.z+ghi.w)
               + (dlo.x+dlo.y+dlo.z+dlo.w) + (dhi.x+dhi.y+dhi.z+dhi.w);
    let dryPig = (r1a.x+r1a.y+r1a.z+r1a.w) + (r1b.x+r1b.y+r1b.z+r1b.w)
               + (r2a.x+r2a.y+r2a.z+r2a.w) + (r2b.x+r2b.y+r2b.z+r2b.w);
    q[13] = wetPig;
    q[14] = dryPig;
    if (w0.x >= 0.5) {
      q[11] = 1.0;
      let uw = vel(vec2<i32>(c.x - 1, c.y), n).x;
      let vn = vel(vec2<i32>(c.x, c.y - 1), n).y;
      q[12] = abs((w0.z - uw) + (w0.w - vn));
    }
  }

  let wg = wid.y * nwg.x + wid.x;

  for (var i = 0u; i < NQ; i = i + 1u) {
    scratch[lid] = q[i];
    workgroupBarrier();
    var stride = 128u;
    loop {
      if (stride == 0u) { break; }
      if (lid < stride) { scratch[lid] = scratch[lid] + scratch[lid + stride]; }
      workgroupBarrier();
      stride = stride / 2u;
    }
    if (lid == 0u) { partials[wg * NQ + i] = scratch[0]; }
    workgroupBarrier();
  }
}
