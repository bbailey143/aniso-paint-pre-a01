// The gauges. §8 requires the bench to display conservation permanently:
// total water, total pigment per slot, total body volume. Paint a stroke, lift
// the brush, watch the numbers hold.
//
// Each workgroup reduces its 16x16 patch to one partial per quantity; the CPU
// sums the partials. Accumulation is f32 even though storage is f16 — summing
// a million half-floats in half precision would lose the very drift we are
// trying to measure.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var wet1_in: texture_2d<f32>;
@group(0) @binding(3) var wet2_in: texture_2d<f32>;
@group(0) @binding(4) var wet3_in: texture_2d<f32>;
@group(0) @binding(5) var wet4_in: texture_2d<f32>;
@group(0) @binding(6) var wet5_in: texture_2d<f32>;
@group(0) @binding(7) var<storage, read_write> partials: array<f32>;

// 0      total film h_f
// 1      total saturation s
// 2..9   per-slot pigment (g + d)
// 10     total body h_p
// 11     wet cell count
// 12     total |divergence| over wet cells  — residual left by relaxation.
//        Divided by the wet count on the host it gives mean |div|, which is
//        what drives the adaptive iteration controller. C97's tau is stated on
//        the max; the mean is cheaper to reduce and is what we tune against.
const NQ: u32 = 13u;

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

    var q: array<f32, 13>;
    for (var i = 0u; i < NQ; i = i + 1u) { q[i] = 0.0; }

    if (!oob(c, n)) {
        let w0 = textureLoad(wet0_in, c, 0);
        let glo = textureLoad(wet1_in, c, 0);
        let ghi = textureLoad(wet2_in, c, 0);
        let dlo = textureLoad(wet3_in, c, 0);
        let dhi = textureLoad(wet4_in, c, 0);
        let w5 = textureLoad(wet5_in, c, 0);

        q[0] = w0.y;
        q[1] = w5.x;
        q[2] = glo.x + dlo.x;
        q[3] = glo.y + dlo.y;
        q[4] = glo.z + dlo.z;
        q[5] = glo.w + dlo.w;
        q[6] = ghi.x + dhi.x;
        q[7] = ghi.y + dhi.y;
        q[8] = ghi.z + dhi.z;
        q[9] = ghi.w + dhi.w;
        q[10] = w5.z;
        if (w0.x >= 0.5) {
            q[11] = 1.0;
            // Staggered divergence, same stencil the solver uses.
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
