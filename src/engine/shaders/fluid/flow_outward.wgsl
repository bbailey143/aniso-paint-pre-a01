// MoveWater 3 — C97 FlowOutward. Edge darkening (the coffee-ring rim on a
// drying wash). Blur the SURFACE-FILM mask, then bias =
// -eta * (1 - M') * M, written to its own scratch texture so flux_compute does
// not double-count a term. The solver's broad scheduling mask also includes an
// absorbed capillary halo; using that here put the "pinned edge" beyond the
// actual puddle and made eta almost inert.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var press_out: texture_storage_2d<rgba32float, write>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }

  let m = select(0.0, 1.0, textureLoad(wet0_in, c, 0).y > WET_EPS);

  var acc = 0.0;
  var cnt = 0.0;
  for (var dy = -4; dy <= 4; dy = dy + 1) {
    for (var dx = -4; dx <= 4; dx = dx + 1) {
      let q = vec2<i32>(c.x + dx, c.y + dy);
      if (!oob(q, n)) {
        let qFilm = textureLoad(wet0_in, q, 0).y;
        acc = acc + select(0.0, 1.0, qFilm > WET_EPS);
        cnt = cnt + 1.0;
      }
    }
  }
  let m_blur = select(0.0, acc / cnt, cnt > 0.0);
  // A coffee ring is an EVAPORATING drop replenishing its pinned edge, not a
  // generic force that should distort a perfectly non-drying wash. Normalise
  // against the shared wetness-decay clock so ordinary drying uses the medium
  // row's full edge strength, zero evaporation gives zero ring flow, and the
  // artist's faster-drying setting does not exceed that physical ceiling.
  let dryingDrive = clamp(P.evapRate / max(P.dryRate, WET_EPS), 0.0, 1.0);
  let bias = -P.edgeEta * dryingDrive * (1.0 - m_blur) * m;
  textureStore(press_out, c, vec4<f32>(bias, 0.0, 0.0, 0.0));
}
