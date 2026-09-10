// Minimal SVG reader: enough for the Illustrator exports in src/assets.
// Walks tags in document order keeping a stack, so we can ask "which top-level
// child of <g class="cls-13"> does this shape belong to".

import svgpath from 'svgpath';

const SELF_CLOSING = /\/>$/;

/** Parse `class="a b"`-style attributes off a raw tag string. */
function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

/** Parse the <style> block into { className: { prop: value } }. */
export function parseStyles(svg) {
  const rules = {};
  const style = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  for (const m of style.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const decls = {};
    for (const d of m[2].split(';')) {
      const [k, v] = d.split(':');
      if (k && v) decls[k.trim()] = v.trim();
    }
    for (const sel of m[1].split(',')) {
      const cls = sel.trim().replace(/^\./, '');
      if (!cls) continue;
      rules[cls] = { ...rules[cls], ...decls };
    }
  }
  return rules;
}

/** Resolve the effective presentation attrs for a list of class names. */
export function resolveStyle(rules, classList) {
  let s = {};
  for (const c of classList) s = { ...s, ...rules[c] };
  const dash = s['stroke-dasharray'];
  return {
    stroke: s.stroke ?? null,
    fill: s.fill && s.fill !== 'none' ? s.fill : null,
    strokeWidth: s['stroke-width'] ? parseFloat(s['stroke-width']) : 1,
    dash: dash ? dash.split(/[\s,]+/).map(Number) : null,
    opacity: s.opacity ? parseFloat(s.opacity) : 1,
  };
}

// ---------------------------------------------------------------- transforms

const I = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export const applyMat = (m, [x, y]) => [
  m[0] * x + m[2] * y + m[4],
  m[1] * x + m[3] * y + m[5],
];

export function parseTransform(str) {
  if (!str) return I;
  let m = I;
  for (const t of str.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const n = t[2].trim().split(/[\s,]+/).map(Number);
    switch (t[1]) {
      case 'translate': m = mul(m, [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]); break;
      case 'scale':     m = mul(m, [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]); break;
      case 'matrix':    m = mul(m, n); break;
      case 'rotate': {
        const a = ((n[0] ?? 0) * Math.PI) / 180;
        const r = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
        if (n.length >= 3) {
          m = mul(m, [1, 0, 0, 1, n[1], n[2]]);
          m = mul(m, r);
          m = mul(m, [1, 0, 0, 1, -n[1], -n[2]]);
        } else m = mul(m, r);
        break;
      }
    }
  }
  return m;
}

// ------------------------------------------------------------- path sampling

/** Adaptive-ish flatten of a cubic into `steps` points (endpoint excluded). */
function cubic(p0, p1, p2, p3, steps) {
  const out = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

/**
 * Flatten a path `d` into runs of points (one run per subpath / M command).
 * Points are in the element's own coordinate space; apply `mat` afterwards.
 */
export function samplePath(d, stepsPerCurve = 24) {
  const runs = [];
  let cur = null;
  let pos = [0, 0];
  svgpath(d).abs().unshort().unarc().iterate((seg) => {
    const c = seg[0];
    if (c === 'M') {
      pos = [seg[1], seg[2]];
      cur = [pos];
      runs.push(cur);
    } else if (c === 'L') {
      pos = [seg[1], seg[2]];
      cur.push(pos);
    } else if (c === 'H') {
      pos = [seg[1], pos[1]];
      cur.push(pos);
    } else if (c === 'V') {
      pos = [pos[0], seg[1]];
      cur.push(pos);
    } else if (c === 'C') {
      const p1 = [seg[1], seg[2]], p2 = [seg[3], seg[4]], p3 = [seg[5], seg[6]];
      cur.push(...cubic(pos, p1, p2, p3, stepsPerCurve));
      pos = p3;
    } else if (c === 'Q') {
      const q = [seg[1], seg[2]], p3 = [seg[3], seg[4]];
      const p1 = [pos[0] + (2 / 3) * (q[0] - pos[0]), pos[1] + (2 / 3) * (q[1] - pos[1])];
      const p2 = [p3[0] + (2 / 3) * (q[0] - p3[0]), p3[1] + (2 / 3) * (q[1] - p3[1])];
      cur.push(...cubic(pos, p1, p2, p3, stepsPerCurve));
      pos = p3;
    } else if (c === 'Z' || c === 'z') {
      if (cur && cur.length) {
        cur.push([...cur[0]]);
        pos = [...cur[0]];
      }
    }
  });
  return runs.filter((r) => r.length > 1);
}

/** Sample an <ellipse>/<circle> parametrically so transforms just work. */
export function sampleEllipse({ cx, cy, rx, ry }, n = 256) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return pts;
}

