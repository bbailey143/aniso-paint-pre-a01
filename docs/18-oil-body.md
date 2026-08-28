# 18 — Oil body: why it reads thin, and what to try

**STATUS: §2 and the mass thread are DONE — `docs/16` E10 has the numbers.
Steps 1 and 2 of §5 are executed; 3, 4 and 5 remain and are the artist's to
start. §3's diagnosis stands but its premise moved: the film is no longer a
sixteenth of the tooth, it now reaches 0.263 against 0.30.**

**Opened 2026-08-27 by Claude (Fable 5), on `tuft-fill`.** Written at the
artist's instruction: *"I believe the oil paint is missing body (which I think
should be mass) which is why it's missing height and doesn't look quite right.
Do not build anything, but document any suggestions."* Nothing in this file has
been built. Everything below is either a measurement already on record
(cited) or **[UNVERIFIED]** reasoning to be tested before it is trusted.

---

## 1. What "body" already is, and what it is not

The artist's instinct — body should be mass — is what the engine already
believes. **The film height `w0.y` IS the paint's mass.** There is no missing
variable waiting to be added: every unit deposited raises the height, height
never leaves (oil neither evaporates nor absorbs), and E10 (HANDOFF Part B)
measured a four-pass pile holding its height to 0.08 % over 600 idle steps.

**Do not build a second height field.** E10 already ruled on this: the paste
solver flows `w0.y`; a parallel body field would give oil two heights and
leave the solver moving the one that is no longer the paint. The problem is
not that mass is missing from the model. It is that (a) mass stops
accumulating too early, and (b) the mass that IS there is nearly invisible.
Those are the two threads below.

## 2. The mass thread — the pile saturates, and pickup is the prime suspect

E10's stacked passes: +0.56, +0.25, +0.12, +0.08. Real oil keeps building;
this converges. E10 named two candidates and did not chase them. Since then,
docs/17 Part A (`8e4b0d9`) has made one of them **much stronger**:

**[UNVERIFIED] Suspect 1 — the brush now eats its own pile.** Part A made
contact an exchange: `rExchange` lifts paint whether or not the tuft has room,
precisely so a full brush can trade with the layer below. But an exchange has
no idea whether the paint below is *different* paint. A loaded yellow brush
restating its own yellow stroke now lifts yellow at the full exchange rate
while laying yellow down — a swap that nets toward zero. That is exactly the
signature of the E10 curve: each pass adds less because each pass also
removes more (the pile is taller, so `canvasQuantity` is bigger).

*The measurement that settles it, before any code:* rerun the E10 four-pass
stack on the current build with pickup off (`upRate` forced 0) vs on. If the
off-column keeps climbing where the on-column saturates, this is the cause.
Costs one bench run.

*The fix shape, if confirmed:* scale `rExchange` by how unlike the two paints
are — the slot-space difference between what the brush carries and what the
cell holds. Same-on-same collapses to pure addition (which is what stacking
paint IS); yellow-through-blue keeps the full exchange docs/17 was built for.
This would raise body without touching a single deposit number, and without
reopening the pickup verdict. **[UNVERIFIED — the difference metric and its
curve are a design choice, not physics; keep it monotone and test the
crossing bench before believing it.]**

**Suspect 2 — the deposit gate — is likely innocent.** Once `bridged` reaches
1 the gate opens fully (`gate = base + (1-base)*bridged`, deposit.wgsl:313),
so a tall pile does not throttle further deposit. Check it anyway while
instrumented for suspect 1; it is one more printout.

## 3. The height thread — the mass that exists is nearly invisible

A loaded oil stroke measures ~0.018 of film per wet cell against a canvas
tooth of 0.30 (library.ts:87). The paint is a **sixteenth** as tall as the
weave it sits on. Everything downstream is asked to render impasto from a
film thinner than the texture of the ground.

Three consequences, each with a suggestion:

