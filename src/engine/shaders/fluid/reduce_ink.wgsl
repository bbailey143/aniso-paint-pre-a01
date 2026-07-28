// Fine dry-media ledger. Ink is a separate higher-resolution canvas band, so
// this reducer deliberately asks the texture for its own dimensions instead of
// borrowing the wet-fluid grid size from Params.

@group(0) @binding(0) var ink0: texture_2d<f32>;
@group(0) @binding(1) var ink1: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> partials: array<f32>;

const NQ: u32 = 8u;
var<workgroup> scratch: array<f32, 256>;

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_index) lid: u32,
        @builtin(workgroup_id) wid: vec3<u32>,
        @builtin(num_workgroups) nwg: vec3<u32>) {
  let dim = textureDimensions(ink0);
  var q: array<f32, 8>;
  for (var i = 0u; i < NQ; i = i + 1u) { q[i] = 0.0; }
  if (gid.x < dim.x && gid.y < dim.y) {
    let a = textureLoad(ink0, vec2i(gid.xy), 0);
    let b = textureLoad(ink1, vec2i(gid.xy), 0);
    q = array<f32, 8>(a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w);
  }
  let wg = wid.y * nwg.x + wid.x;
  for (var i = 0u; i < NQ; i = i + 1u) {
    scratch[lid] = q[i];
    workgroupBarrier();
    var stride = 128u;
    loop {
      if (stride == 0u) { break; }
      if (lid < stride) { scratch[lid] = scratch[lid] + scratch[lid + stride]; }
      workgroupBarrier();
      stride = stride / 2u;
    }
    if (lid == 0u) { partials[wg * NQ + i] = scratch[0]; }
    workgroupBarrier();
  }
}