// ------------------------------------------------------------------ the walk

/**
 * Returns the top-level children of the element matching `rootClass`, each as
 * { index, tag, classList, shapes: [{ tag, classList, style, runs }] } where
 * `runs` are point runs already in root coordinates.
 */
export function readGroups(svg, rootClass, rules) {
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/g, '');
  // Tokenise opening, closing and self-closing tags in document order so that
  // same-name nesting (<g> inside <g>) tracks depth correctly.
  const tokens = [...body.matchAll(/<(\/)?([a-zA-Z][\w:-]*)\b([^>]*?)(\/)?>/g)];

  const stack = [];
  let rootDepth = -1;
  let groups = [];
  let current = null;

  for (const t of tokens) {
    const raw = t[0];
    const isClose = Boolean(t[1]);
    const tag = t[2];
    const selfClose = Boolean(t[4]) || SELF_CLOSING.test(raw);

    if (isClose) {
      stack.pop();
      if (rootDepth !== -1 && stack.length < rootDepth) {
        rootDepth = -1; // left the root group entirely
        current = null;
      } else if (stack.length === rootDepth) {
        current = null;
      }
      continue;
    }

    const a = attrs(raw);
    const classList = (a.class ?? '').split(/\s+/).filter(Boolean);
    const depth = stack.length;
    const parentMat = depth ? stack[depth - 1].mat : I;
    const worldMat = mul(parentMat, parseTransform(a.transform));

    if (tag === 'g' && classList.includes(rootClass)) {
      rootDepth = depth + 1;
      if (!selfClose) stack.push({ tag, mat: worldMat });
      continue;
    }

    const insideRoot = rootDepth !== -1 && depth >= rootDepth;

    if (insideRoot && depth === rootDepth) {
      // A new top-level child of the root group.
      current = { index: groups.length, tag, classList, shapes: [] };
      groups.push(current);
    }

    if (insideRoot && current) {
      let runs = null;
      if (tag === 'path' && a.d) runs = samplePath(a.d);
      else if (tag === 'polyline' && a.points) {
        const n = a.points.trim().split(/[\s,]+/).map(Number);
        const pts = [];
        for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
        runs = [pts];
      } else if (tag === 'line') {
        runs = [[[+a.x1, +a.y1], [+a.x2, +a.y2]]];
      } else if (tag === 'ellipse') {
        runs = [sampleEllipse({ cx: +a.cx, cy: +a.cy, rx: +a.rx, ry: +a.ry })];
      } else if (tag === 'circle') {
        runs = [sampleEllipse({ cx: +a.cx, cy: +a.cy, rx: +a.r, ry: +a.r })];
      }
      if (runs) {
        current.shapes.push({
          tag,
          classList,
          attrs: a,
          style: resolveStyle(rules, classList),
          runs: runs.map((r) => r.map((p) => applyMat(worldMat, p))),
          mat: worldMat,
        });
      }
    }

    if (!selfClose) stack.push({ tag, mat: worldMat });
  }

  // Drop wrapper groups that produced no shapes of their own but whose children
  // were captured one level deeper.
  return groups.filter((g) => g.shapes.length > 0);
}
