// DryTick (§9). Owns the wetness continuum w, and — per the amendment — owns
// evaporation. It is the only pass permitted to remove water from the system.
// The Fluid engine moves water; DryTick evaporates it; nothing else destroys
// it. Without this, w falls to zero while the water it described is still on
// the books, and the conservation gauge drifts for reasons no one can find.
//
// Set evap_rate to 0 and total water must hold flat forever. That is the test.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var wet5_in: texture_2d<f32>;
@group(0) @binding(3) var wet0_out: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var wet5_out: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = i32(P.grid);
    let c = vec2<i32>(i32(gid.x), i32(gid.y));
    if (oob(c, n)) { return; }

    var w0 = textureLoad(wet0_in, c, 0);
    var w5 = textureLoad(wet5_in, c, 0);

    var hf = w0.y;
    var s = w5.x;
    var w = w5.y;

    if (w0.x >= 0.5) {
        // The wetness continuum. Expressed as a rate per unit time, never as a
        // per-frame delta (cross-cutting invariant 2) — D15's drying constant
        // dries twice as fast at 120 fps as at 60, and that is why it does not
        // port to anyone else's machine.
        w = max(w - P.dry_rate * P.dt, 0.0);

        // Evaporation. Metered, and the only water leaving the system.
        if (P.evap_rate > 0.0) {
            let e = P.evap_rate * P.dt;
            hf = max(hf - e, 0.0);
            s  = max(s - e * 0.5, 0.0);
        }
    }

    // A cell with no film, no saturation and no wetness left is simply dry.
    // In the full engine this is where the wet -> dry1 handoff of §5 fires.
    var m = w0.x;
    if (hf <= WET_EPS && s <= WET_EPS && w <= 0.0) { m = 0.0; }

    textureStore(wet0_out, c, vec4<f32>(m, hf, w0.z, w0.w));
    textureStore(wet5_out, c, vec4<f32>(s, w, w5.z, w5.w));
}
