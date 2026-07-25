# canvas-spike

Feasibility bench for the canvas contract. Answers one question: does the wet
band of the cell schema, at the D7 wetness budget, fit inside a 16.7 ms frame —
and does it conserve water and pigment while doing so?

Headless by design. No window, no brush, no render engine. Those are other
specs; dragging them in would mean measuring them by accident.

See [RESULTS.md](RESULTS.md) for the first run.

## Running it

```
cargo run --release
```

Defaults to the D7 budget: 1024² wet cells, 50 relaxation iterations, 600 frames
with the bots lifting off at frame 240.

| flag | default | what it does |
|---|---|---|
| `--grid N` | 1024 | Simultaneously wet cells per side. 1024 is D7. |
| `--relax N` | 50 | C97 divergence relaxation iterations. The dominant cost. |
| `--frames N` | 600 | Total frames. |
| `--settle-at N` | 240 | Frame at which the bots stop painting. Everything after is the hands-off conservation watch. |
| `--bots N` | 12 | Synthetic strokes churning the wet set. |
| `--evap R` | 0 | Evaporation rate. Leave at 0 for the conservation test — with nobody painting and nothing evaporating, the gauges must hold flat. |
| `--f32` | off | Control run at full 32-bit float instead of D8's half-float. Not a shipping option — it exists to tell rounding loss apart from a real asymmetry in the flux maths. |
| `--dump 0` | on | Skip the PNG snapshot. |

## What to look at

**The verdict line** — median GPU time per frame against 16.7 ms.

**The pass table** — where the frame actually goes. Currently relaxation is 71%
of it and everything else is noise.

**The conservation block** — with `--evap 0` and the bots off, water, pigment and
body must all read `drift -0.0000 %`. Anything else means paint is leaking, and
paint that leaks silently will read to an artist as "this dries wrong" long
before it reads as a bug.

**wet_field.png** — blue is standing water, red and green are two pigment slots.
Mostly a sanity check that the bots painted something and the wash spread rather
than sitting in dead squares.

## Structure

```
src/main.rs          host: resources, pass ordering, gauges, timing, report
shaders/common.wgsl  Params + helpers, prepended to every pass
shaders/*.wgsl       one file per pass, bindings from 0 so wgpu derives layouts
```

Pass order per frame follows contract §9. Two orderings matter and are easy to
get wrong:

- `flux_apply_pigment` runs **before** `flux_apply_water`, because the fraction
  of pigment leaving a cell is (water leaving / water present *before* the move).
- `flux_compute` writes every outflow once, and both the water and pigment
  passes read that same buffer. That shared buffer is what keeps the two moving
  together and the ledger balanced.
