// Debug-only post-capillary alarm.
//
// This pass never changes paint. It scans the saturation field immediately
// after CapillaryFlow and permanently latches one u32 when a compute consumer
// sees a value that cannot be physical. The CPU reads the latch once after a
// whole session, so the observer adds no per-frame synchronisation.

@group(0) @binding(0) var wet5_in: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> alarm: atomic<u32>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(wet5_in);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }

  let saturation = textureLoad(wet5_in, vec2<i32>(gid.xy), 0).x;
  if (!(saturation >= 0.0) || saturation > WATER_LIM) {
    atomicStore(&alarm, 1u);
  }
}
