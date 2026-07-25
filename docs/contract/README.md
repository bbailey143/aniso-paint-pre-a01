# Canvas contract — index

The contract split one file per section. `../canvas-contract-spec.md` remains
the canonical whole; these are the same text, verified character-identical.

**Read this differently from the cards.** The harvest was *designed* to be
split — it tells you to paste one card. The contract was written to be read
whole, and its sections cross-reference each other constantly. Splitting it
saves less (the whole thing is ~5k tokens, against 14k for the harvest) and
costs more in coherence.

What the split is actually for: the engine specialists in `.claude/agents/` are
told to load specific sections. Without this, "load §2.3, §4, §8, §9" is an
instruction no session can follow — you either load the whole file or nothing.
Now it is executable.

**If you are doing anything cross-cutting, load the whole contract instead.**

## Sections

| File | Contents |
|---|---|
| [`00-preamble.md`](00-preamble.md) | What this document is and the rule about what may enter it |
| [`00-purpose-and-scope.md`](00-purpose-and-scope.md) | What the contract covers and what it explicitly does not |
| [`01-ratified-decisions.md`](01-ratified-decisions.md) | **D1–D12.** Closed. Load this whenever you might be about to reopen one |
| [`02-the-cell.md`](02-the-cell.md) | Per-cell state inventory, the baked floor, live dry layers, the wet film, the global tilt block, and the 54-number count |
| [`03-texture-schema.md`](03-texture-schema.md) | How the cell is realised in RGBA16F, and the brush↔canvas alignment that must be preserved |
| [`04-tiles.md`](04-tiles.md) | Tile states, the wetness budget, the halo, paging, sim-vs-display resolution |
| [`05-drying-pipeline.md`](05-drying-pipeline.md) | wet → dry1 → dry2 → baked floor, re-wetting, sealing |
| [`06-undo.md`](06-undo.md) | Stroke-unit undo, the seam wrinkle, and D10's pool ceiling |
| [`07-layers.md`](07-layers.md) | The D6 reservation and what layers will mean when they ship |
| [`08-invariants.md`](08-invariants.md) | Conservation, the Teflon clamp, dimensionless parameters. Non-negotiable, load with everything |
| [`09-pass-ownership.md`](09-pass-ownership.md) | Which engine writes which field, in what order. The lane markings |
| [`10-acceptance-tests.md`](10-acceptance-tests.md) | How you know it works |
| [`11-open-items.md`](11-open-items.md) | What is still unsettled |

## Suggested loads by engine

| Engine | Sections |
|---|---|
| **Fluid** | 08, 09, 02, 04 |
| **Pigment & optical** | 08, 09, 02, 03, 01 |
| **Brush** | 08, 09, 03 |
| **Paper & substrate** | 08, 09, 02, 04 |
| **Canvas state** | all of it — this document is yours |

Sections 08 and 09 go with everything. The invariants are what "wrong" means,
and pass ownership is what "yours" means.
