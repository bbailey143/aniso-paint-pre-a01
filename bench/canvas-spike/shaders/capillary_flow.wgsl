// SimulateCapillaryFlow (§9, C97). Water leaves the standing film and enters
// the paper, then creeps through the fibres. This is the layer that produces
// backruns and the ragged creeping edge of a wash — in damp paper the only
// water present is inside the pores, so capillary action dominates momentum.
//
// [FIXED — caught by the conservation gauge, first run]
// Diffusion must be computed from the INPUT field only. The first version
// absorbed film into saturation and *then* diffused, so this cell used its
// post-absorption value while its neighbours were still reading pre-absorption
// values from the input texture. The exchange across a pair stopped being equal
// and opposite, and the sheet quietly lost 12% of its water in fifty frames.
// Absorption and diffusion are now both computed against the input state and
// summed at the end, which restores the antisymmetry.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var wet5_in: texture_2d<f32>;
@group(0) @binding(3) var paper: texture_2d<f32>;
@group(0) @binding(4) var wet0_out: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var wet5_out: texture_storage_2d<rgba16float, write>;

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

    // Capillary spread, from the input field on both sides of every edge.
    // Out-of-bounds neighbours mirror this cell, so no flux crosses the edge of
    // the sheet and nothing leaks off the paper.
    // A26's cos(alpha) factor: at a vertical board diffusion stops and pigment
    // purely follows the flow instead of smearing into mush.
    let k = KDIFF * P.cos_alpha;
    let sl = sat_at(vec2<i32>(c.x - 1, c.y), n, s_in);
    let sr = sat_at(vec2<i32>(c.x + 1, c.y), n, s_in);
    let su = sat_at(vec2<i32>(c.x, c.y - 1), n, s_in);
    let sd = sat_at(vec2<i32>(c.x, c.y + 1), n, s_in);
    let ddiff = k * ((sl - s_in) + (sr - s_in) + (su - s_in) + (sd - s_in));

    // Absorption: film into paper, limited by what the sheet can still hold.
    let room = max(cap - s_in, 0.0);
    let take = min(min(ALPHA * P.dt * hf_in, hf_in), room);

    let hf = max(hf_in - take, 0.0);
    let s = max(s_in + ddiff + take, 0.0);

    // The mask creeps outward once the paper here is damp enough. This is how a
    // puddle grows into dry paper without any explicit edge tracking.
    var m = w0.x;
    if (s > EPS_WET) { m = 1.0; }

    textureStore(wet0_out, c, vec4<f32>(m, hf, w0.z, w0.w));
    textureStore(wet5_out, c, vec4<f32>(s, w5.y, w5.z, w5.w));
}
