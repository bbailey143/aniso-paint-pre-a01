// Conservation pass. All inter-cell movement is a clamped flux between cells,
// never a per-cell height clamp. Each cell computes the four amounts it gives
// away; the neighbour derives the same number from its side, so what leaves one
// arrives whole in the next. Nothing created, nothing lost.

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
@group(0) @binding(2) var press_in: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> flux: array<vec4<f32>>;

fn pr(c: vec2<i32>, n: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  return textureLoad(press_in, c, 0).x;
}

fn height_at(c: vec2<i32>, n: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  return sane(textureLoad(wet0_in, c, 0).y, WATER_LIM);
}

/**
 * A26 thin-film mobility on one cell face.
 *
 * The average is deliberately allowed to include a dry neighbour. This is the
 * documented fix that makes dry paper a resistive destination rather than an
 * artificial wall. Dividing by mobility + viscous resistance maps the physical
 * mobility to a stable 0..1 response without a new threshold or magic speed.
 */
/**
 * Slump: how much paste leaves this cell across one face.
 *
 * The driving quantity is the DROP IN THE PILE, not a push. That distinction is
 * the whole of why the first two attempts failed.
 *
 * Gating the velocity field meant thick paint got MORE mobile, not less: face
 * mobility below goes as the cube of the film height, so every stroke laid on
 * top of the last raised h, raised mobility, and eventually blew straight
 * through the threshold however high it was set. The artist found it from the
 * other end on 2026-08-24, with Body at 0.712 of a maximum 0.8: "it only holds
 * for a short time and dissipates... in fact it turns into a liquid." Building
 * paint up was the thing making it runny.
 *
 * A pile of paste does not work like that. What decides whether it moves is how
 * steep it is, not how deep — a thick FLAT layer is perfectly stable, and that
 * is what covering the canvas in two strokes actually requires. So:
 *
 *     it moves when the drop to the neighbour exceeds the yield stress
 *     and then only the excess over that flows, slowed by viscosity
 *
 * which is the sarasara lab's `flowLayer`, the build the artist recognised as
 * having the feel of actual oil. The 0.2 ceiling is that solver's too: no cell
 * gives away more than a fifth of itself in one step.
 *
 * The gravity term is what a tilted board does to a slope — it makes the
 * downhill face easier to clear and the uphill face harder, by the same amount,
 * so the pair stays exactly antisymmetric and nothing is created or lost.
 */
fn slump(hHere: f32, hThere: f32, bias: f32) -> f32 {
  let excess = (hHere - hThere + bias) - P.yieldStress;
  if (excess <= 0.0) { return 0.0; }
  return min(hHere * 0.2, excess * P.dt * 0.5 / max(P.viscosity, 0.05)) * CREEP;
}

/**
 * How fast paint that nobody is touching moves.
 *
 * The lab's slump rate came across without its timestep, and at 60 frames a
 * second letting a cell give away a fifth of itself per frame flattens a ridge
 * in under a quarter of a second. That is not paint settling, that is paint
 * running — and the artist put it plainly on 2026-08-24: "It should NOT spread
 * out after being placed down by the brush... this was all done by laying down
 * the paint and then waiting. That's not what oil painting is like!"
 *
 * Real oil holds a knife ridge for hours. So free movement is creep: slow
 * enough to be invisible while you work, present enough that a genuinely
 * overloaded pile still gives way eventually, which is the one behaviour the
 * lab board wanted from it (OL-02, "slumps when overloaded").
 *
 * Everything else that moves paint is the brush, which is the point.
 */
const CREEP: f32 = 0.02;

fn face_response(h1: f32, h2: f32) -> f32 {
  let mean_h = 0.5 * (h1 + h2);
  let mobility = mean_h * mean_h * mean_h;
  let resistance = max(P.viscosity * P.drag, WET_EPS);
  return mobility / (mobility + resistance);
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }
  let idx = u32(c.y * n + c.x);

  let w0 = textureLoad(wet0_in, c, 0);
  let h = w0.y;
  if (w0.x < 0.5 || h <= WET_EPS) { flux[idx] = vec4<f32>(0.0); return; }

  let l = vec2<i32>(c.x - 1, c.y);
  let r = vec2<i32>(c.x + 1, c.y);
  let up = vec2<i32>(c.x, c.y - 1);
  let dn = vec2<i32>(c.x, c.y + 1);

  var o = vec4<f32>(0.0);

  if (P.yieldStress > 0.0) {
    // A PASTE. It has no velocity field and reads none: `update_velocities` and
    // the pressure relaxation are skipped outright for a yielding material (see
    // fluid.ts), because a pile of paste is moved by its own steepness and by
    // the brush, and by nothing else.
    let g = P.gravityResponse * P.cosAlpha;
    o = vec4<f32>(
      slump(h, height_at(r, n),   g * P.gravityX),
      slump(h, height_at(l, n),  -g * P.gravityX),
      slump(h, height_at(dn, n),  g * P.gravityY),
      slump(h, height_at(up, n), -g * P.gravityY),
    );
  } else {
    // WATER, exactly as before. Not near enough — the same instructions in the
    // same order, which is what makes every watercolour result still stand.
    let p_here = pr(c, n);
    let uE = clamp(w0.z - (pr(r, n) - p_here), -1.0, 1.0);
    let vS = clamp(w0.w - (pr(dn, n) - p_here), -1.0, 1.0);

    var uW = 0.0;
    var vN = 0.0;
    if (!oob(l, n))  { let wl = textureLoad(wet0_in, l, 0);  uW = clamp(wl.z - (p_here - pr(l, n)), -1.0, 1.0); }
    if (!oob(up, n)) { let wu = textureLoad(wet0_in, up, 0); vN = clamp(wu.w - (p_here - pr(up, n)), -1.0, 1.0); }

    o = vec4<f32>(
      max(uE, 0.0) * h * face_response(h, height_at(r, n)) * P.dt,
      max(-uW, 0.0) * h * face_response(h, height_at(l, n)) * P.dt,
      max(vS, 0.0) * h * face_response(h, height_at(dn, n)) * P.dt,
      max(-vN, 0.0) * h * face_response(h, height_at(up, n)) * P.dt,
    );
  }

  if (c.x >= n - 1) { o.x = 0.0; }
  if (c.x <= 0)     { o.y = 0.0; }
  if (c.y >= n - 1) { o.z = 0.0; }
  if (c.y <= 0)     { o.w = 0.0; }

  let tot = o.x + o.y + o.z + o.w;
  let cap = h * 0.9;
  if (tot > cap && tot > 0.0) { o = o * (cap / tot); }

  flux[idx] = o;
}
