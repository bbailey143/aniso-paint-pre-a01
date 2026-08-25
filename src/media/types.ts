// The media hierarchy (Card 7, D3).
//
// A medium is a DATA ROW of physical properties that plugs into SHARED
// equations — the GPU passes. A subclass overrides values, never methods. That
// is the whole extensibility argument: adding tempera or casein later is a new
// row on `WetMedium`, and adding a coloured pencil is a new row on `GranularDry`.
// Neither is a new code path.
//
// The line that must never blur (D3): the library stores BEHAVIOUR, cells store
// AMOUNTS. Nothing here is ever cached per-cell.

/**
 * The reusable physical part of every material row. Values are normalised to
 * this engine's 0..1 ranges, not copied per pixel: a cell stores amounts while
 * the library owns material behaviour. These fields come from the unified
 * medium schema and are shared by dry media now and wet media as it grows.
 */
export interface MediumPhysics {
  /** Fine particles settle into tooth; large particles bridge over it. */
  pigmentParticleSize: number;
  /** 0 = freely flowing binder, 1 = effectively dry/immobile binder. */
  binderViscosity: number;
  /** Resistance to crushing or deforming the material itself. */
  mediumHardness: number;
  /** How readily friction shears material from the tool onto the surface. */
  shearRate: number;
  /** How readily sheared material remains attached to the surface. */
  adhesionStrength: number;
  /** Stress needed before a hard tool begins to compress paper fibres. */
  compressiveYield: number;
  /** Capacity for a smooth, reflective deposited surface. */
  specularPotential: number;
  /** Fine-scale surface reflectance independent of pigment colour. */
  microReflectance: number;
  /** Normalised optical-density control for the deposited material. */
  refractiveIndex: number;
}

/** Everything every medium has. The shared ancestry. */
export interface Medium {
  name: string;
  slug: string;
  /**
   * Artist-facing family this belongs to — Graphite, Charcoal, Watercolour.
   *
   * The same idea as Paper.collection, and for the same reason: the picker has
   * to group things without carrying its own list of what goes where. 9B and 2H
   * are two hardnesses of one material, not two materials.
   */
  collection: string;
  /** Which branch of the tree — decides whether the fluid passes run at all. */
  family: 'wet' | 'dry';

  /** Library pigment slugs this medium lays down, with relative parts.
   * Goes through the same sticky slot allocator and the same KM render as
   * paint: a pencil is not a special case in the optics. */
  pigments: Array<[string, number]>;
  /** The common physical medium vector. */
  physics: MediumPhysics;

  // ---- optical -------------------------------------------------------------
  /** Saunderson surface-reflection constants. */
  k1: number;
  k2: number;
  /** Gloss dial, 0 glossy .. 1 matte. Per medium, never per pigment. */
  kInstrument: number;
  /**
   * How far a STANDING FILM of this material's own vehicle drags it toward
   * mirror-wet, 0..1. Absent means 1, which is what every material did before
   * this row existed.
   *
   * A puddle of water is genuinely glassy, so a water medium belongs at 1 —
   * and its film is gone in ninety seconds, so the effect expires on its own.
   * An oil film does not leave: real oil cures by oxidation over days rather
   * than drying, so the row says openTime 48 hours and an evaporation rate
   * 1920x slower than watercolour's. The consequence was that oil sat pinned
   * at maximum gloss for the whole session and its own kInstrument was never
   * read at all. An oil film is the PAINT, not a layer of solvent lying on it,
   * so it should not be treated as a wet puddle in the first place.
   */
  filmGloss?: number;

  // ---- body ----------------------------------------------------------------
  /**
   * How far a load of this material stands off the sheet, as relief the light
   * can catch.
   *
   * 0 is flat — a stain, which is watercolour and every dry stick: the only
   * thing the lamp finds is the paper's own tooth. Higher and the film becomes
   * a surface in its own right, so a ridge left by a bristle throws a shadow
   * and an impasto passage reads as something sitting ON the canvas rather than
   * soaked into it.
   *
   * Replaces the old `hasBody` boolean, which nothing ever read. A dead flag
   * next to a live number that means the same thing is worse than no flag.
   */
  relief: number;
  /** Fraction of wet height retained on drying. */
  bodyShrink: number;
  /**
   * How completely a load of this material hides the surface beneath it.
   *
   * 0 is a stain: the sheet shows through however much you put on, which is
   * watercolour and is the whole reason watercolour is painted on white paper.
   * 1 covers: two loaded strokes of oil and the canvas is gone.
   *
   * This exists because the sheet's TONE and its TOOTH were being applied over
   * the finished colour rather than under it. The Kubelka-Munk stack already
   * hides the paper's reflectance as a layer thickens - that part was right -
   * but the sheet's colour and its relief lighting were multiplied on top
   * afterwards, unconditionally. So the weave came through a solid impasto, and
   * the harder you painted the more canvas you saw.
   *
   * Strictly it is an approximation of what the optics would do on their own if
   * the sheet's tone were spectral rather than RGB. At 0 the composite is
   * byte-for-byte what it was.
   */
  hidesGround: number;

