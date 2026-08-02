// Pack the pigment library + CIE weights + Saunderson constants into GPU buffers.
//
// The library stores behaviour; cells store amounts (the one quote of truth,
// Card 0 invariant 5). The composite pass reads these buffers to turn per-cell
// pigment amounts into colour. Layout mirrors src/color/km.ts exactly so the CPU
// tray and the GPU canvas agree.

import { CIE_BANDS, SAUNDERSON, N_BANDS } from './pigments';
import { PIGMENTS } from './pigment-palette';

export const PIGMENT_COUNT = PIGMENTS.length;

export interface ColorLibraryBuffers {
  /** vec2<f32>[PIGMENT_COUNT * N_BANDS] as (K, S) per pigment per band. */
  ks: GPUBuffer;
  /** vec4<f32>[N_BANDS] CIE [X,Y,Z,0] weights (observer*D65, Y-normalised). */
  cie: GPUBuffer;
  /** Uniform: k1, k2, kInstrumentDefault, pigmentCount. */
  params: GPUBuffer;
}

export function createColorLibrary(device: GPUDevice): ColorLibraryBuffers {
  // ks: interleaved (K,S) per pigment per band, pigment-major.
  const ks = new Float32Array(PIGMENT_COUNT * N_BANDS * 2);
  let o = 0;
  for (const p of PIGMENTS) {
    for (let b = 0; b < N_BANDS; b++) {
      ks[o++] = p.K[b];
      ks[o++] = p.S[b];
    }
  }
  const ksBuf = device.createBuffer({
    size: ks.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'pigment-ks',
  });
  device.queue.writeBuffer(ksBuf, 0, ks);

  // CIE weights padded to vec4 for std430 alignment.
  const cie = new Float32Array(N_BANDS * 4);
  for (let b = 0; b < N_BANDS; b++) {
    cie[b * 4 + 0] = CIE_BANDS[b][0];
    cie[b * 4 + 1] = CIE_BANDS[b][1];
    cie[b * 4 + 2] = CIE_BANDS[b][2];
    cie[b * 4 + 3] = 0;
  }
  const cieBuf = device.createBuffer({
    size: cie.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'cie-weights',
  });
  device.queue.writeBuffer(cieBuf, 0, cie);

  const params = new Float32Array([
    SAUNDERSON.k1, SAUNDERSON.k2, SAUNDERSON.kInstrumentDefault, PIGMENT_COUNT,
  ]);
  const paramsBuf = device.createBuffer({
    size: params.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'color-params',
  });
  device.queue.writeBuffer(paramsBuf, 0, params);

  return { ks: ksBuf, cie: cieBuf, params: paramsBuf };
}
