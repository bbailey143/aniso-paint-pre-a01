// E19 — the brush's shove, moved once per BRUSH SOLVE STEP instead of once per
// browser frame.
//
// The deposit pass works out how much of a cell's film the tuft has taken hold
// of and which way it is being pushed. Both of those are already per-distance:
// the fraction compounds over the step's travel. But the transport was not.
// `deposit.wgsl` wrote a single four-face give-ledger and it was applied ONCE a
// frame, so the paint landed one cell away however far the brush had actually
// travelled — and a brush is only over a given cell for two or three frames, so
// paint moved two or three cells and no dial could change it.
//
// That is a per-frame quantity where a per-distance one belongs:
// `00-invariants.md` §2, and the same shape that cost `19` a week on the fish
// scales. `level_fresh.wgsl` already fixed the identical fault for levelling and
// wrote down the rule this pass follows: "it must run once per BRUSH SOLVE STEP,
// not once per browser frame... so the sweep count follows the paint, and the
// per-sweep budget is divided by it, leaving the TOTAL paint moved identical
// however the stroke is cut into frames."
//
// So: the host runs this once per solve step, and the per-sweep fraction is
// sized so the TOTAL taken from the source cell is unchanged. Distance scales
// with travel; amount does not.
//
//   f_sweep = 1 - (1 - f_total)^(1/sweeps)
//
// which is `deposit.wgsl`'s own idiom for compounding a rate over distance
// (`upBoth = 1 - pow(1 - r, dist)`) read backwards.
//
// With `sweeps` = 1 this reduces to `f_sweep = f_total` and the pass writes
// exactly the ledger the deposit used to write, so every water medium — which
// takes one sweep — is untouched.

/* The shared control block. Declared per shader, in lane order, listing only
   what this pass reads — the same convention `level_fresh.wgsl` follows. */
struct Ctl {
  count: f32,
  minX: f32, minY: f32, maxX: f32, maxY: f32,
  travelX: f32, travelY: f32,
  smear: f32,
  upRate: f32,
  brushTake: f32, brushGrab: f32,
  sweeps: f32,
  share: f32,
  /** Smear sweeps this chunk is being given — one per brush solve step, capped
   *  on the CPU. The per-sweep fraction below is divided out of it, so the
   *  amount that leaves a cell is the same however the stroke is cut up. */
  smearSweeps: f32,
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var wet0_in: texture_2d<f32>;
/** Per cell, what the deposit worked out: (dirX, dirY, total fraction, unused).
 *  The direction is a unit vector; the fraction is of the film present. */
@group(0) @binding(2) var<storage, read> drag: array<vec4<f32>>;
@group(0) @binding(3) var<uniform> C: Ctl;
@group(0) @binding(4) var<storage, read_write> flux: array<vec4<f32>>;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = i32(P.grid);
  let c = vec2<i32>(i32(gid.x), i32(gid.y));
  if (oob(c, n)) { return; }
  let idx = u32(c.y * n + c.x);

  let d = drag[idx];
  let dir = d.xy;
  let total = clamp(d.z, 0.0, 1.0);
  let len = length(dir);
  if (len <= 1.0e-6 || total <= 0.0) { flux[idx] = vec4<f32>(0.0); return; }

  // Split the total across the sweeps so the amount that leaves this cell is
  // the same however many frames the stroke was cut into. `sweeps` is at least
  // 1, and at 1 this is the identity.
  let sweeps = max(C.smearSweeps, 1.0);
  let f = 1.0 - pow(1.0 - total, 1.0 / sweeps);

  let film = max(textureLoad(wet0_in, c, 0).y, 0.0);
  let carried = min(f * film, film * 0.9);

  let u = dir / len;
  // The parts sum to exactly `carried`, so the split cannot invent or lose
  // paint — the same construction the deposit used.
  let w = abs(u.x) + abs(u.y);
  var out = vec4<f32>(
    max(u.x, 0.0), max(-u.x, 0.0), max(u.y, 0.0), max(-u.y, 0.0),
  ) * (carried / max(w, 1.0e-6));

  // Never promise more than is here, and never off the edge of the sheet.
  let asked = out.x + out.y + out.z + out.w;
  let room = film * 0.9;
  if (asked > room && asked > 0.0) { out = out * (room / asked); }
  if (c.x >= n - 1) { out.x = 0.0; }
  if (c.x <= 0)     { out.y = 0.0; }
  if (c.y >= n - 1) { out.z = 0.0; }
  if (c.y <= 0)     { out.w = 0.0; }

  flux[idx] = out;
}
