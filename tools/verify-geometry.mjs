// Objective fidelity check, independent of any rasteriser.
//
// Projects every primitive in src/hero/geometry.json back to 2D exactly the way
// the orthographic camera does (drop z) and measures, for each generated
// vertex, its distance to the nearest segment of the original vector artwork.
//
// A perfect rebuild scores 0. Anything under a few hundredths of a design unit
// is far below one rendered pixel at any realistic viewport.

import fs from 'node:fs';
import path from 'node:path';
import { parseStyles, readGroups } from './svg-read.mjs';

const svg = fs.readFileSync(path.resolve('src/assets/elemento-fundo.svg'), 'utf8');
const rules = parseStyles(svg);
const groups = readGroups(svg, 'cls-13', rules);
const { viewBox, primitives } = JSON.parse(
  fs.readFileSync(path.resolve('src/hero/geometry.json'), 'utf8'),
);

// ------------------------------------------- reference: the original polylines

/** Every segment of the source artwork, as [x1, y1, x2, y2]. */
const segments = [];
for (const g of groups) {
  for (const s of g.shapes) {
    for (const run of s.runs) {
      for (let i = 1; i < run.length; i++) {
        segments.push([run[i - 1][0], run[i - 1][1], run[i][0], run[i][1]]);
      }
    }
  }
}

// Uniform grid so the nearest-segment query stays linear in practice.
const CELL = 8;
const cols = Math.ceil(viewBox.w / CELL) + 2;
const rows = Math.ceil(viewBox.h / CELL) + 2;
const grid = new Map();
const key = (cx, cy) => cy * cols + cx;
const cellOf = (x, y) => [
  Math.min(cols - 1, Math.max(0, Math.floor(x / CELL))),
  Math.min(rows - 1, Math.max(0, Math.floor(y / CELL))),
];

segments.forEach((seg, i) => {
  const [x1, y1, x2, y2] = seg;
  const [ax, ay] = cellOf(Math.min(x1, x2), Math.min(y1, y2));
  const [bx, by] = cellOf(Math.max(x1, x2), Math.max(y1, y2));
  for (let cy = ay; cy <= by; cy++) {
    for (let cx = ax; cx <= bx; cx++) {
      const k = key(cx, cy);
      let bucket = grid.get(k);
      if (!bucket) grid.set(k, (bucket = []));
      bucket.push(i);
    }
  }
});

function distToSegment(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Distance from a point to the nearest source segment, widening the search. */
function nearest(px, py) {
  const [cx, cy] = cellOf(px, py);
  let best = Infinity;
  for (let ring = 0; ring < Math.max(cols, rows); ring++) {
    for (let y = cy - ring; y <= cy + ring; y++) {
      for (let x = cx - ring; x <= cx + ring; x++) {
        // Only the newly added ring, not the interior we already scanned.
        if (ring > 0 && Math.abs(y - cy) !== ring && Math.abs(x - cx) !== ring) continue;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        for (const i of grid.get(key(x, y)) ?? []) {
          const d = distToSegment(px, py, segments[i]);
          if (d < best) best = d;
        }
      }
    }
    // Once the best hit is inside the scanned radius, no wider ring can beat it.
    if (best <= ring * CELL) return best;
  }
  return best;
}

// -------------------------------------- candidate: project the 3D primitives

/** Same maths as the shader path in wireframe.ts, with z discarded. */
function projectArc(p) {
  const span = p.t1 - p.t0;
  const steps = Math.min(1400, Math.max(24, Math.ceil((p.radius * Math.abs(span)) / 0.7)));
  const ct = Math.cos(p.tilt);
  const cs = Math.cos(p.spin), ss = Math.sin(p.spin);
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = p.t0 + span * (i / steps);
    const x = p.radius * Math.cos(t);
    const y = p.radius * Math.sin(t) * ct;
    out.push([p.center[0] + x * cs - y * ss, p.center[1] + x * ss + y * cs]);
  }
  return out;
}

const stats = [];
let all = [];

for (const p of primitives) {
  let points = [];
  if (p.kind === 'arc') {
    points = projectArc(p);
  } else if (p.kind === 'segments' || p.kind === 'polyline') {
    points = p.runs.flat().map(([x, y]) => [x, y]);
  } else if (p.kind === 'disc') {
    // Compare the disc's rim, which is what the source drew as a circle.
    for (let i = 0; i < 128; i++) {
      const t = (i / 128) * Math.PI * 2;
      points.push([
        p.center[0] + p.radius * Math.cos(t),
        p.center[1] + p.radius * Math.sin(t),
      ]);
    }
  }
  const ds = points.map(([x, y]) => nearest(x, y));
  const mean = ds.reduce((s, d) => s + d, 0) / ds.length;
  const max = Math.max(...ds);
  stats.push({ id: p.id, kind: p.kind, n: ds.length, mean, max });
  all = all.concat(ds);
}

all.sort((a, b) => a - b);
const pct = (q) => all[Math.min(all.length - 1, Math.floor(q * all.length))];
const overallMean = all.reduce((s, d) => s + d, 0) / all.length;

const worst = [...stats].sort((a, b) => b.max - a.max).slice(0, 6);
console.log('worst-deviating primitives (design units):');
for (const s of worst) {
  console.log(
    `  ${s.id.padEnd(16)} ${s.kind.padEnd(9)} n=${String(s.n).padStart(5)}  ` +
    `mean=${s.mean.toFixed(4)}  max=${s.max.toFixed(4)}`,
  );
}

console.log(`\nvertices compared: ${all.length}   source segments: ${segments.length}`);
console.log(`mean deviation : ${overallMean.toFixed(5)} units`);
console.log(`p50 / p99      : ${pct(0.5).toFixed(5)} / ${pct(0.99).toFixed(5)} units`);
console.log(`max deviation  : ${all[all.length - 1].toFixed(5)} units`);
console.log(
  `\nas a share of the ${viewBox.w} unit artwork width: ` +
  `mean ${((overallMean / viewBox.w) * 100).toFixed(4)}%, ` +
  `max ${((all[all.length - 1] / viewBox.w) * 100).toFixed(4)}%`,
);
// At a 1400px-wide render the artwork spans roughly 1400 * 429.38/820 px.
const pxPerUnit = (1400 * (viewBox.w / 820)) / viewBox.w;
console.log(
  `at a 1400px-wide panel (${pxPerUnit.toFixed(2)} px/unit): ` +
  `mean ${(overallMean * pxPerUnit).toFixed(3)}px, max ${(all[all.length - 1] * pxPerUnit).toFixed(3)}px`,
);
