// Second reduction stage — sum the per-workgroup partials down to ONE row of
// NQ totals, on the GPU.
//
// [THIS IS THE FIX, AND IT IS AN INSTRUMENT FIX, NOT A PHYSICS ONE]
//
// Reading a large buffer back to the CPU on this machine plants the constant
// 2.0 at a fixed offset (x = 241 of each 512-wide row; byte 3856 of every
// 8192-byte row). Proven by scanning the same buffer two ways in the same
// submission: a GPU-side scan reports zero non-zero entries, 12 times out of 12,
// while the CPU readback of that identical buffer reports 1-5, always starting
// at x = 241. The memory is clean; the copy-and-map path is not.
//
// Every "conservation fault" chased through P4-P6 was this: N corrupted entries
// x 2.0, which is exactly the integer growth (+2, +4, +8, +16) that kept showing
// up and never made physical sense.
//
// The workaround is simply to never read back enough bytes to reach the bad
// offset. Reducing to NQ floats means the host copies ~60 bytes instead of ~53 KB.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> partials: array<f32>;
@group(0) @binding(2) var<storage, read_write> totals: array<f32>;

const NQ_F: u32 = 15u;

@compute @workgroup_size(NQ_F, 1, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let q = gid.x;
  if (q >= NQ_F) { return; }
  let groups = arrayLength(&partials) / NQ_F;
  var sum = 0.0;
  for (var g = 0u; g < groups; g = g + 1u) {
    sum = sum + partials[g * NQ_F + q];
  }
  totals[q] = sum;
}