**(a) Height only reaches the eye through slopes.** The composite shades by
the film's gradient (`paintGx/paintGy`, composite.wgsl:713). A thick FLAT
passage and a thin flat passage light identically except through the optical
`hidesGround` term. Real oil does not work that way on canvas either — which
is the clue: real impasto is read almost entirely at **ridges and stroke
edges**, where the brush ploughed paint aside and left a berm. The engine has
no berm. The shove moves loose film exactly one cell along the travel
direction (E9: "it nudges the blue along instead of clearing it") and nothing
moves **sideways or piles at the stroke's end**.

**[UNVERIFIED] Suggestion — displaced paint must go somewhere.** When the
tuft presses into standing film, the film it displaces should pile at the
footprint's edge — a lateral shove, conservative (ledgered like every other
flux), strongest where pressure is highest. This is one mechanism buying
three looks at once: the raised edge along a stroke laid through wet paint,
the blob where a stroke stops, and visible furrows when a stiff brush drags
through a pile. It also gives `yieldStress` something to finally do: berms
steep enough to clear 0.34 would slump back a little, which is the fat,
settling look of the real material. This is the largest build suggested here
and should come **after** the mass thread, because berms made of a film this
thin would be invisible anyway.

**(b) The per-dip amount may simply be low.** `withdraw` gives
`downRate × flow` per cell travelled of what each hair holds, and E10's mean
film per pass is 0.07. Before touching `downRate` (0.55, shared shape with
other media), note that the artist already owns two dials that raise laid
mass with no code: **load** and **flow**. *Suggestion: have the artist paint
one pass at flow well above default and say whether the thickness — not the
colour — starts to look right.* If yes, the fix is a per-medium flow default,
one line, rather than new physics. If no amount of flow looks right, the
problem is confirmed to be (a)/(c), not quantity. Costs zero code either way.

**(c) `relief` is a single scalar against a tooth 16× taller.** Oil's
`relief: 26` feeds `paintRelief`, and `standingBody` and `paintShare` both
scale from it. It may be doing its job — E11 showed the shade floor was the
real thief — but nobody has looked at oil's relief since the blade fix and
the deeper shadow landed. *Suggestion: only after (a) and (b), sweep relief
at the easel, artist judging. It is a dial, it is his.*

## 4. Noted, not actionable now

- **`bodyShrink 0.85` still cannot fire** (E10): oil's film never reaches
  `WET_EPS`, so cure-driven sinking is unreachable. Any future cure look must
  key on `w`, not on the film vanishing. Unchanged; recorded so nobody
  rediscovers it.
- **Oil not slumping is correct.** Slopes sit far under `yieldStress` 0.34.
  If berms (3a) ever exist, occasional slumping becomes a feature, not a bug.

## 5. Order of attack, when building resumes

1. ~~The one-run measurement in §2 (pickup off vs on, four-pass stack).~~
   **DONE 2026-08-27.** Confirmed outright: 1.007 with pickup off against
   0.174 with it on. `docs/16` E10.
2. ~~If confirmed: like-paint exchange scaling — this is the mass fix.~~
   **DONE.** Plus three more faults it uncovered — the holding ledger, the
   film's monopoly over the tuft, and pickings never working inward. Stacking
   is now 0.897 and four passes reach a peak film of 0.263 against a 0.30
   tooth. All three docs/16 E9 open faults are closed with it.
3. **NEXT, and it is the artist's:** the zero-code flow test in §3b. Paint one
   oil pass at flow well above default and say whether the THICKNESS looks
   right. Also judge the crossing — how strong pickup should feel is his call
   and his only accepted number is still "3 % feels correct".
4. Only then the berm (§3a). Its premise has changed for the better: the film
   is no longer far thinner than the weave, so a berm would now be visible.
5. Relief sweep (§3c) last, artist judging.

~~None of this reopens the docs/16 E9 pickup verdicts; the three open faults
there (fade, strength, 100.7 % holding) still come first in the queue.~~
**SUPERSEDED:** doing the mass work turned out to BE the E9 work. The fade and
the strength were one fault — a tuft-wide film handed whole to every hair — and
the holding figure was a mis-measurement, not created paint. See `docs/16` E10.
