// Derives a 3D scene from src/assets/elemento-fundo.svg.
//
// The contract: rendered through an orthographic camera looking down -Z, with
// the viewBox mapped 1:1, the scene's projection at rest is the original vector
// drawing. Nothing is redrawn or "tidied up" — each ellipse keeps its own
// fitted radius, tilt and spin, so the hand-drawn slop between the great
// circles survives.
//
// One primitive is emitted per SVG shape (not per group) because the artwork
// splits a single curve into a solid cap + dashed body + solid cap, and each
// sub-path restarts its own dash phase. Matching that granularity is what keeps
// the dash rhythm identical.

import fs from 'node:fs';
import path from 'node:path';
import { parseStyles, readGroups } from './svg-read.mjs';
import { fitEllipse, ellipseToCircle3D, paramAt } from './conic.mjs';

const SRC = path.resolve('src/assets/elemento-fundo.svg');
const OUT = path.resolve('src/hero/geometry.json');

/** A shape shorter than this is a dash cap, not a curve worth fitting. */
const CAP_LENGTH = 5;
/** Algebraic residual below which we accept a conic fit, in user units. */
const FIT_TOLERANCE = 0.25;
/** Max bow from the endpoint chord for a shape to count as straight. */
const STRAIGHT_TOLERANCE = 0.75;

const TAU = Math.PI * 2;

