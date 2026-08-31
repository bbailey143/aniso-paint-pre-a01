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

**Step 1 — look at bare oil.** Paint with everything in §3 off. Expect it to
look wrong; the point is to find out *how* wrong, and which complaint returns
first. That complaint names the behaviour that has earned its place.

**Steps 2..n — add back in the order the paint asks for**, one at a time,
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
exactly what D13 says the artist should be able to do for themselves. Cadmium
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
