# 19 — Making the paint sit ON the canvas, not float above it

**Opened 2026-08-28 by Claude (Fable 5), on `tuft-fill`.** Written at the
artist's instruction, with his screenshot of a blue/yellow crossing: *"Document
any suggestions for how to make the paint look more like it's on the canvas.
The shadow is making it look like it floats."* Nothing here is built.
Everything is either read from `composite.wgsl` as it ships (anchored) or
**[UNVERIFIED]** reasoning to be tested before it is trusted.

---

## 1. What the eye is reporting, in the screenshot's own terms

The strokes read as **stickers**: crisp, uniformly-outlined shapes hovering a
millimetre off the cloth. Three visual cues produce that reading, and the
current lighting produces all three:

1. **The shadow rings the whole mark.** A real ridge is dark on the side away
   from the lamp and lit on the side toward it — an outline that is dark all
   the way round is what a die-cut edge looks like.
2. **Nothing falls on the canvas.** All the darkening lives on the paint's own
   pixels. A real object pressed onto cloth throws its shade onto the CLOTH
   beside it; that spill is the single strongest "these two things touch" cue
   the eye has, and it is entirely absent.
3. **The paint is smoother than what it sits on.** Inside the stroke the weave's
   embossing is gone while the surrounding canvas is strongly textured. A
   smooth patch on rough cloth reads as a separate object lying on top; thin
   paint on real canvas DRAPES — the threads emboss through it until the paint
   is genuinely thick enough to bury them.

## 2. Why the lighting does each of those — anchors, no speculation

**The silhouette is the steepest slope in the picture.** Since E10 a stroke
carries ~0.26 of film, and at its boundary that falls to zero across a cell or
two. No interior brush ridge is remotely that steep, so the relief shading
(`paintGx/paintGy`, composite.wgsl:713–714) spends its whole range tracing the
outline. The 6-cell sampling span (`paintLightSpan`, :698) widens the traced
band without softening the cliff — the edge still dominates the gradient.
**Note the irony:** E10 made this WORSE by making the paint five times taller.
The floating look is partly the price of the body fix, which is why it shows
now and did not before.

**The deep shadow floor keys on slope, not on which slope.** `paintShare`
(:762) routes the 0.25 floor to any pixel whose tilt comes from paint — edge
cliffs first, since they are the steepest. Direction is left to `lambert`, and
with the lamp high (`lightDir` z = 0.78, :718) the away-side of a cliff goes
deep while the toward-side catches a rim of light — so the mark is RINGED, dark
one side, bright the other, everywhere on its perimeter. That ring is cue 1.

**Shade multiplies the paint only.** `shade` scales the pixel being drawn, and
a pixel just OUTSIDE the mark has no paint gradient — so shadow stops dead at
the silhouette. Cue 2 has no mechanism at all today: there is nothing in the
compositor that lets a ridge darken the sheet beside it.

**The weave is removed from under the paint too early, and by the wrong
quantity.** `seen` (:625) fades the paper's embossing by `hidesGround × (laid ×
thickScale + standingBody)` — an OPTICAL amount, pigment in the light path. But
whether threads still shape the SURFACE is a geometric question: film height
against tooth height (0.30). A one-pass stroke (~0.075 peak) optically covers
well at `hidesGround 2`, so `seen` kills the weave's shading — while
physically a film a quarter the height of the threads should still be draped
over every one of them. Cue 3 is this conflation.

## 3. Suggestions, in the order they should be tried

**(a) Measure the ring before touching it.** One probe: sample the composited
tone at N points around a stroke's perimeter and plot against angle to the
lamp azimuth. If the dark band is near-uniform rather than lobed toward the
away side, part of the ring is not lambert at all and the fix hunts elsewhere
first. Cheap, and it gives the "before" for everything below.

**(b) Let the weave emboss through the paint.** Fade the paper's shading
gradient by film-vs-tooth (`w0.y` against `P.toothAmp`) instead of by the
optical `seen`, or blend the two so colour-coverage and surface-burial are
separate questions. Thin and medium paint then carries the canvas texture
INSIDE the mark, matching its surroundings — cue 3 gone, and it is the
cheapest of the three fixes: a change of one fade term, watercolour untouched
at `paintRelief 0`. **[UNVERIFIED — the blend curve is a design choice; judge
against the screenshot.]**

**(c) Ground shadow: let the ridge shade the sheet it stands on.** In the
compositor, sample the film height a short step TOWARD the lamp
(screen-space, along `lightDir.xy`); if taller paint sits there, darken this
pixel by an amount falling off with distance. Costs a couple of taps, needs no
new buffer, and puts shade ON THE CANVAS on the away side of every ridge —
cue 2, the strongest grounding cue. It also softens the outline into something
attached to the ground plane. **[UNVERIFIED — step length and falloff are feel
numbers; sweep on the bench like `SURFACE_BLEED` was.]**

**(d) Stop the silhouette monopolising the shading range.** Compress extreme
slopes before lighting (e.g. shade from the gradient of a saturating function
of height rather than raw height), so a 0.26-to-0 cliff and a genuine interior
furrow stop differing thirtyfold. Interior brushwork then becomes visible
relative to the edge instead of being flattened by comparison — this is also
what §18's berm needs to look right when it arrives. Try only if the ring
survives (b) and (c). **[UNVERIFIED.]**

**(e) The lamp itself, last.** `lightDir` is fixed at elevation ~0.78 — a high
lamp gives short, tight shading, which is part of why the shadow reads as an
outline rather than as light falling across a surface. If (b)–(d) are not
enough, a slightly lower lamp for canvas grounds lengthens every cue at zero
per-pixel cost. Artist's call, at the easel.

## 4. What NOT to do

- **Do not soften the paint's edge in the SOLVER.** The film cliff is real —
  oil holds a sharp edge; that is `yieldStress` doing its job. This is a
  lighting problem, and it should be fixed where the light is.
- **Do not shrink `paintRelief` or raise the 0.25 shade floor to hide the
  ring.** Both would re-flatten the interior that E11 and the artist's
  0.82→0.45→0.0→0.25 sweep just won. The floor's history is in
  composite.wgsl:727; reopening it casually costs that work.

## 5. Order of attack, when building resumes

1. The perimeter probe in §3a — the instrument, before any dial.
2. Weave-through-paint (§3b) — cheapest, and likely half the float on its own.
3. The ground shadow (§3c) — the strongest cue, one screen-space term.
4. Slope compression (§3d) only if the ring survives 2 and 3.
5. The lamp (§3e) last, artist judging at the easel.
