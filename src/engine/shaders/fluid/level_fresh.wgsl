// Fresh-paint levelling, for pastes — the second half of the deposit.
//
// WHY THIS IS ITS OWN PASS.
//
// A loaded brush lays a COMB: each hair puts down its own ridge and the gaps
// between them stay empty. Left alone a paste would keep that comb, because a
// paste has no flow to settle it — so paint under the hairs is squeezed flat as
// it is laid, and what is left of the yield stress is what the hairs have not
// already overcome. That much is unchanged; it is the artist's 2026-08-24 note
// and it is why fresh oil reads as a coherent band with gentle striation rather
// than a row of spikes.
//
// It used to run INSIDE `deposit.wgsl`, and there it could not be right. To
// level a ridge you compare your height with your neighbour's. Inside the
// deposit pass a cell knows its own new height but reads its neighbours out of
// `wet0_in`, which that pass has not written yet — so every cell compared its
// post-deposit self against pre-deposit neighbours. In the middle of a stroke
// that says "I tower over bare canvas" when in truth the neighbour was being
// painted in the same instant, and HOW WRONG it is depends on how much paint
// the frame was carrying. Bundle four stylus reports into a frame and the error
// is four reports tall; bundle one and it is a quarter of that. The result was
// one scale per frame with a wavelength of exactly the frame's travel.
//
// [MEASURED, docs/19 E6/E7] Oil / Flat Hog / Flat White, stored edge ripple:
// switching the old block off gave 0.04277 -> 0.00312, which is the CPU
// footprint's own figure, with the repeat falling from 16 cells to 2. Capping
// the amount by total film rather than by the frame's deposit did NOT fix it
// (0.03987, repeat 32), so the stale neighbour was the fault and not the budget.
//
// Running after the deposit, both sides of every comparison are post-deposit.
// Frame packaging becomes invisible, which is what invariant 2 requires.
//
// WHAT IT MAY MOVE is still `laid * 0.8` — only the paint that just arrived;
// everything under it has set as far as this pass is concerned. That budget is
// deliberately kept: summed over a stroke it is proportional to the paint laid,
// so it is the SAME total however the stroke is cut into frames. Rate-limiting
// by dt alone would not be — a stroke in twice as many frames would get twice
// as many levelling passes.

struct Ctl {
  count: f32,
  minX: f32, minY: f32, maxX: f32, maxY: f32,
  travelX: f32, travelY: f32,
  smear: f32,
  upRate: f32,
  brushTake: f32, brushGrab: f32,
  /** Levelling sweeps this chunk is being given — one per brush solve step,
   *  capped on the CPU. The budget below is divided by it. */
  sweeps: f32,
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
/** (what this frame laid here, how hard the hairs pressed) from deposit.wgsl. */
@group(0) @binding(2) var<uniform> C: Ctl;
/** (what this frame laid here, how hard the hairs pressed) from deposit.wgsl. */
@group(0) @binding(3) var<storage, read> fresh: array<vec2<f32>>;
/** The same outflow ledger the deposit wrote its shove into. Added to, not
 *  replaced: the shove and the levelling both leave the same cell, and the one
 *  ceiling below is applied over their sum. */
@group(0) @binding(4) var<storage, read_write> flux: array<vec4<f32>>;

/** A neighbour's film height, AFTER the deposit. Off the sheet reads as
 *  nothing there, which is correct: paint does level off the edge. */
fn filmAt(c: vec2<i32>, n: i32) -> f32 {
  if (oob(c, n)) { return 0.0; }
  return textureLoad(wet0_in, c, 0).y;
}

/** Identical to the function that used to live in deposit.wgsl. */
fn levelOut(here: f32, there: f32, yieldHere: f32) -> f32 {
  let excess = (here - there) - yieldHere;
  if (excess <= 0.0) { return 0.0; }
  return min(here * 0.2, excess * P.dt * 0.5 / max(P.viscosity, 0.05));
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }
  let idx = u32(c.y * n + c.x);

  // Water media level through the fluid passes instead; running this for them
  // as well would be levelling the same paint twice.
  if (P.yieldStress <= 0.0) { return; }

  let f = fresh[idx];
  let laid = f.x;
  let press = f.y;
  if (laid <= 0.0 || press <= 0.0) { return; }

  let w0 = textureLoad(wet0_in, c, 0);
  // The surface it levels ACROSS is the whole film — a ridge is a ridge
  // whenever it was laid — and it is now the film this frame's deposit
  // actually produced, on both sides of every comparison.
  let top = w0.y;
  let yieldHere = P.yieldStress * clamp(1.0 - press, 0.0, 1.0);
  var lvl = vec4<f32>(
    levelOut(top, filmAt(vec2<i32>(c.x + 1, c.y), n), yieldHere),
    levelOut(top, filmAt(vec2<i32>(c.x - 1, c.y), n), yieldHere),
    levelOut(top, filmAt(vec2<i32>(c.x, c.y + 1), n), yieldHere),
    levelOut(top, filmAt(vec2<i32>(c.x, c.y - 1), n), yieldHere),
  );
  let asks = lvl.x + lvl.y + lvl.z + lvl.w;
  /* Divided across the sweeps this chunk gets, so the TOTAL paint the levelling
     may move over a stroke is the same however the stroke was cut into frames.
     Sixteen cells of travel in one frame now get the same total levelling as
     sixteen frames of one cell — which is what a slow stroke was already
     getting, and why slow strokes came out visibly cleaner. */
  let flowing = laid * 0.8 / max(C.sweeps, 1.0);
  if (asks > flowing && asks > 0.0) { lvl = lvl * (flowing / asks); }

  /* One ceiling over the shove and the levelling together, because both come
     out of the same cell and the appliers subtract the sum from what is there.
     More than the cell holds would be paint invented from nothing. */
  var tot = flux[idx] + lvl;
  let asked = tot.x + tot.y + tot.z + tot.w;
  let room = w0.y * 0.9;
  if (asked > room && asked > 0.0) { tot = tot * (room / asked); }
  if (c.x >= n - 1) { tot.x = 0.0; }
  if (c.x <= 0)     { tot.y = 0.0; }
  if (c.y >= n - 1) { tot.z = 0.0; }
  if (c.y <= 0)     { tot.w = 0.0; }
  flux[idx] = tot;
}
