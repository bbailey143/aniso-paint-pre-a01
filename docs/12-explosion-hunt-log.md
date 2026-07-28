# Explosion hunt — running work log

**Status: OPEN. Contained, not explained.**
Last updated: 2026-07-28. Branch `webgpu-test`.

---

## 0. How to use this file

This is an **append-only error-log book** for one specific unsolved fault. It is
written so that a person or model with **no prior context** can start work in about
ten minutes. If you are picking this up cold, read sections 1–7 in order, then go to
the end of section 9 and continue from the last entry.

**Rules for whoever continues it:**

- Add a new `### E<n>` entry for every experiment, even failed ones. Especially
  failed ones. Four confident diagnoses have already died on re-test in this project;
  the dead ends are the most valuable part of the record.
- Every entry must state **Purpose / Method / Raw result / What it proves / What it
  does NOT prove**. Do not skip the last one.
- **Reproduce any result on a second identical run before writing it down as fact.**
  This is a hard project rule (see `CLAUDE.md`). Mark single-run results `[1 RUN
  ONLY]`.
- Facts go in section 6, exclusions in section 7, guesses in section 8 **clearly
  labelled as guesses**. Never promote a guess to section 6 without a reproduced
  measurement.
- If you retract something, **leave the original text and strike it** — do not
  delete. The trail matters.

Terminology used across this project: `[UNVERIFIED]` = reasoned, not measured.
`[TRAP]` = already cost someone time. `D#` = a ratified decision, closed.

---

## 0b. START HERE — the next action

**Everything below is context. This is the job.**

E5 concluded that the fault is a transient garbage **read**, injected into the canvas
by the capillary diffusion term. Guarding every texture *write* did not work, for
exactly that reason. **So guard the READ.**

One line, in `src/engine/shaders/fluid/capillary_flow.wgsl`:

```wgsl
fn sat_at(c: vec2<i32>, n: i32, fallback: f32) -> f32 {
  if (oob(c, n)) { return fallback; }
  return sane(textureLoad(wet5_in, c, 0).x, WATER_LIM);   // <-- add sane()
}
```

`sane()` and `WATER_LIM` already exist in `common.wgsl` on the current tree
(section 10). The **baseline** worktree does not have them — copy the two helpers in,
or inline `if (!(v >= 0.0) || v > 1.0e4) { return fallback; }`.

**Test it on the BASELINE (port 5174), not the current tree** — the baseline fires
24/24, so a clean 16-session soak there is real evidence, whereas the current tree
fires 1-in-16 and would prove almost nothing. Use `window.__soak` from section 3.3.
Then port to the current tree and re-run the acceptance numbers in section 10.

**Expected outcome if the inference is right:** zero blowups on the baseline. If it
still fires, the inference is wrong — say so plainly, log it as E6-failed, and the
next suspect is H2 (ping-pong hazard) or H1 (hardware), tested by moving the deposit
into the same command encoder as the fluid passes.

**Do NOT "fix" this by lowering `KDIFF`.** E4 measured that it still fires five times
below the stability limit; lowering the coefficient only hides it.

---

## 1. The fault, in one paragraph

While painting normally, a **single cell** of the simulation grid intermittently
acquires an absurd value (~1e36 to 1e37, sometimes exactly `+Infinity`) in **one
frame**. The fluid solver then spreads that poisoned cell outward exactly as it
should, which the artist sees as **a dark blob that appears from nowhere and keeps
growing**, and as **spots of water that bloom outward as perfect circles**. The
conservation readout shows `pigment = Infinity` and/or `water = 1.7e37`, with
`wet cells = 262144` (every cell in the 512×512 grid flagged wet). It is not a
runaway that grows over time — the value **appears in a single frame and then sits
frozen**.

---

## 2. Why this matters more than anything else open

It is the only known fault that **destroys the artist's work**. Everything else open
on this branch is a limitation (weak re-wetting, unproven water conservation). This
one makes the tool untrustworthy. It must be closed before P8 polish.

---

## 3. Environment and exact reproduction

