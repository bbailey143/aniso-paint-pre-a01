// MoveWater 3 — C97 FlowOutward. Edge darkening (the coffee-ring rim on a
// drying wash). Blur the SURFACE-FILM mask, then bias =
// -eta * (1 - M') * M, written to its own scratch texture so flux_compute does
// not double-count a term. The solver's broad scheduling mask also includes an
// absorbed capillary halo; using that here put the "pinned edge" beyond the
// actual puddle and made eta almost inert.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var press_out: texture_storage_2d<rgba32float, write>;

// [UNVERIFIED] Transition depth for a partially covered surface cell. A binary
// `h_f > WET_EPS` edge exposed the 512-cell physics grid as stair steps once the
// rim was dark enough to see. This continuous coverage keeps the physical grid
// but stops treating one molecule over the threshold as a fully covered cell.
const FILM_EDGE_SCALE: f32 = 0.02;

fn film_coverage(h: f32) -> f32 {
  let film = max(h, 0.0);
  return film / (film + FILM_EDGE_SCALE);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  let m = film_coverage(textureLoad(wet0_in, c, 0).y);

  var acc = 0.0;
  var weightSum = 0.0;
  for (var dy = -4; dy <= 4; dy = dy + 1) {
    for (var dx = -4; dx <= 4; dx = dx + 1) {
      let q = vec2<i32>(c.x + dx, c.y + dy);
      // C97 calls for a Gaussian-like edge kernel. The old equal-weight 9×9
      // square made a strong rim repeat the simulation lattice as dotted,
      // concentric boxes. This radial parabola is a compact smooth
      // approximation: centre-weighted, circular, and cheap enough per frame.
      let r2 = dx * dx + dy * dy;
      let weight = f32(max(17 - r2, 0));
      if (!oob(q, n) && weight > 0.0) {
        let qFilm = textureLoad(wet0_in, q, 0).y;
        acc = acc + film_coverage(qFilm) * weight;
        weightSum = weightSum + weight;
      }
    }
  }
  let m_blur = select(0.0, acc / weightSum, weightSum > 0.0);
  // A coffee ring is an EVAPORATING drop replenishing its pinned edge, not a
  // generic force that should distort a perfectly non-drying wash. Normalise
  // against the shared wetness-decay clock so ordinary drying uses the medium
  // row's full edge strength, zero evaporation gives zero ring flow, and the
  // artist's faster-drying setting does not exceed that physical ceiling.
  let dryingDrive = clamp(P.evapRate / max(P.dryRate, WET_EPS), 0.0, 1.0);
  let bias = -P.edgeEta * dryingDrive * (1.0 - m_blur) * m;
  textureStore(press_out, c, vec4<f32>(bias, 0.0, 0.0, 0.0));
}
