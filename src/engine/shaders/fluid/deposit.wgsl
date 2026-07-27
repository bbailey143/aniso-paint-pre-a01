// Pointer deposit — stands in for BrushContact + Transfer until the brush
// engine lands (P5). Writes h_f, M, g[8], w. No neighbour reads, so it is a
// pure deposit.
//
// The stroke arrives as a list of resampled segments, NOT single points: stylus
// samples are far sparser than simulation steps, and depositing once per frame
// at the instantaneous position makes strokes bead into dots (Card 6 TRAP; the
// bench reproduced it). The host resamples the path to <= 1 cell per step and
// this pass integrates distance to each segment.

struct Seg {
  a: vec2<f32>,     // start, grid space
  b: vec2<f32>,     // end, grid space
  radius: f32,      // contact radius in cells
  water: f32,       // water deposited at the centreline
  pigment: f32,     // pigment deposited at the centreline
  reach: f32,       // 0..1 how deep into the paper's tooth this hair reaches
};

struct Ctl {
  count: f32,
  minX: f32,
  minY: f32,
  maxX: f32,
  maxY: f32,
  _p0: f32,
  _p1: f32,
  _p2: f32,
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> segs: array<Seg>;
// The footprint's bounding box. Every cell still copies through (this pass
// ping-pongs, so a skipped cell would lose its contents), but only cells the
// hairs can actually reach pay for the segment loop.
@group(0) @binding(2) var<uniform> C: Ctl;
@group(0) @binding(3) var<storage, read> mix: array<vec4<f32>>;  // 2 x vec4 = 8 slot weights
@group(0) @binding(4) var wet0_in: texture_2d<f32>;
@group(0) @binding(5) var wet1_in: texture_2d<f32>;
@group(0) @binding(6) var wet2_in: texture_2d<f32>;
@group(0) @binding(7) var wet5_in: texture_2d<f32>;
@group(0) @binding(8) var wet0_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(9) var wet1_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(10) var wet2_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(11) var wet5_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(12) var paper: texture_2d<f32>;

// Distance from point p to segment ab.
fn segDist(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let ab = b - a;
  let len2 = dot(ab, ab);
  if (len2 < 1e-8) { return distance(p, a); }
  let t = clamp(dot(p - a, ab) / len2, 0.0, 1.0);
  return distance(p, a + ab * t);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  var w0 = textureLoad(wet0_in, c, 0);
  var glo = textureLoad(wet1_in, c, 0);
  var ghi = textureLoad(wet2_in, c, 0);
  var w5 = textureLoad(wet5_in, c, 0);

  let count = i32(C.count);
  let inBox = f32(c.x) >= C.minX && f32(c.x) <= C.maxX
           && f32(c.y) >= C.minY && f32(c.y) <= C.maxY;
  if (count > 0 && inBox) {
    let pos = vec2<f32>(f32(c.x) + 0.5, f32(c.y) + 0.5);
    var water = 0.0;
    var pig = 0.0;

    // Drybrush / scumbling. A hair pressed lightly only skims the peaks of the
    // paper; only when it is driven deeper does it reach into the valleys. So
    // deposition is gated on the paper's own height field against how far this
    // hair reaches, which is what breaks a fast or light stroke into a ragged
    // broken mark on rough paper and lets a slow firm one lay solid. [C97 4.7]
    let toothH = textureLoad(paper, c, 0).x;

    for (var i = 0; i < count; i = i + 1) {
      let s = segs[i];
      let d = segDist(pos, s.a, s.b);
      if (d < s.radius) {
        // Smooth falloff to the rim — a hard edge would inject divergence the
        // relaxation then has to chase.
        let fall = 1.0 - d / s.radius;
        let f = fall * fall;
        // Peaks-first contact. A C1 ramp, not a hard cut, or the mark stipples.
        let need = 1.0 - clamp(s.reach, 0.0, 1.0);
        let gate = smoothstep(need - 0.18, need + 0.18, toothH);
        let take = f * gate;
        water = water + take * s.water;
        pig = pig + take * s.pigment;
      }
    }

    if (water > 0.0 || pig > 0.0) {
      w0.y = w0.y + water;          // h_f
      w0.x = 1.0;                   // M — wet
      w5.y = 1.0;                   // w — fully wet
      // Pigment split across the active slots by the mix weights.
      glo = glo + mix[0] * pig;
      ghi = ghi + mix[1] * pig;
    }
  }

  textureStore(wet0_out, c, w0);
  textureStore(wet1_out, c, glo);
  textureStore(wet2_out, c, ghi);
  textureStore(wet5_out, c, w5);
}
