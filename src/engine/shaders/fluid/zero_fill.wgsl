// Explicitly clear a texture to zero.
//
// Relying on the implementation to zero a texture before its first read is a bet
// on someone else's lazy-init bookkeeping. On the bench that bet produced a
// nondeterministic 1e37 in the water field that survived several rounds of
// analysis as a phantom "instability". Every field read before it is written
// gets cleared here, explicitly, once.
//
// [TRAP, measured twice — this is the THIRD time this one has bitten]
// This pass used to take `Params` at binding 0 solely to read `P.grid`. When the
// ink band arrived at a different resolution, the ink variant was built by
// swapping that line for `textureDimensions(dst)` — which left `P` declared but
// never statically used. `layout: 'auto'` DROPS a binding the shader does not
// use, so binding the params buffer became a validation error, the bind group
// came back invalid, and the whole `clear` encoder was thrown away.
//
// Every wet zero-fill shared that one encoder. So "clear sheet" silently stopped
// clearing ANYTHING — water and pigment accumulated across every wipe — and the
// only visible symptom was watercolour that would not behave.
//
// The fix is not to special-case the ink variant. It is to stop needing Params
// at all: the extent a clear should cover is a property of the texture being
// cleared, so ask the texture. One binding, one layout, both resolutions, and
// nothing left for `layout: 'auto'` to drop. The ink variant now differs by its
// storage format alone.

@group(0) @binding(0) var dst: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dim = textureDimensions(dst);
  if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  textureStore(dst, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(0.0, 0.0, 0.0, 0.0));
}
