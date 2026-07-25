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

Reading order: cards first, contract second.

## Load only what the job needs

Both documents are split, with an index beside each:

- [`docs/cards/`](docs/cards/) — one file per card. Reading the whole harvest
  costs ~14k tokens; one engine's slice costs one to three.
- [`docs/contract/`](docs/contract/) — one file per section. Smaller savings
  (~5k whole), but it makes "load §2.3, §4, §8, §9" an instruction a session can
  actually follow rather than an aspiration.

**Always** load `docs/cards/00-invariants.md`, plus contract sections
`08-invariants` and `09-pass-ownership` — the first is what "wrong" means, the
second is what "yours" means. **Then** load the card(s) and section(s) for the
engine you are on, and nothing else.

The canonical whole files stay put and are verified character-identical to their
parts. Load them for cross-cutting work — auditing the contract against the
cards, hunting for contradictions between engines — which genuinely needs
everything at once. That is how the missing evaporation owner and the
unratified fluid route were caught, and no specialist would have seen either.

## Orchestrator and specialists

Five engine specialists live in [`.claude/agents/`](.claude/agents/): `fluid-engine`,
`pigment-engine`, `brush-engine`, `paper-engine`, `canvas-engine`. Each is
scoped to its own cards and its own writable fields, and each is told what it
may read but must not touch.

**The point is not that specialists know more. It is that each one starts with
an empty context window and returns only its conclusion.** A specialist loads
8k tokens, builds, and hands back a paragraph — the shader source, the compile
logs, the failed attempts and the parameter sweeps all evaporate with it. The
orchestrator accumulates summaries, not transcripts.

Working rules:

- **Specialists build. The orchestrator audits.** No specialist may modify
  another engine's fields. If one finds a problem outside its lane it describes
  it and reports back; it does not fix it.
- **Cross-engine decisions are the orchestrator's.** Ratifying a D-number,
  changing the cell schema, or resolving a contradiction between two engines
  never happens inside a specialist.
- **Spawn for chunky work, not for questions.** A specialist starts cold and
  re-derives context, which is worth it for building an engine and wasteful for
  a two-line answer.

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
| D12 | Browser/WebGPU ships first, native iPad second. Engine code uses WebGPU **core** only |

## Stack

**Rust** on the CPU for the brush solver (it's ~16 numbers of state — a pocket
calculator), **GPU compute shaders via wgpu** for the canvas (millions of
cells). Half-float throughout.

**One source, three targets.** wgpu compiles to Vulkan/DX12 on Windows, Metal
natively on iPad, and WebGPU in the browser via WebAssembly. Per D12 the browser
ships first — Safari 26 has WebGPU on iPadOS, so an iPad user reaches this from
a URL with no App Store in the way. Windows is the development loop only.

The cost of keeping that door open: **engine code uses WebGPU core, no optional
features.** Timestamp queries and `float32-filterable` are bench-only. WebGPU's
default limits are real, and the 256 MB single-buffer ceiling is already binding.

Any reference to Dart or Flutter is leftover from an abandoned direction.
Ignore it and correct it if you find it.

## How to work here

- **Make the call.** When asked to suggest a fix, implement it — don't return a menu of options with a decision still owed. State the one-line reason and move.
- **Check the arithmetic.** The specs carry byte counts, memory budgets and timing numbers. Verify new numbers against the stated ones, and say something when they disagree. Several real contradictions have been caught this way.
- **Run it twice before believing it.** Any conservation, timing or stability result gets reproduced on an identical command line before it is interpreted. The bench produced three confident diagnoses of the same symptom — precision loss, then instability, then memory corruption — and only the third survived. Reproducibility would have killed the first two immediately.
- **Say "I don't know" rather than constructing a plausible story.** Both of the wrong diagnoses above were coherent, evidence-backed narratives. So was asserting it was night when the time of day was never available.
- **Watch for internal conflicts.** A proposal that fails one of the acceptance tests in contract §10 is wrong, however sensible it looks in isolation.
- **Commit and push when a document changes.** The repo is the source of truth.

## Current state

Both documents ratified as of July 2026, D1–D11 closed.

**Feasibility bench: PASS.** `bench/canvas-spike/` — 3.78 ms per frame at the
D7 wetness budget against a 16.7 ms target, on a Radeon RX 570 (a conservative
iPad proxy). The cell schema fits. Findings and four fixed bugs are written up
in `bench/canvas-spike/RESULTS.md`.

**One thing left open there:** a nondeterminism on the bench's `--precision full`
control path — identical runs return different conservation numbers. It affects
a diagnostic switch, not the shipping half-float path, so it blocks a
measurement rather than the project. Two cheap untried discriminators: localise
which cells hold the garbage, and try the DX12 backend instead of Vulkan.

Open items are listed in contract §11 and Card 8.

## On memory

Chat context does not survive between sessions or between tools. This repo does.
**If it isn't written down here, it doesn't exist** — so when something is
decided, it goes in a document and gets pushed, not left in a conversation.
