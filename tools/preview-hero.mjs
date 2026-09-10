// Renders what the hero will actually show for a given tour scene and framing.
// Use it to choose a scene, or to dial a yaw, without guessing from a flattened
// panorama — the flat image tells you what is in the room, not what lands on
// screen.
//
//   node tools/preview-hero.mjs <slug> <sceneId> [yaw] [pitch] [fov]
//
// yaw/pitch are radians and fov is the vertical angle in degrees, all in the
// viewer's convention, exactly as tour.json stores them. Omit them to use the
// scene's own vistaInicial, which reproduces exactly what the page would do.
// An explicit fov is taken as the effective angle, unscaled and unclamped, so
// framings outside the page's current range can be explored.
//
// Set SCRIM=1 to composite the hero's mask on top — the only honest way to
// judge a scene, since a glorious reprojection can still go to mud under it.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { reproject, centredU, clamp } from './reproject.mjs';

const VIEWER =
  process.env.LESCO_VIEWER ?? path.resolve(process.cwd(), '..', 'LESCO-VIEWER');

/** Must mirror the constants in src/hero/panorama.ts. */
const FOV_SCALE = 1;
const FOV_MIN = 46;
const FOV_MAX = 84;
const PITCH_LIMIT = 0.18;

const OUT_W = 1200;
const OUT_H = 740;

const [slug, sceneId, yawArg, pitchArg, fovArg] = process.argv.slice(2);
if (!slug || !sceneId) {
  console.error('usage: node tools/preview-hero.mjs <slug> <sceneId> [yaw] [pitch] [fov]');
  process.exit(1);
}

const tour = JSON.parse(
  fs.readFileSync(path.join(VIEWER, 'data', 'tours', slug, 'tour.json'), 'utf8'),
);
const scene = (tour.cenas ?? []).find((c) => c.id === sceneId);
if (!scene) {
  console.error(`scene ${sceneId} not found in ${slug}`);
  process.exit(1);
}

const vista = scene.vistaInicial ?? {};
const yaw = yawArg ? Number(yawArg) : (vista.yaw ?? 0);
const pitch = clamp(
  pitchArg ? Number(pitchArg) : (vista.pitch ?? 0),
  -PITCH_LIMIT,
  PITCH_LIMIT,
);
const fov = fovArg
  ? Number(fovArg)
  : clamp((vista.fov ?? 76) * FOV_SCALE, FOV_MIN, FOV_MAX);

const source = ['jpg', 'media.jpg']
  .map((ext) => path.join(VIEWER, 'media', slug, `${sceneId}.${ext}`))
  .find((p) => fs.existsSync(p));
if (!source) {
  console.error(`no media for ${slug}/${sceneId}`);
  process.exit(1);
}

const out = await reproject({
  source,
  yaw,
  pitch,
  fov,
  width: OUT_W,
  height: OUT_H,
});

if (process.env.SCRIM) {
  // Same two gradients as .panel__scrim in src/style.css.
  const near = Number(process.env.SCRIM_NEAR ?? 0.52);
  const far = Number(process.env.SCRIM_FAR ?? 0.18);
  const foot = Number(process.env.SCRIM_FOOT ?? 0.72);
  const navy = [0x17, 0x22, 0x2f];
  for (let py = 0; py < OUT_H; py++) {
    // The 0deg gradient starts at the bottom edge and clears by 42% up.
    const fromBottom = 1 - py / (OUT_H - 1);
    const aV = fromBottom < 0.42 ? foot * (1 - fromBottom / 0.42) : 0;
    for (let px = 0; px < OUT_W; px++) {
      const fx = px / (OUT_W - 1);
      const aH =
        fx <= 0.26 ? near
        : fx >= 0.72 ? far
        : near + ((far - near) * (fx - 0.26)) / (0.72 - 0.26);
      const at = (py * OUT_W + px) * 3;
      for (let c = 0; c < 3; c++) {
        let v = out[at + c];
        v = v + (navy[c] - v) * aH;
        v = v + (navy[c] - v) * aV;
        out[at + c] = v;
      }
    }
  }
}

const dest = path.resolve(
  process.env.PREVIEW_DIR ?? '.',
  `preview-${slug}-${sceneId}${process.env.SCRIM ? '-scrim' : ''}.jpg`,
);
await sharp(out, { raw: { width: OUT_W, height: OUT_H, channels: 3 } })
  .jpeg({ quality: 86 })
  .toFile(dest);

console.log(
  `${slug}/${sceneId} "${scene.nome}"  ` +
  `yaw=${yaw.toFixed(3)} pitch=${pitch.toFixed(3)} fov=${fov.toFixed(1)}  ` +
  `-> centres u=${centredU(yaw).toFixed(3)}`,
);
console.log(dest);
