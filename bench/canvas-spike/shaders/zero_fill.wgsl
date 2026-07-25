// Explicitly clear a texture to zero.
//
// [ADDED — chasing a nondeterministic 1e37]
// Water totals came back different on every run of an identical command line:
// +2139%, +278%, +556%. Pigment and divergence stayed sane throughout, and the
// bogus value was already present at frame 199. A physics blowup grows; this
// was simply there, and it moved between runs. That is uninitialised memory
// being read, not a solver going unstable.
//
// Relying on the implementation to zero a texture before its first read is a
// bet on someone else's lazy-init bookkeeping. Every field this engine reads
// before it writes gets cleared here, explicitly, once.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var dst: texture_storage_2d<FMT_WATER, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = i32(P.grid);
    let c = vec2<i32>(i32(gid.x), i32(gid.y));
    if (oob(c, n)) { return; }
    textureStore(dst, c, vec4<f32>(0.0, 0.0, 0.0, 0.0));
}
