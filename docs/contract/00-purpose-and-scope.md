## 0. Purpose and scope

The four other engines are verbs — the brush contacts, the fluid flows, the pigment settles, the paper absorbs. The canvas is the noun they all act on. This contract defines:

1. The per-cell state schema (the "core sample")
2. The texture layout that realizes it in half-float GPU memory
3. The tile system: activation, budget, paging
4. The drying pipeline: wet → live dry → baked floor
5. Undo semantics
6. The layer reservation
7. Conservation invariants and bench readouts
8. Pass ownership: which engine reads and writes which field

Out of scope: brush internals (brush spec), fluid solver internals (watercolor/oil specs), UI. This document is the *interface between* those things.

---
