// Dry media deposition (P7) — graphite, ballpoint, and every future row on
// `DryMedium`.
//
// This pass BYPASSES the whole fluid band. Nothing here touches h_f, u, v, s or
// M, so no water is created, no divergence is injected, and the relaxation
// never sees it. A pencil is not a very dry brush; it is a different branch of
// the tree (D3).
//
// It writes straight into dry2 — the permanent floor. That is the correct band
// for `oneWayDoor = true` media: graphite does not lift when you wash over it,
// and neither does ballpoint ink. Writing into dry1 would make a pencil line
// dissolve under a wet wash, which is wrong and would look it.
//
// Because dry2 is already in the composite's Kubelka-Munk chain and already in
// the conservation ledger, a pencil renders and is accounted for with no
// special case anywhere downstream.

struct Seg {
  a: vec2<f32>,
  b: vec2<f32>,
  radius: f32,
  water: f32,       // always 0 for a dry medium
  pigment: f32,
  reach: f32,       // 0..1 how deep into the tooth the tip gets
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
@group(0) @binding(2) var<uniform> C: Ctl;
@group(0) @binding(3) var<storage, read> mix: array<vec4<f32>>;
@group(0) @binding(4) var dry2a_in: texture_2d<f32>;
@group(0) @binding(5) var dry2b_in: texture_2d<f32>;
@group(0) @binding(6) var paper: texture_2d<f32>;
@group(0) @binding(7) var dry2a_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(8) var dry2b_out: texture_storage_2d<rgba32float, write>;

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

  // This pass ping-pongs, so every cell must copy through even when it is
  // nowhere near the stroke — a skipped cell would lose the drawing.
  var a2 = textureLoad(dry2a_in, c, 0);
  var b2 = textureLoad(dry2b_in, c, 0);

  let count = i32(C.count);
  let inBox = f32(c.x) >= C.minX && f32(c.x) <= C.maxX
           && f32(c.y) >= C.minY && f32(c.y) <= C.maxY;

  if (count > 0 && inBox) {
    let pos = vec2<f32>(f32(c.x) + 0.5, f32(c.y) + 0.5);
    let toothH = textureLoad(paper, c, 0).x;
    var lay = 0.0;

    for (var i = 0; i < count; i = i + 1) {
      let s = segs[i];
      let d = segDist(pos, s.a, s.b);
      if (d < s.radius + 0.5) {
        // ANALYTIC COVERAGE — how much of this CELL the tip actually crossed,
        // not how far the cell centre is from the centreline.
        //
        // [TRAP, measured, and it was visible before it was measured] Any
        // falloff of the form `g(d / radius)` samples a continuous shape at one
        // point per cell, and a shape narrower than a cell falls between the
        // sampling points. A ballpoint at size 0.5 is 0.85 cells across, and
        // down a diagonal line the deposited amount swung 0.284 / 0.002 /
        // 0.284 / 0.128 — a 99 % ripple, which is exactly the row of beads on
        // screen. Horizontal test strokes hid it completely, because they sit
        // squarely on the cell rows; only a diagonal exposes it.
        //
        // Coverage instead of distance fixes it at the root: a cell one radius
        // out is half covered, half a cell further out is not covered at all,
        // and every cell along the path gets its true share. A mark thinner
        // than the grid then comes out FAINTER, which is right, rather than
        // BROKEN, which is an artefact.
        let f = clamp(s.radius - d + 0.5, 0.0, 1.0);

        // THE TOOTH GATE. This is the whole of "rapid strokes on rough paper
        // come out broken, slow deliberate ones come out smooth". `reach` was
        // already reduced by speed and by hardness on the CPU; here it meets
        // the paper's actual height field.
        //
        // [TRAP, measured] Gating on the raw height is wrong, and the symptom is
        // backwards behaviour on smooth paper. The generator centres every
        // sheet's height on ~0.5 and varies only the SPREAD, so hot press spans
        // roughly 0.42-0.58 while rough spans 0.08-0.92. A light or fast tip
        // needs a height above ~0.65, which rough paper's peaks supply and hot
        // press simply never reaches — so a 4H on smooth paper deposited
        // NOTHING (0 % coverage) while the same 4H on rough paper marked its
        // peaks (5 %). Exactly inside out.
        //
        // A tip rides on the high points, and on a smooth sheet nearly the whole
        // surface IS the high point. So re-reference the height to the sheet's
        // own amplitude: the peak of every paper sits at 1, and the valleys drop
        // away by as much as that paper is rough. Hot press then rides at
        // 0.84-1.0 and takes a continuous but light line; rough rides at
        // 0.15-1.0 and breaks the same stroke into scattered marks.
        let ride = 1.0 - P.toothAmp * (1.0 - toothH);
        let need = 1.0 - clamp(s.reach, 0.0, 1.0);
        let gate = smoothstep(need - 0.18, need + 0.18, ride);

        lay = lay + f * gate * s.pigment;
      }
    }

    if (lay > 0.0) {
      a2 = a2 + mix[0] * lay;
      b2 = b2 + mix[1] * lay;
    }
  }

  textureStore(dry2a_out, c, a2);
  textureStore(dry2b_out, c, b2);
}
