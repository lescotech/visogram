// Fidelity harness: renders the 3D scene at the design's own scale and
// difference-blends the untouched vector over it. Used to prove the rebuild
// projects back to the drawing rather than just claiming it does.

import backgroundSvg from './assets/inline/elemento-fundo.svg?raw';
import { createWireframe } from './hero/wireframe';

const stage = document.getElementById('stage')!;
const canvas = document.getElementById('art') as HTMLCanvasElement;
document.getElementById('ref')!.innerHTML = backgroundSvg;

createWireframe(canvas, stage);

const modes: Record<string, string> = {
  d: 'diff',
  a: 'solo-art',
  r: 'solo-ref',
  o: 'overlay',
};
addEventListener('keydown', (e) => {
  const mode = modes[e.key.toLowerCase()];
  if (!mode) return;
  document.body.className = mode;
});
