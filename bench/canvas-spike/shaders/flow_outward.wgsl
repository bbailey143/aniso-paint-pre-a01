// MoveWater, stage 3 — C97 FlowOutward. Edge darkening.
//
// Physically the coffee-ring effect: liquid evaporating at a pinned contact
// line is replenished from the interior, and that outward creep drags pigment
// with it. C97 fakes it cheaply by lowering pressure near the edge of the wet
// mask, so flow leans outward. Blur the mask, then p -= eta * (1 - M') * M.
// This is the pass that puts the dark rim on a dried wash.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var press_in: texture_2d<f32>;
@group(0) @binding(3) var press_out: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = i32(P.grid);
    let c = vec2<i32>(i32(gid.x), i32(gid.y));
    if (oob(c, n)) { return; }

    let m = textureLoad(wet0_in, c, 0).x;
    let p = textureLoad(press_in, c, 0).x;

    // Box blur of the wet mask. C97 uses a Gaussian with K = 10; a 9-tap box
    // at this scale is visually indistinguishable and far cheaper.
    var acc = 0.0;
    var cnt = 0.0;
    for (var dy = -4; dy <= 4; dy = dy + 1) {
        for (var dx = -4; dx <= 4; dx = dx + 1) {
            let q = vec2<i32>(c.x + dx, c.y + dy);
            if (!oob(q, n)) {
                acc = acc + textureLoad(wet0_in, q, 0).x;
                cnt = cnt + 1.0;
            }
        }
    }
    let m_blur = select(0.0, acc / cnt, cnt > 0.0);

    let p_new = p - P.edge_eta * (1.0 - m_blur) * m;
    textureStore(press_out, c, vec4<f32>(p_new, 0.0, 0.0, 0.0));
}
