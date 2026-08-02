// The measured library is generated and must remain reproducible. Artist tools
// may also need a stable composite colour that is not one row in that source
// database. Build those here from measured K/S curves, never by inventing a
// display RGB colour and pretending it is pigment.

import { PIGMENTS as MEASURED_PIGMENTS, type Pigment } from './pigments';

type SpectralPart = readonly [slug: string, fraction: number];

function measuredBlend(
  name: string,
  ci: string,
  slug: string,
  temp: string,
  parts: readonly SpectralPart[],
  transport: Pick<Pigment, 'rho' | 'omega' | 'gamma' | 'transportSrc'>,
  hex: string,
): Pigment {
  const sources = parts.map(([sourceSlug, fraction]) => {
    const pigment = MEASURED_PIGMENTS.find((candidate) => candidate.slug === sourceSlug);
    if (!pigment) throw new Error(`Missing measured pigment ${sourceSlug}`);
    return { pigment, fraction };
  });
  const total = sources.reduce((sum, source) => sum + source.fraction, 0);
  const K = new Array(sources[0].pigment.K.length).fill(0);
  const S = new Array(sources[0].pigment.S.length).fill(0);
  for (const { pigment, fraction } of sources) {
    const amount = fraction / total;
    for (let band = 0; band < K.length; band++) {
      K[band] += pigment.K[band] * amount;
      S[band] += pigment.S[band] * amount;
    }
  }
  return { name, ci, slug, temp, K, S, ...transport, hex };
}

/**
 * The reddish earth color requested for Conté. This is one pigment-library row
 * and therefore one canvas slot, but every wavelength still comes from the
 * measured source curves: 20% PR254 + 68% PO20 + 12% PBk9. The proportions were
 * fitted to the supplied sanguine references; the full KM chain yields #994f37.
 */
export const SANGUINE_SEPIA = measuredBlend(
  'Sanguine Sepia',
  'PR254/PO20/PBk9',
  'sanguine-sepia',
  'warm',
  [
    ['pyrrole-red', 0.20],
    ['cadmium-orange', 0.68],
    ['bone-black', 0.12],
  ],
  {
    rho: 0.1492,
    omega: 3.168,
    gamma: 0.1456,
    transportSrc: 'Derived weighted analog: PR254 + PO20 + PBk9',
  },
  '#994f37',
);

export const PIGMENTS: Pigment[] = [...MEASURED_PIGMENTS, SANGUINE_SEPIA];
