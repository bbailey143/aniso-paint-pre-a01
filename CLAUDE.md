# CLAUDE.md — aniso-paint-pre-a01

Read this before doing anything else in this repo.

## What this is

Pre-alpha for a natural-media painting engine — real watercolor, gouache,
acrylic and oil behavior from physics, not texture stamps. Five engines:
brush, fluid, pigment/optical, paper, and canvas state. Target hardware is
iPad-class GPU.

Two documents are ratified and live here. Everything else is downstream of them.

| File | Role |
|---|---|
| `docs/physics-reference-cards.md` | The evidence. Every number traced to the paper it came from. |
| `docs/canvas-contract-spec.md` | The structure that evidence justifies. Canvas state, tiles, drying, undo, pass ownership. |

Reading order: cards first, contract second. Per the cards' own instruction,
paste the **relevant card** into a working session — not the whole file.

## Who you're working with

Bartford is an artist, not a programmer. He wrote HTML and JS between roughly
2010 and 2020, so he reads code comfortably and understands structure — but
frame changes in terms of *what happens to the paint*, not what happens to the
type system. When something is done, say what he should look at to confirm it.

## The fence — the one rule that matters

Nothing enters an engine unless it is either:

1. **On a reference card**, cited to its source, or
2. **A recorded decision**, with its reason written down.

Do not invent constants. If a number is needed and no card supplies it, say so
plainly and mark it `[UNVERIFIED]` rather than filling the gap with something
plausible. The whole point of the cards is that no session — human or AI — has
to re-read the papers, and none can quietly make things up.

**Markers:**

- `[UNVERIFIED]` — reasoning, not a finding. Test it on the bench before trusting it.
- `[TYPO]` / `[TRAP]` — these already cost someone else time.
- `D1`–`D11` — ratified decisions. Closed.

## What's settled (D1–D11, canvas contract §1)

Do not reopen these casually. If one must change, everything downstream changes too.

| | |
|---|---|
| D1 | 8 pigment slots per cell; library of 24–48 is separate |
| D2 | Slot overflow merges the two most spectrally similar pigments |
| D3 | Two live dry layers re-wettable; older auto-bakes. Water media only |
| D4 | Baking is automatic and invisible |
| D5 | Undo unit is the brush stroke, not the physics after it |
| D6 | Single layer now; layer index reserved in the schema, default 0 |
| D7 | ~1024² cells of *simultaneously wet* canvas. A wetness budget, not a canvas size |
| D8 | Half-float (16-bit) throughout, RGBA16F |
| D9 | Fluid route: hybrid — C97 spine, A26 terms, B04 body flow |
| D10 | Undo pool: 256 MB fixed, 128-tile per-stroke cap, 45 s append window |
| D11 | Board tilt is a global uniform. Board tilt and view rotation are separate actions |

## Stack

**Rust** on the CPU for the brush solver (it's ~16 numbers of state — a pocket
calculator), **GPU compute shaders** for the canvas (millions of cells).
Half-float throughout.

Any reference to Dart or Flutter is leftover from an abandoned direction.
Ignore it and correct it if you find it.

## How to work here

- **Make the call.** When asked to suggest a fix, implement it — don't return a menu of options with a decision still owed. State the one-line reason and move.
- **Check the arithmetic.** The specs carry byte counts, memory budgets and timing numbers. Verify new numbers against the stated ones, and say something when they disagree. Several real contradictions have been caught this way.
- **Watch for internal conflicts.** A proposal that fails one of the acceptance tests in contract §10 is wrong, however sensible it looks in isolation.
- **Commit and push when a document changes.** The repo is the source of truth.

## Current state

Both documents ratified as of July 2026. Next artifact per the contract's
closing line: **performance feasibility bench**, then the Rust/GPU port plan.

Open items are listed in contract §11 and Card 8.

## On memory

Chat context does not survive between sessions or between tools. This repo does.
**If it isn't written down here, it doesn't exist** — so when something is
decided, it goes in a document and gets pushed, not left in a conversation.
