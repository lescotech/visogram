/**
 * The hero's reactive wireframe: the vector artwork rebuilt as real 3D and
 * rendered through an orthographic camera, so that at rest its projection is
 * the original drawing and moving the pointer genuinely rotates the object.
 *
 * Fidelity notes — the reasons this looks like the vector and not like WebGL:
 *
 * - Orthographic camera. The drawing is a parallel projection (its ellipses are
 *   true ellipses), so a perspective camera would bend the rest pose.
 * - Line2/LineMaterial rather than LineBasicMaterial, whose `linewidth` is
 *   ignored on every desktop driver. Fat lines give us the real 0.5pt hairline
 *   and real `stroke-dasharray`.
 * - No depth testing, with an explicit render order matching document order.
 *   SVG has no z-buffer; it paints in order. Wireframes have no fills to
 *   occlude, so painting order is both faithful and correct.
 * - Group opacity lives on the canvas element in CSS, not on the materials.
 *   SVG flattens a group before applying its 0.43 alpha, so per-material
 *   opacity would make every line crossing darker than the original.
 */

import {
  Color,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Quaternion,
  Scene,
  WebGLRenderer,
} from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import geometryData from './geometry.json';
import { DESIGN, EYE_ANCHOR } from './design';

type Vec3 = [number, number, number];

interface ArcPrimitive {
  kind: 'arc';
  id: string;
  center: Vec3;
  radius: number;
  tilt: number;
  spin: number;
  t0: number;
  t1: number;
  stroke: string;
  strokeWidth: number;
  dash: number[] | null;
}
interface PathPrimitive {
  kind: 'segments' | 'polyline';
  id: string;
  runs: Vec3[][];
  stroke: string;
  strokeWidth: number;
  dash: number[] | null;
}
interface DiscPrimitive {
  kind: 'disc';
  id: string;
  center: Vec3;
  radius: number;
  fill: string;
}
type Primitive = ArcPrimitive | PathPrimitive | DiscPrimitive;

/**
 * How far the pointer can swing the object, in radians. Kept deliberately
 * short: the drawing's signature is the 55.65-degree tilt of its main ring,
 * and past roughly 12 degrees that ring opens up enough to read as a
 * different pose. This is the one knob for how lively the hero feels.
 */
const SWING = { x: 0.13, y: 0.2 };
/** Exponential smoothing time constant, seconds. Lower is snappier. */
const EASE_TAU = 0.22;
/** Target arc-length between generated vertices, in design units. */
const ARC_STEP = 0.7;

function arcPositions(p: ArcPrimitive): number[] {
  const span = p.t1 - p.t0;
  const steps = Math.min(1400, Math.max(24, Math.ceil((p.radius * Math.abs(span)) / ARC_STEP)));
  const ct = Math.cos(p.tilt), st = Math.sin(p.tilt);
  const cs = Math.cos(p.spin), ss = Math.sin(p.spin);
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = p.t0 + span * (i / steps);
    const x = p.radius * Math.cos(t);
    const y = p.radius * Math.sin(t) * ct;
    const z = p.radius * Math.sin(t) * st;
    out.push(
      p.center[0] + x * cs - y * ss,
      p.center[1] + x * ss + y * cs,
      p.center[2] + z,
    );
  }
  return out;
}

export interface Wireframe {
  /** Pointer position as fractions of the panel, each in [0, 1]. */
  point(fx: number, fy: number): void;
  /** Ease back to the rest pose. */
  release(): void;
  destroy(): void;
}

