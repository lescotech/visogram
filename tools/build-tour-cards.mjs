// Thumbnails for the gallery cards in section 03.
//
// The handoff leaves these as <image-slot> placeholders and lists "links e
// thumbnails dos tours reais" as a client pendency, with only Alpha One
// confirmed. But the panoramas are already here — the hero streams all four —
// so the thumbnails need no one's help: reproject each tour's own framing and
// crop it to the card.
//
// Still genuinely pending: the tour URLs. tours.lesco.com.br is named in the
// viewer's config.js but its URL_BASE is blank, so nothing is published yet.
// Cards render unlinked until a `url` shows up in the manifest.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { reproject, centredU } from './reproject.mjs';

const VIEWER =
  process.env.LESCO_VIEWER ?? path.resolve(process.cwd(), '..', 'LESCO-VIEWER');
const MANIFEST = path.resolve('src/hero/tours.json');
const OUT_DIR = path.resolve('public/tours');

/** Card image area is ~374x260 at three columns in the 1180px container. */
const W = 760;
const H = 528;
const QUALITY = 74;
/**
 * Wider than the hero uses. A card is a small window and needs to read as a
 * room at a glance, where the hero can afford to sit close to a surface.
 */
const CARD_FOV = 88;

const tours = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
fs.mkdirSync(OUT_DIR, { recursive: true });

const sourceFor = (slug, scene) =>
  [`${scene}.jpg`, `${scene}.media.jpg`]
    .map((n) => path.join(VIEWER, 'media', slug, n))
    .find((p) => fs.existsSync(p));

let total = 0;
for (const tour of tours) {
  // The manifest records the scene by name, not id, so find it in the viewer.
  const data = JSON.parse(
    fs.readFileSync(path.join(VIEWER, 'data', 'tours', tour.slug, 'tour.json'), 'utf8'),
  );
  const scene = (data.cenas ?? []).find((c) => c.nome === tour.cena);
  const src = scene && sourceFor(tour.slug, scene.id);
  if (!src) {
    console.warn(`SKIP ${tour.slug} — no media for "${tour.cena}"`);
    continue;
  }

  const raw = await reproject({
    source: src,
    yaw: tour.vista.yaw,
    pitch: Math.max(-0.18, Math.min(0.18, tour.vista.pitch)),
    fov: CARD_FOV,
    width: W,
    height: H,
  });

  const buf = await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
    .webp({ quality: QUALITY, effort: 6 })
    .toBuffer();
  fs.writeFileSync(path.join(OUT_DIR, `${tour.slug}-card.webp`), buf);
  total += buf.length;

  console.log(
    `${tour.obra.padEnd(14)} ${tour.cena.padEnd(18)} ` +
    `u=${centredU(tour.vista.yaw).toFixed(3)} fov=${CARD_FOV}  ` +
    `${W}x${H}  ${(buf.length / 1024).toFixed(0)}KB`,
  );
}

console.log(`\n${tours.length} cards -> public/tours (${(total / 1024).toFixed(0)}KB total)`);