  // ---- transfer ------------------------------------------------------------
  downRate: number;
  upRate: number;
  /** Minimum left behind by advection/pickup — adhesion. */
  teflonMin: number;

  // ---- drying --------------------------------------------------------------
  /** How long it stays workable, seconds. */
  openTime: number;
  /** Wet -> dry lightness change. Positive = lightens. */
  valueShift: number;
  /** Re-wets with water. */
  reactivatable: boolean;
  /** Drying is permanent. */
  oneWayDoor: boolean;
}

/** Media that move as a fluid and are applied with a brush. */
export interface WetMedium extends Medium {
  family: 'wet';
  solvent: 'water' | 'oil';
  /** C97 mu. */
  viscosity: number;
  /** C97 kappa — ordinary resistance to surface flow. */
  drag: number;
  /** How strongly the medium responds to the board's shared gravity field. */
  gravityResponse: number;
  /** Extra resistance from liquid already held in the substrate below. */
  wetLayerDrag: number;
  /** C97/Deegan outward drying flow that carries pigment toward a pinned edge.
   * This is the WATER side: it lowers pressure at the film edge and pigment
   * reaches the rim as a passenger. Keep it gentle — see `rimMigration`. */
  edgeDarkening: number;
  /**
   * How strongly suspended pigment drifts toward a receding film edge on its
   * own, independent of how fast the water is moving.
   *
   * The reason this exists as a separate row from `edgeDarkening`: C97 gets its
   * ring by pushing water, so ring strength and water speed are one dial. Turn
   * it up far enough to see the rim and the water field is being driven at cell
   * scale, which on a 512 grid reads as stippling and needles (log 13, E8).
   * This row moves pigment down a deliberately smoothed film gradient instead,
   * so the rim can be strong while the water stays calm.
   *
   * Per medium because it is particle mobility in the vehicle: watercolour rings
   * famously, a binder-loaded gouache holds pigment where it lands, and oil does
   * not dry by evaporation at all and should be 0. Zero restores the pure-C97
   * behaviour exactly.
   */
  rimMigration: number;
  /** Gaussian sigma in cells for the film blur that gives `rimMigration` its
   * direction — the width of the rim's catchment. Larger = a broader, softer
   * shoulder; smaller = a narrow stranded line. Weighted inside a fixed 9x9
   * window, so a medium changing this does not change the cost. */
  rimReach: number;
  /**
   * How much faster the film dries at its pinned edge than in its interior.
   * `0` = evenly, which is what every medium did before this row existed.
   * `2` means the rim loses water three times as fast as the middle.
   *
   * This is the coffee ring, and unlike `edgeDarkening` and `rimMigration` it
   * does not model the ring — it sets up the cause and lets the existing water
   * and pigment transport produce the ring on its own. Nothing pushes paint.
   *
   * Per medium because it is really "does this stuff dry by losing solvent to
   * the air, and how exposed is its edge": high for watercolour, lower for a
   * bodied paint whose surface skins over, and **0 for oil**, which does not
   * dry by evaporation at all — it cures, and it famously leaves no ring.
   */
  edgeEvaporation: number;
  /**
   * The stress a face must feel before this material moves at all.
   *
   * Water has none: push it however gently and it flows, which is why a wash
   * levels itself and a watercolour brushmark disappears the moment you lift.
   * Oil has a real one. Below it the paint is a soft solid and holds whatever
   * shape it was left in - that is impasto, a knife ridge, and the reason a
   * brushmark in oil is still there tomorrow.
   *
   * Above the threshold only the EXCESS drives flow (the Bingham term), so a
   * stress that barely clears it produces almost nothing: thick paint creeps
   * rather than collapsing. Pile it high enough that its own weight clears the
   * threshold and it slumps, which is exactly what real paint does.
   *
   * 0 restores water's behaviour precisely - the solver takes an early exit
   * and the unyielded path is untouched, not approximated.
   *
   * [UNVERIFIED] The oil value is reasoned from the archived oil spec's
   * Herschel-Bulkley model, not measured. It is the first number to turn when
   * oil feels wrong: too high and the brush cannot shove paint at all, too low
   * and ridges sag.
   */
  yieldStress: number;
  /** Dimensionless, per unit time. */
  evapRate: number;
  /** How strongly it soaks in via Lucas-Washburn. */
  absorptionCoupling: number;
  /** A26 zeta — weight incoming pigment over resident. */
  pigmentBoost: number;
}

