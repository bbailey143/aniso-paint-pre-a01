# Reference cards — index

The harvest, split one file per card. `../physics-reference-cards.md` remains the
canonical whole; these are the same text, verified character-identical.

**The rule the harvest states about itself:** *paste the relevant card into a
session working on that engine — not the whole file.* Splitting it makes that
enforceable instead of merely remembered. Reading the whole harvest costs about
14k tokens; a single engine's slice costs one to three.

## Always load

| File | Why |
|---|---|
| [`00-invariants.md`](00-invariants.md) | How to use the cards, the source register, and the four cross-cutting invariants. Conservation, dimensionless parameters, precision, resolution strategy. Violating any of them is how the project goes wrong, so every engine loads this. |

## Load for the engine you are on

| Engine | Cards |
|---|---|
| **Fluid** | [`01-fluid.md`](01-fluid.md) — C97 shallow water, A26 thin film, the D9 hybrid |
| **Pigment & optical** | [`02-pigment-optical.md`](02-pigment-optical.md) — Kubelka-Munk, Saunderson, band count, the measured data |
| **Pigment transport** | [`03-pigment-transport.md`](03-pigment-transport.md) — ρ/ω/γ, TransferPigment, backruns |
| **Oil / viscous** | [`04-oil-viscous.md`](04-oil-viscous.md) — B04 heuristic, yield stress, brush↔canvas transfer |
| **Brush** | [`05-brush.md`](05-brush.md) — spines, FFD lattice, anisotropic friction, the reservoir |
| **Paper & substrate** | [`06-paper-substrate.md`](06-paper-substrate.md) — tooth, sizing, Lucas-Washburn, size exclusion |

## Load when the work calls for it

| File | When |
|---|---|
| [`07-acceptance.md`](07-acceptance.md) | Any time you are deciding whether something is *right*. Drying times, value shifts, behavioural targets, the five-minute proofs. This is the only document that says what "right" looks like. |
| [`08-decisions-owed.md`](08-decisions-owed.md) | Before ratifying anything. Several of these are now closed by D1–D11 in the contract. |
| [`09-untested-proposals.md`](09-untested-proposals.md) | Reasoning, not findings. Bench before trusting. |
| [`10-not-yet-obtained.md`](10-not-yet-obtained.md) | Ranked list of sources still to fetch. |
| [`99-licensing-and-search.md`](99-licensing-and-search.md) | Before shipping anything derived from the sources. |

## Cross-cutting work is the exception

Auditing the contract *against* the cards — hunting for contradictions between
engines — genuinely needs the whole harvest at once. That is how the missing
evaporation owner and the unratified fluid route were caught in July 2026; an
engine specialist would have seen neither. Load everything for that, and only
that. Then go back to slices.
