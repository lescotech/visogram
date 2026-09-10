// Diagnostic pass over elemento-fundo.svg: for every top-level element, report
// whether it reads as a straight line or an elliptical arc, and how well the
// conic fit holds. Run with `node tools/inspect.mjs` before trusting the
// extractor's output.

import fs from 'node:fs';
import path from 'node:path';
import { parseStyles, readGroups } from './svg-read.mjs';
import { fitEllipse, ellipseToCircle3D, paramAt } from './conic.mjs';

const file = path.resolve('src/assets/elemento-fundo.svg');
const svg = fs.readFileSync(file, 'utf8');
const rules = parseStyles(svg);
const groups = readGroups(svg, 'cls-13', rules);

const deg = (r) => ((r * 180) / Math.PI).toFixed(2);
const f2 = (n) => n.toFixed(2);
const pt = (p) => `(${f2(p[0])},${f2(p[1])})`;

/** Max perpendicular distance from the chord through the endpoints. */
function straightness(pts) {
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Infinity;
  let max = 0;
  for (const p of pts) {
    const d = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
    if (d > max) max = d;
  }
  return max;
}

console.log(`styles: ${Object.keys(rules).join(', ')}\n`);
console.log(`top-level elements inside .cls-13: ${groups.length}\n`);

for (const g of groups) {
  const all = g.shapes.flatMap((s) => s.runs.flat());
  const classes = [...new Set(g.shapes.flatMap((s) => s.classList))].join('+');
  const tags = [...new Set(g.shapes.map((s) => s.tag))].join('/');
  const st = g.shapes[0].style;
  const dash = st.dash ? `dash[${st.dash.join(' ')}]` : 'solid';

  console.log(
    `#${String(g.index).padStart(2)}  ${tags.padEnd(16)} ${classes.padEnd(22)} ` +
    `pts=${String(all.length).padStart(4)} runs=${g.shapes.reduce((n, s) => n + s.runs.length, 0)} ` +
    `sw=${st.strokeWidth} ${st.fill ? `fill=${st.fill}` : `stroke=${st.stroke}`} ${dash}`,
  );

  // Straight?
  const flat = straightness(all);
  if (flat < 0.75) {
    const a = all[0], b = all[all.length - 1];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    console.log(
      `      LINE  ${pt(a)} -> ${pt(b)}  len=${f2(Math.hypot(b[0] - a[0], b[1] - a[1]))} ` +
      `angle=${deg(ang)}deg  bow=${flat.toFixed(3)}`,
    );
    // Per-run gaps tell us where the artwork breaks the axis around the eye.
    const runs = g.shapes.flatMap((s) => s.runs);
    if (runs.length > 1) {
      console.log(`      runs: ${runs.map((r) => `${pt(r[0])}..${pt(r[r.length - 1])}`).join('  ')}`);
    }
    console.log('');
    continue;
  }

  // Arc / ring: fit the conic.
  const el = fitEllipse(all);
  if (!el) {
    console.log('      NO FIT (not an ellipse)\n');
    continue;
  }
  const c3 = ellipseToCircle3D(el);
  const t0 = paramAt(el, all[0]);
  const t1 = paramAt(el, all[all.length - 1]);
  const closed = Math.hypot(all[0][0] - all[all.length - 1][0], all[0][1] - all[all.length - 1][1]) < 1;

  console.log(
    `      ARC   c=${pt([el.cx, el.cy])} a=${f2(el.semiMajor)} b=${f2(el.semiMinor)} ` +
    `major@${deg(el.angle)}deg  rms=${el.rms.toFixed(4)}`,
  );
  console.log(
    `      3D    R=${f2(c3.radius)} tilt=${deg(c3.tilt)}deg spin=${deg(c3.spin)}deg ` +
    `t=[${deg(t0)}..${deg(t1)}] ${closed ? 'CLOSED' : 'open'}`,
  );
  console.log(`      ends  ${pt(all[0])} -> ${pt(all[all.length - 1])}\n`);
}
