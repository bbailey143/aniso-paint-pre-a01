# Card guide — aniso-paint (`tuft-fill`)

The fence for this build. No number enters an engine that isn't on a card cited to
its source, or a recorded decision. See the root [`CLAUDE.md`](../CLAUDE.md).

## Reading order

Always load [`00-invariants.md`](00-invariants.md) (what "wrong" means) and
[`03-pass-ownership.md`](03-pass-ownership.md) (what "yours" means). Then load the
card(s) for the engine you are on, and nothing else.

| Card | Role |
|---|---|
| [`00-invariants.md`](00-invariants.md) | The fence, cross-cutting invariants, and the source register. |
| [`01-architecture.md`](01-architecture.md) | The class hierarchy: media / brush / substrate as data + shared equations. |
| [`02-cell-schema.md`](02-cell-schema.md) | Per-cell state and the RGBA16F texture layout. |
| [`03-pass-ownership.md`](03-pass-ownership.md) | The per-frame GPU pass order and who writes what. |
| [`04-color-km.md`](04-color-km.md) | Kubelka-Munk colour, the 12-pigment library, provenance. |
| [`05-fluid.md`](05-fluid.md) | Water movement, relaxation, capillary flow, edge darkening. |
| [`06-brush.md`](06-brush.md) | Kinematic spine, FFD lattice, reservoir, anisotropic friction. |
| [`07-media.md`](07-media.md) | The shared medium property surface and per-medium rows. |
| [`08-substrate.md`](08-substrate.md) | Paper/canvas: tooth, sizing, absorption, granulation. |
| [`09-acceptance.md`](09-acceptance.md) | Pass/fail behavioural targets and the proof tests. |
| [`10-decisions.md`](10-decisions.md) | Ratified decisions (D-numbers) for this direction. |
| [`11-open-fault-conservation.md`](11-open-fault-conservation.md) | **Open fault.** The sheet gains water and pigment, and the gauge that should have caught it lagged. Read before trusting any conservation number here. |

## Working logs — what was measured, and what it cost to learn

The cards above are the fence. These are the bench: numbered in the order they
were opened, each one a record of what was measured in the running app, what it
proved, and — deliberately — what was tried and failed. **Retractions are struck
rather than deleted**, because several of them are the most useful lines here.

Do not read these to learn the physics; read them before re-measuring something,
so you do not re-derive a trap that has already cost someone a day.

| Log | What it covers |
|---|---|
| [`12-explosion-hunt-log.md`](12-explosion-hunt-log.md) | The debug API (§4), the channel map (§5), and **the shader traps (§11) — read §11 before writing WGSL.** |
| [`13-water-paper-behavior-log.md`](13-water-paper-behavior-log.md) | Water on paper: absorption, edges, drying. |
| [`14-tuft-geometry-log.md`](14-tuft-geometry-log.md) | Bristle geometry, contact, the blade-angle work. |
| [`15-paste-flow-log.md`](15-paste-flow-log.md) | Oil as a paste: yield stress, no currents, slumping. |
| [`16-pickup-log.md`](16-pickup-log.md) | **Brush pickup, E1–E10.** How a stroke pulls the layer beneath it. E10 (2026-08-27) is the current state: oil builds body, the carried colour fades. |
| [`17-pickup-rework.md`](17-pickup-rework.md) | The review that found the three dilutions making pickup invisible. **Executed and closed.** |
| [`18-oil-body.md`](18-oil-body.md) | Why oil read thin. Mass thread **DONE** (see 16 E10); the berm and relief suggestions remain. |
| [`19-paint-on-canvas.md`](19-paint-on-canvas.md) | **OPEN — the current job.** The paint reads as a sticker floating above the canvas. Three visual cues, each anchored to the line of `composite.wgsl` that makes it, with an order of attack. Suggestions only; nothing built. |

`HANDOFF.md` is the relay baton and always names the live next step. Read it
first, every time — several models work this repo in turn.

## Provenance

The physics traces to the same primary sources as the `main` evidence base (C97,
B04, A26, VL, BE16, MB21, Y13 — see [`00-invariants.md`](00-invariants.md)) plus
Bartford's Media Consolidated Physics guide. Where this build diverges from `main`,
the divergence is a recorded decision, not an accident.