### 3.1 Machine
- Windows 11. GPU reported by the app HUD: **`amd / gcn-4`** (Polaris generation).
- **The GPU matters** — see hypothesis H1 in section 8. If you are on different
  hardware, say so in your log entries, because that alone may change the result.

### 3.2 Two builds, side by side

| build | commit | port | notes |
|---|---|---|---|
| current | `webgpu-test` HEAD | 5173 | has the `sane()` guards; fires ~1 in 16 |
| **baseline** | `4b1f747` (pre-Codex) | 5174 | **no guards; fires 24 out of 24** |

**Hunt on the BASELINE.** It reproduces on the first attempt every single time. The
current tree needs about three full painting sessions per occurrence, which is what
made every earlier attempt inconclusive.

Set the baseline up from scratch:

```bash
git worktree add "C:/Users/benja/AppData/Local/Temp/claude/baseline-4b1f747" 4b1f747
```

```powershell
New-Item -ItemType Junction -Path "C:\Users\benja\AppData\Local\Temp\claude\baseline-4b1f747\node_modules" -Target "C:\Users\benja\Documents\aniso-paint-pre-a01\.claude\worktrees\webgpu-test-477000\node_modules"
```

```bash
cd "C:/Users/benja/AppData/Local/Temp/claude/baseline-4b1f747" && npm.cmd run dev -- --host 127.0.0.1 --port 5174
```

Tear down with `git worktree remove <path>` when done. The worktree is disposable.

### 3.3 The reproduction recipe

