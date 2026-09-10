// Projection harness: drives the real panorama module with a labelled probe so
// mirroring and the yaw origin can be read off the screen instead of trusted.
//
// Two frames, because counting bands in a scaled screenshot is error-prone and
// the rose band is not:
//
//   yaw = 0   centres u = 0.5   -> the 5|6 boundary sits on the crosshair
//   yaw = pi  centres u = 0.0   -> the rose band sits on the crosshair
//
// The second is the one that matters. If rose is not centred at yaw = pi, the
// origin is wrong; if the numbers climb leftwards, the sphere is mirrored.

import { createPanorama } from './hero/panorama';
import { asset, type Tour } from './hero/tours';

const probe = (yaw: number): Tour => ({
  slug: '_probe',
  obra: 'Probe',
  cidade: '—',
  uf: '—',
  tipo: 'probe',
  ano: 2026,
  escritorio: null,
  cena: '12 bands',
  cenas: 1,
  vista: { yaw, pitch: 0, fov: 76 },
  luma: 128,
  src: asset('/tours/_probe.webp'),
  srcDense: asset('/tours/_probe.webp'),
  srcLite: asset('/tours/_probe.webp'),
  lqip: asset('/tours/_probe.webp'),
});

for (const [id, yaw] of [
  ['stage-zero', 0],
  ['stage-pi', Math.PI],
] as const) {
  const stage = document.getElementById(id);
  const canvas = stage?.querySelector('canvas');
  if (stage && canvas instanceof HTMLCanvasElement) {
    createPanorama(canvas, stage, { tours: [probe(yaw)], freeze: true });
  }
}
