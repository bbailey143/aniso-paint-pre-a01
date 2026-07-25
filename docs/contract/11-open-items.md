## 11. Open items carried forward

- **`[OPEN — bench]` D8's half-float cost is not yet measurable, because the f32 control is nondeterministic.** Identical bench runs at f32 return water drift of +2139%, +278%, +556% — garbage memory, not physics. Half-float runs repeat exactly and lose 6.4% of the sheet over 200 hands-off frames. An earlier entry here claimed the film dynamics were unstable and that half-float rounding was masking it; that was wrong and is retracted. One real bug did come out of it: nothing guaranteed the wet fields were cleared before first read, and fixing that took half-float drift from 18.9% to 6.4% and made pigment conservation exact. The remaining f32 nondeterminism must be found before any precision decision is revisited. See `bench/canvas-spike/RESULTS.md` §4.
- Full-sheet wet-wash coarsening strategy `[UNVERIFIED]` — bench before hardening (§4.2).
- **Dry-tile cost is understated.** §4.1 estimates ~30–40 bytes/cell, but a tile carrying the baked floor *plus* both live dry layers is 30 half-floats = **60 bytes/cell** — the normal state for any twice-glazed area. Accepted as-is for now; revisit when the paging budget for 4096²+ canvases is set, since §4.2 rests the big-canvas claim on exactly this number.
- Fixed vs dynamic palette — UI-stage decision; schema is agnostic.
- Undo depth / persistence tunables (§6).
- Solvent tool for oil re-working — future; the reactivatable-bit machinery in §5 is where it plugs in.
- Spectral bands fixed vs adaptive (Card 8 #2) — floor storage assumes fixed 8; if adaptive is ever chosen, `R_floor` must store band *identities* too. Flagging the coupling so the choice is made knowingly.

---

*End of contract. The five engines now all have a spec. Next: performance feasibility bench, then the Rust/GPU port plan.*