26 strokes, mouse-style input, load 0.75. Paste this into the page console (or an
automation tool's JS-exec) with the app loaded:

```js
const e = window.__engine, s = window.__stroke;
const mk = () => ({ px:0, py:0, pointerType:'mouse', down:true, velocity:0,
                    pressure:0.65, tiltAngle:0, tiltAzimuth:0, twist:0 });
window.__session = async () => {
  e.clear();
  e.setMix(new Map([['ultramarine-blue', 1]]));
  s.charge(e.mixWeights, 0.75);          // BASELINE: 2 args. CURRENT tree: add a 3rd, 0.
  for (let i = 0; i < 26; i++) {
    const y = 120+(i*37)%280, x = 100+(i*53)%200;
    const x1 = x+220, y1 = y+((i%3)-1)*40, n = 60;
    s.begin(x, y, mk());
    for (let k = 1; k <= n; k++) {
      s.add(x+(x1-x)*k/n, y+(y1-y)*k/n, mk());
      const d = s.drain(); e.step(d.data, d.count);
    }
    s.end();
    for (let q = 0; q < 20; q++) { const d = s.drain(); e.step(d.data, d.count); }
  }
  return await e.sampleGauges();
};
```

A session is "blown up" if `pigment` or `water` is non-finite or `> 1e6`.
Normal values for this session: pigment ≈ 4180, water ≈ 3500, wetCells ≈ 115000.

---

## 4. Debug API (exposed by `src/main.ts` at the bottom)

```js
window.__engine    // CanvasEngine
window.__stroke    // StrokeEngine
window.__BRUSHES   // brush definitions array
```

| call | does |
|---|---|
| `e.clear()` | zero every field AND reset the pigment slot map |
| `e.setMix(new Map([['ultramarine-blue',1]]))` | set the palette mix (must be called after `clear()`, which wipes the slot map — **a very easy mistake, it silently gives you a colourless brush**) |
| `e.step(data, count)` | advance one frame with `count` stroke segments |
| `e.render()` | composite to the canvas |
| `await e.sampleGauges()` | force a fresh synchronous-ish gauge read (do NOT use `e.readings`, which can be many frames stale) |
| `await e.dump(name)` | read a whole texture back as `Float32Array`, RGBA per cell, row-major |
| `e.fluid.skip` | a `Set<string>` of pass names to disable — the bisect tool |
| `e.gpu.device` | the raw `GPUDevice`, for `pushErrorScope` / buffer readback |

`dump` names: `wet0 wet1 wet2 wet3 wet4 wet5 press dry1a dry1b dry2a dry2b`.
Cell `(x,y)` lives at float offset `(y*512 + x)*4 + channel`.

`skip` names, **in pass order within a frame**:
`deposit` is NOT skippable (it runs in its own encoder before the others), then
`vel`, `relax`, `outward`, `fluxCompute`, `fluxPig`, `fluxWater`, `transfer`,
`capillary`, `rewet`, `dry`, `handoff`.

---

## 5. Canvas data layout (what each channel means)

| texture | .x | .y | .z | .w |
|---|---|---|---|---|
| `wet0` | `M` wet flag (0/1) | `h_f` standing film | `u` velocity | `v` velocity |
| `wet1` | suspended pigment `g`, slots 0–3 | | | |
| `wet2` | suspended pigment `g`, slots 4–7 | | | |
| `wet3` | settled pigment `d`, slots 0–3 | | | |
| `wet4` | settled pigment `d`, slots 4–7 | | | |
| `wet5` | `s` paper saturation | `w` wetness continuum | `h_p` body | `justDried` flag |
| `press` | relaxation pressure / outward bias | | | |
| `dry1a/b` | re-wettable dried layer, slots 0–3 / 4–7 | | | |
| `dry2a/b` | permanent floor, slots 0–3 / 4–7 | | | |

Gauge lanes (see `reduce.wgsl`): `0` film, `1` saturation, `2..9` per-slot pigment
(g+d+dry1+dry2), `10` body, `11` wet cell count, `12` total |divergence|,
`13` wet-band pigment, `14` dry-band pigment.

All wet-band textures are **rgba32float** (D6 — half-float lost 6.5% of pigment per
200 frames). The dry-media ink band is rgba16float at 2048² and is a separate ledger.

---

## 6. ESTABLISHED — reproduced, safe to build on

1. **It is exactly one cell.** Dumping all eleven textures at the moment the meter
   blows finds one cell with a huge value; everything else is pristine. Observed
   cells: `wet1[209,100].0` (twice), `wet1[169,276].0`, `wet1[233,212].0`,
   `wet0[361,212].0` (= exactly `+Infinity`), `wet5[137,180].0`. **The cell moves**
   between runs — it is not a fixed address.
2. **It arrives in ONE frame.** Sampling every frame, the pigment total went
   `677.49 → 3.9211e37` between consecutive frames. Watched for 14 frames afterward:
   ratio `1.0000` every frame, no growth. It appears; it does not accumulate.
3. **The solver then spreads it, correctly.** That is the blob and the circles. The
   physics is behaving properly on a poisoned input.
4. **Non-deterministic on the current tree.** Identical run, identical parameters,
   identical stroke sequence: blew up once, clean the next time. Adding a full GPU
   sync every frame makes it markedly rarer.
5. ~~**It is NOT the arithmetic of the fluid passes.** With every pass in `skip`
   (only the brush deposit running) it still fires.~~ **RETRACTED at E2.** On the
   baseline the explosion happens during IDLE frames with no deposit at all, which
   points squarely AT the fluid passes. The original observation was made on the
   guarded current tree at a 1-in-3 rate and was probably a coincidence of timing.
   Re-run it on the baseline before trusting it. (The sub-finding that the CPU-side
   stroke segments were all finite and small at the firing instant still stands.)
5b. **It fires during idle frames, brush off the paper** (E2): saturation healthy at
   0.0896 at the end of a stroke, 5.2e35 twenty frames later. ~x65 per frame.
5c. **It is the paper saturation field `s` (`wet5.x`) that goes first** (E1): 738 bad
   cells, all in that one channel, in a coherent block pinned to the canvas edge,
   while pigment was still perfectly healthy at 845.6.
6. **It requires painting.** 4800 frames of the full solver on a cleared, empty sheet
   produced **zero** spontaneous non-zero cells. So it is not idle memory decay.
7. **It predates the Codex session.** See E0 below. Baseline `4b1f747`: **24/24**.
8. **Bit patterns cluster just under overflow**, all positive:
   `0x7de87df5`, `0x7de87c32`, `0x7e325c65`, `0x7e438bc1`, and once exactly
   `0x7f800000` (+Inf). Uniformly random bits would scatter across exponents and
   signs and would be negative half the time. **They are not.**
5d. **It enters through the capillary DIFFUSION term** (E3): `cosAlpha = 0` disables
   `ddiff` alone and the fault vanishes completely. Absorption and evaporation are
   measured-excluded.
5e. **The diffusion is NOT unstable and NOT mis-tuned** (E4, E5): it still fires at
   `k = 0.045`, five times below the textbook limit, and after the event the total of
   `s` is frozen to eight significant figures for 20 frames while the peak decays.
   The scheme conserves correctly. The total jumps ONCE and never moves again.
5f. **`[INFERENCE — strong]` A `textureLoad` of `wet5_in` in `capillary_flow.wgsl`
   occasionally returns garbage (~1e35).** The diffusion is the INJECTOR, not the
   disease. This is the only way `ddiff` can deliver 4.6e34 when the whole grid's
   maximum one stroke earlier was 0.0774. **It is why guarding every write failed:
   the bad value is never written.**
9. **Containment works and costs the painting nothing.** `sane()` in `common.wgsl`
   (see section 10) took pigment blowups to zero and total blowups from 4/14 to 1/16.
   Physics after guards: wash laid `165.5792`, settled `165.5792` (drift `4.6e-5`);
   drying handoff moved all `165.5792` wet→dry exactly; ink held `2871.05` through a
   glaze. Identical to pre-guard numbers.

---

## 7. EXCLUDED — do not spend time here again

| ruled out | how |
|---|---|
| Codex's ink band / water charge / tilt picker | baseline `4b1f747` fires 24/24 (E0) |
| The new water-charge slider specifically | fires identically at `waterCharge = 0` |
| ~~Fluid-pass arithmetic~~ | **RETRACTED at E2.** Narrowed at E3 to the capillary diffusion term specifically. |
| Capillary **absorption** (`take`) | E3: `cosAlpha=0` leaves it fully active, fault gone |
| Evaporation / `dry_tick` | E3: skipping it does not help |
| `KDIFF` being mis-tuned / too close to the 0.25 limit | E4: still fires at k=0.045. **Do not "fix" this by lowering KDIFF.** |
| The diffusion being numerically unstable | E5: total frozen to 8 s.f. for 20 frames post-event; peak decays. It conserves. |
| Guarding texture WRITES as a cure | E5: the bad value is never written — it is transient on a read |
| Bad CPU-side stroke segments | scanned at the firing instant, all finite and small |
| Idle VRAM decay | 4800 idle frames on an empty sheet, zero events |
| A slow numerical runaway | value appears in one frame, then frozen for 14 frames |
| A fixed bad memory address | the cell moves between runs |
| `reduce.wgsl` workgroup barriers | inspected; barrier discipline is correct |
| The gauge lying (as the whole story) | textures independently dumped and confirmed corrupt; CPU re-sum of the texture agreed with the gauge to 4 digits |

---

## 8. HYPOTHESES — unproven, labelled as such

**H1 `[GUESS — NOT TESTED]` Driver or hardware, below our code.** The identical
symptom is on the record from the **Rust/wgpu bench on the `main` branch**, quoted in
the header of `zero_fill.wgsl`: *"a nondeterministic 1e37 in the water field that
survived several rounds of analysis as a phantom instability"*. Different host
language, different codebase, **same GPU**. Supporting: after guarding *every* write
of *every* accumulating field, a bad value still appeared in a field whose every
writer is guarded — meaning it did not enter through any store this code owns.
**Test that would settle it: run section 3.3 on a different GPU.** If clean there,
this is the machine and `sane()` is the correct permanent answer.

**H1b `[GUESS — NOT TESTED]` The bad read is a cache/compression-metadata artefact.**
AMD GCN uses delta colour compression and metadata for render/storage targets. A
mis-synchronised decompress would return plausible-looking garbage on a read while
leaving the stored bytes intact — which fits every observation, including the fact
that guarding writes changed nothing and that an empty sheet never fires (no
meaningful data has been written to compress).

**H2 `[GUESS — NOT TESTED]` A read/write hazard around the ping-pong flip.** The
brush deposit is submitted in its **own command encoder per chunk**, and the CPU
flips the ping-pong index immediately after `queue.submit()`, before the main fluid
encoder is even built (`fluid.ts`, `step()`). This is believed legal, but it is the
one structural oddity that only occurs while painting — which matches fact 6 exactly
(the fault needs the brush). Worth testing by recording the deposit into the same
encoder as the fluid passes and re-running the soak.

**H3 `[GUESS — NOT TESTED]` Something specific to `rgba32float` storage textures on
this driver.** The wet band is 32-bit float storage (D6). The ink band is 16-bit and
has never been observed to corrupt. Not investigated at all.

---

## 9. Experiment log

### E0 — Is it Codex's change? (2026-07-28)

**Purpose.** The artist's hypothesis was that the fault was introduced by the Codex
session (fine ink band, water-charge slider, tilt picker, gauge relocation). If true,
the fix is a revert and the hunt is over.

**Method.** Checked out `4b1f747` — the last commit before Codex touched anything —
into a throwaway worktree, junctioned `node_modules`, ran a second dev server on
5174, and ran the **identical** session from section 3.3 against both builds. The
baseline predates the 3-arg `charge()` and the ink lane, verified in-page before
running (`s.charge.length === 2`, `'inkPigment' in e.readings === false`).

**Raw result.**

| build | blowups | worst value |
|---|---|---|
| `4b1f747` pre-Codex, run 1 | **16 / 16** (first attempt every time) | `Infinity` (water AND pigment) |
| `4b1f747` pre-Codex, run 2 (confirm) | **8 / 8** | `Infinity` |
| post-Codex, before guards | 4 / 14 | `4.145e37` |
| post-Codex, with guards | 1 / 16 | `2.736e37` |

**What it proves.** The fault is **older than the ink band, the water charge and the
tilt picker**. Codex did not cause it; that build fires it *less* often. Retract the
"it must be Codex" hypothesis.

**What it does NOT prove.** It does not say what the cause *is*, and it does not
prove Codex's changes are unrelated to the *rate* — the rate difference (4/14 vs
16/16) is unexplained and could be a timing side effect of the extra per-frame ink
work rather than anything meaningful.

