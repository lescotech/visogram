// Checks the tour viewer's camera against the convention it claims to follow —
// by raycasting a real three.js sphere rather than by re-deriving the maths.
//
// The point is to fail for reasons the maths did not anticipate. `src/tour/
// viewer.ts` turns the *camera* where `src/hero/panorama.ts` turns the *sphere*,
// and asserts the two centre the same texture column; and it places hotspot
// markers from a direction vector written out by hand. Both are exactly the kind
// of thing that agrees with itself while pointing at the wrong wall, which is
// what happened the first time this project matched the viewer's yaw.
//
//   node tools/verify-tour.mjs

import fs from 'node:fs';
import path from 'node:path';
import {
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { centredU } from './reproject.mjs';

/** Mirrors YAW_ORIGIN in src/projection.ts. */
const YAW_ORIGIN = 1.5 * Math.PI;
/** Radians and NDC units. Generous enough for float noise, tight enough to fail. */
const EPS = 1e-4;

const geometry = new SphereGeometry(10, 128, 80);
geometry.scale(-1, 1, 1);
const material = new MeshBasicMaterial();

/** A sphere posed the way one of the two renderers poses it. */
function stage(meshYaw) {
  const mesh = new Mesh(geometry, material);
  mesh.rotation.order = 'YXZ';
  mesh.rotation.y = meshYaw;
  mesh.updateMatrixWorld(true);
  return mesh;
}

function camera(yaw, pitch) {
  const cam = new PerspectiveCamera(76, 16 / 9, 0.1, 100);
  cam.rotation.order = 'YXZ';
  cam.rotation.y = yaw;
  cam.rotation.x = pitch;
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

/** What the centre of frame lands on, as texture coordinates. */
function centre(mesh, cam) {
  const caster = new Raycaster();
  caster.setFromCamera(new Vector2(0, 0), cam);
  const [hit] = caster.intersectObject(mesh, false);
  if (!hit?.uv) throw new Error('the camera is not looking at the sphere');
  return { u: hit.uv.x, v: hit.uv.y, point: hit.point };
}

/** The direction viewer.ts builds for a hotspot at (yaw, pitch). */
const heading = (yaw, pitch) =>
  new Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  );

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `   ${detail}` : ''}`);
  if (!ok) failed++;
};

// 1. The viewer turns the camera and lands where the viewer convention says.
//    centredU is the same function tools/reproject.mjs samples with, which is
//    what the hero's framing was checked against.
console.log('camera turned, sphere fixed at YAW_ORIGIN');
// Not exactly ±pi: that puts the ray through the seam, where the sphere's
// duplicated uv column makes the *raycast* ambiguous. The renderer samples a
// wrapped texture there and does not care.
for (const yaw of [0, 0.628, -0.1934, -0.2762, 1.2, -2.996, 3.1]) {
  const { u } = centre(stage(YAW_ORIGIN), camera(yaw, 0));
  const want = centredU(yaw);
  const off = Math.abs(((u - want + 0.5) % 1) - 0.5);
  check(`yaw ${yaw.toFixed(4)} centres u`, off < EPS, `u=${u.toFixed(6)} want=${want.toFixed(6)}`);
}

// 2. And it lands in the same place the hero's turned sphere does.
console.log('\nsame framing as the hero, which turns the sphere instead');
for (const yaw of [0, 0.628, -0.1934, 2.4]) {
  const mine = centre(stage(YAW_ORIGIN), camera(yaw, 0)).u;
  const hero = centre(stage(YAW_ORIGIN - yaw), camera(0, 0)).u;
  check(
    `yaw ${yaw.toFixed(4)} agrees with panorama.ts`,
    Math.abs(((mine - hero + 0.5) % 1) - 0.5) < EPS,
    `camera=${mine.toFixed(6)} sphere=${hero.toFixed(6)}`,
  );
}

// 3. Pitch has the sign the manifests assume: positive looks up.
console.log('\npitch');
for (const pitch of [0.4, -0.4]) {
  const { point } = centre(stage(YAW_ORIGIN), camera(0, pitch));
  check(
    `pitch ${pitch} looks ${pitch > 0 ? 'up' : 'down'}`,
    Math.sign(point.y) === Math.sign(pitch),
    `y=${point.y.toFixed(3)}`,
  );
}

// 4. Every hotspot in the manifest projects to the centre of frame when the
//    camera is turned to its own heading, and behind the camera from opposite.
console.log('\nhotspot markers');
const manifest = JSON.parse(
  fs.readFileSync(path.resolve('src/tour/scenes.json'), 'utf8'),
);
const ndc = new Vector3();
let spots = 0;
let worst = 0;
let behindOk = true;
for (const tour of manifest) {
  for (const scene of tour.cenas) {
    for (const spot of scene.hotspots) {
      spots++;
      const dir = heading(spot.yaw, spot.pitch).multiplyScalar(9);

      const at = camera(spot.yaw, spot.pitch);
      ndc.copy(dir).project(at);
      worst = Math.max(worst, Math.hypot(ndc.x, ndc.y));

      const away = camera(spot.yaw + Math.PI, -spot.pitch);
      ndc.copy(dir).project(away);
      if (!(ndc.z > 1)) behindOk = false;

      // The marker has to sit on the same texture column the tour placed it in.
      const { u } = centre(stage(YAW_ORIGIN), at);
      if (Math.abs(((u - centredU(spot.yaw) + 0.5) % 1) - 0.5) > EPS) {
        check(`${tour.slug}/${scene.id} ${spot.id} column`, false, `u=${u.toFixed(6)}`);
      }
    }
  }
}
check(`${spots} hotspots centre when faced`, worst < 1e-6, `worst offset ${worst.toExponential(2)}`);
check(`${spots} hotspots read as behind from the other side`, behindOk);

console.log(
  failed ? `\n${failed} check(s) failed` : '\nall checks passed',
);
process.exit(failed ? 1 : 0);
