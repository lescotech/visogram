// Least-squares conic fit + decomposition into ellipse parameters, and from
// there into the 3D circle whose orthographic projection is that ellipse.
//
// A circle of radius R in the XY plane, tilted by `tilt` about X and then spun
// by `spin` about Z, projects (dropping z) to an ellipse with semi-major R
// along `spin` and semi-minor R*cos(tilt) perpendicular to it. Inverting that
// is what lets us rebuild the artwork as real 3D without redrawing it.

/** Solve a dense n x n system by Gaussian elimination with partial pivoting. */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-14) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Fit a x^2 + b xy + c y^2 + d x + e y - 1 = 0 to the points, then decompose.
 * Points are recentred first so the normal equations stay well conditioned.
 */
export function fitEllipse(points) {
  if (points.length < 6) return null;
  const mx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const my = points.reduce((s, p) => s + p[1], 0) / points.length;
  const sc = Math.hypot(
    ...points.map((p) => Math.hypot(p[0] - mx, p[1] - my)),
  ) / Math.sqrt(points.length) || 1;

  const P = points.map(([x, y]) => [(x - mx) / sc, (y - my) / sc]);
  const basis = ([x, y]) => [x * x, x * y, y * y, x, y];

  const A = Array.from({ length: 5 }, () => new Array(5).fill(0));
  const rhs = new Array(5).fill(0);
  for (const p of P) {
    const v = basis(p);
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) A[i][j] += v[i] * v[j];
      rhs[i] += v[i];
    }
  }
  const sol = solve(A, rhs);
  if (!sol) return null;
  const [a, b, c, d, e] = sol;
  const f = -1;

  const disc = 4 * a * c - b * b;
  if (Math.abs(disc) < 1e-12) return null;
  // Centre of the conic, in normalised space.
  const x0 = (b * e - 2 * c * d) / disc;
  const y0 = (b * d - 2 * a * e) / disc;
  // Value at the centre: the centred conic is a x'^2 + b x'y' + c y'^2 = -f0.
  const f0 = a * x0 * x0 + b * x0 * y0 + c * y0 * y0 + d * x0 + e * y0 + f;
  if (Math.abs(f0) < 1e-15) return null;

  // Eigenvalues of [[a, b/2], [b/2, c]] give the squared inverse semi-axes.
  const tr = a + c;
  const det = a * c - (b * b) / 4;
  const gap = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + gap;
  const l2 = tr / 2 - gap;
  if (-f0 / l1 <= 0 || -f0 / l2 <= 0) return null; // not an ellipse

  // l1 is the larger eigenvalue, so it yields the *smaller* semi-axis.
  const semiMinor = Math.sqrt(-f0 / l1) * sc;
  const semiMajor = Math.sqrt(-f0 / l2) * sc;
  // Direction of the major axis = eigenvector of the smaller eigenvalue (l2).
  let angle = 0.5 * Math.atan2(b, a - c); // major axis of the l2 eigenvector
  // atan2 above points at the l1 (minor) axis when a > c; normalise by testing.
  const probe = (t) => {
    const ct = Math.cos(t), st = Math.sin(t);
    return a * ct * ct + b * ct * st + c * st * st;
  };
  if (probe(angle) > probe(angle + Math.PI / 2)) angle += Math.PI / 2;

  return {
    cx: x0 * sc + mx,
    cy: y0 * sc + my,
    semiMajor,
    semiMinor,
    /** Radians, angle of the major axis from +x, in SVG (y-down) space. */
    angle: Math.atan2(Math.sin(angle), Math.cos(angle)),
    rms: rmsError(points, { a, b, c, d, e, f }, mx, my, sc),
  };
}

function rmsError(points, k, mx, my, sc) {
  // Geometric error is expensive; report the algebraic residual scaled back to
  // user units, which is good enough to catch a bad fit.
  let acc = 0;
  for (const [X, Y] of points) {
    const x = (X - mx) / sc, y = (Y - my) / sc;
    const v = k.a * x * x + k.b * x * y + k.c * y * y + k.d * x + k.e * y + k.f;
    const gx = 2 * k.a * x + k.b * y + k.d;
    const gy = 2 * k.c * y + k.b * x + k.e;
    const g = Math.hypot(gx, gy) || 1e-9;
    acc += (v / g) ** 2;
  }
  return Math.sqrt(acc / points.length) * sc;
}

/** Ellipse params -> the 3D circle that projects to it. */
export function ellipseToCircle3D(el) {
  const ratio = Math.min(1, el.semiMinor / el.semiMajor);
  return {
    center: [el.cx, el.cy],
    radius: el.semiMajor,
    /** Rotation about the local X axis, radians. Sign is the depth choice. */
    tilt: Math.acos(ratio),
    /** Rotation about Z that aims the local +X at the major axis. */
    spin: el.angle,
  };
}

/**
 * Angular parameter of a 2D point on the ellipse, matching the 3D circle's
 * parameterisation: p(t) = center + Rz(spin) * (R cos t, R cos(tilt) sin t).
 */
export function paramAt(el, [x, y]) {
  const dx = x - el.cx, dy = y - el.cy;
  const ca = Math.cos(-el.angle), sa = Math.sin(-el.angle);
  const u = (dx * ca - dy * sa) / el.semiMajor;
  const v = (dx * sa + dy * ca) / el.semiMinor;
  return Math.atan2(v, u);
}