const polylineLength = (pts) => {
  let l = 0;
  for (let i = 1; i < pts.length; i++) {
    l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return l;
};

function straightness(pts) {
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return Infinity;
  let max = 0;
  for (const p of pts) {
    max = Math.max(max, Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len);
  }
  return max;
}

/** Geometric-ish residual of points against a fitted ellipse. */
function residual(el, pts) {
  let acc = 0;
  for (const p of pts) {
    const t = paramAt(el, p);
    const ca = Math.cos(el.angle), sa = Math.sin(el.angle);
    const u = el.semiMajor * Math.cos(t), v = el.semiMinor * Math.sin(t);
    const x = el.cx + u * ca - v * sa;
    const y = el.cy + u * sa + v * ca;
    acc += (p[0] - x) ** 2 + (p[1] - y) ** 2;
  }
  return Math.sqrt(acc / pts.length);
}

/**
 * Parameters for a run, unwrapped so the sequence is continuous. Returns the
 * covered [t0, t1] interval, which may run outside [-pi, pi].
 */
function paramRange(el, pts) {
  let prev = paramAt(el, pts[0]);
  let lo = prev, hi = prev;
  for (let i = 1; i < pts.length; i++) {
    let t = paramAt(el, pts[i]);
    while (t - prev > Math.PI) t -= TAU;
    while (t - prev < -Math.PI) t += TAU;
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
    prev = t;
  }
  return [lo, hi];
}

// ---------------------------------------------------------------------------

const svg = fs.readFileSync(SRC, 'utf8');
const rules = parseStyles(svg);
const groups = readGroups(svg, 'cls-13', rules);

const vb = svg.match(/viewBox="([\d.\s-]+)"/)[1].trim().split(/\s+/).map(Number);
const viewBox = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
const groupOpacity = rules['cls-13']?.opacity ? parseFloat(rules['cls-13'].opacity) : 1;

const primitives = [];
const report = [];
const greatCircles = [];

for (const g of groups) {
  // --- Filled discs (the pupil and the satellite node).
  const filled = g.shapes.filter((s) => s.style.fill);
  if (filled.length) {
    for (const s of filled) {
      const pts = s.runs[0];
      const el = fitEllipse(pts);
      primitives.push({
        id: `disc-${g.index}`,
        kind: 'disc',
        center: [el.cx, el.cy, 0],
        radius: (el.semiMajor + el.semiMinor) / 2,
        fill: s.style.fill,
      });
      report.push(`#${g.index} disc r=${el.semiMajor.toFixed(2)} at (${el.cx.toFixed(2)},${el.cy.toFixed(2)})`);
    }
    continue;
  }

  const allPts = g.shapes.flatMap((s) => s.runs.flat());

  // --- Straight axes: keep every run exactly as drawn, at z = 0. The breaks
  //     around the eye and the solid caps on dashed bodies are intentional.
  if (straightness(allPts) < STRAIGHT_TOLERANCE) {
    for (const [i, s] of g.shapes.entries()) {
      primitives.push({
        id: `axis-${g.index}-${i}`,
        kind: 'segments',
        runs: s.runs.map((r) => r.map(([x, y]) => [x, y, 0])),
        stroke: s.style.stroke,
        strokeWidth: s.style.strokeWidth,
        dash: s.style.dash,
      });
    }
    const a = allPts[0], b = allPts[allPts.length - 1];
    report.push(
      `#${g.index} axis ${g.shapes.length} shape(s) ` +
      `(${a[0].toFixed(2)},${a[1].toFixed(2)})->(${b[0].toFixed(2)},${b[1].toFixed(2)}) ` +
      `@${((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI).toFixed(2)}deg`,
    );
    continue;
  }

  // --- Curves. Fit the group as one conic; if that fails the group holds more
  //     than one curve, so fit each substantial shape on its own.
  const bodies = g.shapes.filter((s) => polylineLength(s.runs.flat()) >= CAP_LENGTH);
  let conics = [];
  const whole = fitEllipse(allPts);
  if (whole && residual(whole, allPts) < FIT_TOLERANCE) {
    conics = [whole];
  } else {
    for (const s of bodies) {
      const pts = s.runs.flat();
      const el = fitEllipse(pts);
      if (el && residual(el, pts) < FIT_TOLERANCE) conics.push(el);
    }
  }

  if (!conics.length) {
    // Not circular at all (the eye lens). Keep the sampled vector as-is.
    for (const [i, s] of g.shapes.entries()) {
      primitives.push({
        id: `flat-${g.index}-${i}`,
        kind: 'polyline',
        runs: s.runs.map((r) => r.map(([x, y]) => [x, y, 0])),
        stroke: s.style.stroke,
        strokeWidth: s.style.strokeWidth,
        dash: s.style.dash,
      });
    }
    report.push(`#${g.index} flat path (no conic fit) — kept as vector`);
    continue;
  }

  const assigned = new Map(conics.map((c) => [c, []]));
  for (const [i, s] of g.shapes.entries()) {
    for (const [j, run] of s.runs.entries()) {
      // Assign this run to whichever conic of the group explains it best.
      let best = conics[0], bestErr = Infinity;
      for (const c of conics) {
        const e = residual(c, run);
        if (e < bestErr) { bestErr = e; best = c; }
      }
      assigned.get(best).push(...run);
      const c3 = ellipseToCircle3D(best);
      const [t0, t1] = paramRange(best, run);

      // Depth sign: the artwork uses solid strokes for the near hemisphere and
      // dashes for the far one. Pick the tilt sign that puts this arc's midpoint
      // on the matching side. z(t) = R * sin(tilt) * sin(t).
      const mid = (t0 + t1) / 2;
      const wantFront = !s.style.dash;
      const sMid = Math.sin(mid);
      let tilt = c3.tilt;
      if (Math.abs(sMid) > 1e-6) {
        const zSign = Math.sign(sMid); // with tilt > 0
        if ((zSign > 0) !== wantFront) tilt = -tilt;
      }

      primitives.push({
        id: `arc-${g.index}-${i}-${j}`,
        kind: 'arc',
        center: [best.cx, best.cy, 0],
        radius: c3.radius,
        tilt,
        spin: c3.spin,
        t0,
        t1,
        closed: t1 - t0 > TAU - 1e-3,
        stroke: s.style.stroke,
        strokeWidth: s.style.strokeWidth,
        dash: s.style.dash,
        fitError: Number(bestErr.toFixed(4)),
      });
    }
  }

  for (const c of conics) {
    const c3 = ellipseToCircle3D(c);
    if (c3.radius > 100) greatCircles.push({ r: c3.radius, cx: c.cx, cy: c.cy });
    report.push(
      `#${g.index} arc R=${c3.radius.toFixed(2)} tilt=${((c3.tilt * 180) / Math.PI).toFixed(2)}deg ` +
      `spin=${((c3.spin * 180) / Math.PI).toFixed(2)}deg err=${residual(c, assigned.get(c)).toFixed(4)}`,
    );
  }
}

// The implied sphere, reported only so we can see how much slop the artwork has.
const sphere = greatCircles.length
  ? {
      radius: greatCircles.reduce((s, c) => s + c.r, 0) / greatCircles.length,
      center: [
        greatCircles.reduce((s, c) => s + c.cx, 0) / greatCircles.length,
        greatCircles.reduce((s, c) => s + c.cy, 0) / greatCircles.length,
      ],
      spread: {
        radius: [Math.min(...greatCircles.map((c) => c.r)), Math.max(...greatCircles.map((c) => c.r))],
      },
    }
  : null;

const out = { source: 'elemento-fundo.svg', viewBox, groupOpacity, sphere, primitives };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

console.log(report.join('\n'));
console.log(`\nimplied sphere: R=${sphere.radius.toFixed(2)} ` +
  `(${sphere.spread.radius.map((n) => n.toFixed(1)).join('..')}) ` +
  `centre (${sphere.center.map((n) => n.toFixed(2)).join(', ')})`);
const byKind = primitives.reduce((m, p) => ((m[p.kind] = (m[p.kind] ?? 0) + 1), m), {});
console.log(`\n${primitives.length} primitives ->`, byKind);
const worst = primitives.filter((p) => p.fitError !== undefined)
  .sort((a, b) => b.fitError - a.fitError).slice(0, 3);
console.log('worst arc fits:', worst.map((p) => `${p.id}=${p.fitError}`).join('  '));
console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
