// MoveWater, final stage. Water is moved strictly by the fluxes: what a cell
// gives away is subtracted, what its neighbours aimed at it is added.
//
// This is the pass the conservation gauge is really testing. With the bots off
// and evaporation at zero, total water must hold flat forever. If it drifts,
// the flux formula is not symmetric and everything downstream is suspect.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> flux: array<vec4<f32>>;
@group(0) @binding(3) var wet0_out: texture_storage_2d<FMT_WATER, write>;

fn flux_at(c: vec2<i32>, n: i32) -> vec4<f32> {
    if (oob(c, n)) { return vec4<f32>(0.0, 0.0, 0.0, 0.0); }
    return flux[u32(c.y * n + c.x)];
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = i32(P.grid);
    let c = vec2<i32>(i32(gid.x), i32(gid.y));
    if (oob(c, n)) { return; }

    var w0 = textureLoad(wet0_in, c, 0);

    let f = flux_at(c, n);
    let out_total = f.x + f.y + f.z + f.w;

    let inL = flux_at(vec2<i32>(c.x - 1, c.y), n).x;
    let inR = flux_at(vec2<i32>(c.x + 1, c.y), n).y;
    let inU = flux_at(vec2<i32>(c.x, c.y - 1), n).z;
    let inD = flux_at(vec2<i32>(c.x, c.y + 1), n).w;

    let h_new = max(w0.y - out_total + inL + inR + inU + inD, 0.0);

    // Mask follows the water. A cell that has received anything becomes wet —
    // this is the one-tile halo of §4.2 doing its job at cell granularity.
    var m = w0.x;
    if (h_new > WET_EPS) { m = 1.0; }

    textureStore(wet0_out, c, vec4<f32>(m, h_new, w0.z, w0.w));
}
