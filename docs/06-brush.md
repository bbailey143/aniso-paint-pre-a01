# CARD 6 — Brush Engine

The brush manipulates the wet film; it is not the paint. ~16 numbers of state —
solve it in plain TypeScript on the CPU every frame. It can be built and tuned
before the fluid engine works at all.

## The founding decision (VL)

**Dynamics at spine resolution. Footprint at bristle resolution.** Solve one or two
kinematic spines. Hundreds of bristles are *geometry only*, riding a free-form
deformation lattice, never simulated. The footprint is produced by rasterizing the
actual bristle geometry, so the mark carries per-hair structure nothing per-hair
computed. You get streaks without paying for them.

## Geometry decoupled from solver — the FFD lattice

1. Model the tuft as a polygon mesh in its undeformed state.
2. Enclose it in a free-form deformation lattice.
3. Drive the lattice control points from the kinematic spine(s).
4. The mesh inherits whatever the spines do.

**Spine count (VL findings):** single spine → round brushes (cannot spread bristles);
two spines → flat-brush spreading/scratching (each drives one side of the lattice);
more than two → no visible improvement. **Two is the budget.**

## Bristle dynamics

A bristle is a **kinematic chain**. Each segment has a length and two angles θ, φ
(fixed XYZ convention); twist assumed zero. Bend angle `β = cos⁻¹(cos θ · cos φ)`.

Minimize `C = Σ_joints E_spring + E_friction`, with `E_spring = (k/2)(180° − β)²`.

`[KEY]` Rest angle is 180° for straight bristles — **make it a per-segment field** and
you get worn/splayed brushes, plasticity (the brush remembers its splay through a
stroke), and fan brushes as configuration, not code.

**Taper:** ≥4 segments, decreasing lengths toward the tip, and spring constants
decreasing toward the tip. Stiff at the ferrule, flexible at the tip — this is what
lets a large round brush draw a hairline.

## Anisotropic friction

VL's observation: **the brush is essentially always pulled, almost never pushed.**
```
E_friction = μ · Σ_contact (1 − η) · |N| · ‖d‖
η = C_η · max(0, d_p · d/‖d‖)^k
```
`d_p` = preferred drag direction. Friction → near-zero along the pull direction, high
sideways or pushing. `[REQUIREMENT]` The lobe must be **C1-continuous** (smooth) — a
hard directional if/else makes any solver chatter. Barrel roll rotates `d_p`.

## The reservoir (VL Table 1)

| Texture | Contents |
|---|---|
| 1 | active pigment set 1 `[p₁..p₄]` |
| 2 | active pigment set 2 `[p₅..p₈]` |
| 3 | `[water, capacity, —, —]` |
| 4 | footprint `[on/off, tx, ty, —]` |

`[KEY]` **Per-cell capacity** — the belly of a mop holds more than its tip. Data, not code.

**Bidirectional transfer** (VL Table 2), per contacting (reservoirCell, canvasCell):
```
toCanvas    = downRate × reservoirQuantity
toReservoir = upRate   × canvasQuantity
```
Clamped both sides against remaining capacity, applied symmetrically so mass is
conserved. `[PAYOFF]` The sponge is just large capacity + high upRate — so **lifting
and scrubbing are brush parameters, not a separate eraser mode.**

## Footprint — the contact slab

Render the tuft from the canvas's viewpoint, orthographic, with the near plane just
below the paper surface and the far plane just above. Everything in that thin slab is
the footprint. Carry the tuft's 2D texcoords `(tx, ty)` into each footprint cell so
the reverse (canvas → brush) update knows which reservoir cell it came from. The
brush **hovers slightly**; contact depth is a tunable, not a binary — setting it is
also how you get drybrush.

## Traps (VL)

- **Bristles jumping off the canvas.** A pure inequality non-penetration constraint
  lets the optimizer lift a joint to dodge friction. Fix: for any joint violating the
  constraint this step, replace it with an **equality** constraint pinning it to the
  surface.
- **Normal force `N`.** Approximate as constant, re-estimated each step. Computing it
  from the full spring configuration is "tedious and does not noticeably improve
  results." Take the permission slip.
- **Resample the stroke path.** Stylus samples are far sparser than sim steps.
  Interpolate positions and run the full contact-and-transfer sequence at each. B04
  says the same: never move more than one cell per step. Two sources, one requirement.
  The bench reproduced the failure — strokes bead into dots without this.

## Build library and tests

Build `RoundSable` (single spine) and `FlatSable` (two spines). Pass/fail from VL:
1. The tuft **snaps back instantly** when lifted.
2. Experienced artists needed almost no instruction — natural strokes in seconds.
   **If someone has to be told how the brush works, it isn't done.**

Hardware: a 5-DOF tablet (position, pressure, tilt) is enough — that is the Huion on
the desk. Barrel roll and squeeze are later additions, not prerequisites.
