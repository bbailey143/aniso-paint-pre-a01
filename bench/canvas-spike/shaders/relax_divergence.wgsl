// MoveWater, stage 2 — C97 RelaxDivergence, staggered, in gather form.
//
// [FIXED TWICE. Both times by the gauges, and the second one matters.]
//
// Attempt 1 stored u,v at cell centres and used central differences for both
// divergence and pressure gradient — textbook odd-even decoupling. A
// checkerboard pressure pattern is invisible to a central-difference gradient,
// so it grew. §2.3 already said staggered.
//
// Attempt 2 staggered the grid but kept a pressure-Poisson form:
//     u -= xi * grad(p_old);   p -= xi * div(u_old)
// That is an amplifier. Its eigenvalues are 1 +/- i*xi*sqrt(lambda), magnitude
// strictly above one, so it grows without bound no matter how small xi is.
// Divergence went from 0.00015 to 0.086 and the sheet gained 753% of its water.
//
// C97 does not solve a pressure Poisson equation. It computes the divergence of
// a cell and pushes that cell's four faces directly to cancel it:
//
//     delta = -xi * div(i,j)
//     p(i,j) += delta
//     u(i+1,j) += delta;  u(i,j) -= delta
//     v(i,j+1) += delta;  v(i,j) -= delta
//
// That is a scatter, which a GPU cannot do under ping-pong. The gather form is
// algebraically identical: a face shared by two cells is pushed by both, so
//
//     u_face += delta(this cell) - delta(east neighbour)
//
// The resulting operator on divergence is (1 - xi * L), L the 5-point Laplacian
// with eigenvalues in [0, 8]. Stable for xi < 0.25; at C97's 0.1 the worst mode
// damps to 0.2 per iteration. High-frequency divergence — exactly what a brush
// stroke injects — dies fastest.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var wet0_out: texture_storage_2d<FMT_WATER, write>;

const XI: f32 = 0.1;   // C97 redistribution factor. Must stay under 0.25.

// Divergence at a cell, from its own east/south faces and its neighbours'.
// Zero outside the sheet and on dry cells, so no correction leaks into paper
// that is not carrying water.
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

    if (w0.x < 0.5) {
        textureStore(wet0_out, c, w0);
        return;
    }

    let delta_c = -XI * dv(c, n);
    let delta_e = -XI * dv(vec2<i32>(c.x + 1, c.y), n);
    let delta_s = -XI * dv(vec2<i32>(c.x, c.y + 1), n);

    // Each face is pushed by the cell on either side of it.
    let nu = w0.z + (delta_c - delta_e);
    let nv = w0.w + (delta_c - delta_s);

    textureStore(wet0_out, c, vec4<f32>(w0.x, w0.y, clamp(nu, -1.0, 1.0), clamp(nv, -1.0, 1.0)));
}
