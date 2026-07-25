# aniso-paint-pre-a01

Pre-alpha working repository for a natural-media painting engine.

This repo holds the **settled documents** — the research harvest and the canvas
contract. Everything here is either a finding cited to a primary source, or a
decision made deliberately and recorded with its reason. Nothing else enters.

## What's in here

| File | What it is |
|---|---|
| [`docs/physics-reference-cards.md`](docs/physics-reference-cards.md) | The research harvest. Every number the engines are allowed to use, each one traced back to the paper it came from. This is the fence — it exists so no future session has to re-read the papers, and so nothing gets quietly invented. |
| [`docs/canvas-contract-spec.md`](docs/canvas-contract-spec.md) | The fifth engine: canvas state. Defines what the canvas *is* — what a cell stores, who is allowed to touch it, and what must remain true at all times. The other four engine specs point at this one. |

## Reading order

Start with the **reference cards** — they're the evidence. Then the **canvas
contract**, which is what the evidence was assembled to justify.

## Ground rules

- Anything marked `[UNVERIFIED]` is reasoning, not a finding. Test it on the bench before trusting it.
- Anything marked `[TYPO]` or `[TRAP]` already cost someone else time.
- Ratified decisions (`[DECISION]`, D1–D11 in the canvas contract) are closed. If one has to change, everything downstream of it changes too.
- Implementation language is **Rust** (CPU brush solver) plus GPU compute shaders for the canvas.
