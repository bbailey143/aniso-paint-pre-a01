// The media library: behaviour lives in rows; cells store only amounts.
//
// [UNVERIFIED] The dry-media values below are normalised working values from
// the unified physical-medium schema. They are intentionally visible here so
// artist testing can tune a material without creating a special code path.

import type { WetMedium, GranularDry, InkMedium, Tool, MediumPhysics } from './types';

type DryRow = GranularDry | InkMedium;

export const WATERCOLOR: WetMedium = {
  name: 'Watercolour', slug: 'watercolour', family: 'wet', pigments: [],
  physics: {
    pigmentParticleSize: 0.12, binderViscosity: 0.10, mediumHardness: 0,
    shearRate: 0.35, adhesionStrength: 0.45, compressiveYield: 1,
    specularPotential: 0.18, microReflectance: 0.35, refractiveIndex: 0.62,
  },
  k1: 0.03, k2: 0.65, kInstrument: 1,
  hasBody: false, bodyShrink: 0, downRate: 0.35, upRate: 0.08, teflonMin: 0.02,
  openTime: 90, valueShift: 0.18, reactivatable: true, oneWayDoor: false,
  solvent: 'water', viscosity: 0.1,
  drag: 0.06, gravityResponse: 0.03, wetLayerDrag: 0.55,
  edgeDarkening: 0.045,
  // Claude's current watercolor baseline keeps these shared rim controls
  // intentionally inert until artist calibration turns them on.
  rimMigration: 0, rimReach: 2.0, edgeEvaporation: 0,
  evapRate: 0.0015,
  absorptionCoupling: 0.0001, pigmentBoost: 1,
};

function physics(
  pigmentParticleSize: number, binderViscosity: number, mediumHardness: number,
  shearRate: number, adhesionStrength: number, compressiveYield: number,
  specularPotential: number, microReflectance: number, refractiveIndex: number,
): MediumPhysics {
  return {
    pigmentParticleSize, binderViscosity, mediumHardness, shearRate,
    adhesionStrength, compressiveYield, specularPotential, microReflectance, refractiveIndex,
  };
}

function graphite(name: string, slug: string, row: MediumPhysics,
                  deposition: number, velocityCoupling: number): GranularDry {
  return {
    name, slug, family: 'dry', kind: 'granular', pigments: [['bone-black', 1]], physics: row,
    k1: 0.03, k2: 0.65, kInstrument: 0.45,
    hasBody: false, bodyShrink: 0, downRate: 1, upRate: 0, teflonMin: 1,
    openTime: 0, valueShift: 0, reactivatable: false, oneWayDoor: true,
    toothThreshold: 0.5, velocityCoupling, hardness: row.mediumHardness,
    tipRadius: 1.1, contactProfile: 'round', contactAspect: 1,
    tiltStart: 24, tiltAspect: 6, pressureExp: 1.1, deposition, edgeSharpness: 0.85,
  };
}

/** The deliberately small pencil set requested for this dry-media pass. */
export const GRAPHITE_GRADES: GranularDry[] = [
  graphite('9B', 'graphite-9b', physics(0.10, 1, 0.08, 0.95, 0.80, 0.94, 0.45, 0.30, 0.62), 0.32, 0.35),
  graphite('2B', 'graphite-2b', physics(0.08, 1, 0.32, 0.68, 0.88, 0.88, 0.52, 0.34, 0.64), 0.22, 0.50),
  graphite('HB', 'graphite-hb', physics(0.06, 1, 0.55, 0.54, 0.92, 0.78, 0.42, 0.30, 0.66), 0.18, 0.62),
  graphite('2H', 'graphite-2h', physics(0.04, 1, 0.80, 0.32, 0.95, 0.64, 0.34, 0.24, 0.68), 0.15, 0.78),
];

function ballpoint(name: string, slug: string, pigment: string, deposition: number): InkMedium {
  return {
    name, slug, family: 'dry', kind: 'ink', flowMode: 'ball', pigments: [[pigment, 1]],
    physics: physics(0.02, 0.88, 0.72, 0.58, 0.98, 0.88, 0.25, 0.22, 0.70),
    k1: 0.03, k2: 0.65, kInstrument: 0.8,
    hasBody: false, bodyShrink: 0, downRate: 1, upRate: 0, teflonMin: 1,
    openTime: 0, valueShift: 0, reactivatable: false, oneWayDoor: true,
    toothThreshold: 0.42, velocityCoupling: 0.16, hardness: 0.72,
    tipRadius: 0.46, contactProfile: 'round', contactAspect: 1,
    tiltStart: 55, tiltAspect: 0.15, pressureExp: 0.25, deposition, edgeSharpness: 1.45,
    skipStrength: 0.72, skipScale: 5.5, chatter: 0.26,
  };
}