**Bonus finding, and the reason to keep the baseline alive:** the old build is a
**deterministic reproduction**. That is worth more than a tidy tree. Hunt there.

**Aside, `[REASONING, not measured]`** — why the artist only noticed it now: the same
Codex session moved the conservation panel from behind the palette to the lower left.
The fault did not arrive; the instrument did.

---

### E1 — Where does it land on the baseline? (2026-07-28)

**Purpose.** On the current tree the fault always presented as ONE cell. Before
hunting a mechanism, establish what it actually looks like on the deterministic
baseline, where it fires every time.

**Method.** Ran the section 3.3 session on `4b1f747` (port 5174). Sampled the gauge
once per stroke — coarse on purpose, see gotcha 8. On the first stroke that tripped,
dumped **all eleven textures** and listed every cell that was non-finite or > 1e6.

**Raw result.** First bad stroke: **4** (0-indexed). Gauge trail:

| stroke | pigment | water | wet cells |
|---|---|---|---|
| 0 | 169.526 | 127.144 | 4535 |
| 1 | 337.784 | 253.338 | 11000 |
| 2 | 507.838 | 380.879 | 18748 |
| 3 | 677.395 | 508.046 | 26025 |
| **4** | 845.636 (healthy!) | **3.22e16** | 35704 |

