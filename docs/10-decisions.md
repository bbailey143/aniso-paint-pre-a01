# CARD 10 — Ratified Decisions

Recorded decisions for this direction, each with its reason. Closed unless a decision
is explicitly reopened — and if one changes, everything downstream changes too. These
are the second half of the fence: a number may enter an engine because a card cites
it, or because a decision here justifies it.

| # | Decision | Reason |
|---|---|---|
| **D1** | **TypeScript + WebGPU**, bundled with Vite. No Rust/WASM on this branch. WebGPU **core** only in engine code. | Browser-first; Bartford reads JS/HTML; instant iteration; WGSL shaders port unchanged from the `main` bench. Native iPad deferred and re-scoped later. |
| **D2** | This branch authors its **own card guide**. The `main` reference cards + contract are cited as a source, not carried forward wholesale. | A deliberate new direction. Divergences from `main` are recorded here, not accidental. |
| **D3** | **Media are separated from brushes.** Each is a class in a hierarchy with shared ancestry; a medium is a *data row of parameters* over *shared equations*. | Extensibility with a fixed code surface — a future user adds tempera/casein as a row. The library stores behaviour; cells store amounts. |
| **D4** | Colour is **Kubelka-Munk**: **full 38 measured bands** in the library and live render, two-constant, Duncan linear mixing in concentration space, Saunderson with per-medium `K_instrument`. Band reduction is deferred to baked-floor per-cell storage only. | Subtractive mixing (blue + yellow = green). The library is tiny and Composite runs once/frame, so 38 bands cost ~nothing and carry **zero reduction error** — 8-band binning was validated at dE2000 ≈ 8 on yellows and rejected. See [`04-color-km.md`](04-color-km.md). BE16 provides an internally-consistent K/S scale, so no separate S=1 pin is needed. |
| **D5** | **12 mixable pigments** from BE16 measured data (all 38 bands): PW6, PY74, PY83, PO20, PR254, PV19, PR122, PV23, PB29, PB15:4, PG7, PBk9. | A usable high-chroma starting palette; real measured K/S behind the fence. Data retrieved via the Internet Archive; `tools/build_pigments.py` regenerates `src/color/pigments.ts`. |
| **D6** | **RGBA16F half-float** for all canvas textures; small named intermediates may be higher. | Many mobile GPUs/browsers lack 32-bit float RGBA (A26); B04 confirmed half sufficient. |
| **D7** | **Cell schema** adopted from the `main` contract: 54 half-floats/cell (wet 24 + dry1 10 + dry2 10 + floor 10), the `WET*/DRY*/FLOOR*/PAPER` texture layout. | Bench-validated; the slot-for-slot alignment (brush↔canvas, wet↔dry) is worth preserving. |
| **D8** | **Conservation via clamped fluxes between cells**; no semi-Lagrangian advection in wet passes. **DryTick is the only pass that removes water.** | Mass conservation is the axiom (three independent teams). Concentrating evaporation in one pass keeps the conservation gauge honest. |
| **D9** | **Fluid: C97 shallow-water spine** with A26's dimensionless params, mobility fix, tilt diffusion, and local-gravity grafts. Relaxation uses the **C97 gather form** on a **staggered grid**. | C97 has watercolour's full vocabulary; A26 has the modern, portable formulation. The gather form is the stable one (bench proved the alternatives are not). |
| **D10** | **Brush solver in CPU TypeScript**, every frame; **two spines maximum**; stroke path **resampled** to ≤1 cell/step. | ~16 numbers of state — a pocket calculator. Two spines cover round + flat (VL); resampling stops strokes beading into dots. |
| **D11** | **Pen input via Pointer Events**: pressure, tiltX/tiltY, twist where available; velocity derived; `getCoalescedEvents()` for high-frequency sampling. | Web-native full-tilt/pressure/velocity; coalesced events feed the resampler. No plugin, works on the Huion and on iPad. |
| **D12** | **First build scope:** round + flat sable, watercolour + full water fluid cycle + KM mixing, graphite pencil, ballpoint, and 3 papers (hot/cold press, rough). Everything else is a documented row for later. | A vertical slice that exercises every engine once, so the rest is adding rows. |

## Open items (not blocking)

- ~~**Pigment data fetch (D5).**~~ Done — real BE16 data, 38 bands, in
  `src/color/pigments.ts`.
- **Baked-floor band reduction.** When baking lands (P3+), choose the per-cell
  `R_floor` band count and reduction method; validate the dE is imperceptible.
- **Adaptive relaxation under a sharp brush load.** The bench's controller settled at
  ~2 iterations under gentle synthetic bots; a real stroke injects sharper divergence.
  Re-measure when the brush lands.
- **Value-shift mechanism.** Whether wet→dry shift is scattering, `K_instrument`, or
  both — and gouache's inversion specifically — needs bench measurement (`[UNVERIFIED]`).
- **Native iPad path.** Deferred under D1; re-scope after the browser build proves out.
