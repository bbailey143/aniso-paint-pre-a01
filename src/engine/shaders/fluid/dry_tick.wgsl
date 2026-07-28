// DryTick. Owns the wetness continuum w AND evaporation — the only pass that
// removes water from the system. Rates are per unit time, never per-frame
// deltas (invariant 2). Set evapRate to 0 and total water must hold flat.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var wet5_in: texture_2d<f32>;
@group(0) @binding(3) var wet0_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var wet5_out: texture_storage_2d<rgba32float, write>;

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
    w = max(w - P.dryRate * P.dt, 0.0);
  }

  // The wet mask schedules fluid motion; it is not a statement that the paper
  // contains no water. Capillary creep can spread a large total amount into a
  // halo where every individual cell is below the mask threshold. Gating
  // evaporation on M stranded that absorbed water permanently: the HUD could
  // read "wet cells 0" while the water total never fell again.
  //
  // Both standing and absorbed water therefore continue drying regardless of
  // the motion mask. DryTick remains the sole owner of water removal.
  if (P.evapRate > 0.0) {
    let e = P.evapRate * P.dt;
    hf = max(hf - e, 0.0);
    s  = max(s - e * 0.5, 0.0);
  }

  var m = w0.x;
  if (hf <= WET_EPS && s <= WET_EPS && w <= 0.0) { m = 0.0; }

  // Flag the wet -> dry TRANSITION for this frame only. The handoff passes that
  // follow move the cell's pigment down into the dry layers, and they must fire
  // exactly once: firing again would push an already-empty dry1 into dry2 and
  // destroy the layer. Flagging the edge (was wet, now dry) is self-clearing,
  // because the next frame the cell is already dry and takes the other branch.
  var justDried = 0.0;
  if (w0.x >= 0.5 && m < 0.5) { justDried = 1.0; }

  // Containment for the water side (see `sane` in common.wgsl). One catch put
  // exactly +Infinity (0x7f800000) into a water cell, so the film and the
  // paper's saturation get the same guard the pigment does. This pass writes
  // every cell every frame, so it scrubs as well as blocks.
  textureStore(wet0_out, c, vec4<f32>(m, sane(hf, WATER_LIM), w0.z, w0.w));
  textureStore(wet5_out, c, vec4<f32>(sane(s, WATER_LIM), w, w5.z, justDried));
}
