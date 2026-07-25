# Feasibility bench — results

Hardware: **Radeon RX 570** (Polaris, 4 GB), Vulkan, Windows. Deliberately a
modest card — roughly iPad-class, and well below the RTX 3080 Ti laptop A26's
published timings came from. Conservative against the real target.

Scope: the wet band only. No brush, no render, no dry/bake pipeline. Bots paint
for 240 frames to build a live wet canvas, then lift off; every gauge is read
with hands off and evaporation at zero, where the numbers must hold flat.

---

## Headline

**Performance: PASS, with room to spare.**

| configuration | frame | relax iterations |
|---|---|---|
| C97's full 50 iterations | 10.09 ms | 50 |
| **adaptive iteration count** | **3.78 ms** | **2** |
| budget | 16.70 ms | |

**Conservation: the flux algebra is exact. The dynamics are not yet stable.**
That second half is the real result of this bench, and it changes the
recommendation I would have given after the first run.

---

## 1. Adaptive relaxation — 10.09 ms to 3.78 ms

Relaxation was 71 % of the frame. C97 specifies *up to* 50 iterations with an
early exit once divergence falls under τ = 0.01; the first bench always ran the
full count.

A true within-frame early exit needs an indirect dispatch driven by a GPU-side
reduction. Instead the bench now measures the divergence residual each frame and
sizes the next frame's count from it. The field is continuous between frames, so
a one-frame lag costs nothing — and unlike a fixed count it responds when the
artist floods the sheet.

Result: the controller settles at **2 iterations**, and the residual stays at
0.0013 against a τ of 0.01 — comfortably converged. Fifty iterations were buying
nothing in this regime.

| relax iterations | frame (ms) |
|---|---|
| 50 | 10.09 |
| 20 | 6.98 |
| 10 | 5.28 |
| adaptive (settles at 2) | **3.78** |

`[CAVEAT]` The synthetic bots deposit gently over a 14-cell radius. A real brush
slamming water onto dry paper injects far sharper divergence, and the controller
should climb in response. That is what it is built to do, but it has not been
tested against a load that actually demands high iteration counts. **Re-measure
when the brush engine lands.**

Separately, splitting the pressure field out of the relaxation pass (see §3)
removed a whole texture write from the hot loop — that alone took the fixed-50
case from 12.43 ms to 10.09 ms.

---

## 2. `[FOUND AND FIXED]` Capillary diffusion was asymmetric

The first run lost **12.3 % of its water in fifty frames** with nobody painting.

`capillary_flow` absorbed film into saturation and *then* diffused, so each cell
diffused using its own post-absorption value while its neighbours still read
pre-absorption values from the input texture. The exchange across a cell pair
stopped being equal and opposite. Fixed by computing absorption and diffusion
both against the input state and summing at the end.

---

## 3. `[FOUND AND FIXED TWICE]` The relaxation was an amplifier

**Attempt 1 — collocated velocities.** u and v stored at cell centres, with
central differences for both divergence and pressure gradient. Textbook odd-even
decoupling: a checkerboard pressure pattern is invisible to a central-difference
gradient, so it grows unopposed. §2.3 of the contract already specified a
staggered grid, citing C97 and A26. It was right, and this is why.

**Attempt 2 — staggered, but still a pressure-Poisson iteration.**

```
u -= xi * grad(p_old)
p -= xi * div(u_old)
```

This is unconditionally unstable. Its eigenvalues are `1 ± i·xi·√λ`, magnitude
strictly greater than one for any non-zero xi. Divergence went from 0.00015 to
0.086 and the sheet gained 753 % of its water.

**Attempt 3 — what C97 actually does.** C97 solves no pressure Poisson equation
at all. It takes a cell's divergence and pushes that cell's four faces directly
to cancel it. That is a scatter, which a GPU cannot do under ping-pong, but the
gather form is algebraically identical: a face shared by two cells is pushed by
both, so `u_face += delta(this cell) − delta(east neighbour)`. The resulting
operator on divergence is `(1 − xi·L)` with L the 5-point Laplacian, eigenvalues
in [0, 8] — stable for xi < 0.25, and at C97's 0.1 the worst mode damps to 0.2
per iteration. High-frequency divergence, exactly what a brush stroke injects,
dies fastest.

Divergence now holds at 0.00016 through 50 iterations instead of growing.

---

## 4. `[RETRACTED]` "The film dynamics are unstable"

**This section's conclusion was wrong. It is kept because the reasoning matters
and because it shows how a plausible story survived several rounds of evidence.**

The claim was that the film dynamics were unstable and that half-float rounding
was accidentally damping them. Every experiment below is real and reproducible.
The conclusion drawn from them was not, because one check was never run:
**the same command line, twice.**

The f32 runs are **nondeterministic**. Identical binary, identical arguments:

```
run 1  1024/relax20/full   water drift = +2139.0110 %
run 2  1024/relax20/full   water drift =  +278.1477 %
run 3  1024/relax20/full   water drift =  +556.0197 %
```

Half-float runs, by contrast, repeat exactly. The "instability" was garbage
memory being read on the f32 path, and every conclusion drawn from comparing
f16 against f32 was comparing a real number against a random one.

Two tells were visible and went unread:

- Water was already 1.3e37 at frame 199 — **present from the start**, not grown.
  A physical instability ramps; this was simply there.
- Pigment and divergence stayed perfectly sane in the same runs. A blowup in the
  film would have dragged both with it.

