# CARD 5 — Brush Engine

## The founding decision

**Dynamics at spine resolution. Footprint at bristle resolution.**

VL's central move: solve one or two kinematic spines. Hundreds of bristles are *geometry only*, riding a deformation lattice, never simulated. But the footprint is produced by **rasterizing the actual bristle geometry**, so the mark on the canvas carries per-hair structure that nothing per-hair computed.

You get streaks without paying for them.

`[CEILING]` Splay is geometric, not emergent. Bristles fan because the lattice stretches, not because each hair found its own path around a paper ridge. If you eventually want that, it's WetBrush territory.

## Geometry decoupled from solver — the FFD lattice

1. Model the tuft as an ordinary polygon mesh (VL used Blender) in its undeformed state.
2. Enclose it in a **free-form deformation lattice**.
3. Drive the lattice control points from the kinematic spine(s).
4. The mesh inherits whatever the spines do.

**Proof it works:** their **sponge** — no bristles, not a brush at all — runs in the same framework on a single spine. Shape becomes an asset, not a code path. This is your `BrushFile` schema validated.

**Spine count findings:**
- Single spine → round brushes. **Cannot spread bristles.**
- Two spines → flat-brush spreading and scratching. Each drives one side of the lattice.
- More than two → *"did not result in noticeably better looking results."* **Two is your budget.**

## Bristle representation & dynamics

A bristle is a **kinematic chain**. Each segment has a predefined length and two angles θ, φ (fixed XYZ convention). Twist is assumed zero.

Bend angle: `β = cos⁻¹(cos θ · cos φ)`

**Energy function minimized:**
```
C = Σ_joints E_spring + E_friction
E_spring = (k/2)(180° − β)²
```

