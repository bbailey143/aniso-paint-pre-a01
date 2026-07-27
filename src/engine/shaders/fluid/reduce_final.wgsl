// Second reduction stage — sum the per-workgroup partials down to ONE row of
// NQ totals, on the GPU.
//
// [THIS IS AN INSTRUMENT FIX, NOT A PHYSICS ONE]
//
// Stage 1 leaves one partial per 16x16 workgroup: at a 512 grid that is 1024
// workgroups x 13 quantities = ~53 KB the host had to copy and fold every frame,
// just to display five numbers. Folding it here instead means the readback is
// 64 bytes. Cheaper, and the CPU side stops being able to get the stride wrong.
//
// [RETRACTED] This shader was first written to dodge a supposed readback
// corruption (a constant 2.0 planted at a fixed offset). That did not reproduce
// on re-test — see docs/11. The reduction is kept on its own merits; the
// corruption claim is withdrawn.
//
// [TRAP] Two things sank the first attempt at this shader, and both are quiet:
//
//   1. NQ was written 15 here and 13 in reduce.wgsl. The stride is the layout
//      contract between the two stages; a mismatch reads scrambled lanes.
//   2. It declared a `Params` uniform at binding 0 and never read it. Under
//      `layout: 'auto'` a statically-unused binding is dropped from the
//      generated layout, so binding it is a validation error, the pass is
//      discarded, and `totals` is simply never written — which reads back as a
//      perfectly plausible row of zeros rather than as an error.
//
// So: no uniform here, and NQ is stated once, next to the reason it must match.

// Must equal NQ in reduce.wgsl — the partials buffer is laid out with this stride.
const NQ: u32 = 13u;
// One lane per output slot, padded to 16 so the readback buffer is fully written
// (never trust lazy init) and stays 64 bytes / 16-byte aligned.
const LANES: u32 = 16u;

@group(0) @binding(0) var<storage, read> partials: array<f32>;
@group(0) @binding(1) var<storage, read_write> totals: array<f32>;

@compute @workgroup_size(LANES, 1, 1)
fn main(@builtin(local_invocation_index) q: u32) {
  if (q >= LANES) { return; }
  if (q >= NQ) { totals[q] = 0.0; return; }

  let groups = arrayLength(&partials) / NQ;
  var sum = 0.0;
  for (var g = 0u; g < groups; g = g + 1u) {
    sum = sum + partials[g * NQ + q];
  }
  totals[q] = sum;
}
