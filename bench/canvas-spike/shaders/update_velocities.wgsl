// MoveWater, stage 1 — C97 UpdateVelocities, with A26's gravity term (D11).
// Writes u,v into WET0 and seeds the transient pressure field.
// h_f is NOT touched here: water only moves through the clamped fluxes in
// flux_apply_water (§8.1). Pressure lives in its own scratch texture so that
// relaxation cannot quietly destroy mass.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var paper: texture_2d<f32>;
@group(0) @binding(3) var wet0_out: texture_storage_2d<FMT_WATER, write>;

fn hf_at(c: vec2<i32>, n: i32) -> f32 {
    if (oob(c, n)) { return 0.0; }
    return textureLoad(wet0_in, c, 0).y;
}
fn paper_h(c: vec2<i32>, n: i32) -> f32 {
    let q = clamp(c, vec2<i32>(0, 0), vec2<i32>(n - 1, n - 1));
    return textureLoad(paper, q, 0).x;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = i32(P.grid);
    let c = vec2<i32>(i32(gid.x), i32(gid.y));
    if (oob(c, n)) { return; }

    var w0 = textureLoad(wet0_in, c, 0);
    let m = w0.x;
    let h = w0.y;

    if (m < 0.5 || h <= WET_EPS) {
        textureStore(wet0_out, c, vec4<f32>(w0.x, w0.y, 0.0, 0.0));
        return;
    }

    let l = vec2<i32>(c.x - 1, c.y);
    let r = vec2<i32>(c.x + 1, c.y);
    let u_ = vec2<i32>(c.x, c.y - 1);
    let d_ = vec2<i32>(c.x, c.y + 1);

    // Staggered (§2.3): u here is the face between c and c+x, v the face
    // between c and c+y. Every gradient is therefore a plain difference across
    // that one face, never a central difference straddling two cells — which is
    // what let a checkerboard mode grow in the first version.
    var du = -(hf_at(r, n) - h);
    var dv = -(hf_at(d_, n) - h);

    // Paper slope. C97 condition 4 — streaks parallel to flow.
    let ph = paper_h(c, n);
    du = du - P.paper_influence * (paper_h(r, n) - ph);
    dv = dv - P.paper_influence * (paper_h(d_, n) - ph);

    // D11 board tilt. Zero when the board lies flat.
    du = du + P.gravity_x;
    dv = dv + P.gravity_y;

    // Viscosity — C97 mu.
    let uL = select(0.0, textureLoad(wet0_in, l, 0).z, !oob(l, n));
    let uR = select(0.0, textureLoad(wet0_in, r, 0).z, !oob(r, n));
    let uU = select(0.0, textureLoad(wet0_in, u_, 0).z, !oob(u_, n));
    let uD = select(0.0, textureLoad(wet0_in, d_, 0).z, !oob(d_, n));
    let vL = select(0.0, textureLoad(wet0_in, l, 0).w, !oob(l, n));
    let vR = select(0.0, textureLoad(wet0_in, r, 0).w, !oob(r, n));
    let vU = select(0.0, textureLoad(wet0_in, u_, 0).w, !oob(u_, n));
    let vD = select(0.0, textureLoad(wet0_in, d_, 0).w, !oob(d_, n));

    du = du + P.viscosity * (uL + uR + uU + uD - 4.0 * w0.z);
    dv = dv + P.viscosity * (vL + vR + vU + vD - 4.0 * w0.w);

    // Integrate, then viscous drag (C97 kappa).
    var nu = (w0.z + P.dt * du) * (1.0 - P.drag);
    var nv = (w0.w + P.dt * dv) * (1.0 - P.drag);

    // Never move more than one cell per step (C97 adaptive dt / B04 CFL).
    nu = clamp(nu, -1.0, 1.0);
    nv = clamp(nv, -1.0, 1.0);

    textureStore(wet0_out, c, vec4<f32>(w0.x, w0.y, nu, nv));
}