**738 bad cells. Every single one in `wet5` channel 0 — the paper saturation `s`.**
No other texture, no other channel. Confined to a near-solid rectangle
**x 94–132 (39 columns) × y 0–23 (24 rows)**, hard against the **top edge** of the
canvas. Values ramp smoothly along x: 1.80e6, 1.50e7, 1.06e8, 6.50e8, 3.46e9 —
roughly ×6–7 per cell. Max 5.13e14, median 1.19e11.

**What it proves.**
- On the baseline this is **not** a single random cell. It is a **coherent, spatially
  smooth, exponentially ramped block** in ONE field (`s`), pinned to a boundary.
  That is the signature of a **numerical instability**, not memory corruption.
- Pigment was still perfectly healthy (845.6) at the moment water had already reached
  3.2e16. **Water/saturation goes first.** The pigment blowups seen on the current
  tree are downstream.
- The trigger stroke was at y=268; the damage is at y=0–23. **It is nowhere near the
  brush.**

**What it does NOT prove.** It does not show where the block STARTED — the dump is
after the stroke plus 20 idle frames, so this is the state after it had time to
spread. E2 answers that. It also does not yet reconcile with the earlier
current-tree observation that the fault fired with every fluid pass in `skip` (only
the deposit running); that observation is now **suspect** and should be re-run on the
baseline before being trusted.

