// Synthetic load. Stands in for BrushContact + Transfer (§9) so the wet passes
// have something to chew on. Bots ride Lissajous paths to keep the wet set
// churning and to force tile promotion/demotion at the edges.
// Writes h_f, M, g[8], w, h_p. No neighbour reads, so it is a pure deposit.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var wet1_in: texture_2d<f32>;
@group(0) @binding(3) var wet2_in: texture_2d<f32>;
@group(0) @binding(4) var wet5_in: texture_2d<f32>;
@group(0) @binding(5) var wet0_out: texture_storage_2d<rgba16float, write>;
@group(0) @binding(6) var wet1_out: texture_storage_2d<rgba16float, write>;
@group(0) @binding(7) var wet2_out: texture_storage_2d<rgba16float, write>;
@group(0) @binding(8) var wet5_out: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = i32(P.grid);
    let c = vec2<i32>(i32(gid.x), i32(gid.y));
    if (oob(c, n)) { return; }

    var w0 = textureLoad(wet0_in, c, 0);
    var glo = textureLoad(wet1_in, c, 0);
    var ghi = textureLoad(wet2_in, c, 0);
    var w5 = textureLoad(wet5_in, c, 0);

    if (P.bots_active == 1u) {
        var g = array<f32, 8>(glo.x, glo.y, glo.z, glo.w, ghi.x, ghi.y, ghi.z, ghi.w);
        let nf = f32(n);
        let pos = vec2<f32>(f32(c.x), f32(c.y));
        let radius = nf * 0.014 + 6.0;
        let nb = i32(P.bot_count);

        for (var b = 0; b < nb; b = b + 1) {
            let fb = f32(b);
            let ax = 1.00 + fb * 0.37;
            let ay = 1.31 + fb * 0.29;
            let ph = fb * 0.703;
            let bx = (0.5 + 0.42 * sin(ax * P.time + ph)) * nf;
            let by = (0.5 + 0.42 * sin(ay * P.time * 1.11 + ph * 1.7)) * nf;

            let d = distance(pos, vec2<f32>(bx, by));
            if (d < radius) {
                let fall = 1.0 - d / radius;
                let amt = fall * fall * 0.05;
                w0.y = w0.y + amt;              // h_f
                w0.x = 1.0;                     // M — wet
                w5.y = 1.0;                     // w — fully wet
                w5.z = w5.z + amt * 0.20;       // h_p — body height
                let slot = b % 8;
                g[slot] = g[slot] + amt * 0.45;
            }
        }
        glo = vec4<f32>(g[0], g[1], g[2], g[3]);
        ghi = vec4<f32>(g[4], g[5], g[6], g[7]);
    }

    textureStore(wet0_out, c, w0);
    textureStore(wet1_out, c, glo);
    textureStore(wet2_out, c, ghi);
    textureStore(wet5_out, c, w5);
}
