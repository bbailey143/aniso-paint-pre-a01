# 20 — Oil from zero

**Opened 2026-08-30 by Claude (Opus 5), on `tuft-fill`, at the artist's
instruction:** *"We need to start from ground 0, as if oil does not exist and
start building it."*

Nothing is deleted by this file. It establishes what oil is **allowed** to be
from the evidence, sorts every oil behaviour now in the engine into what the
evidence supports and what was added later to cure a symptom, and sets the order
to rebuild in. **The build order is the artist's to ratify before anything is
stripped.**

---

## 1. What the evidence actually says oil is

This is the whole of it. It is smaller than most people assume.

**Oil is not a build row.** [`07-media.md`](07-media.md) "The build rows" has
exactly three — Watercolor, Graphite pencil, Ballpoint. Oil sits in **"The
extended roadmap (from the GUIDE — parked, not built)"**, which grants it four
properties and no more:

| | |
|---|---|
| `solvent` | `oil` |
| `bodyShrink` | **≈ 1 — 100 % peak retention** |
| `openTime` | multi-day |
| viscosity | **fat-over-lean gradient** |

[`09-acceptance.md`](09-acceptance.md) adds the targets, all marked
`[future]`: value shift **zero to minimal**, finish **naturally glossy/satin**,
open time **2–7 days dry-to-touch, 6–12 months full cure**, and the **one-way
door** (oil does not re-wet).

