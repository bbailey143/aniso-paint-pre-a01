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
/**
 * Never let one face give away more than would drop this cell BELOW the
 * neighbour it is giving to. Crossing over inverts the slope and the pair then
 * push paint back and forth forever.
 *
 * This is all that is left of the old per-face `slump`. It used to decide the
 * AMOUNT as well, which is what locked the flow to the grid: each of the four
 * faces asked its own neighbour "am I taller than you by more than the yield?"
 * and answered yes or no on its own. A pile trying to run north-east could
 * only go north, then east, then north — and that staircase is exactly the
 * right-angled maze the artist photographed on 2026-08-24. How much moves is
 * now decided once, from the real direction of steepest descent; this only
 * stops it overshooting.
 */
fn face_cap(want: f32, hHere: f32, hThere: f32, bias: f32) -> f32 {
  return min(want, max(0.0, (hHere - hThere + bias) * 0.5));
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

/**
 * How wide a band the yield gate opens over, as a fraction of the yield.
 *
 * A hard threshold says every scrap of this paint gives way at exactly the same
 * steepness. Real paste does not: it is a suspension, and its yield is a spread
 * of values, so the shallow end of a pile creeps while the middle still holds.
 * A hard gate also freezes into connected threads — a cell tips, hands paint to
 * its neighbour, and both drop under the line, which leaves the thin filaments
 * running through the artist's photograph.
 *
 * [UNVERIFIED] Chosen, and the absolute floor below it likewise: with Body
 * turned nearly off the fraction alone would be far smaller than a cell's own
 * film height and the gate would be a hard line again.
 */
const YIELD_BAND: f32 = 0.35;
const YIELD_FLOOR: f32 = 0.002;

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
    /* A PASTE. It has no velocity field and reads none: `update_velocities` and
       the pressure relaxation are skipped outright for a yielding material (see
       fluid.ts), because a pile of paste is moved by its own steepness and by
       the brush, and by nothing else.

       Those two skipped passes are also what hides the grid for water. Water
       builds a flow direction and then smooths it; paste does neither, so
       whatever direction this pass picks is the only direction paint has, and
       for a long time that was one of four. A round pile slumped into a
       RECTANGLE with square corners — reproduced 2026-08-24 before this was
       changed, and visible across a whole painting the artist sent in as a
       right-angled circuit-board pattern.

       So the direction is taken once, from all eight neighbours, and the amount
       is split across the four faces this pass owns. The conservation
       bookkeeping is untouched: a cell still gives away exactly the sum of its
       own four faces and its four neighbours still receive exactly those, which
       is what flux_apply_water and flux_apply_pigment add up. */
    let g = P.gravityResponse * P.cosAlpha;
    let hR = height_at(r, n);
    let hL = height_at(l, n);
    let hD = height_at(dn, n);
    let hU = height_at(up, n);
    let hRU = height_at(vec2<i32>(c.x + 1, c.y - 1), n);
    let hLU = height_at(vec2<i32>(c.x - 1, c.y - 1), n);
    let hRD = height_at(vec2<i32>(c.x + 1, c.y + 1), n);
    let hLD = height_at(vec2<i32>(c.x - 1, c.y + 1), n);

    /* Which way the pile is actually steepest. Sobel over the 3x3, which for a
       straight ramp returns the same magnitude the old one-sided difference
       did — so Body still means what it meant and the dial does not have to be
       relearned. */
    let gx = ((hR - hL) * 2.0 + (hRU - hLU) + (hRD - hLD)) * 0.125;
    let gy = ((hD - hU) * 2.0 + (hRD - hRU) + (hLD - hLU)) * 0.125;

    // Downhill, with gravity as a body force rather than a per-face fudge.
    let fx = -gx + g * P.gravityX;
    let fy = -gy + g * P.gravityY;
    let slope = sqrt(fx * fx + fy * fy);

    let band = max(YIELD_FLOOR, P.yieldStress * YIELD_BAND);
    let over = slope - P.yieldStress;
    let open = smoothstep(-band, band, over);
    let give = min(h * 0.2,
                   max(over + band, 0.0) * P.dt * 0.5 / max(P.viscosity, 0.05))
               * CREEP * open;

    /* Split what it gives between the four faces it has, by direction. A pile
       running north-east now gives half north and half east in the same step,
       instead of stepping around the corner over two. */
    let inv = 1.0 / max(abs(fx) + abs(fy), 1.0e-6);
    o = vec4<f32>(
      face_cap(give * max( fx, 0.0) * inv, h, hR,  g * P.gravityX),
      face_cap(give * max(-fx, 0.0) * inv, h, hL, -g * P.gravityX),
      face_cap(give * max( fy, 0.0) * inv, h, hD,  g * P.gravityY),
      face_cap(give * max(-fy, 0.0) * inv, h, hU, -g * P.gravityY),
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