`[KEY]` The rest angle is 180° *"when assuming straight bristles."* **Make rest angle a per-segment field in the brush file** and you get: worn/splayed brushes; plasticity (Chu's method nudges the target angle as the wet tuft deforms, so the brush remembers its splay through a stroke and recovers slowly); and shaped tools like fan brushes as configuration rather than code.

**Taper:** at least 4 segments, **decreasing lengths toward the tip**, and **spring constants decrease toward the tip**. Stiff at the ferrule where bristles are packed, flexible at the tip. This is what lets a large round brush draw a hairline.

## Anisotropic friction

VL's observation from watching painters: **the brush is essentially always pulled, almost never pushed**, except for small details like dots.

```
E_friction = μ · Σ_contact (1 − η) · |N| · ‖d‖
η = C_η · max(0, d_p · d/‖d‖)^k
```
where `d_p` is the preferred drag direction, and `0 ≤ C_η ≤ 1` and `k` shape the anisotropic cone. Friction goes to near-zero along the pull direction, stays high sideways or pushing.

`[REQUIREMENT]` The formulation is deliberately **C1-continuous** — required by the optimizer. A hard directional if/else will make any solver chatter. **Use a smooth lobe.**

`[CONNECTION]` Apple Pencil Pro barrel roll rotates the tuft → rotates `d_p` → changes how the brush resists. A real physical consequence of a real input, not a mapped parameter.

## `[TRAP]` Solver traps

**Bristles jumping off the canvas.** With a pure inequality non-penetration constraint (`Plane_z − p_z ≥ 0`), the optimizer can decide that lifting a joint costs less energy than paying the friction to drag it — and the bristle hops across the canvas. **Fix:** for any joint violating the constraint in the current step, replace it with an **equality** constraint pinning it to the surface.

**Don't compute the normal force properly.** VL approximates `N` as constant, re-estimated each timestep, stating plainly that computing it from the full spring configuration is *"tedious and it does not noticeably improve results."* Permission slip — take it.

**Resample the stroke path.** Stylus samples are far sparser than simulation steps. Interpolate positions between samples and run the full contact-and-transfer sequence at each. B04 says the same from the other direction: never move more than one cell per step. Two independent sources, one requirement.

## The reservoir — schema

VL Table 1, effectively liftable:

| Texture | Contents |
|---|---|
| 1 | active pigment set 1: `[p₁, p₂, p₃, p₄]` |
| 2 | active pigment set 2: `[p₅, p₆, p₇, p₈]` |
| 3 | `[water, capacity, unused, unused]` |
| 4 | footprint: `[on/off, tx, ty, unused]` |

`[KEY]` **Per-cell capacity** — the belly of a mop holds more than its tip. That's data, not code.

**Bidirectional transfer** (VL Table 2), per contacting (reservoirCell, canvasCell) pair:
```
toCanvas    = downRate × reservoirQuantity
toReservoir = upRate   × canvasQuantity
```
clamped on both sides against remaining capacity, then applied symmetrically so mass is conserved. Simpler than B04's Algorithm 1, and bidirectional per cell where B04's is unidirectional.

`[PAYOFF]` **Their sponge is just large capacity + high upRate.** Not a special tool — a row in the table. Which means the **lifting and scrubbing** behavior your CHART demands for watercolor and gouache is a brush parameter, not a separate eraser mode.

## The contact slab — footprint generation

Render the tuft from the **canvas's viewpoint**, orthographic projection, with the **near plane just below the paper surface and the far plane just above**. Everything caught in that thin slab is the footprint.

A fragment shader carries the tuft's own 2D texture coordinates `(tx, ty)` through into the footprint, so every footprint cell knows which reservoir cell it came from — that's what makes the reverse update (canvas → brush) possible.

The brush **hovers slightly** above the canvas, and the lattice control points are allowed to penetrate even when the mesh barely does. **Contact depth is a tunable, not a binary.** Setting it is also how you get drybrush.

## Where it runs

Four segments × two spines ≈ **sixteen numbers of state for the whole brush.**

VL split it CPU solver / GPU geometry and canvas. That's still right. Your fluid canvas is millions of cells and belongs in compute shaders; the brush is a pocket calculator. **Solve it in plain Rust on the CPU every frame.**

Consequence: the brush engine can be built and tuned **before the fluid engine works at all.**

## `[OPEN QUESTION]` Quasi-static vs dynamic

VL **rejects time-stepping integration** for bristles, arguing that a stiff, heavily damped system integrated with semi-implicit springs goes inaccurate or unstable, and citing dAb's inability to handle bristle splitting. They solve for **static equilibrium** directly — no dynamics — producing the "snappy" behavior of a real bristle regaining shape the instant it lifts.

XPBD is a fair answer: built precisely to stay stable with stiff constraints, and it maps to a GPU where their SQP optimizer (donlp2) does not — they ran the optimization on the CPU.

**But the observation is testable and free.** Push damping and iteration count toward equilibrium in your XPBD solve and see whether it looks *more* like a brush. If it does, you've found both a look and a saving.

## `[GAPS THEY ADMIT]`

VL skipped **plasticity** (a wet tuft holding its splayed shape through internal friction) and **pore resistance** (bristles catching in surface irregularities). Both are Chu & Tai's. Both matter to you — **pore resistance is dry-brush skip and paper tooth**, straight out of your CHART.

## The canon — you can stop hunting

| Year | Who | Contribution |
|---|---|---|
| 1986 | Strassmann, *Hairy Brushes* | 1D array of idealized bristles, each carrying ink. The origin. |
| 1997 | Lee | First physically-based 3D brush, elastic bristles via Hooke's law |
| 1999/2000 | Saito & Nakajima | Energy optimization instead of integration |
| 2001 | Baxter et al., *dAb* | Haptic spring-mass brush, subdivision surface |
| 2002 | Xu et al. | NURBS "writing primitives" |
| 2002/2004 | Chu & Tai | Anisotropic friction, lateral spine nodes, bristle spreading, **pore resistance, plasticity**, child tufts |
| 2004 | Baxter & Lin | Multi-spine for Western brushes |
| 2015 | Chen, Kim, Ito, Wang, *WetBrush* | Bristle-level GPU 3D painting |

## Test plan — already written for you

**VL Figure 2 — six archetypes:** Chinese calligraphy, flat, round, rigger, fan, mop. Your starting library and coverage matrix.

**VL Figure 7 — eleven named behaviors** to hit: smearing with a clean round brush, scratchy fan strokes, bristle spreading with black ink, sponge deposit and pickup, mixing with a round brush, flat-brush strokes, and **drawing a very fine stroke with the flexible tip of a large round brush**.

**Two pass/fail criteria from the paper:**
1. The tuft must **snap back instantly** when lifted.
2. Experienced artists in their evaluation needed *almost no instruction* — natural strokes appeared within seconds. **If someone has to be told how your brush works, it isn't done.**

## Hardware note

VL got all of this from a **5-DOF tablet: position, pressure, tilt**. That's your Huion. The entire brush engine, including tuning it until it feels right, is buildable on hardware already on your desk. Barrel roll and squeeze are later additions, not prerequisites.

---
