// Drying handoff, step 1 of 3 — push the older layer down.
//
// A cell that has just dried is about to store its pigment into dry1, so
// whatever dry1 already held has to move down into dry2 first. dry2 is the
// accumulating floor: everything older than the newest dried application,
// collapsed together. That is the auto-bake — it happens by itself and the
// artist never sees it.
//
// Split into its own pass because WebGPU core allows only FOUR storage textures
// per stage, and the full handoff writes ten. Each step here writes at most four.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet5_in: texture_2d<f32>;    // w (flags in .w)
@group(0) @binding(2) var dry1a_in: texture_2d<f32>;
@group(0) @binding(3) var dry1b_in: texture_2d<f32>;
@group(0) @binding(4) var dry2a_in: texture_2d<f32>;
@group(0) @binding(5) var dry2b_in: texture_2d<f32>;
@group(0) @binding(6) var dry2a_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(7) var dry2b_out: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  var a2 = textureLoad(dry2a_in, c, 0);
  var b2 = textureLoad(dry2b_in, c, 0);

  if (textureLoad(wet5_in, c, 0).w > 0.5) {
    a2 = a2 + textureLoad(dry1a_in, c, 0);
    b2 = b2 + textureLoad(dry1b_in, c, 0);
  }

  textureStore(dry2a_out, c, a2);
  textureStore(dry2b_out, c, b2);
}
