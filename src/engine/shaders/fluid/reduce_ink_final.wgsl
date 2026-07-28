// Collapse the 128x128 fine-ink workgroup totals into eight slots. One lane
// owns one slot and walks the partial rows, avoiding atomics and keeping the
// conservation reading deterministic.

@group(0) @binding(0) var<storage, read> partials: array<f32>;
@group(0) @binding(1) var<storage, read_write> totals: array<f32>;

const NQ: u32 = 8u;

@compute @workgroup_size(8, 1, 1)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
  let q = lid.x;
  // [TRAP, and it has already cost this branch a round] The group count used to
  // be hardcoded as 16384 — (2048/16) squared — which is a THIRD place that has
  // to agree with INK_RES in fluid.ts and the workgroup size in reduce_ink.wgsl.
  // reduce_final.wgsl was silently returning zeros for exactly this class of
  // mismatch. Ask the buffer how long it is instead; then the ink grid can move
  // without a shader edit, and a wrong stride cannot hide.
  let groups = arrayLength(&partials) / NQ;
  var sum = 0.0;
  for (var g = 0u; g < groups; g = g + 1u) {
    sum = sum + partials[g * NQ + q];
  }
  totals[q] = sum;
}