`[FIXED]` Nothing guaranteed the wet fields were cleared before their first
read. Every texture is now explicitly zeroed at startup (`shaders/zero_fill.wgsl`)
rather than trusting the implementation's lazy-init bookkeeping. That fix alone:

- took half-float water drift from **−18.9 % to −6.4 %** — so a large part of
  what was blamed on rounding was uninitialised memory;
- made pigment conservation **exact (−0.0000 %)** on most f32 runs.

`[STILL OPEN]` A rarer nondeterminism survives on the f32 path — common at
1024², occasional at 512², producing ~1e37 in `h_f` or `s` while pigment stays
exact. Not yet located. Until it is, **no f32 measurement from this bench can be
trusted, including any comparison against half-float.**

What this does *not* overturn: the flux algebra is still exact (§2, and pigment
now reads −0.0000 %), and the relaxation fixes in §3 are still correct and still
needed.

### The experiments, for the record

The isolation runs below are reproducible but were interpreted through the
nondeterminism, so their differences are not necessarily meaningful.

Run at full f32, hands off, evaporation zero, the sheet **gains** water — by
200 %, by 1500 %, and in some configurations it overflows to 1e33 outright. Run
the identical setup at half-float and it quietly **loses** about 19 %.

Isolation runs:

| change | water drift, f32, 900 frames |
|---|---|
| baseline (relax 20) | +10.9 % … +420 % (grows with run length) |
| capillary diffusion off (`KDIFF = 0`) | **−0.0000 %** |
| absorption off (`ALPHA = 0`) | +2e33 % |
| absorption raised to 0.80 | +128 % |
| relaxation off (`--relax 0`) | +5e35 % |
| relaxation 2 / 5 / 20 | +856 % / +326 % / +11 % |
| `--dt` 1.0 / 0.5 / 0.25 | +217 % / +420 % / +292 % |

Read correctly, these say only that a corrupted value lands differently
depending on how much of the sheet is live and how many passes run between the
corruption and the measurement. The apparent dose-response — relaxation helping,
absorption helping, diffusion hurting — is what random corruption looks like
when you vary the amount of work around it. Every one of those numbers is a
single sample of a distribution, and the distribution is wide.

The one line that survives: **with capillary diffusion off the mask stays put
and conservation reads −0.0000 %.** That is the flux algebra being exact, and it
has since been confirmed independently — pigment reads −0.0000 % after the
zero-init fix.

**Where D8 actually stands.** Unknown, and it stays unknown until the f32 path
is trustworthy. What can be said: after zero-init, half-float loses **6.4 % of
the sheet over 200 hands-off frames, reproducibly**. Whether that is rounding or
another latent bug of the same family as the three already found has not been
established.

**Correct order of work:**

1. **Find the remaining f32 nondeterminism.** Everything waits on it — a control
   run that returns a different answer each time cannot referee anything.
2. Re-measure half-float drift against a fixed f32 control.
3. *Then* decide precision, and re-test the split idea.

Until step 1 lands, treat the f32 numbers as noise and the half-float numbers as
an upper bound on drift that may well shrink again.

**Method note, worth more than the numbers.** Three rounds of this bench
produced three confident diagnoses — precision loss, then instability, then
memory corruption. Only the third survived. The check that would have caught the
first two immediately was running the same command line twice. That is now the
first thing to do with any conservation result, before interpreting it at all.

---

## 5. Memory: read/write separation doubles the wet band

| | 1024² | 1448² | 2048² |
|---|---|---|---|
| logical (24 half-floats/cell) | 48 MB | 96 MB | 192 MB |
| **actually allocated** | **96 MB** | **192 MB** | **384 MB** |
| median frame @ relax 20 | 6.98 ms | 14.96 ms | 27.07 ms |

Every wet field needs read/write separation — a pass cannot read its neighbours
and overwrite itself in the same dispatch. §2.6's 113 MB is the logical cell
count; the working figure is twice that.

Split precision (water f32, pigment f16) costs 128 MB at 1024²; full f32 costs
192 MB.

**Practical ceiling on this GPU: about 1448² wet at 20 relax iterations.** That
matches the contract's framing of D7 as a wetness budget rather than a canvas
size.

---

## 6. Visible in the snapshot: the stroke-resampling trap

`wet_field.png` shows the bot paths beading into discrete dots where the bots
move fastest, rather than laying continuous strokes. That is Card 5's `[TRAP]` —
stylus samples are far sparser than simulation steps, and the path must be
resampled with the full contact-and-transfer sequence run at each interpolated
position. B04 says the same from the other direction: never move more than one
cell per step.

The bots deposit once per frame at their instantaneous position, so the bench
reproduces the artefact faithfully. Worth keeping as a regression check — when
the brush engine lands, those beads should become strokes.

---

## Carried forward

1. **Stabilise the film dynamics at f32.** Blocks everything in §4. Nothing about
   precision can be settled until this is done.
2. Re-measure the adaptive controller against a sharp brush load, not gentle
   bots — the current test never demands high iteration counts.
3. `flow_outward` at 1.24 ms is a 9×9 box blur every frame; separable two-pass
   should cut it substantially.
4. True within-frame early exit via indirect dispatch, if the adaptive
   controller proves insufficient under real strokes.
5. Not yet covered by the bench: tile promotion/demotion, the dry/bake pipeline,
   undo snapshots, and the §10 acceptance tests beyond conservation.
