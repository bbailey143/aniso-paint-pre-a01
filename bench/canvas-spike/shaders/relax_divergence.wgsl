// MoveWater, stage 2 — C97 RelaxDivergence. Jacobi form so each cell writes
// only itself and the pass is race-free under ping-pong.
//
// This is the suspect. C97 specifies up to N = 50 iterations, and each one is a
// full-grid read-modify-write. If the frame budget breaks anywhere, it breaks
// here — which is exactly why relax_iters is a runtime knob.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var press_in: texture_2d<f32>;
@group(0) @binding(3) var wet0_out: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var press_out: texture_storage_2d<rgba16float, write>;

const XI: f32 = 0.1;   // C97 redistribution factor

fn vel(c: vec2<i32>, n: i32) -> vec2<f32> {
    if (oob(c, n)) { return vec2<f32>(0.0, 0.0); }
    let t = textureLoad(wet0_in, c, 0);
    return vec2<f32>(t.z, t.w);
}
fn pr(c: vec2<i32>, n: i32) -> f32 {
    if (oob(c, n)) { return 0.0; }
    return textureLoad(press_in, c, 0).x;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = i32(P.grid);
    let c = vec2<i32>(i32(gid.x), i32(gid.y));
    if (oob(c, n)) { return; }

    let w0 = textureLoad(wet0_in, c, 0);
    let p = textureLoad(press_in, c, 0).x;

    if (w0.x < 0.5) {
        textureStore(wet0_out, c, w0);
        textureStore(press_out, c, vec4<f32>(p, 0.0, 0.0, 0.0));
        return;
    }

    let l = vec2<i32>(c.x - 1, c.y);
    let r = vec2<i32>(c.x + 1, c.y);
    let u_ = vec2<i32>(c.x, c.y - 1);
    let d_ = vec2<i32>(c.x, c.y + 1);

    // Divergence at this cell.
    let div = 0.5 * ((vel(r, n).x - vel(l, n).x) + (vel(d_, n).y - vel(u_, n).y));

    // Push pressure against the divergence, then let the pressure gradient
    // correct the velocity. C97 conditions 5 and 6 — local changes go global.
    let p_new = p - XI * div;
    let nu = w0.z - XI * 0.5 * (pr(r, n) - pr(l, n));
    let nv = w0.w - XI * 0.5 * (pr(d_, n) - pr(u_, n));

    textureStore(wet0_out, c, vec4<f32>(w0.x, w0.y, clamp(nu, -1.0, 1.0), clamp(nv, -1.0, 1.0)));
    textureStore(press_out, c, vec4<f32>(p_new, 0.0, 0.0, 0.0));
}
