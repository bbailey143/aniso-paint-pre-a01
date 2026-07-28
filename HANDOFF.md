# STOP — you are on the wrong branch

This is **`main`**: the archived evidence base from an earlier direction (the Rust/wgpu
feasibility bench, the original physics reference cards and canvas contract). It is
kept as a **source to cite**, not as the codebase. **Do not do development work here.**

## The active project is on the `webgpu-test` branch

A browser-first WebGPU natural-media painting app: TypeScript + WGSL, no Rust, no
WASM. That branch has its own `CLAUDE.md`, its own re-authored guardrail docs, and the
live relay baton at **`docs/HANDOFF.md`**.

## How to get there

The branch may be checked out in a **worktree**, in which case `main` stays here and
you simply open the other folder:

```
C:\Users\benja\Documents\aniso-paint-pre-a01\.claude\worktrees\webgpu-test-477000
```

If that folder does not exist, the worktree has been collapsed and you can switch
normally:

```
git checkout webgpu-test
```

If `git checkout webgpu-test` fails with *"already used by worktree at …"*, that is
not an error to work around — it is git telling you the branch is checked out in the
folder named in the message. **Open that folder instead.**

## Then

Read **`docs/HANDOFF.md`** on the `webgpu-test` branch and follow it. It is
self-contained: the protocol every model follows, the current state, and the exact
next action. Several AI models work this repo in relay, so that file — not any one
conversation — is the source of truth.

## How to tell you are in the right place

The `webgpu-test` branch has `src/engine/`, `src/media/`, `package.json`, and
`docs/HANDOFF.md`. If you are instead looking at `bench/`, `docs/cards/` or
`docs/contract/`, you are still on `main`.