---

### E2 — When does it start? (2026-07-28)

**Purpose.** E1 showed the aftermath. Find the moment of onset, and whether it grows
or appears.

**Method.** Same session on the baseline, but dump `wet5` and report the peak
saturation and its location **twice per stroke** — immediately after the stroke ends,
and again after the 20 idle settle frames. Normal per-cell `s` is bounded by the
paper's capacity and runs < 1, so cells over 2 are already wrong and are counted.

**Raw result.**

| stroke | peak `s` after stroke | cells>2 | peak `s` after 20 idle frames | cells>2 |
|---|---|---|---|---|
| 0 | 0.09062 | 0 | 0.077316 | 0 |
| 1 | 0.090165 | 0 | 0.076905 | 0 |
| 2 | 0.091188 | 0 | 0.077782 | 0 |
| 3 | 0.09088 | 0 | 0.077524 | 0 |
| **4** | **0.089571** | **0** | **5.2061e+35 at (273,228)** | **545** |

**What it proves. This is the most important entry in the log so far.**
- The field is **completely healthy at the end of stroke 4** (0.0896, zero bad cells)
  and is at 5.2e35 twenty frames later. **The explosion happens during IDLE frames,
  with the brush off the paper and no segments being deposited.**
- Growth is ~1e36 over 20 frames ≈ **×65 per frame**. Violent, and exponential.
- Therefore it is **NOT the brush deposit**, and not any stroke input.
- Peak sits at (273,228) here vs the x94–132/y0–23 block in E1, i.e. the location
  differs between the onset frame and the aftermath — consistent with something that
  starts somewhere and floods outward.

**What it does NOT prove.** It does not identify the pass. E3 bisects that. Note the
direct contradiction with the earlier current-tree claim that it fires with all
passes skipped — **that claim is now formally in doubt** and is flagged in section 7.

