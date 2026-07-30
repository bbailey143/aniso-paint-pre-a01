# Dry-media parallel handoff — 2026-07-29

Read this alongside the live `docs/HANDOFF.md`.  This note is deliberately
separate so it does not overwrite Claude's active watercolor baton.

## Safe working split

| Work | Location | Owner |
|---|---|---|
| Watercolor / the shared live checkout | `C:\Users\benja\Documents\aniso-paint-pre-a01` | Claude |
| Dry media foundation | `C:\tmp\aniso-paint-pencil` on `codex/pencil-tuning` | Codex |

Do not switch branches, reset files, or overwrite `docs/HANDOFF.md` in the
shared checkout while Claude is working.  The dry-media work is isolated and
can be brought across as a deliberate, reviewable change later.

**Exact dry-media checkpoints to apply, in order:** `fbb1bf8` (`Build shared
dry-media foundation`) and `cd25abc` (`Add long-press medium settings cards`)
and `21a100b` (`Pin settings cards for tools and papers`) from
`codex/pencil-tuning`.

## What is ready in the dry-media branch

- A shared physical-material row now describes particle size, binder body,
  hardness, shear/friability, adhesion, compression, and surface-light
  characteristics.  This is a common vocabulary for future dry tools rather
  than a pencil-only set of sliders.
- The active dry renderer uses particle size, hardness, shear, adhesion, and
  compression.  Tilt now creates a directional broadside contact instead of
  merely making a round point larger.
- The pencil rack is now exactly: **9B, 2B, HB, 2H**.
- Ballpoints remain, defined through the same shared material row.
- New tools: vine charcoal, Conté crayon, wax crayon, and a chisel-tip fountain
  pen.
- The fountain pen uses an actual directional chisel footprint.  It is
  presently a dry, deposited-ink tool — it does not yet feather or wick like a
  wet ink simulation.

The local dry-media page is `http://127.0.0.1:5174/`.  It loaded on the AMD
GPU without page errors.  `npm.cmd run build` passes.  These are technical
checks only; the artist still needs to judge real strokes, especially with a
stylus.

## What still needs artist judgment

1. At strong tilt, 9B must read as a convincing broad side, with the wide axis
   aligned to the stylus angle, not like an oversized circular dab.
2. 9B, 2B, HB, and 2H must feel like four clearly useful grades on paper.
3. Charcoal, Conté, and wax need distinct mark character on rough, hot-press,
   and cold-press papers.
4. The chisel fountain must give a dependable broad/thin change as it turns.
5. The normalized material numbers are working starting points, not a claim of
   final real-world calibration.

## Important current limits

- New charcoal, Conté, wax, and fountain rows are intentionally bone-black so
  their material behavior can be judged before color variations are added.
- Surface-light values are retained in the shared material rows, but are not
  yet drawn per mark.  Do not apply them as a single active-tool gloss effect:
  that would incorrectly change older marks when the tool changes.
- Watercolor passes, wet transport, and Claude's current rim work were not
  edited on this branch.

## Files to bring forward

The dry-media work is contained in these files:

```
src/media/types.ts
src/media/library.ts
src/media/dry-tool.ts
src/input/stroke.ts
src/engine/fluid.ts
src/engine/canvas.ts
src/engine/shaders/fluid/dry_deposit.wgsl
src/main.ts
src/style.css
docs/01-architecture.md
docs/07-media.md
docs/09-acceptance.md
```

## Safe merge recipe

1. Let Claude finish and commit the current watercolor milestone in the shared
   checkout first.
2. From a clean, updated integration checkout, review and apply the commit at
   the tip of `codex/pencil-tuning`.  Do not move the shared live checkout onto
   this branch.
3. If there is a conflict in `src/engine/fluid.ts`, retain Claude's wet changes
   and bring over only the dry-segment layout, dry buffer, bounds, and contact
   profile plumbing.  The wet segment layout must remain eight values.
4. If there is a conflict in `src/main.ts`, preserve the watercolor event path
   and add only the dry contact-profile argument.
5. Do not merge a competing copy of `docs/HANDOFF.md`; this separate note is
   the dry-media handoff.
6. Run `npm.cmd run build`, then open the app and make real tilted strokes
   before calling the merge artist-ready.

## Next safest task

Use one short, stylus-led calibration pass to set the four graphite grades and
the broadside response.  Only after that should the same shared settings be
used to tune charcoal, Conté, wax, and fountain ink.