[`00-invariants.md`](00-invariants.md)'s source register carries **B04**
(Baxter, Wendt, Lin, *IMPaSTo*, NPAR '04) as the oil/thick-paint paper:
conservative advection, brush transfer, undo, spectral KM, band reduction.
**That is architecture, and the engine already runs most of it.** B04 supplies
no oil material constants.

And [`07-media.md`](07-media.md) settles the value shift by mechanism: *"Oil
neither absorbs nor evaporates → no shift."*

## 2. What the archived spec adds, and it is already in the row

`src/media/library.ts` states its own derivation above `OIL`, six lines, each
mapped to a value — and it is honest about its footing: **"[UNVERIFIED] Every
value below is reasoned from the spec, not measured."**

| the spec says | the row |
|---|---|
| It holds its shape until pushed | `yieldStress` |
| Its pigment never spreads on its own | `rimMigration 0`, `edgeDarkening 0` |
| It never wets the sheet | `absorptionCoupling 0` |
| It cures by oxidation over days | `openTime 48 h`, `evapRate` near nil |
| It is opaque and glossy | `kInstrument` low, specular high |
| It picks up what it is dragged through | `upRate` high |

**This is a sound ground zero.** The medium row is not where oil drifted.

**Two gaps against §1, both real build items:**

- **`bodyShrink` is 0.85; the roadmap says ≈ 1, 100 % peak retention.** The row
  itself notes it is *currently unread* by any pass, so changing it today would
  be inert — but it is declared wrong and should be corrected when it becomes
  live.
- **Fat-over-lean is not built at all.** It is one of the four defining
  properties and there is no viscosity gradient anywhere in the engine.

## 3. What was added later, and what each was added to cure

Every one of these is oil-only, every one is marked `[UNVERIFIED]`, and every
one exists because the artist reported something. **They are not mistakes. They
are undocumented answers to real complaints, stacked without anyone standing
back.** That stacking is what "too far from pure oil" means.

| # | behaviour | where | added to cure |
|---|---|---|---|
| 1 | `bridged` — the tooth gate fills as paint builds | `deposit.wgsl` | "the canvas never disappeared under the paint"; weave stamped into every layer |
| 2 | `gateHalfWidth` narrowed by viscosity | `deposit.wgsl` | light contact should be opaque fragments on peaks, not a translucent average |
| 3 | `level_fresh` — the entire pass | own shader | the comb of hair ridges a paste cannot settle (artist note 2026-08-24) |
| 4 | `rExchange` + the TVD "unlike" metric | `deposit.wgsl` | the pile saturating — a brush eating its own paint. **This one is ratified plan work: `18-oil-body.md` §5 step 2, DONE.** |
| 5 | `smearStrength` | `deposit.wgsl` | the brush must be able to push paint about |
| 6 | `teflonMin` / `workableBody` release | `deposit.wgsl` | dark outlines under every crossing |

**Not on this list, and not drift: the artist's own easel decisions.**
`relief: 10` and `hidesGround: 2` and `kInstrument: 0` were each set by him at
the easel on a stated date, with the reasoning recorded beside them. They are
recorded decisions under the fence. **They stay.**

## 4. The rebuild

**Ground zero = §1 plus §2.** A paint that holds its shape until pushed, never
wets the sheet, never spreads on its own, cures over days, and is opaque and
glossy — with **every row in §3 switched off**.

Nobody has ever seen that. Each §3 behaviour was added on top of the last, and
the bare paint has never been looked at since the first one landed.

**Step 0 — make it switchable.** One flag per §3 behaviour, all off by default
under a bare-oil mode, so oil can be built up one behaviour at a time and each
addition judged on its own. This is the rebuild's instrument, not more
accumulation: without it "add one thing back" is a code edit and a rebuild per
judgement.

**Step 1 — COVERAGE PER THREAD.** *Added to the build order by the artist,
2026-08-31, on the evidence of §11e.*

Paint does not fade. Measured across every mark on the test panel — tearing,
running out, fast, slow, the loaded head of a stroke and the dying tail of the
same stroke — it crosses from bare canvas to full cover in **0.4 to 0.8 mm, about
one canvas thread**, reproduced at four times the magnification as 0.75 mm and
29 pixels. **A thread is painted or it is bare.** What fades is the *proportion*
of threads covered, over tens of millimetres — 29.9 mm for a brush running out.

The engine fades film thickness and runs alpha to zero, which is an optical fade
and the wrong mechanism.

**Why it is here and not in the add-back list.** It is not a §3 behaviour sitting
on top of the paint; it is how the paint meets the cloth at all, which §4 already
counts as ground zero when it says the paint is *opaque*. Real opacity is
per-thread. And every judgement in the steps that follow is made **by eye, on a
mark** — so if the mark fades by the wrong mechanism, every later judgement
inherits the error. That is not hypothetical: `19` spent a week chasing a ripple
by smoothing a quantity that in real paint has no smooth values.

**Nothing is lost by doing it first.** Step 0's flags keep the old behaviour a
switch away, so the bare-oil "before" picture is still available on demand rather
than being spent as a one-off.

**IT BLOCKS ON THE SCALE DECISION, AND MUST NOT START BEFORE IT.** A mechanism
that lives at one thread needs the thread to exist. At the brush-anchored
0.432 mm per sim cell a canvas thread is **2.0 cells** (§10e) — Nyquist, which
cannot carry it. So this step opens by settling §10d and §10e: millimetres per
cell, and the split between the weave that is *seen* (re-derived at screen
resolution, unbounded by the sim grid) and the tooth that is *felt* (bound by it).
**Both are cross-engine and the artist's to ratify.**

**Step 2 — look at bare oil.** Paint with everything in §3 off. Expect it to
look wrong; the point is to find out *how* wrong, and which complaint returns
first. That complaint names the behaviour that has earned its place.

**Steps 3..n — add back in the order the paint asks for**, one at a time,
judged, and each one either promoted to a recorded decision with its reason or
left out. Anything nobody misses does not go back in.

**Then the two §2 gaps:** correct `bodyShrink` when it becomes live, and decide
whether fat-over-lean is built or formally parked.

## 5. What this rebuild must not touch

The frame-invariance and instrument work of [`19`](19-paint-on-canvas.md) E13
and E17 — the pickup exponent, the readback settle, the lift seeing its own
frame's paint, the `rubbed` ceiling, the trimmed tone metric.

**None of those is a fix to oil.** Every one is `00-invariants.md` §2 work —
"never a per-frame delta" — and applies to watercolour identically. Reverting
them restores measured faults in both media and blinds the bench that would
judge the rebuild. They are the floor this is built on, not part of the pile.

## 6. Where the plan already stood, and it is still the artist's move

[`18-oil-body.md`](18-oil-body.md) §5 step 3 has been open since 2026-08-27 and
begins **"NEXT, and it is the artist's."** Two verdicts, zero code:

1. One oil pass at Flow well above default — does the **thickness** look right?
2. A crossing — how strong should the **carry** feel? The last accepted figure
   is **"3 % feels correct"** (2026-08-26); the trail today starts at 20.6 %.

Those verdicts are inputs to this rebuild, not alternatives to it. `16` is
explicit about the second: **"Do not tune this to a number. Show him a crossing
and take the verdict."**

---

## 7. Real paint, measured — and the target was wrong

**Artist reference images supplied 2026-08-30.** `tools/measure-real-paint.py`
reads the same quantity `fish-scale-bench.ts` reads: a tone profile along a
stroke, detrended with a moving mean, relative RMS of the residual. Only windows
with a clearly defined stroke direction are sampled (structure-tensor coherence
≥ 0.45), which keeps the samples inside single strokes.

**PROVENANCE FIRST — two of the five supplied images are not evidence.**

| file | verdict |
|---|---|
| `—Pngtree—…ochre grunge texture` | **Real paint. Photograph, 2900², full impasto detail.** The strongest reference here. |
| `by Chris Long_.jpg` | **Real oil**, normal loaded brush, attributed. |
| `12bc6f3c…` | **Real paint**, palette knife, heavy impasto. |
| `1c656e12…` | **REJECTED — AI-generated.** Carries the watermark "Содержимое, сгенерированное ИИ" ("Content generated by AI"). Not paint, and must not be cited. |
| `4c714d56…` | **Rejected as physical reference.** No relief, no weave, no specular on any ridge — it reads as a digital painting. Usable for composition, not for how paint behaves. |

**THE MEASUREMENT.** Along-stroke tone ripple, at several detrend radii so the
figure cannot be an artefact of one window:

| detrend radius | close-up (2900²) | Chris Long | palette knife |
|---|---:|---:|---:|
| ±4 px | 0.0388 | 0.0901 | 0.0947 |
| ±8 px | 0.0634 | 0.1196 | 0.1316 |
| **±16 px** | **0.0907** | **0.1481** | **0.1717** |
| ±32 px | 0.1139 | 0.1734 | 0.2149 |

**The engine, after a week of work aimed at this number: 0.003 to 0.015.**

**Real oil carries ten to fifty times more along-stroke tone variation than the
engine produces.** At the bench's own ±16 setting, three independent real
paintings read 0.091, 0.148 and 0.172 against our 0.003–0.015.

**WHAT THIS MEANS, and it reframes the whole of `19`.** The fish-scale hunt was
driving tone ripple toward zero. **Zero is the wrong target.** Real oil is not
smooth along a stroke — it is full of structure, and that structure is most of
what makes it read as paint rather than as a gradient.

The banding the artist reported was still a real fault: its repeat lag tracked
the frame travel exactly (`19` E17), and paint cannot know what a browser frame
is. **But the goal was never "make the stroke smooth". It is "the structure must
be the brush's, not the frame's."** Every frame-invariance fix in E13 and E17
was therefore right and stays; every instinct to smooth the mark further was
aimed at the wrong end.

**What the images show that the engine does not do at all:**

1. **Bristle striation is the dominant texture**, not a defect. Every real
   stroke is a bundle of parallel hair tracks running along the direction of
   travel. `level_fresh` (behaviour 3, §3) exists to SETTLE that comb. The
   reference says it should be strong, not settled.
2. **Colour striates rather than averages.** In the close-up a single sweep
   carries red, ochre, pink and grey as distinct filaments side by side. The
   engine stores one scalar pigment amount per footprint segment — `17`
   already named this "the scalar bottleneck" and it is the largest single
   difference between these photographs and our output.
3. **Paint tears.** Dragged thin it BREAKS, leaving hard-edged gaps with the
   ground showing through — not a smooth fade to transparent.
4. **Terminal ridges catch light.** Where a stroke ends or the brush lifts, a
   raised lip throws a shadow and the wet binder throws a highlight. This is
   `18` §3a's berm, still unbuilt.

**CAVEATS, and they are real.** Photographs carry the painting's own subject
shading; the coherence filter limits this but does not remove it. Raking light
on relief adds shadow that is genuinely part of how oil looks but is not the
same quantity a flat tone render produces. JPEG noise inflates the ±4 px column.
**And pixels are not cells** — without a scale reference in frame, none of these
numbers can be mapped onto engine cells. A ten-to-fifty-fold gap is far too
large to be explained away by any of that, but the exact figure should not be
treated as a target until the scale is known.

---

## 8. Second batch — and it is evidence for a different engine

**Seven more images, 2026-08-30.** The first batch was paintings, which is
evidence about how paint *behaves*. Most of this batch is **mixing charts with
named pigments**, which is evidence about how paint *mixes* — the optical
engine, not the fluid one. Two findings, one of them foundational.

### 8a. Card 9's first proof test, in real oil paint

`d6d18df…` is six labelled two-pigment studies, brand and pigment named:
UB+CR, CR+TRO, UB+TRO, **UB+CYM**, CR+CYM, TRO+CYM, each a full mixing field
with white tinting.

**The UB+CYM panel is `09-acceptance.md`'s five-minute proof test #1 —
blue + yellow — done in oil and photographed.** Sampled (white-balanced on the
chart's own ground, `#e4e4e6`, so the cast is small):

| | |
|---|---|
| Ultramarine Blue (Gamblin, oil) masstone | **`#223066`** |
| Cadmium Yellow Medium (Gamblin, oil) | **`#dcad02`** |
| their mixture, mid-ladder | **`#64701c`** |
| what a naive RGB average predicts | `#7f6e34` |

`#7f6e34` is R 127, G 110 — **red above green, a muddy tan.** The real mixture
is R 100, G 112 — **green above red, an actual green.** The channels swap order.
**The product thesis is confirmed on real oil paint, measured, not cited from a
figure.** This is the first time that test has been run against material rather
than against MB21 Fig. 1.

**A check worth making, not a fault yet.** The engine's own Ultramarine masstone
is `#382e68` against the reference's `#223066` — blue and green agree closely
(104/102, 46/48) but **red is 56 against 34**, so ours reads more violet. One
photograph, unknown colour management, and real ultramarines differ by brand and
grind, so this is suggestive only. Worth checking properly against a colour
target; not worth changing a spectrum over.

### 8b. THE ENGINE HAS NO EARTH COLOURS — and oil is built on them

The library is twelve pigments: Titanium White, Hansa Yellow, Diarylide Yellow,
Cadmium Orange, Pyrrole Red, Quinacridone Red, Quinacridone Magenta, Dioxazine
Purple, Ultramarine Blue, Phthalo Blue (GS), Phthalo Green (BS), Bone Black.

**That is a modern synthetic palette** — the set you would pick for watercolour
or acrylic.

The reference charts run on **Yellow Ochre, Raw Sienna, Burnt Umber, Light Red,
Transparent Red Oxide, Cadmium Red Light, Cadmium Yellow Medium** and
Ultramarine Blue. `b64b8978…` names four of them outright and shows their
mutual mixes; `647fb256…` is a full oil colour wheel with tint ladders built on
the same family.

**Only Ultramarine Blue is in both.** There is not one earth colour in the
engine — no ochre, no sienna, no umber, no red oxide. Those are the backbone of
oil painting, they are what every one of these reference palettes is made of,
and an oil painter opening this app finds none of them.

**This is a ground-zero build item nobody had written down.** D1 already
reserves for it — *"8 pigment slots per cell; library of 24–48 is separate"* —
and the library sits at 12. **Oil cannot be built from ground zero on a palette
that contains no earth pigments**, and it belongs in §4's order alongside the
behavioural work.

**And these charts are the material to validate it with.** Each is a two-pigment
series with a white tint ladder — exactly the shape of data a K/S spectrum is
fitted and checked against, and exactly `09-acceptance.md`'s proof test #3
("real paints *gain* saturation and shift hue mixed with white").

### 8c. Behaviour: a fourth real painting, and it is the thin end

`46pk728n9bhf1.jpeg` (2780×3753) is thin, scumbled, dry-brushed work over a
visible weave — the opposite end from the impasto close-up. Same measurement as
§7:

| detrend radius | ±4 px | ±8 px | **±16 px** | ±32 px |
|---|---:|---:|---:|---:|
| scumbled painting | 0.1215 | 0.1736 | **0.2091** | 0.2547 |

**The highest of the four**, which is what a broken dry stroke over a weave
should read. The real-paint range at ±16 px is now **0.091, 0.148, 0.172,
0.209** across four independent paintings, against the engine's **0.003–0.015**.

It also shows, plainly and at scale: **the weave reads through every thin
passage**, and **long dragged strokes break into skips** rather than fading.

### 8d. Rejected, and why

`4bdaa4d1…` — the loaded brush against paint. It is a **stock product photograph
of acrylic** (Tri-Art tube), staged for a catalogue. The tube would give a rough
scale only under an assumption about its volume, the medium is wrong, and the
brush is dipped for the camera rather than painted with. The one suggestive
detail — paint sitting as a blob at the very tip rather than through the tuft —
is consistent with E18's stranded-paint finding but must not be cited as
evidence for it.

**Still missing, and still the bottleneck: a scale reference.** Pixels are not
cells. The 6-to-70-fold gap in §7 and §8c is far too large to be a confound, but
none of it can be turned into an engine target until something of known size is
photographed beside the paint.

---

## 9. The Zorn palette — the artist's suggestion, and it is the right one

**Yellow Ochre, Cadmium Red Light, Ivory Black, Titanium White.** Four pigments.

**Two of the four are already in the engine.**

| Zorn | engine | |
|---|---|---|
| Titanium White | **Titanium White, PW6** | ✓ have it |
| Ivory Black | **Bone Black, PBk9** | ✓ have it — PBk9 *is* bone/ivory char; "Ivory Black" is the traditional name for the same pigment |
| Yellow Ochre | — | ✗ **PY43, missing** |
| Cadmium Red Light | — | ✗ **PR108, missing.** The engine's Cadmium Orange is PO20, the same cadmium sulfoselenide family and spectrally adjacent, but not it |

**Why it is the right choice for a ground-zero rebuild, and not merely a
convenient one:**

1. **It is a COMPLETE palette in four pigments.** A full-value, full-range
   painting can be made with it. That turns "does oil work yet?" into a question
   answerable at the smallest possible scale, which is exactly what §4's build
   order needs. Twenty-four pigments is a library; four is a test.

2. **It supplies a second Kubelka-Munk proof test the engine cannot currently
   run.** **Yellow Ochre + Ivory Black → GREEN.** Ivory black is blue-biased, so
   real paint goes olive; linear RGB predicts nothing but a darker ochre. It is
   the same class of test as blue + yellow (§8a) and just as famous — and the
   artist's own `b64b8978…` already contains it: its lower panel is *Yellow
   Ochre / Cadmium Red Light / into Black and White*, **which is a Zorn chart.**
   **The validation material is already in hand.**

3. **It is the skin-tone palette.** Its whole reputation is the range of flesh
   and neutral tones it yields from a warm–cool axis with no blue at all. If KM
   reproduces that range from four pigments, the optical engine is working in a
   way no swatch comparison can demonstrate.

4. It closes §8b's earth-colour gap with **the fewest possible additions** —
   one earth, one cadmium.

**Ultramarine stays** regardless: it is already measured, and it is what makes
§8a's blue + yellow test possible. Zorn's palette has no blue, so it replaces
nothing.

### What it costs, honestly

`[SETTLED 2026-08-30 — this section previously guessed, and half of the guess was
wrong.]` The guess was that BE16 "holds at least twice what was used" because the
column indices have gaps. **BE16's own paper is on disk**
(`ArtistSpectralDatabase.pdf`, Berns, CIC24 2016) and its Table I ends the
question outright.

**BE16 is nineteen paints. Twelve were taken. These seven were left behind:**

| left behind | |
|---|---|
| Bismuth Vanadate Yellow | PY 184 |
| Pyrrole Orange | PO 73 |
| **C.P. Cadmium Red Light** | **PR 108** |
| Cobalt Blue | PB 28 |
| Cerulean Blue, Chromium | PB 36:1 |
| Phthalo Blue (Red Shade) | PB 15:1 |
| Phthalo Green (Yellow Shade) | PG 36 |

So the two halves of Zorn's gap are **not the same problem at all**:

- **Cadmium Red Light IS in BE16**, measured, sitting in a column nobody read.
  `[UNVERIFIED]` Reading the taken columns against Table I's order puts it at
  **column 7** (Pyrrole Orange at 6) — the mapping is exact from column 8
  onward, so this is a strong inference and a one-line test the moment a copy of
  the spreadsheet exists: the masstone must come out red.
- **Yellow Ochre was never there.** Confirmed against Table I: BE16 contains **no
  earth pigment of any kind.** Berns selected for high chroma on purpose. No
  amount of finding the file produces an ochre.

**AND THE FILE IS GONE — from disk and from the web.** A machine-wide search
found only the paper, not the spreadsheet. The RIT link is dead. So is the
grayskyimaging link to Berns's *later* dataset — 58 Golden pigments, same lab,
same two-constant masstone-tint method, same Saunderson constants, and the
obvious place an ochre would have lived. **That page now says the spectral
database "is no longer available."** Both doors are shut.

**What was actually at risk, and is now fixed.** The real damage was never Zorn:
it was that `build_pigments.py` had **no runnable input**, so the entire optical
library was a generated file nobody could reproduce — precisely what the fence
exists to prevent. The K/S table has been read back out of the generated
`pigments.ts` into [`data/be16-ks.csv`](../data/be16-ks.csv), which is now the
build's default input and the provenance of record. **Verified: it regenerates
`src/color/pigments.ts` byte-identical, twice.** The library is safe and
reproducible again. See [`04-color-km.md`](04-color-km.md).

**What that rescue does NOT do:** it could only save the twelve columns already
built. Cadmium Red Light is not in it. Adding either Zorn pigment still needs
measured data we do not currently hold.

**THE OPEN QUESTION IS NOW A SOURCING ONE, and it has three answers ranked:**

1. **A live mirror of the Golden data.** `realtimerendering.com/downloads/GoldenSpectra.zip`
   is up: "HB 10 mil Drawdowns over White", **78 Golden Heavy Body acrylics with
   K/S**. That is the same manufacturer line BE16 and B22 were both built from,
   and Golden's Heavy Body range does include Yellow Ochre PY43 and Cadmium Red
   Light PR108. If it carries K and S *separately*, both gaps close at once and
   §8b's earth-colour gap closes with them. **Two things to check on opening it:**
   whether it is two-constant K and S or only the K/S ratio, and its band range —
   the page says **400–700 nm (31 bands)** against our 380–750 (38), which would
   need either a library-wide range change or a marked extrapolation at the ends.
2. **The Wayback Machine.** Both dead links were live once and the RIT file was
   already recovered that way in the first place. Worth ten minutes.
3. **Ask Berns.** The 2022 paper says the 2016 Excel file "was made available by
   request." The request still works, presumably; it just is not a same-day
   answer.

**Meanwhile, nothing has to wait.** Both pigments can exist *today* as **named
recipes mixed from the measured twelve** — not invented spectra, mixtures of
measured ones, which is exactly what the engine already does every frame and
exactly what **D13** says the artist should be able to do for themselves —
ratified on `origin/3D-brush`, and not yet carried onto this branch. Cadmium
Red Light ≈ Cadmium Orange PO20 + Pyrrole Red (PO20 and PR108 are the same
cadmium sulfoselenide chemistry, differing in selenium content). Yellow Ochre ≈
Diarylide Yellow + Bone Black + a little Pyrrole Red, tuned against the artist's
own Zorn chart. Each is labelled a **recipe, not a measurement**, and each is
replaced the day real spectra arrive.

**Two caveats to record before anyone treats the result as measured oil:**

- **BE16 measured Golden Heavy Body ACRYLICS, not oils.** Same pigment
  chemistry, different binder. For K/S that is a fair proxy — it is the pigment
  that absorbs and scatters — but the binder changes refractive index, and the
  gloss side of it is handled separately by `kInstrument` anyway. The existing
  twelve carry the same caveat and it has never been written down.
- **Transport rows (`rho`, `omega`, `gamma`) are not in BE16.** They come from
  C97, and neither ochre nor cadmium red light appears in C97 Fig. 5 directly.
  Earth pigments granulate strongly, so an ochre would take a reasoned analog
  marked `[UNVERIFIED]` — exactly as `titanium-white`, `pyrrole-red` and
  `bone-black` already do.

### Where it sits in the build

This is a **§4 build item in its own right**, parallel to the behavioural steps
and independent of them: the optical engine can be rebuilt and validated against
the artist's charts while the fluid behaviours are still switched off. It does
not wait on step 0, and step 0 does not wait on it.

---

## 10. THE SCALE IS SOLVED — real oil, measured in millimetres

**Artist's own oils, photographed with a steel rule in frame, 2026-08-31.** Nine
photographs: one clean thinned stroke shot three ways, the brush laid beside it,
a crossing, a dry-brushed passage, and two rule shots. Ultramarine + Raw Sienna,
thinned right out, on primed canvas. The brush is a #2 synthetic flat.

**This is the reference the whole of §7 and §8 was missing.** Those sections
measured tone ripple in *pixels* and said so plainly: *"pixels are not cells …
none of these numbers can be mapped onto engine cells until something of known
size is photographed beside the paint."* It now has been. Everything below is in
millimetres, and `tools/measure-scaled-paint.py` regenerates all of it.

The scale photograph is kept in the repo at
[`docs/reference/scale-ruler-blue-stroke.jpg`](reference/scale-ruler-blue-stroke.jpg)
— every number in this section is anchored to it, so it is provenance, not an
attachment.

### 10a. The scale itself

The rule's millimetre graticule read by its own periodicity, not by eye:

**38.91 px per mm**, sd **0.033 px** across the best 8 of 31 independent bands on
the rule. A tilted rule gives a period that drifts with height; this one does not,
which is what makes the frame usable. (The wider shot `…121307` drifts 33.9 → 37.3
px across its rule and was rejected for scale on exactly that test.)

### 10b. What real thinned oil measures

| | |
|---|---:|
| stroke width, #2 synthetic flat, pressed | **9.94 mm** (iqr 8.8–10.8) |
| relaxed tuft width, same brush | ~7.7 mm |
| canvas thread pitch, warp | **0.864 mm** |
| canvas thread pitch, weft | 0.772 mm |
| threads across one stroke | **~11.6** |

**The weave reads at 0.859 mm THROUGH the paint and 0.864 mm on bare ground
beside it.** Those are two independent measurements of the same cloth, one of
them taken through a stroke, and they agree to half a percent. That agreement is
the proof of two things at once: the period really is the weave, and the paint is
thin enough that the canvas dominates what you see inside the mark.

### 10c. Along-stroke ripple, in millimetres, reproduced three times

The same quantity `fish-scale-bench.ts` reads — tone along the stroke, detrended
with a moving mean, relative RMS of the residue — now with the window in physical
units. Three separate photographs of the *same* stroke:

| detrend radius | `…121216` | `…120619` | `…120717` |
|---|---:|---:|---:|
| ±0.25 mm | 0.0224 | 0.0190 | 0.0188 |
| ±0.50 mm | 0.0377 | 0.0337 | 0.0354 |
| **±1.0 mm** | **0.0472** | **0.0440** | **0.0450** |
| ±2.0 mm | 0.0656 | 0.0649 | 0.0613 |
| ±4.0 mm | 0.0892 | 0.0845 | 0.0766 |

**Three frames, three camera positions, agreement within about 10 %.** Only the
first carries a rule; the other two are scaled by the stroke's own width, which is
why they are a reproduction and not an independent measurement of the scale.

**The ripple has no single wavelength — it climbs steadily with the window.**
Real paint carries structure at every scale from a quarter of a millimetre up.
There is no characteristic bump to match, which means no single "roughness"
constant will ever reproduce it.

**And these numbers are far LOWER than §7's 0.091–0.209.** Not a contradiction:
those were impasto and dry-scumbled paintings measured at an unknown physical
radius. **This is a thinned wash, which is what the engine is actually trying to
make**, so this is the closer target, and it is the one with a rule in the frame.

### 10d. THE ENGINE HAS NO PHYSICAL SCALE AT ALL — and that is the real finding

There is **no millimetres-per-cell anywhere in the codebase.** Not in the
invariants, not in the cell schema, not in the substrate. Every length is in
cells, and cells have never been given a size.

**So §7's headline comparison was never valid.** "Real paint 0.091–0.209 against
the engine's 0.003–0.015" put a ±16-*pixel* window beside a ±16-*cell* window and
read the ratio as a fault. Those are not the same length, and nobody could have
said what either one was. The gap may well be real — but that arithmetic did not
show it, and it should not be quoted again until it is redone against a ratified
scale.

**The comparison that IS valid needs no scale**, because it is a ratio of two
lengths inside the same system — threads of canvas across one brush width:

| | threads across the stroke |
|---|---:|
| **real canvas, real #2 flat** | **11.6** |
| engine, Fine Linen (`featureFreq` 118) | 5.3 |
| engine, Cotton Duck (`featureFreq` 64) | 2.9 |

The paper texture is built at `SIM` = 512 and `canvas_weave` puts one thread per
unit of `p`, so a thread is `512 / featureFreq` cells: 4.34 for linen, 8.0 for
duck. The flat brushes' blades are ~23 cells (`length` × `widthRatio`: 22 × 1.05,
24 × 0.95).

**The engine's canvas is 2.2× (linen) to 4.0× (duck) too coarse for its own
brush.** Scale-free, so it cannot be argued away by not knowing how big the canvas
is meant to be.

### 10e. And it cannot simply be fixed by turning the number up

Anchoring on the measured brush — 9.94 mm laid by a 23-cell blade — gives
**0.432 mm per sim cell**, so the 512 grid covers about **221 mm** of canvas. At
that scale a real canvas thread is **2.0 sim cells**. That is exactly Nyquist:
**the simulation grid cannot represent a real canvas weave under a real brush.**
Setting `featureFreq` to 276 would put a thread on two cells and produce aliasing,
not cloth.

`[UNVERIFIED — reasoning, not a measurement]` The way out is that these are two
different jobs wearing one number:

- **The weave you SEE** is re-derived by the composite at screen resolution
  (`canvas.ts`: *"The composite re-derives the same grain at screen resolution"*),
  so it is not bound by the sim grid at all. This half can be made physically
  correct today.
- **The tooth that the paint FEELS** — the height field that drives deposition and
  pooling — is bound by the sim grid, and at 0.432 mm per cell it can only ever be
  a coarser, statistical stand-in for cloth.

Splitting those two is a **cross-engine decision and it is the artist's to
ratify**, together with the millimetres-per-cell it rests on. It is not a
specialist's change and nothing should be tuned until it is settled.

### 10f. The crossing, measured — and both previous answers were low

`docs/18` §5 step 3 has been open since 2026-08-27 asking *how strong the carry
should feel* when a stroke crosses a wet one. The artist's remembered preference
was **"3 % feels correct"**; the engine's trail starts at **20.6 %**.

The ochre stroke in `…120903` crosses the wet blue and runs on past it over bare
ground, so the pigment in that trail is carried, not shown through:

| past the crossing | blue carried |
|---|---:|
| 0 – 8 mm | **50 – 60 %**, essentially flat |
| 9 – 13 mm | 37 → 25 → 14 → 9 % |
| ~16 mm | **0** |

**Real thinned oil carries about 55 % of what it crosses, holds it almost
undiminished for roughly one brush width, then loses it over the next half
width.** Both earlier answers are far under, and the *shape* matters more than the
number: a plateau then a knee, not the immediate decay the engine produces.

`[ONE FRAME ONLY]` The plateau-then-knee shape is unambiguous across 24 sample
points, but the absolute percentage rests on a single photograph's colour balance
and has not been reproduced. **Treat the shape as a finding and the 55 % as
provisional** until a second crossing is shot.

### 10g. Still missing

- **The tearing stroke.** Named by the artist himself as absent from this batch.
  §7 item 3 — paint dragged thin BREAKS, leaving hard-edged gaps, rather than
  fading. Nothing here shows it.
- **The same stroke fast and slow.** Speed is the axis the engine is known to get
  wrong (`19`: *slow = clean, fast = significantly better*), and every stroke in
  this batch is at one speed.
- **A loaded brush running out.** How the mark changes from full to empty, in one
  continuous pass, is what `18` E18's stranded paint is really about.

---

## 11. Tear, slow, fast, run out — the three missing strokes, measured

**Artist's test panel, 2026-08-31, `IMG_20260831_181404`.** Seven strokes on one
board with a 25 cm rule in frame, labelled *Tear* / *Slow* / *Fast* / *Run Out*.
Sent as two files: a contrast-stretched greyscale carrying the labels, and the
untouched colour frame. **Only the colour frame is used for anything tonal** —
the greyscale one has had its levels pulled and its tone is no longer the paint's.

### 11a. Scale, and a third confirmation of the weave

**10.00 px per mm**, and this frame confirms itself: the millimetre graticule
reads 10.006 / 10.018 / 9.995 / 10.027 px (snr up to 23) and the **centimetre**
graticule reads 99.72 / 99.78 / 99.86 / 99.74 px — **9.98 px/mm**. Two separate
combs on the same rule, 0.2 % apart.

**The canvas weave here measures 0.860 mm against §10's 0.864 mm** — a different
board, a different session, and a quarter of the magnification. Third independent
agreement. The measurement chain is sound.

### 11b. What each stroke is

Labels sit 45–75 px above the row they name (the gap to the row above is always
105–135 px), which fixes the mapping. `[UNVERIFIED]` The top pair carries no
label of its own and behaves like the second pair, so *Tear* is read as naming
all four short strokes.

| | width | length | coverage | holes ≥0.8 mm |
|---|---:|---:|---:|---|
| Tear, 1st pair | 19.6 / 19.1 mm | 69 / 73 mm | 71 % / 56 % | none |
| Tear, 2nd pair | 14.8 / 15.0 mm | 71 / 65 mm | 73 % / 40 % | none |
| **Slow** | **10.0 mm** | 190 mm | 50 % | 7, **8 mm** total |
| **Fast** | 11.9 mm | 192 mm | **22 %** | 9, **131 mm** total, longest 48.6 mm |
| **Run Out** | 13.0 mm | 228 mm | 52 % | 9, 16 mm total |

**The Slow stroke measures 10.0 mm wide against §10's 9.94 mm for the same #2
flat.** Another agreement across sessions.

**The four Tear strokes were made with a #12 filbert**, confirmed by the artist
2026-08-31 — not the #2 flat that made the other three. Measured 14.8–19.6 mm
wide, which is right for a 12 filbert, and its rounded end is why those four have
no square shoulders where the others do. **So the tear strokes are a different
tool and their widths must not be compared against the flat's**; what carries
across is the edge, which is a property of the paint and not of the brush, and it
matches (§11e).

### 11c. SLOW versus FAST, and it is not subtle

Same brush, same paint, same board, 190 mm each:

| | coverage | length of stroke with no paint on it |
|---|---:|---:|
| Slow | **50 %** | **8 mm of 190** |
| Fast | **22 %** | **131 mm of 192** |

**A fast stroke lays under half the paint and spends two thirds of its length off
the canvas.** The engine's fast strokes stay in contact and keep depositing;
this one skips 48 mm in a single void.

`[CAUTION]` That longest void is nearly five brush widths, which is more like the
brush leaving the surface than skipping across the tooth, and the last fifth
recovers to 59 % coverage — consistent with pressure coming back at the end. So
**"fast strokes deposit less" is solid; "fast strokes skip 48 mm" may be a lifted
brush rather than a property of speed.** Worth one more fast pass, held flat.

### 11d. RUN OUT — the number `18` E18 has been waiting for

Coverage along the stroke, in fifths: **78 % → 68 % → 61 % → 31 % → 21 %.**

**From 60 % coverage down to 25 % takes 29.9 mm — about three brush widths.**
Two different methods on the same stroke give 29.9 and 30.25 mm.

That is what a brush running out looks like: not a cliff, and not a gentle
gradient either, but a slow statistical thinning over roughly three widths of the
tool.

### 11e. THE FINDING — paint does not fade, it stops. Within one thread.

Measured on transects **across** each mark: how far it takes to cross from bare
canvas to full paint.

| | median | quartiles |
|---|---:|---|
| Tear, 1st pair | 1.35 / 0.70 mm | 0.4–2.6 |
| Tear, 2nd pair | 0.40 / 0.70 mm | 0.3–1.5 |
| Slow | **0.40 mm** | 0.3–0.8 |
| Fast | 0.60 mm | 0.4–1.1 |
| Run Out, head | 1.00 mm | 0.5–1.9 |
| Run Out, **tail** | **0.70 mm** | 0.4–1.2 |

**Every mark on the board has the same edge, and it is about one canvas thread
(0.86 mm).** Tearing, running out, fast, slow, the loaded head of a stroke and
the dying tail of the same stroke — all the same.

**Reproduced at four times the magnification.** On §10's frame (38.91 px/mm) the
same measurement gives **0.75 mm, which is 29 pixels** — a blur-limited edge would
be 2–3 px, so this is a real distance and not the camera's resolution.

**This reframes §7 item 3 and it is implementable.** "Paint tears" was written up
as hard-edged gaps versus a smooth fade, as though tearing and fading were two
different behaviours. They are not:

> **There is no partial coverage at the scale of a canvas thread. A thread is
> either painted or bare. What fades is the PROPORTION of threads covered, and it
> fades over tens of millimetres — 30 mm for a brush running out.**

The Run Out stroke proves both halves at once: its envelope decays over 29.9 mm
while every individual edge inside it stays hard at 0.70 mm.

**The engine does the opposite.** It fades film thickness continuously and lets
alpha go to zero, which is an optical fade. Real paint is **binary per thread and
statistical over the stroke.** That is very likely also why the fish-scale hunt in
`19` was so hard to end: it was smoothing a quantity that in real paint has no
smooth values to find.

`[UNVERIFIED — reasoning]` It also puts a floor under §10d's grid problem. A
mechanism that is binary at one thread needs the thread resolved, and at 0.432 mm
per sim cell a thread is 2.0 cells. **The thread scale is not decoration; it is
where this mechanism lives.**

### 11f. Still open

- **A tear at a known brush width** — the four tear strokes were made with
  something wider than the #2 flat, so they cannot be compared against the rest.
- **One more fast pass, kept flat on the board**, to separate skipping from
  lifting.
- The Tear strokes show no full-width breaks at all. Whatever tearing is in them
  is *inside* the mark — filaments with bare canvas between — which is the same
  binary-per-thread behaviour as everything else on the board, not a separate
  effect.

---

## 12. D14 — Coverage is a fraction of threads, not a film alpha

**Ratified by the artist 2026-08-31.** Recorded as **D14** in
[`10-decisions.md`](10-decisions.md) (D13 was already taken — see 12g); this section is its evidence and its shape.
It is the standing ground for §4's Step 1.

### 12a. The decision

> **A cell stores what FRACTION of its canvas threads carry paint. It does not
> store how transparent the paint is.**
>
> Deposition raises that fraction toward 1. Running out, tearing and lifting
> lower it. **At draw time the compositor decides WHICH threads**, by threshold
> against the weave field it already evaluates at screen resolution — so the edge
> it draws is hard at thread scale at any magnification, while the fade across a
> mark is the change in the fraction.
>
> **A thread is painted or it is bare. There is no partial alpha at thread
> scale.** Paint on a covered thread renders at full Kubelka-Munk strength; the
> ground shows through only on threads that are bare.

### 12b. Why — the measurements, and they are reproduced

**The edge.** Across every mark on the test panel (§11e) — tearing, running out,
fast, slow, the loaded head of a stroke and the dying tail of the *same* stroke —
paint crosses from bare canvas to full cover in **0.4 to 0.8 mm**. The canvas
thread is 0.86 mm. **Reproduced on a second photograph at four times the
magnification: 0.75 mm, which is 29 pixels**, so it is a physical distance and not
the camera's blur. Two sessions, two brushes (#2 flat and #12 filbert), two
boards, one answer.

**The fade.** The same Run Out stroke falls from 60 % coverage to 25 % over
**29.9 mm — about three brush widths** — by two independent methods that agree
(29.9 and 30.25). So the envelope is soft over tens of millimetres while every
edge inside it stays hard.

**Both halves are in one mark.** That is what forces the model: no single film
alpha can be simultaneously hard at 0.7 mm and soft over 30 mm. Two quantities
were being asked of one number.

### 12c. Why not simply a finer grid

Resolving threads directly needs a thread across 3–4 cells. At the
brush-anchored scale (§10e) a thread is **2.0 sim cells**, so that is a 2× grid in
each axis — **4× the cells**, against a D7 budget and a bench that already stands
at 3.78 ms.

**The fraction buys the same look for one number per cell.** And it is not a
workaround: [`00-invariants.md`](00-invariants.md) **§4, "coarse sim under fine
display"**, already says the physics grid may be coarser than the display grid
and that the visual layer is the one that wants resolution. This decision is that
invariant applied, not an exception to it.

It also settles the thing §10d found had been one number and should not be: **the
weave you SEE** (drawn at screen resolution, free of the sim grid, and able to be
physically correct today) is now separate from **the tooth the paint FEELS**
(bound to the sim grid, and free to stay a coarser statistical stand-in, because
the coverage fraction is doing the thread-scale work instead).

### 12d. What this decision does NOT settle

Named so nobody treats them as decided:

1. **Millimetres per cell.** Still open. §10e's 0.432 mm per sim cell is
   `[UNVERIFIED]` — reasoned from one measured brush over a 23-cell blade, not
   ratified. **Step 1 opens by settling it**, because the coverage fraction is
   meaningless until a cell has a size.
2. **How the fraction evolves.** The rate deposition raises it, and lifting,
   drying and tearing lower it. That is Step 1's build work and it is where the
   §3 behaviours will reconnect.
3. **Where it lives in the cell.** A new field or derived from what is there —
   a schema question, and the canvas engine's to answer under D8 (RGBA16F).
4. **Wet-on-wet.** Whether two wet coverages merge, and how.

**INVARIANT 2 BINDS THIS.** The rate at which coverage changes must be a
**fraction per unit of distance travelled, or per unit of time** — never per
frame, never per cell stepped. That is not a general caution: a per-frame
coverage rate would reproduce the fish-scale banding of `19` exactly, in a new
place, and the whole of `19` E13 and E17 is the record of how long that takes to
find.

### 12e. Acceptance tests

A build of Step 1 is right when all four hold. Written now, before the code, so
they cannot be fitted to it afterwards.

1. **The edge stays hard everywhere.** A cross-section anywhere along a stroke —
   including its dying tail — crosses bare to covered in **≤ 1 mm** at the
   ratified scale. Not just at the loaded head.
2. **The fade is 30 mm.** A brush running out falls from 60 % to 25 % coverage
   over **30 mm ± 10**. Not 2 mm, not 100 mm.
3. **Speed still costs paint.** Over equal distance a fast stroke deposits
   materially less than a slow one — measured at **22 % against 50 %** coverage
   (§11c). The direction and rough size must survive; the exact ratio is one
   panel and is not the test.
4. **Zooming reveals no ramp.** The edge is drawn at screen resolution, so
   magnifying the canvas must not turn it into a soft gradient. This is the test
   that separates the decision from a cosmetic tweak.

### 12f. The risk worth watching

`[UNVERIFIED]` At low coverage, thresholding a regular weave field could read as
**printed fabric rather than broken paint** — a tidy dot pattern instead of a
mark. `canvas_weave` already carries a `slub` noise term for exactly this reason
in the height field, and the same term is available here. Whether it is enough at
10–20 % coverage is unknown, and it is the first thing to look at once anything
is on screen.

### 12g. It is D14, not D13 — a correction

This decision was first written up as D13, because this branch's card 10 runs
D1–D12 and 13 looked free. **It is not.** `origin/3D-brush` ratified **D13 —
studios** on 2026-07-31 ("every material is authored in a studio; studios are a
product surface for the artist, not a developer tool"), and that row was never
carried onto `tuft-fill`. Two sibling branches holding different D13s is exactly
the kind of collision that costs somebody a day, so **coverage per thread is
D14.**

The gap is now an open item in card 10: D13 either gets carried across or its
absence gets recorded on purpose. D2 permits this branch to diverge; it does not
permit diverging silently.

---

## 13. How big is a cell — the artist's answers, and what they cost

**2026-08-31.** §12's D14 is meaningless until a cell has a size, so Step 1 opens
here. Two answers from the artist, one of them still to be confirmed.

> **Canvas:** *"moot, it should be changeable and customizable. For all intents
> and purposes we can start with 16x20."*
>
> **Smallest brush:** *"that little flat I've used, a #8 which is 1/2 mm wide per
> my measure… I have tiny riggers for extra fine detail, soooo, for all intents
> again we'll just start with the little #8 flat."*

### 13a. 16 × 20 at half a millimetre a cell — and it fits

16 × 20 in = **406.4 × 508 mm**. At **0.5 mm per sim cell** that is
**1016 × 813 = 0.83 M cells**.

| | |
|---|---:|
| cells to simulate | **0.83 M** |
| the `main` bench's proven load ([`05-fluid.md`](05-fluid.md)) | **1024² = 1.05 M at 3.78 ms/frame**, RX 570, against a 16.7 ms budget |
| cell state at D7's 54 half-floats | **89 MB** |

**A 16 × 20 at half a millimetre is SMALLER than the grid the bench already ran
at 3.78 ms.** It sits inside a proven envelope rather than asking for a new one.
`05-fluid.md` says the same in its own words: *"1024² is in reach, 2048² a
stretch"* — and this is under 1024².

`[NOTE]` `SIM` is currently **512**, which is half this and was set conservatively
below what the bench proved. Raising it is a change to make deliberately, not a
free one: cell state goes 28 MB → 89 MB.

### 13b. And it is D14 that made this possible

**Yesterday this answer would have been unbuildable.** Before D14 the sim grid
had to resolve a **0.86 mm canvas thread**, and at 0.5 mm per cell a thread is
1.7 cells — under Nyquist, exactly the wall §10e hit.

D14 moved the thread to the compositor, which draws it at screen resolution. So
**the grid no longer has to resolve the cloth. It only has to resolve the
brush.** That is a far weaker requirement, and it is what lets a 16 × 20 board
work at all.

It is also the third time the same split has paid: `INK = SIM * 4` already exists
in `canvas.ts` for exactly this reason — *"a ballpoint hairline needs this extra
resolution; water movement does not."* Fine detail is drawn fine; fluid is
simulated coarse.

### 13c. Do the brushes fit? Yes, except one

At 0.5 mm per cell:

| brush | width | cells across |
|---|---:|---:|
| the #2 flat, measured §10b | 9.94 mm | **20** ✓ |
| a ½-inch flat | 12.7 mm | **25** ✓ |
| the #12 filbert, measured §11b | ~17 mm | **34** ✓ |
| a fine rigger | ~1 mm | **2** — a mark, not a tuft |

**`[RESOLVED 2026-08-31]` The #8 really is half a millimetre**, confirmed by the
artist against the question. **And it does not move the cell size**, which is
worth understanding, because the first reading of it said the opposite.

Simulating it as a tuft would need 8 cells across it — 0.06 mm per cell, which
over a 16 × 20 board is **66 million cells.** Not possible.

**But there is nothing there to simulate.** Half a millimetre of chisel is four
or five filaments. It does not splay, it does not carry a belly of paint, it
cannot lead with one side — not in the engine and *not in reality either*. A tuft
model would be inventing structure the tool does not have. **It is a line-maker,
so it is DRAWN, not simulated** — the same route `canvas.ts` already gives the
pencil and the ballpoint through `INK = SIM * 4`.

**So the line falls here:**

| | |
|---|---|
| **~4 mm and up** (8+ cells) | a simulated tuft: splay, belly, reservoir, footprint |
| **below ~4 mm** | a drawn mark at ink resolution; paint behaviour simplified |

`[NOTE, and it is a good sign]` **The brush library was already built to this
scale without anyone naming it.** `library.ts` gives round-sable `length` 26,
flat-sable 24, flat-hog 22 — at 0.5 mm per cell that is 11–13 mm, and the
artist's #2 flat measured 9.94 mm. The proportions were right before the scale
existed.

`[ONE THING TO CONFIRM WHEN CONVENIENT, NOT BLOCKING]` A flat is a chisel: wide
across the face, thin across the edge, and 0.5 mm is a very ordinary *thickness*
for one. If the rule was laid across the thin edge, the face is likely several
millimetres and the brush is simulatable after all. **It changes which side of
the line that one brush sits on. It does not change the cell size**, which is why
it is not blocking.

### 13d. "Changeable and customizable" forces its own decision

Two ways to honour it, and they feel completely different to paint on:

- **(a) Fixed grid, cell size follows the canvas.** Memory constant. But a 24 × 36
  board gets 1.1 mm cells and **the same brush behaves coarser on a bigger
  canvas.**
- **(b) Fixed cell size, grid follows the canvas.** Paint behaves identically at
  any size, which is what an artist expects. Memory scales with area, so it needs
  a ceiling.

**`[RATIFIED 2026-08-31 — the artist chose (b)]` Fixed cell size.** Paint behaves
the same on every canvas. Hold 0.5 mm per cell up to about 16 × 20 (0.83 M cells,
89 MB); past that the cell grows rather than the budget, and the artist is told
rather than surprised. **A bigger canvas must not blunt the brush** — that is the
sentence to keep when the details are forgotten.

`[SETTLED]` **0.5 mm per cell stands**, and 13c is why: the #8 turning out to be
genuinely tiny does not pull the cell size down after it, because that brush is
drawn rather than simulated.

**And it makes the grid non-square, which is real work.** `SIM` is one constant
used as `[SIM, SIM]`; 16 × 20 is 4:5. Every pass that assumes a square grid has to
stop assuming it. That is a build item, not a decision.

---

## 14. Step 0 is built — one switch per behaviour, and it works

**2026-08-31.** §4's Step 0: one flag per §3 behaviour so oil can be built back
up one at a time. All six switch, each was verified independently, and every
figure below was reproduced on a second identical run before it was written down.

### 14a. What was built

`P.oilFlags`, one bit per behaviour, in a new seventh row of the fluid `Params`
struct alongside the engine's first physical scale (`cellMM` 0.5, `threadMM`
0.864, and `coverRate` reserved for Step 1).

| bit | | behaviour | gated at |
|---:|---|---|---|
| 1 | `OIL_BRIDGE` | tooth gate fills as paint builds | `deposit.wgsl` |
| 2 | `OIL_GATE` | contact ramp narrowed by viscosity | `deposit.wgsl` |
| 4 | `OIL_LEVEL` | `level_fresh` — settling the hair comb | `level_fresh.wgsl` |
| 8 | `OIL_EXCHANGE` | `rExchange` + the TVD "unlike" metric | `deposit.wgsl` |
| 16 | `OIL_SMEAR` | the brush pushing paint already down | `deposit.wgsl` |
| 32 | `OIL_RELEASE` | workable body releasing the teflon floor | `deposit.wgsl` ×2 |

`OIL_ALL` (63) is the default and is exactly the paint that shipped. `OIL_NONE`
is bare oil. Host side: `engine.setOilBehaviours(flags)`.

**`level_fresh` is gated inside the shader, not by skipping the dispatch.** The
dispatch site carries a warning that gating it there leaves a smear flux written
and never applied, silently discarded by `flux_compute` later in the frame. The
flag sits at the same early return watercolour has always taken, which is a
proven path.

### 14b. The ladder — one behaviour at a time, from bare

Flat hog, oil, ultramarine, 96 inputs, one straight stroke.

| | wet cells | film | brush holds |
|---|---:|---:|---:|
| **bare oil** | 6629 | 416.971 | 72.73 % |
| + Bridge | 6629 | 422.350 | 72.92 % |
| + Gate | 6627 | 421.275 | 73.04 % |
| + Level | 6660 | 418.733 | 72.26 % |
| + Exchange | 6629 | **416.971** | **72.73 %** — *no change at all* |
| + Smear | 6635 | 415.141 | 73.22 % |
| + Release | 6629 | 404.185 | 76.21 % |
| **all six (shipped)** | 6663 | 413.953 | 76.78 % |

**Release is the heaviest single behaviour on this stroke** — 12.8 of film that
stays on the brush instead of the canvas.

### 14c. THE TRAP THIS ALREADY CAUGHT — behaviour 4 is invisible twice over

`+ Exchange` changed nothing. It is not miswired. It is doubly hidden, and both
halves fall straight out of its own formula:

```
rExchange = upRate × cover × loose × workableBody × unlike
```

1. **`unlike` is zero when a colour meets itself.** The ladder paints ultramarine
   onto ultramarine, so the TVD metric is 0 and no trade can happen. **On a
   crossing in two colours it appears at once:**

   | blue stroke, then yellow across it | film | brush holds |
   |---|---:|---:|
   | bare | 715.918 | 69.72 % |
   | Release only | 694.780 | 71.39 % |
   | **Release + Exchange** | **680.859** | **75.54 %** |

2. **`workableBody` is what `OIL_RELEASE` gates**, so behaviour 4 does nothing
   whatsoever without behaviour 6 — confirmed, on a crossing, twice:

   | | film | brush holds |
   |---|---:|---:|
   | bare (0) | 715.918 | 69.72 % |
   | Exchange alone (8) | **715.918** | **69.72 %** — identical |

**`[CARRY THIS INTO STEP 2]` The bare-oil look must include a crossing in two
different colours, and behaviour 4 must be judged with behaviour 6 already on.**
Judged the obvious way — one colour, one behaviour at a time — behaviour 4 reads
as doing nothing and would be dropped for entirely the wrong reason. It is
ratified plan work (`18-oil-body.md` §5 step 2); it would have been thrown away
by a correct-looking procedure.

### 14d. Watercolour is untouched, and one leak was caught getting there

Same stroke in watercolour, flags all on and all off:

| | wet cells | film | brush holds |
|---|---:|---:|---:|
| flags 63 | 3151 | 277.536 | 61.75 % |
| flags 0 | **3151** | **277.536** | **61.75 %** |

Identical, as it must be: the flags are for looking at bare *oil*, not for
disabling the engine.

**It was not identical on the first cut.** Five of the six sites already sit
inside a `yieldStress > 0` branch, so they were oil-only for free — but the smear
block does not, and gating it on the flag alone took watercolour's smear away
with the paint's. Caught by testing water as well as oil, before commit. The gate
is now `P.yieldStress <= 0.0 || flag`.

### 14e. Method note

Every row here was run twice on an identical command and matched to the last
decimal before being written down. The first attempt at this test reported
**zero film and zero cells**, which is the exact signature of the broken deposit
pipeline that cost two sessions in `19`. It was not: the stylus sample in the
harness was malformed (`down` missing), so the resampler emitted no segments at
all. **`count: 0` at the drain distinguishes the two in one line, and is worth
checking first every time.**

---

## 15. EARMARKS — everywhere we chose to diverge, and what it costs to come back

**Written 2026-08-31 at the artist's request, before he goes to look at bare
oil.** Every entry is a place where a decision was deliberately deferred, a
branch was taken over an alternative, or something was found and parked. None of
these is a bug list. **They are the places where "we decided not to decide yet",
so that coming back to them is a choice rather than an archaeology.**

Ordered by what it costs to reopen, cheapest first.

### 15a. Cheap — a session or less, nothing downstream moves

| # | earmarked | where | to reopen |
|---|---|---|---|
| E1 | **The #8 flat may be a thickness, not a width.** A flat is a chisel and 0.5 mm is an ordinary *edge*. If the rule went across the thin way, that brush is several mm and sits on the simulated side of the line instead of the drawn side. | §13c | One measurement. Changes which side of the line one brush sits on; **does not** change the cell size, which is why it was not allowed to block. |
| E2 | **One more fast pass, held flat.** The Fast stroke's 48 mm void is nearly five brush widths and its far end recovers to 59 % — that reads like a lifted brush, not skipping. "Fast deposits less" is solid; "fast skips 48 mm" is not. | §11c | One stroke, rule in frame. |
| E3 | **A tear at a known brush width.** The four tear strokes were a #12 filbert, so their widths cannot be set against the #2 flat's. | §11f | One stroke with the flat. |
| E4 | **The crossing carry is one frame.** ~55 % held flat for 8 mm then gone by 16 mm. The plateau-then-knee *shape* is unambiguous over 24 points; the **percentage is unreproduced**. | §10f | A second crossing photograph. Until then quote the shape, not the number. |
| E5 | **`src/ui/palette.ts` is dead code** — imported nowhere; the live UI is the React studio. It already cost one wrong edit. | — | Delete it. Careful: `.pal-btn` and `.loading-row` are still used by the React tree. |

### 15b. Medium — a decision is owed, and something waits on it

| # | earmarked | where | to reopen |
|---|---|---|---|
| E6 | **`coverRate` is written but unused.** The seventh params row carries it at 0 so the schema settles once instead of twice. | §14a | Step 1 fills it. Invariant 2 binds it: **fraction per millimetre travelled**, never per frame. |
| E7 | **The grid is square and the canvas is 4:5.** `SIM` is one constant used as `[SIM, SIM]`; a 16 × 20 board is not square. | §13d | Every pass that assumes a square grid has to stop. Work, not a decision — but it is a real slice of work and nothing above it can ship without it. |
| E8 | **`SIM` is 512 and the ratified scale wants ~1016 × 813.** 512 was set conservatively below what the bench proved (1024² at 3.78 ms). Cell state goes 28 MB → 89 MB. | §13a | Raise it deliberately, with the memory noted, not as a side effect of something else. |
| E9 | **Behaviour 4 cannot be judged alone.** `rExchange` is zero without behaviour 6, and zero when a colour meets itself. | §14c | **Carry this into Step 2.** The bare-oil look must cross two different colours with release on, or ratified work gets dropped for the wrong reason. |
| E10 | **Two pigments are recipes, not measurements** — if the Zorn palette is built before BE16 is found. Yellow Ochre and Cadmium Red Light mixed from the measured twelve. | §9 | They are replaced the day real spectra land. Label them as recipes so nobody later reads them as measured. |

**Added 2026-08-31 with §16:**

| # | earmarked | where | to reopen |
|---|---|---|---|
| E16 | **A brush that runs dry mid-stroke stops interacting with the canvas entirely.** `brush.ts` emits a contact only `if (w > 0 \|\| pig > 0)`, so an empty tuft is invisible to the sheet: it cannot push, pick up or scrub. A dry brush is exactly what you scrub *with*. | §16b | Widening the gate touches **every medium and every brush that runs dry**, so it needs its own measurement, not a side effect of an oil experiment. Bears on E18's stranded paint and §11d's run-out. Currently opened for smudge mode alone. |
| E17 | **Turning `OIL_RELEASE` off audibly slowed the artist's GPU fans.** Real signal, mechanism unknown, no story offered. | §16d | One frame-time measurement with the flag on and off. |
| E19 | **The smear's carry distance is per FRAME, not per distance travelled.** Its fraction compounds over travel correctly, but the flux it writes reaches one cell and is applied once a frame — so paint moves two or three cells however fast the brush goes and however high the dial. Invariant 2's exact shape, in a place the invariant was never read as reaching. | §16g | The shove must carry a distance proportional to travel: sub-step the smear within a frame, or give the flux reach. **Shared with normal oil painting**, so it needs its own measurement and its own decision — not a side effect of the smudge experiment. |
| E18 | **The six §14 behaviours are near-invisible to the eye** even though five of six move the numbers. The artist could pick out only comb settling, and prefers it off. | §16d | Says the §14b ladder measures something finer than the eye reads. Revisit when the rebuild reaches behaviour 3. |

### 15c. Expensive — reopening moves things downstream

| # | earmarked | where | to reopen |
|---|---|---|---|
| E11 | **The weave you SEE is being split from the tooth you FEEL.** D14 leans on this: the compositor draws threads at screen resolution; the sim grid carries only the fraction. | §12c, §10e | If the split turns out not to hold — if the *physical* tooth needs thread resolution after all — D14's cost argument weakens and the grid question comes straight back. **This is the load-bearing assumption of the whole rebuild.** |
| E12 | **0.432 vs 0.5 mm per cell.** §10e's 0.432 came from one measured brush over a 23-cell blade; §13 ratified 0.5 as the round number. They are not the same and the difference is 16 %. | §10e, §13a | Nothing depends on the distinction yet. It will the moment a brush row is sized in millimetres rather than cells. |
| E13 | **The library's brush rows are still in cells.** `length: 22`, `widthRatio: 1.05`. They happen to land at 11–13 mm, which is right — but by luck, not by construction. | §13c | Once `cellMM` is real, those rows should be authored in millimetres and converted, or they will drift the first time the cell size moves. |
| E14 | **BE16 is lost and its successor is offline.** The library is reproducible from `data/be16-ks.csv`, but only the twelve already built. Cadmium Red Light is in BE16 and unrecoverable from the CSV. | §9 | Three ranked sources; none started. Needs the artist's OK to download. |
| E15 | **`docs/18` §5 step 3 is still his and still open** since 2026-08-27: one oil pass at Flow well above default (is the thickness right?), and a crossing (how strong should the carry feel?). | `18` §5 | Zero code. It is a verdict, not a task. §10f now gives it a measured number to argue with. |

### 15d. The one that is not an earmark

**`19`'s frame-invariance work is not on this list and must not be reopened** —
the pickup exponent, the readback settle, the lift seeing its own frame's paint,
the `rubbed` ceiling, the trimmed tone metric. §5 already says it: every one is
invariant 2 work, applies to watercolour identically, and reverting any of it
restores measured faults in both media and blinds the bench that would judge the
rebuild. **It is the floor, not part of the pile.**

---

## 16. Smudge swap — an experiment, and the gap it uncovered

**Artist's brief, 2026-08-31. EXPERIMENTAL, oil only, for now — not a decision,
not on a card.** It is here to be tried and thrown away if it does not feel
right.

> One dial, 0 to 5 seconds. Hold the pen **off** the canvas for that long and the
> mode flips. Paint becomes Smudge: the brush is empty, lays nothing, and only
> pushes the oil about. Lift again for the same period and the load comes back,
> same colour and loading as before. Text top right says which mode you are in.

**The lift is the only trigger, both ways.** Nothing about painting duration
enters into it: a stroke may run as long as it likes, and the brush only changes
state while it is off the sheet. **One flip per lift** — holding the pen up for
three times the delay flips once, not twice, or a long pause would feel like
nothing had happened.

`[DECIDED, and say so]` **0 means off**, and is the default. A zero-second unload
would be a brush that is never loaded, which is not a mode anybody wants.

### 16a. What a smudge is, mechanically

No shader change. `deposit.wgsl` already documents `brushTake / brushGrab` as the
**room** the tuft has, and `1 -` that as how laden it is — *"the share of its grab
that cannot be drunk and is shoved instead."*

So smudging is **`brushTake = 0` with `brushGrab` untouched**: no room, therefore
fully laden, therefore the whole grab goes down the shove route. That is the
engine's own description of a brush too full to take any more, which is exactly
what pushing paint about is. An empty brush left to itself would do the
*opposite* — all room, all drink — and hoover the picture up.

### 16b. Two faults, both found by measuring rather than by looking

**1. The brush re-dips at the start of every stroke.** `stroke.begin()` calls
`reservoir.charge(this.mix, this.loading, this.waterCharge)` — a fresh dip per
stroke is deliberate and correct. But it meant emptying the tuft lasted exactly
until the next stroke started. `rinse(0)` clears the mix, so no *colour* came
back — and the brush refilled with **clear medium** and laid **248 of film with
no pigment in it.** The loading has to go to zero too, because that is what
`begin()` re-dips *with*. Fixed by charging an empty mix at zero loading.

**2. AND THE ONE THAT MATTERS — an empty brush is invisible to the canvas.**
`brush.ts` emits a contact segment only `if (w > 0 || pig > 0)`: a hair reports
itself only when it had something to give. So the empty tuft emitted **zero
segments**, the engine never learned it was touching, and the smudge moved
**0.04 of 360 film — nothing at all**, reproduced twice.

> **`[FINDING — and it is wider than this experiment]` A brush that runs dry
> mid-stroke stops interacting with the canvas entirely.** It cannot push, it
> cannot pick up, it cannot scrub. It simply ceases to exist as far as the sheet
> is concerned. That is physically wrong — a dry brush is exactly what you scrub
> *with* — and it bears directly on E18's stranded paint and on §11d's run-out.

**It was NOT widened here.** Opening that gate for everything would change every
medium and every brush that runs dry, which is not what an experiment marked
"oil only, for now" may do. A `smudging` flag opens it for exactly one case: the
load is zero so nothing is laid, and the contact exists so the shove can see it.
**The general fix is earmarked (E16), not taken.**

### 16c. What it measures

Blue bar laid, pen lifted into Smudge, then a stroke dragged across it:

| | |
|---|---:|
| segments emitted by the empty brush | **15 070** (was 0) |
| film laid | **−0.04** — nothing |
| brush load afterwards | **0** — it drank nothing |
| film displaced | **5.1 / 3.8** across two runs |

So it lays nothing, drinks nothing, and moves paint — which is the shape asked
for. **The amount is gentle**: about 1.4 % of the whole bar per crossing stroke,
and the crossing only touches a fraction of it. `smearStrength` is at its default
1.0 and `teflonMin` is 0.18, so nothing is throttling it — it is simply the
engine's existing shove.

`[FOR THE ARTIST, NOT THE BENCH]` Whether that is *enough* smudge is a feel
question of exactly the same class as §10f's carry, and `smearStrength` is
already the named dial for it (`19` E-notes: "the dial to turn if the amount is
wrong; the mechanism is the claim"). **Do not tune it from a number.**

### 16d. Two observations from the artist, recorded not chased

1. **"I can't see what any of those knobs do, really. Perhaps I see comb
   settling — and I think I like it turned off."** Taken at face value: the six
   §14 behaviours are individually near-invisible to the eye even though five of
   six move the numbers. That is itself worth knowing, and it says the ladder in
   §14b measures something finer than the eye is reading. **Comb settling off is
   a preference to revisit when the rebuild reaches behaviour 3.**
2. **"When I turned off Release, my GPU fans slowed."** Real signal, mechanism
   **unknown**. `OIL_RELEASE` gates `workableBody`, which appears in both the
   exchange rate and the smear's `loose` term — but the arithmetic there moves
   `loose` only from `w0.y` to `0.82 · w0.y`, which is not a fan-audible amount.
   **No story is offered.** It wants a frame-time measurement with the flag on
   and off, not a guess.

### 16e. Making it stronger — what moved, what did not, and the wall

**Artist, 2026-08-31:** *"Make the smudge stronger. I want it to 'paint' because
that bit of smudging and smoothing is half the battle when it comes to oils."*

**Done as far as the mechanism goes: `smearStrength` 16 while smudging**, the
medium's own value restored on the way back, so a loaded brush paints exactly as
before. That is **twice** the carry — and it is the ceiling, not a choice.

| | drag per pass | note |
|---|---:|---|
| `smearStrength` 1 (as shipped) | **0.53 cells** | |
| `smearStrength` 4 | 0.78 | |
| **`smearStrength` 16 (now, while smudging)** | **0.99 cells** | |
| `smearStrength` 64 | 0.99 | **no better — `fraction` is pinned at its 0.9 clamp** |

Churn inside the crossed region over the same change: **10.5 % → 24.3 %.** Mass
conserved at 100 % throughout; nothing is created or lost.

**One pass of the smudge brush drags paint about one cell — half a millimetre.**

### 16f. Two hypotheses tested and killed

Neither of these is the limiter, and both looked right on paper:

1. **"Oil's yield stress gates most hairs out."** `shoveStep` returns zero
   whenever `reach <= P.yieldStress`, and oil's is 0.34, so at moderate pressure
   many hairs should contribute nothing. **Refuted:** dropping the yield to 0.02
   changes the drag not at all — 0.53 → 0.53 at smear 1, 0.99 → 0.99 at 16.
2. **"Let the brush pick paint up and put it down, which is what smudging really
   is."** **Refuted, and it is worse on both counts:** drag falls to 0.12 cells
   *and* the sheet loses 6.5 % on one pass, 8.2 % over four — the tuft hoovers
   paint off the canvas instead of carrying it. Shove-only was right.

### 16g. THE WALL, and it is a familiar shape

> **The shove's FRACTION scales with how far the brush travelled. The DISTANCE it
> carries paint does not — it is always one cell, once per frame.**

`shoveStep` compounds its fraction over travel — `grabPart = 1 - pow(1 - grabShare,
min(speed, 4))` — so a fast stroke correctly gives up more of each cell's film.
But the smear flux it writes is a `vec4` of the **four immediate faces**, so
whatever is given up lands **one cell away**, and it is applied **once per
frame**. A brush crossing a bar is over any given cell for two or three frames,
so the paint moves two or three cells at most, whatever the dial says.

**That is a per-frame quantity where a per-distance one belongs — the exact shape
`00-invariants.md` §2 forbids, and the exact shape that made the fish-scale hunt
in `19` last a week.** It has simply never bitten before, because until now
nobody asked the smear to carry paint anywhere.

`[EARMARKED E19, NOT TAKEN]` Fixing it means the shove must move paint a distance
proportional to the brush's travel rather than one cell per frame — sub-stepping
the smear within a frame, or giving the flux a reach. **It is shared with normal
oil painting**, so it is not something an experiment marked "oil only, for now"
may change underneath everything else. It wants its own measurement and its own
decision.

`[WHAT THIS MEANS FOR THE ARTIST]` Smudging is now twice what it was and it is
still gentle, because gentle is all this mechanism can be. If it still does not
feel like painting, **the answer is not a bigger number** — every number is
already at its stop. It is E19.
