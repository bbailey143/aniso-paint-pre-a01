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

  // Two things come out of this one sweep. `acc / cnt` is C97's blurred wet MASK
  // and drives the unchanged pressure bias below. `hAcc / hW` is a Gaussian-
  // weighted mean of the actual film HEIGHT, which the rim-migration pass (E9)
  // uses as its direction field. Emitting it here is nearly free — the loop was
  // already being run — and being a blur it is smooth at kernel scale by
  // construction, which is what keeps E9 off the cell grid that killed E8.
  let sigma = max(P.rimReach, 1.0e-3);
  let inv2s2 = 1.0 / (2.0 * sigma * sigma);

  var acc = 0.0;
  var cnt = 0.0;
  var hAcc = 0.0;
  var hW = 0.0;
  for (var dy = -4; dy <= 4; dy = dy + 1) {
    for (var dx = -4; dx <= 4; dx = dx + 1) {
      let q = vec2<i32>(c.x + dx, c.y + dy);
      if (!oob(q, n)) {
        let qFilm = textureLoad(wet0_in, q, 0).y;
        acc = acc + select(0.0, 1.0, qFilm > WET_EPS);
        cnt = cnt + 1.0;
        let r2 = f32(dx * dx + dy * dy);
        let w = exp(-r2 * inv2s2);
        hAcc = hAcc + w * qFilm;
        hW = hW + w;
      }
    }
  }
  let m_blur = select(0.0, acc / cnt, cnt > 0.0);
  let h_blur = select(0.0, hAcc / hW, hW > 0.0);
  // A coffee ring is an EVAPORATING drop replenishing its pinned edge, not a
  // generic force that should distort a perfectly non-drying wash. Normalise
  // against the shared wetness-decay clock so ordinary drying uses the medium
  // row's full edge strength, zero evaporation gives zero ring flow, and the
  // artist's faster-drying setting does not exceed that physical ceiling.
  let dryingDrive = clamp(P.evapRate / max(P.dryRate, WET_EPS), 0.0, 1.0);
  let bias = -P.edgeEta * dryingDrive * (1.0 - m_blur) * m;
  // .x is the pressure bias flux_compute reads. .y is the smoothed film that
  // rim_migration reads. Nothing else uses this texture's other channels.
  textureStore(press_out, c, vec4<f32>(bias, h_blur, 0.0, 0.0));
}
