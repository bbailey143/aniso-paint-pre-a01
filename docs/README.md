# Card guide — aniso-paint (webgpu-test)

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

## Provenance

The physics traces to the same primary sources as the `main` evidence base (C97,
B04, A26, VL, BE16, MB21, Y13 — see [`00-invariants.md`](00-invariants.md)) plus
Bartford's Media Consolidated Physics guide. Where this build diverges from `main`,
the divergence is a recorded decision, not an accident.