/**
 * Media that deposit directly, gated by the paper's tooth. No fluid pass runs.
 *
 * This is where "rapid strokes on rough paper break up, slow deliberate strokes
 * lay smooth" actually lives: `velocityCoupling` pulls `reach` down as the hand
 * speeds up, and `reach` is what decides whether the tip touches only the peaks
 * of the tooth or gets down into the valleys.
 */
export interface DryMedium extends Medium {
  family: 'dry';
  /**
   * What you are actually holding.
   *
   *   'stick'   — bare, with faces. Conte, vine charcoal, chalk, a pastel, a
   *               crayon with the paper off. It can be rolled onto its side and
   *               laid flat, so the shape of the contact is worth showing.
   *   'encased' — wrapped in wood. A pencil only ever presents its point.
   *   'pen'     — a ball or a nib. The contact is fixed by the hardware.
   *
   * This exists so nothing has to ask whether a medium is *conte*. The contact
   * view belongs to every bare stick, and the ones that have not been built yet
   * will get it by saying what they are.
   */
  form: 'stick' | 'encased' | 'pen';
  /** Paper height above which it deposits at all, before hardness shifts it. */
  toothThreshold: number;
  /** 0..1 — how fast strokes break the line up. Graphite high, ballpoint low. */
  velocityCoupling: number;
  /** Temporary artist-facing hardness label; physics.mediumHardness drives the equations. */
  hardness: number;
  /** -1 (soft, 6B) .. +1 (hard, 4H). Scales deposition AND tooth catch: a hard
   * lead lays little and only on peaks, a soft one fills the valleys. */
  /** Base tip shape. A fountain nib is a crisp chisel, not a stretched dot. */
  contactProfile: 'round' | 'chisel';
  /** Long-to-short contact ratio before stylus tilt adds its own broadside. */
  contactAspect: number;
  /** Granulation — how much settles into valleys rather than sitting on top. */

  // ---- tip geometry --------------------------------------------------------
  /** Contact radius in grid cells at size 1. */
  tipRadius: number;
  /** Lean angle, in degrees from vertical, at which side contact begins. */
  tiltStart: number;
  /**
   * Extra length of the contact patch along the direction of lean at a fully
   * laid-over angle. This is shared contact geometry: graphite, charcoal,
   * crayons, markers, and chisel tools can each supply their own row.
   */
  tiltAspect: number;
  /** Pressure response exponent. ~1 for graphite, near 0 for a ballpoint,
   * which is what makes a biro's line so flat. */
  pressureExp: number;
  /** Pigment laid at the centreline at full pressure, per step. */
  deposition: number;
  /**
   * How fast the mark falls off at its rim, in inverse cells. 1 spreads the
   * edge over a whole cell — soft, and it reads as WET. Higher tightens it: a
   * ballpoint leaves a crisp edge because the paste does not spread once it is
   * off the ball.
   */
  edgeSharpness: number;
}

/** Pencils, charcoals, pastels — particles scraped off onto the tooth. */
export interface GranularDry extends DryMedium {
  kind: 'granular';
  /**
   * Symmetric neighbour exchange per contact, 0..0.24. Zero means particles
   * remain where they first catch; higher values let a later pass rub loose
   * surface material into a smoother gradation. The 0.24 ceiling is the stable
   * limit for the four-neighbour exchange used by the shared dry pass.
   */
  surfaceMobility: number;
  /** Deposited amount at which surfaceMobility is halved by compaction. */
  compactionAmount: number;
}

/**
 * Pens. A ballpoint is a viscous paste; a fountain pen is a fluid and will turn
 * the wet path back on when its row is added.
 *
 * A ball only transfers ink while it rolls, and it does not do so evenly — the
 * paste starves and recovers along the line. That intermittency is the whole
 * look of a biro, so it is a property of the medium, not an effect bolted on.
 */
export interface InkMedium extends DryMedium {
  kind: 'ink';
  /** A rolling ball meters paste; a fountain uses a steady wetted nib. */
  flowMode: 'ball' | 'fountain';
  /** 0..1 — how deep the flow dips when the ball starves. */
  skipStrength: number;
  /** Distance in cells over which the flow starves and recovers. */
  skipScale: number;
  /** 0..1 — fine, fast width and density chatter on top of the slow starve. */
  chatter: number;
}

export type AnyMedium = WetMedium | GranularDry | InkMedium;

/** Tools the user can pick. A wet tool drives the brush engine; a dry tool
 * drives the direct-deposit path. Same stroke resampler feeds both. */
export interface Tool<M extends AnyMedium = AnyMedium> {
  name: string;
  slug: string;
  medium: M;
}