export function createWireframe(canvas: HTMLCanvasElement, host: HTMLElement): Wireframe {
  const data = geometryData as unknown as { primitives: Primitive[] };

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearAlpha(0);

  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 0, 1, -4000, 4000);

  // pivot sits at the sphere centre; art cancels that offset so world
  // coordinates stay identical to the SVG's own user units.
  const pivot = new Group();
  pivot.position.set(DESIGN.sphere.x, DESIGN.sphere.y, 0);
  const art = new Group();
  art.position.set(-DESIGN.sphere.x, -DESIGN.sphere.y, 0);
  pivot.add(art);
  scene.add(pivot);

  /** Materials whose linewidth must be re-derived from the pixel scale. */
  const strokes: { material: LineMaterial; units: number }[] = [];
  /** Filled dots, kept facing the camera so they stay perfect circles. */
  const billboards: Mesh[] = [];

  const addLine = (
    positions: number[],
    stroke: string,
    strokeWidth: number,
    dash: number[] | null,
    order: number,
  ) => {
    if (positions.length < 6) return;
    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    const material = new LineMaterial({
      color: new Color(stroke),
      linewidth: strokeWidth,
      dashed: Boolean(dash),
      dashSize: dash?.[0] ?? 1,
      gapSize: dash?.[1] ?? dash?.[0] ?? 1,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const line = new Line2(geometry, material);
    line.computeLineDistances();
    line.renderOrder = order;
    // Every vertex is authored, so the automatic bounds are meaningless once
    // the group rotates; skip culling rather than let arcs pop out of view.
    line.frustumCulled = false;
    art.add(line);
    strokes.push({ material, units: strokeWidth });
  };

  data.primitives.forEach((p, order) => {
    if (p.kind === 'arc') {
      addLine(arcPositions(p), p.stroke, p.strokeWidth, p.dash, order);
    } else if (p.kind === 'disc') {
      const mesh = new Mesh(
        new CircleGeometry(p.radius, 64),
        new MeshBasicMaterial({
          color: new Color(p.fill),
          transparent: true,
          depthTest: false,
          depthWrite: false,
          // The camera maps y downwards to match SVG coordinates, which
          // mirrors the projection and reverses triangle winding; front-face
          // culling would drop these discs entirely.
          side: DoubleSide,
        }),
      );
      mesh.position.set(p.center[0], p.center[1], p.center[2]);
      mesh.renderOrder = order;
      mesh.frustumCulled = false;
      art.add(mesh);
      billboards.push(mesh);
    } else {
      for (const run of p.runs) {
        addLine(run.flat(), p.stroke, p.strokeWidth, p.dash, order);
      }
    }
  });

  // ------------------------------------------------------------------ framing

  let width = 0;
  let height = 0;

  function resize() {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);

    // World height is locked to the design panel height, so the artwork keeps
    // its size relative to the panel and only the visible width follows
    // aspect. Below the design aspect the height opens up instead, which keeps
    // the design's full width in frame — the same contain rule as the CSS
    // `--pt: min(cqh, cqw)`, so type and artwork scale together.
    const aspect = width / height;
    const designAspect = DESIGN.panel.w / DESIGN.panel.h;
    const worldH = aspect >= designAspect ? DESIGN.panel.h : DESIGN.panel.w / aspect;
    const worldW = worldH * aspect;
    camera.left = DESIGN.eye.x - EYE_ANCHOR.fx * worldW;
    camera.right = camera.left + worldW;
    camera.top = DESIGN.eye.y - EYE_ANCHOR.fy * worldH;
    camera.bottom = camera.top + worldH;
    camera.updateProjectionMatrix();

    // linewidth is in CSS pixels when worldUnits is off, which is the
    // predictable path; convert from design units here.
    const pixelsPerUnit = height / worldH;
    for (const s of strokes) {
      s.material.linewidth = s.units * pixelsPerUnit;
      s.material.resolution.set(width, height);
    }
    invalidate();
  }

  // ------------------------------------------------------------- interaction

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const target = { x: 0, y: 0 };
  const current = { x: 0, y: 0 };
  const counter = new Quaternion();

  let frame = 0;
  let last = 0;
  let settled = false;

  function invalidate() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    frame = 0;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
    last = now;

    const k = reduceMotion.matches ? 1 : 1 - Math.exp(-dt / EASE_TAU);
    current.x += (target.x - current.x) * k;
    current.y += (target.y - current.y) * k;

    pivot.rotation.set(current.x, current.y, 0);
    pivot.updateMatrixWorld(true);

    // Keep the filled dots square to the camera.
    counter.copy(pivot.quaternion).invert();
    for (const b of billboards) b.quaternion.copy(counter);

    renderer.render(scene, camera);

    settled =
      Math.abs(target.x - current.x) < 1e-4 && Math.abs(target.y - current.y) < 1e-4;
    if (!settled) invalidate();
    else last = 0;
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  return {
    point(fx, fy) {
      if (reduceMotion.matches) return;
      target.y = (fx * 2 - 1) * SWING.y;
      target.x = (fy * 2 - 1) * SWING.x;
      invalidate();
    },
    release() {
      target.x = 0;
      target.y = 0;
      invalidate();
    },
    destroy() {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      art.traverse((o) => {
        const m = o as Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as { dispose?: () => void } | undefined;
        mat?.dispose?.();
      });
      renderer.dispose();
    },
  };
}
