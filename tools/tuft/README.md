# Tuft geometry bench

> **STALE AS A MODEL OF THE ENGINE, 2026-08-24.** The filled tuft shipped -- see
> docs/14 E10 and `src/brush/tuft.ts`. What is here is now a BEFORE-AND-AFTER
> exhibit: `nowHair` mirrors a `bristlePoint` that no longer exists, and the
> "now" side of every comparison is the old hollow brush. Keep it for the
> comparison; do not read it as current. To measure the brush as it actually is,
> use `node tools/brush-bench.mjs fill`.

A place to redesign the tuft **without touching the paint engine**. Nothing in this
folder is imported by `src/`. Painting behaves exactly as it did.

The split that makes it honest: the **spines are engine output**, recorded from the
real solver; the **hairs are the proposal**, generated here. So the two tufts being
compared are riding the same solved chain, and only the thing under review differs.

## Run it

```
node tools/brush-bench.build.mjs                          # if brush-bench.mjs is stale
node tools/brush-bench.mjs tuft > tools/tuft/tuft-carrier.json
node tools/tuft/tuft-measure.mjs                          # coverage, now vs proposed
node tools/tuft/tuft-regular.mjs                          # how evenly spaced the hairs are
node tools/tuft/tuft-sweep.mjs                            # coverage against hair count
node tools/tuft/tuft-build.mjs                            # writes tuft-bench.html (gitignored)
```

`tuft-carrier.json` is committed and reproduces byte-for-byte: the spine solver is
deterministic and the film is a fixed pose sequence. Re-recording is a check that the
pipeline still runs, **not** an independent sample.

## What is what

| file | what it is |
|---|---|
| `tuft-fill.js` | the proposal. `drawTuft` places roots in a filled section; `hairPath` rides them on the recorded spines. `nowHair` is a faithful port of `Brush.bristlePoint` so the comparison is like for like. |
| `tuft-specs.js` | the proposed rows per brush, and `bundleRadius`. Chosen, not measured &mdash; same standing as the numbers already in `src/brush/library.ts`. |
| `tuft-measure.mjs` | coverage: how much of a mark's own outline is actually inked, rasterised at 0.15 cells and clipped to the outline. |
| `tuft-regular.mjs` | spacing between neighbouring hair tracks across the blade. |
| `tuft-sweep.mjs` | coverage against hair count. |
| `tuft-build.mjs` | inlines carrier + generator into the page template. |

Findings and their method are in `docs/14-tuft-geometry-log.md`.
