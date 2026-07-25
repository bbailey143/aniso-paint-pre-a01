## 6. Undo

**D5: the unit is the stroke.** Pen-down opens an undo record; pen-up closes it.

Mechanism (B04, still correct in 2026): before a stroke first touches a tile, that tile's textures are copied into a dedicated GPU undo texture pool via texture-to-texture copies — never through system memory readback. Undo restores the snapshots; redo re-copies forward.

**The seam wrinkle.** Restoring a tile rewinds *everything* in it, including autonomous wash motion since the snapshot. Undoing seconds after pen-up is invisible; undoing after thirty seconds of bloom spread would snap the stroke's footprint back to an older wetness state than its surroundings — a visible seam.

**Mitigation (required):** the stroke's dirty-tile set is not frozen at pen-up. As long as wetness that the stroke introduced continues to spread, newly-reached tiles are snapshotted *on first contact by that spread* and appended to the stroke's undo record. The record closes when the spread settles or the next stroke begins. Undo then restores a consistent region. Bench test: stroke into a wet wash, wait 30 s, undo — no seam.

**D10 — the pool has a ceiling.** The mitigation above keeps appending tiles for as long as the stroke's wetness keeps spreading, which is unbounded on its own. One wet 64×64 tile snapshot is ~448 KB, so:

| Bound | Value | Why |
|---|---|---|
| Pool size | **256 MB, allocated once, never grows** | ≈570 tile-snapshots. Sits alongside the ~117 MB wet budget without crowding an iPad-class GPU. |
| Per-stroke cap | **128 tiles (~57 MB)** | Half the maximum possible wet area. Stops a single stroke into a full-sheet wash from eating the entire history. |
| Spread-append window | closes at the tile cap, when the spread settles, or at **45 s** — whichever comes first | Clears the 30 s seam test (§10.5) with margin while still bounding the growth. |
| Eviction | ring buffer, oldest record first | Depth degrades gracefully under heavy strokes rather than failing outright. |

A typical stroke touches 10–20 tiles (4.5–9 MB), giving roughly 28–57 levels of undo. Persistence across sessions remains an implementation-time tunable.

---