**Consequence for section 6:** fact 5 ("it is not the arithmetic of the fluid
passes") is RETRACTED as of E2 — see the strike in section 6.

### E3 — Which pass? The `cosAlpha` discriminator (2026-07-28)

**Purpose.** E2 put the onset inside the fluid passes. Identify which one.

**Method.** Baseline, 8-stroke session, one condition at a time. The key trick:
`P.cosAlpha` appears in **exactly one line of one shader** — verified by grep —
`capillary_flow.wgsl:36`, `let k = KDIFF * P.cosAlpha;`. So `cosAlpha = 0` switches
OFF the capillary **diffusion** term while leaving the **absorption** term (`take`)
fully intact. That separates the two halves of the pass, which skipping the whole
pass cannot do.

**Raw result.**

| condition | outcome |
|---|---|
| control | blew up at stroke 4, peak `1.987e35`, 4705 cells over 2 |
| **`cosAlpha = 0` (diffusion off, absorption on)** | **no blowup.** peak `s` = 0.34714, **0** cells over 2 |
| skip `capillary` entirely | no blowup, but peak `s` = 0 (absorption gone too — uninformative alone) |
| skip `dry` (evaporation) | blew up at stroke 6, peak `1.038e33` |

**What it proves.** The explosion enters through the capillary **diffusion** term
`ddiff` — not absorption, not evaporation. The absorption path is now *measured*
excluded, not merely argued.

**What it does NOT prove.** Not why `ddiff` misbehaves. The scheme is a standard
4-neighbour explicit Laplacian that should be stable at this coefficient.

---

### E4 — Is the coefficient simply too big? (2026-07-28)

**Purpose.** `capillary_flow.wgsl` says `KDIFF = 0.18 // must stay under 0.25`, the
textbook stability limit. Test whether this is just a stability-margin problem, which
would make the fix "lower KDIFF".

**Method.** `cosAlpha` is a clean multiplier on `k` (`k = 0.18 x cosAlpha`). Sweep it,
10 strokes per setting, on the baseline.

**Raw result.**

| cosAlpha | effective k | outcome |
|---|---|---|
| 1.0 | 0.18 | blew at stroke 6 |
| 0.75 | 0.135 | blew at stroke 6 |
| 0.5 | 0.09 | blew at stroke 6 |
| 0.25 | 0.045 | blew at stroke 5 |
| 0.1 | 0.018 | **no blowup**, peak `s` 0.20537, 0 cells over 2 |

**What it proves. It is NOT a stability-margin problem.** It still explodes at
`k = 0.045`, five times below the 0.25 limit, where this scheme is extremely stable.
There is no threshold anywhere near 0.25 and the onset stroke barely moves across a
4x range of k. **Lowering `KDIFF` is not the fix** — it would make the fault rarer
while appearing to solve it. Do not take that shortcut.

**What it does NOT prove.** k clearly still scales the damage (0.018 survived 10
strokes). A clue, not a cure — see E5.

---

### E5 — Is the diffusion actually unstable? Conservation of `s` (2026-07-28)

**Purpose.** The decisive question. This Laplacian is **antisymmetric**: what one cell
gains across an edge its neighbour loses. So the TOTAL of `s` can only change by
absorption from the film. If the total grows while the film is empty, the exchange is
not antisymmetric in practice.

**Method.** Baseline session. At the end of each stroke and every 4 idle frames, dump
`wet5` and `wet0`; compute `sum(s)`, `sum(film)`, `max(s)`.

**Raw result — stroke 3, healthy, and this is what correct looks like:**

| idle frame | sum(s) | sum(film) | max(s) |
|---|---|---|---|
| 0 | 505.5508 | 2.48662 | 0.0907034 |
| 4 | 507.59354 | 0.443877 | 0.0875182 |
| 8 | 507.95818 | 0.0792348 | 0.0846074 |
| 12 | 508.02327 | 0.0141439 | 0.0820264 |
| 16 | 508.03489 | 0.00252478 | 0.0796315 |
| 20 | 508.03697 | 0.000450688 | 0.0774020 |

Film drains into saturation, the sum rises by exactly what the film lost, the peak
decays as diffusion spreads it. Textbook.

**Stroke 4, same measurement:**

| idle frame | sum(s) | sum(film) | max(s) |
|---|---|---|---|
| 0 | **4.5975403e+34** | 2.49053 | 5.31971e+33 |
| 4 | 4.5975403e+34 | 0.444575 | 1.57841e+33 |
| 8 | 4.5975403e+34 | 0.0793594 | 9.03013e+32 |
| 12 | 4.5975403e+34 | 0.0141664 | 6.31433e+32 |
| 16 | 4.5975403e+34 | 0.00278171 | 4.90710e+32 |
| 20 | 4.5975402e+34 | 0.00104172 | 4.21357e+32 |

**What it proves — the central finding of the hunt.**

1. **The diffusion is NOT unstable.** After the event the total is frozen to eight
   significant figures across 20 frames and the peak *decays* by an order of
   magnitude as it spreads. The scheme conserves and behaves exactly as designed.
2. **The total JUMPS ONCE**, ~508 to 4.6e34, then never moves. Matches the
   current-tree "one frame, then frozen" observation (fact 2): same fault, new angle.
3. With E3 (`k = 0` prevents it; absorption excluded), the injection must arrive
   through `ddiff = k * ((sl-s) + (sr-s) + (su-s) + (sd-s))`. For that to deliver
   4.6e34 at `k = 0.18`, one of the four neighbour reads **must have returned roughly
   1e35**.
4. **No such value existed in the field.** The previous stroke ended with
   `max(s) = 0.0774` across the entire grid.

**`[INFERENCE — strong, not directly observed]` A `textureLoad` of `wet5_in` in the
capillary pass occasionally returns garbage. The diffusion term is not the disease;
it is the INJECTOR** — it multiplies a transient bad read straight into a legitimate
result, and the solver then spreads it faithfully.

**This resolves the biggest puzzle in the hunt.** Guarding every *write* of every
accumulating field (section 10) did not stop it because **the bad value is never
written**. It appears on a read, is consumed inside one expression, and vanishes.
Nothing downstream can ever see it.

**What it does NOT prove.** The bad read has not been caught in the act. Sampling is
at stroke boundaries and every 4 idle frames, so the exact frame inside stroke 4 is
not pinned, and progressive growth *during* a stroke is not formally excluded (though
the frozen idle total argues strongly against it). It does not say *why* the read
fails: driver, cache/DCC metadata, or a hazard around the ping-pong.

**Timing varies between runs:** E2 saw the field healthy at the end of stroke 4 and
blown 20 idle frames later; E5 saw it already blown at the end of stroke 4. Both at
stroke 4. Consistent with a discrete random event, not deterministic growth.

<!-- APPEND NEW ENTRIES BELOW THIS LINE -->

---

## 10. Reference: the containment already in place

`sane(v, lim)` and `sane4(v, lim)` in `src/engine/shaders/fluid/common.wgsl`, with
`PIG_LIM = 1.0e4` and `WATER_LIM = 1.0e4`. They reject NaN (via `!(v >= 0.0)`,
which is true for NaN because every comparison against NaN is false), negatives, and
anything past the ceiling — returning `0.0`.

Applied in: `deposit`, `flux_apply_pigment`, `flux_apply_water`, `transfer_pigment`,
`capillary_flow`, `rewet`, `dry_tick`, `dry_store`, `bake_push`, `wet_clear`,
`update_velocities`, `relax_divergence`.

Ceilings are six orders of magnitude above any real value (a cell holds pigment ≲ 1
per slot; TransferPigment already clamps to 1.0), so this cannot distort painting.

**This is containment, not a cure. Do not close the fault on the strength of it.**

---

## 11. Gotchas that will waste your time

1. **`layout: 'auto'` drops a binding the shader does not statically use.** Binding
   it anyway is a validation error → the bind group is invalid → **the whole command
   encoder is discarded silently**. This has bitten this project **three times**
   (`reduce_final` returning zeros; the ink zero-fill killing every wet clear). If
   you build a shader variant by string-replacing source, re-check that every
   declared binding is still used. Sweep command:
   parse each `@group(0) @binding(N) var NAME`, strip comments, confirm `NAME`
   appears elsewhere in the file.
2. **WGSL errors do not appear at build time.** `npm run build` runs `tsc --noEmit &&
   vite build` and never compiles WGSL. Shader errors surface at runtime, when the
   pipeline is created. Always load the page after a shader edit.
3. **Editing any source file triggers Vite HMR and reloads the page**, destroying any
   `window.__*` experiment state and killing long-running async probes. Finish an
   experiment before editing.
4. **Long experiments must be backgrounded.** Browser JS-exec tooling typically times
   out at 30s. Pattern:
   `window.__x().then(r => { window.__xR = r; })` then poll `window.__xR`.
5. **`e.clear()` also wipes the pigment slot map.** Always `e.setMix(...)` and
   re-`charge` the brush *after* clearing, or you will paint with a colourless brush
   and measure zero pigment while believing the engine is broken.
6. **Use `await e.sampleGauges()`, never `e.readings`.** The latter comes from a
   frame-skipping async readback and can describe a state many frames old.
7. **The browser pane may not be compositing**, in which case screenshots fail and
   `createImageBitmap(canvas)` returns black. The numeric gauges and `e.dump()` still
   work fine — prefer them for measurement anyway.
8. **A per-frame GPU sync suppresses this fault.** Any probe that awaits every frame
   will make it much rarer or invisible. Sample coarsely (once per stroke), then
   narrow only after you have a hit.
