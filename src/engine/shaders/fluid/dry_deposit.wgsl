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
  /** Rim falloff in inverse cells. 1 spreads the edge over a whole cell, which
   * reads as wet; higher tightens it to the crisp edge a paste leaves. */
  edge: f32,
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
      if (d < s.radius + 0.9) {
        // TRUE COVERAGE, by supersampling the cell 4x4.
        //
        // [TRAP, measured twice] Any falloff of the form `g(d / radius)` samples
        // a continuous shape once per cell, so a shape narrower than a cell
        // falls between the sampling points: a size-0.5 ballpoint swung
        // 0.284 / 0.002 / 0.284 down a diagonal, a 99 % ripple, the row of beads
        // on screen.
        //
        // The first fix approximated coverage as `clamp(radius - d + 0.5)`. That
        // is exact only for an axis-aligned edge, still rippled ~54 % on a
        // diagonal, and needed a 0.9-cell minimum contact width to stay quiet —
        // which then CLAMPED EVERY FINE NIB TO THE SAME WIDTH and erased the
        // pen's thick-and-thin entirely. The floor hid the symptom by destroying
        // the signal.
        //
        // Counting sub-samples inside the capsule is the real thing: exact to
        // 1/16 of a cell at any angle, no minimum width, and a tip finer than a
        // cell renders as a faint continuous line whose DENSITY tracks its true
        // width. That is how a sub-pixel line is supposed to resolve, and it is
        // what lets the ball's starve show up as thinning rather than only as
        // fading.
        var acc = 0.0;
        for (var sy = 0u; sy < 4u; sy = sy + 1u) {
          for (var sx = 0u; sx < 4u; sx = sx + 1u) {
            let sp = vec2<f32>(f32(c.x) + (f32(sx) + 0.5) * 0.25,
                               f32(c.y) + (f32(sy) + 0.5) * 0.25);
            if (segDist(sp, s.a, s.b) <= s.radius) { acc = acc + 1.0; }
          }
        }
        // Gamma on coverage: below 1 spreads the rim (graphite feathers, loose
        // particles sit around the mark), above 1 tightens it (ink is a paste
        // and stops where the ball stopped). Safe on thin marks, unlike a
        // contrast curve, which would erase anything under half a cell.
        let f = pow(acc * 0.0625, max(C.edge, 0.2));

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
