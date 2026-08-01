# CARD 14 — Dry media: the route

The definitive plan for dry media. Four phases. Phase 1 is live; the rest are
planned, not started.

Dry media already exist: ten tools (9B/2B/HB/2H graphite, two ballpoints, vine
charcoal, conté, wax crayon, chisel fountain) over the shared deposition path in
[`src/media/dry-tool.ts`](../src/media/dry-tool.ts) and
`shaders/fluid/dry_deposit.wgsl`. The property surface is
[Card 7](07-media.md). This card is about what happens next, and in what order.

## The order, and why

Bartford's call: **Phase 1 first, so the rest go smoothly.** That is right — the
other three all build on the shared equations, and tuning them after the fact
means revisiting everything downstream.

The proposed order of the remaining three is a **recommendation, not ratified**:

| | Phase | Why here |
|---|---|---|
| 1 | **Make the ten existing tools feel right** | Everything else sits on these equations. Fixing them later means re-tuning every row added in between. |
| 2 | **Smudging, blending, erasing** | A *shared mechanic*, not a per-medium one. Build it before adding media, or every new row has to be revisited to support it. |
| 3 | **The dry-media studio (D13)** | Authoring tool. Building it before bulk-adding media is what makes adding them cheap, and it is what D13 (b) demands — see the tool *and its mark*. |
| 4 | **Add new dry media** | Deliberately last. Per D3 a medium is a row, not a code path, so once the mechanics are complete and the studio exists, each new medium is cheap. Doing this first is the expensive order. |

Note this inverts Bartford's original 2 and 4. The reason is dependency, not
preference: soft pastel, oil pastel, coloured pencil and chalk all want
smudging, and all want authoring. If he wants specific media sooner, say so —
the order is a recommendation.

## Phase 1 — make the ten existing tools feel right `[LIVE]`

**Everything in the dry path is `[UNVERIFIED]`.** `dry-tool.ts` says so in its
own header: the response curves are reasoned from Card 7, not measured. So the
question is not "is the code correct" but "does the mark look like the tool".
That is Bartford's judgement, not a model's.

Two candidates found by reading the code, both untested against his eye:

### 1a. Speed resets to zero at the start of every stroke

`DryTool.begin()` sets `this.speed = 0`, and `emit()` smooths speed at
`0.7 / 0.3` — so it takes roughly five to ten samples to reach the true speed.
Speed pulls `reach` **down** (that is the velocity break-up), which means the
first samples of a *fast* stroke are computed as though the tool were moving
slowly: full reach, full deposition.

**Predicted symptom:** a dark, over-solid nub at the start of every quick
stroke, worst on rough paper where the break-up matters most, and worst for
media with a high `velocityCoupling`.

**How to check:** draw a series of fast, short strokes on Rough and look at the
first few cells of each. Compare against the same stroke drawn slowly.

**If confirmed,** the fix is to seed `speed` from the incoming step on the first
sample rather than from zero, so the smoothing starts at the right value instead
of ramping into it. Cheap and contained.

### 1b. The paper does not remember what has been laid on it

`dry_deposit.wgsl` computes `ride` from the **paper height alone**, and the
write is purely additive (`a2 = a2 + mix[0] * lay`). Nothing feeds deposited
material back into the surface the next stroke sees.

So every stroke meets virgin tooth. On real paper, graphite fills the valleys as
it builds; the surface gets smoother, later strokes glide and deposit more
evenly, and eventually the tooth is full and the mark burnishes to a sheen.

**Predicted symptom:** layering and cross-hatching do not build the way they do
on paper — the mark keeps breaking up over the same grain no matter how many
passes, instead of filling in and smoothing out. Optical density still rises
(Kubelka-Munk asymptotes to masstone) so it *darkens*; what is missing is the
**texture** changing with build-up.

**How to check:** cross-hatch the same patch eight or ten times with 9B on
Rough. Does the grain fill in, or does the eighth pass break up exactly like the
first?

**If confirmed,** this is the bigger of the two and is not a one-line fix: it
needs the laid material to raise an effective surface height that `ride` reads.
That is a real design question (where is it stored, does it belong to the dry
floor or the paper, does it interact with re-wetting) and it gets a written
decision before any code.

### Also owed in Phase 1

- **Bartford's own list.** The two above are what code-reading found. What
  actually bothers him at the tip of the pencil outranks both.
- **No numbers are quoted for any of this yet.** Nothing in the dry path has
  been measured on the bench; see the harness warning in `HANDOFF.md`, which
  blocks trustworthy measurement generally.

## Phase 2 — smudging, blending, erasing `[PLANNED]`

The interactions dry media need and wet media do not. Not started. Open
questions to settle before building: whether a smudge is a tool or a mode; where
lifted material goes (does a finger carry it, and can it be put back down);
whether an eraser is a negative deposition or its own pass; and how any of it
interacts with the dry-floor bake.

## Phase 3 — the dry-media studio `[PLANNED]`

Per D13: edit the numbers, see the tool **and the mark it makes**. Blocked on
the scripted-stroke harness (`HANDOFF.md`, Step 0) exactly as the brush studio
is. This is the second real studio instance, so it is also where the shared
authoring harness gets extracted.

## Phase 4 — new dry media `[PLANNED]`

Soft pastel, oil pastel, coloured pencil, marker, chalk. Each should be a row
over the existing equations. **If a new medium needs a new code path, that is a
finding about Phase 1, not a licence to fork the shader.**
