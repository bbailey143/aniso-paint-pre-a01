// The conservation pass. §8.1: all inter-cell movement is a clamped flux
// between cells, never a per-cell height clamp.
//
// Each cell computes the four amounts it is about to give away. Its neighbour
// computes the same number from its own side using the identical formula, so
// what leaves one cell arrives whole in the next. Nothing is created, nothing
// is lost, and no semi-Lagrangian advection quietly deflates the height field.
//
// Water and pigment both ride these fluxes, which is what keeps them together.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var press_in: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> flux: array<vec4<f32>>;

fn pr(c: vec2<i32>, n: i32) -> f32 {
    if (oob(c, n)) { return 0.0; }
    return textureLoad(press_in, c, 0).x;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = i32(P.grid);
    let c = vec2<i32>(i32(gid.x), i32(gid.y));
    if (oob(c, n)) { return; }
    let idx = u32(c.y * n + c.x);

    let w0 = textureLoad(wet0_in, c, 0);
    let h = w0.y;

    if (w0.x < 0.5 || h <= WET_EPS) {
        flux[idx] = vec4<f32>(0.0, 0.0, 0.0, 0.0);
        return;
    }

    let l = vec2<i32>(c.x - 1, c.y);
    let r = vec2<i32>(c.x + 1, c.y);
    let up = vec2<i32>(c.x, c.y - 1);
    let dn = vec2<i32>(c.x, c.y + 1);

    // Final face velocities. Relaxation has already made the field near
    // divergence-free, so the only thing left to apply is the edge-darkening
    // bias — the outward lean that puts the dark rim on a drying wash.
    // Staggered, so each correction is the difference across that one face.
    let p_here = pr(c, n);
    let uE = clamp(w0.z - (pr(r, n) - p_here), -1.0, 1.0);
    let vS = clamp(w0.w - (pr(dn, n) - p_here), -1.0, 1.0);

    // The west and north faces belong to the neighbours, so read their stored
    // face velocity and apply the same correction from their side. Both cells
    // sharing a face therefore agree on it exactly, which is what makes the
    // ledger balance.
    var uW = 0.0;
    var vN = 0.0;
    if (!oob(l, n)) {
        let wl = textureLoad(wet0_in, l, 0);
        uW = clamp(wl.z - (p_here - pr(l, n)), -1.0, 1.0);
    }
    if (!oob(up, n)) {
        let wu = textureLoad(wet0_in, up, 0);
        vN = clamp(wu.w - (p_here - pr(up, n)), -1.0, 1.0);
    }

    var o = vec4<f32>(
        max(uE, 0.0) * h * P.dt,    // out through the east face
        max(-uW, 0.0) * h * P.dt,   // out through the west face
        max(vS, 0.0) * h * P.dt,    // out through the south face
        max(-vN, 0.0) * h * P.dt,   // out through the north face
    );

    // Nothing leaves the sheet. Without this the conservation gauge bleeds at
    // the border and you spend a day hunting a leak that is just the edge.
    if (c.x >= n - 1) { o.x = 0.0; }
    if (c.x <= 0)     { o.y = 0.0; }
    if (c.y >= n - 1) { o.z = 0.0; }
    if (c.y <= 0)     { o.w = 0.0; }

    // A cell may never give away more than it holds. Scale the whole set so the
    // ratios between the four directions survive the clamp.
    let tot = o.x + o.y + o.z + o.w;
    let cap = h * 0.9;
    if (tot > cap && tot > 0.0) {
        o = o * (cap / tot);
    }

    flux[idx] = o;
}
