# AGENTS.md — aniso-paint (webgpu-test branch)

> **START AT [`docs/HANDOFF.md`](docs/HANDOFF.md).** Several AI models work this repo
> in relay — Codex, Codex and Gemini take turns as credits run out, often mid-task.
> That file is the baton: the protocol every model follows, and the current state with
> the exact next action. Read it, then this file, then whichever log it points you at.
> **Update its Part B before you start work, not after** — a session can be cut off at
> any moment, and anything saved "for the end" will never be written.

Read this before doing anything else on this branch.

## What this is

A browser-first, WebGPU natural-media painting app. Real subtractive paint
behaviour — watercolour, and later gouache, acrylic, oil — from physics, not
texture stamps. Colour is Kubelka-Munk (blue + yellow = green), never RGB
blending. Dry media (pencil, ink) share the same extensible architecture.

**This branch is a new direction.** The `main` branch holds an earlier, ratified
evidence base (`docs/physics-reference-cards.md`, `docs/canvas-contract-spec.md`)
and a Rust/wgpu feasibility bench. That work is **cited as a source**, not carried
forward wholesale. Here the stack is **TypeScript + WebGPU**, and the guardrails
are re-authored in [`docs/`](docs/) for this build.

## Stack

- **TypeScript + WebGPU**, bundled with Vite. No Rust, no WASM on this branch.
- **WGSL compute shaders** do the canvas physics (millions of cells). They are
  host-language-agnostic and port from the `main` bench, which validated them
  (flux algebra exact, conservation holds at half-float).
- **WebGPU core only** — no optional features in engine code. Timestamp queries
  and `float32-filterable` are bench/debug only. Half-float (RGBA16F) throughout.
- The brush solver is ~16 numbers of state — plain TypeScript on the CPU, per frame.
- Target: Safari 26 on iPadOS reaches this from a URL. Windows is the dev loop.

## The fence — the one rule that matters

Nothing enters an engine unless it is either **on a card, cited to its source**,
or **a recorded decision with its reason written down** (see
[`docs/10-decisions.md`](docs/10-decisions.md)).

Do not invent constants. If a number is needed and no card supplies it, say so and
mark it `[UNVERIFIED]` rather than filling the gap with something plausible.

Markers: `[UNVERIFIED]` — reasoning, test it on the bench. `[TYPO]`/`[TRAP]` —
already cost someone time. `D#` — ratified decisions, closed.

## The organizing idea

**Media are separated from brushes. Each is a class in a hierarchy with shared
ancestry.** A medium is a *data row of physical parameters* that plugs into
*shared functional equations* (the GPU passes). Adding tempera or casein later is a
new parameter row, not a new code path. The library stores behaviour; cells store
amounts. Never blur that line. See [`docs/01-architecture.md`](docs/01-architecture.md).

## How to work here

- **Make the call.** When asked for a fix, implement it — don't return a menu.
- **Check the arithmetic.** Byte counts, memory budgets, timing. Verify new numbers
  against stated ones and flag disagreements.
- **Run it twice before believing it.** Any conservation/timing/stability result is
  reproduced on an identical run before it is interpreted. On `main`, the bench
  produced three confident diagnoses of one symptom; only the reproduced one survived.
- **Say "I don't know"** rather than constructing a plausible story.
- **Commit and push when a milestone lands.** The repo is the source of truth.

## Who you're working with

Bartford is an artist, not a programmer. He wrote HTML and JS between ~2010 and
2020, so he reads code comfortably and understands structure — but frame changes in
terms of *what happens to the paint*, not the type system. When something is done,
say what he should look at to confirm it.

## Current state

P0 — guardrail cards — in progress. Phased plan: P0 docs → P1 scaffold+pen input →
P2 colour → P3 canvas/render → P4 fluid → P5 brush → P6 watercolour → P7 dry media
→ P8 polish. See the approved plan and [`docs/README.md`](docs/README.md).
