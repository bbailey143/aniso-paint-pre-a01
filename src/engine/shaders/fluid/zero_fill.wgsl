// Explicitly clear a texture to zero.
//
// Relying on the implementation to zero a texture before its first read is a bet
// on someone else's lazy-init bookkeeping. On the bench that bet produced a
// nondeterministic 1e37 in the water field that survived several rounds of
// analysis as a phantom "instability". Every field read before it is written
// gets cleared here, explicitly, once.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var dst: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }
  textureStore(dst, c, vec4<f32>(0.0, 0.0, 0.0, 0.0));
}
