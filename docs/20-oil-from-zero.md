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