export const BALLPOINT_BLUE = ballpoint('Biro', 'ballpoint-blue', 'phthalo-blue-gs', 0.30);
export const BALLPOINT_BLACK = ballpoint('Biro K', 'ballpoint-black', 'bone-black', 0.42);

export const VINE_CHARCOAL: GranularDry = {
  name: 'Vine Charcoal', slug: 'vine-charcoal', family: 'dry', kind: 'granular', pigments: [['bone-black', 1]],
  physics: physics(0.72, 1, 0.05, 0.95, 0.62, 0.98, 0, 0.06, 0.52),
  k1: 0.03, k2: 0.65, kInstrument: 1, hasBody: false, bodyShrink: 0,
  downRate: 1, upRate: 0, teflonMin: 1, openTime: 0, valueShift: 0, reactivatable: false, oneWayDoor: true,
  toothThreshold: 0.38, velocityCoupling: 0.26, hardness: 0.05,
  tipRadius: 1.7, contactProfile: 'round', contactAspect: 1,
  tiltStart: 16, tiltAspect: 3.4, pressureExp: 1.25, deposition: 0.32, edgeSharpness: 0.62,
};

export const CONTE_CRAYON: GranularDry = {
  name: 'Conte Crayon', slug: 'conte-crayon', family: 'dry', kind: 'granular', pigments: [['bone-black', 1]],
  physics: physics(0.48, 0.96, 0.46, 0.70, 0.86, 0.76, 0.16, 0.18, 0.60),
  k1: 0.03, k2: 0.65, kInstrument: 0.84, hasBody: false, bodyShrink: 0,
  downRate: 1, upRate: 0, teflonMin: 1, openTime: 0, valueShift: 0, reactivatable: false, oneWayDoor: true,
  toothThreshold: 0.44, velocityCoupling: 0.42, hardness: 0.46,
  tipRadius: 1.25, contactProfile: 'round', contactAspect: 1.25,
  tiltStart: 22, tiltAspect: 4.5, pressureExp: 1.05, deposition: 0.26, edgeSharpness: 0.72,
};

export const WAX_CRAYON: GranularDry = {
  name: 'Wax Crayon', slug: 'wax-crayon', family: 'dry', kind: 'granular', pigments: [['bone-black', 1]],
  physics: physics(0.38, 0.56, 0.30, 0.42, 0.94, 0.82, 0.65, 0.44, 0.72),
  k1: 0.03, k2: 0.65, kInstrument: 0.46, hasBody: false, bodyShrink: 0,
  downRate: 1, upRate: 0, teflonMin: 1, openTime: 0, valueShift: 0, reactivatable: false, oneWayDoor: true,
  toothThreshold: 0.32, velocityCoupling: 0.22, hardness: 0.30,
  tipRadius: 1.8, contactProfile: 'round', contactAspect: 1.3,
  tiltStart: 14, tiltAspect: 2.8, pressureExp: 0.86, deposition: 0.28, edgeSharpness: 1.12,
};

export const FOUNTAIN_CHISEL: InkMedium = {
  name: 'Chisel Fountain', slug: 'fountain-chisel', family: 'dry', kind: 'ink', flowMode: 'fountain',
  pigments: [['bone-black', 1]], physics: physics(0.01, 0.14, 0, 1, 0.97, 1, 0.38, 0.30, 0.70),
  k1: 0.03, k2: 0.65, kInstrument: 0.62, hasBody: false, bodyShrink: 0,
  downRate: 1, upRate: 0, teflonMin: 1, openTime: 0, valueShift: 0, reactivatable: false, oneWayDoor: true,
  toothThreshold: 0.08, velocityCoupling: 0.04, hardness: 0,
  tipRadius: 0.52, contactProfile: 'chisel', contactAspect: 3.6,
  tiltStart: 89, tiltAspect: 0, pressureExp: 0.45, deposition: 0.34, edgeSharpness: 1.8,
  skipStrength: 0, skipScale: 1, chatter: 0,
};

export const DRY_MEDIA: DryRow[] = [
  ...GRAPHITE_GRADES, BALLPOINT_BLUE, BALLPOINT_BLACK,
  VINE_CHARCOAL, CONTE_CRAYON, WAX_CRAYON, FOUNTAIN_CHISEL,
];

export const DRY_TOOLS: Tool<DryRow>[] = DRY_MEDIA.map((m) => ({ name: m.name, slug: m.slug, medium: m }));
