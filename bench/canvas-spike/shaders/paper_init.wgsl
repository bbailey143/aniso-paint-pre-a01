// Substrate (§2.4). Static, shared, read-only once written. Every engine reads
// it; none writes it.
//
// Card 6 makes each paper four or five numbers, so a sheet is a data row rather
// than a code path. Here: a pseudo-random height field scaled to 0 < h < 1
// (C97 §4.1), fluid capacity derived from it as c = h(c_max - c_min) + c_min,
// sizing, and capillary radius r_c — Y13's single absorptiveness dial, 0 for
// canvas and 2.5e-4 for thirsty rag paper.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var paper_out: texture_storage_2d<FMT_PIG, write>;

fn hash2(p: vec2<f32>) -> f32 {
    let k = fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
    return k;
}

fn vnoise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u = f * f * (3.0 - 2.0 * f);
    let a = hash2(i);
    let b = hash2(i + vec2<f32>(1.0, 0.0));
    let c = hash2(i + vec2<f32>(0.0, 1.0));
    let d = hash2(i + vec2<f32>(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = i32(P.grid);
    let c = vec2<i32>(i32(gid.x), i32(gid.y));
    if (oob(c, n)) { return; }

    let p = vec2<f32>(f32(c.x), f32(c.y));

    // Three octaves of tooth: the coarse cockle of the sheet, the cold-press
    // grain, and the fibre-scale noise that gives drybrush something to skip on.
    var h = 0.0;
    h = h + 0.55 * vnoise(p * 0.035);
    h = h + 0.30 * vnoise(p * 0.130);
    h = h + 0.15 * vnoise(p * 0.480);
    h = clamp(h, 0.02, 0.98);

    let c_min = 0.20;
    let c_max = 0.85;
    let cap = h * (c_max - c_min) + c_min;

    let sizing = 0.60;    // gelatin-sized rag
    let r_c = 1.4e-4;     // Y13: watercolour paper, mid cold-press

    textureStore(paper_out, c, vec4<f32>(h, cap, sizing, r_c));
}
