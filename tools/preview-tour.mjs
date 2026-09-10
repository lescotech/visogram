// Renders the frame the in-page viewer opens on, straight from the scene
// manifest — the counterpart to preview-hero.mjs, which does the same job for
// the hero's slideshow.
//
//   node tools/preview-tour.mjs                    # every tour's opening frame
//   node tools/preview-tour.mjs biotique           # one tour
//   node tools/preview-tour.mjs biotique c5        # one scene
//
// Writes a contact sheet to ./preview-tours.png (PREVIEW_DIR moves it, as with
// preview-hero.mjs). Use it to judge where a tour lands someone before they
// touch anything: a flattened equirect tells you what is in the room, not what
// fills the frame.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { reproject } from './reproject.mjs';
import { sourceFor } from './tours-config.mjs';

const MANIFEST = path.resolve('src/tour/scenes.json');
const OUT = path.resolve(process.env.PREVIEW_DIR ?? '.', 'preview-tours.png');

const [only, sceneArg] = process.argv.slice(2);

const W = 600;
const H = 372;
const PAD = 12;
const BAR = 26;
const COLS = 2;

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const tours = only ? manifest.filter((t) => t.slug === only) : manifest;
if (!tours.length) {
  console.error(`no tour "${only}" in ${path.relative(process.cwd(), MANIFEST)}`);
  process.exit(1);
}

const tiles = [];
for (const tour of tours) {
  const scenes = sceneArg
    ? tour.cenas.filter((c) => c.id === sceneArg)
    : [tour.cenas.find((c) => c.id === tour.capa) ?? tour.cenas[0]];
  for (const scene of scenes) {
    const src = sourceFor(tour.slug, scene.id);
    if (!src) {
      console.warn(`SKIP ${tour.slug}/${scene.id} — no media`);
      continue;
    }
    const raw = await reproject({
      source: src,
      yaw: scene.vista.yaw,
      pitch: scene.vista.pitch,
      fov: scene.vista.fov,
      width: W,
      height: H,
    });
    tiles.push({
      png: await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(),
      label: `${tour.obra} — ${scene.nome} · ${tour.cenas.length} ambientes`,
    });
    console.log(
      `${tour.obra.padEnd(14)} ${scene.id.padEnd(4)} ${String(scene.nome).padEnd(24)} ` +
      `yaw=${scene.vista.yaw.toFixed(3)} pitch=${scene.vista.pitch.toFixed(3)} fov=${scene.vista.fov}`,
    );
  }
}

if (!tiles.length) throw new Error('nothing to render');

const cols = Math.min(COLS, tiles.length);
const rows = Math.ceil(tiles.length / cols);
const sheetW = cols * W + (cols + 1) * PAD;
const sheetH = rows * (H + BAR) + (rows + 1) * PAD;

const composites = [];
tiles.forEach((tile, i) => {
  const left = PAD + (i % cols) * (W + PAD);
  const top = PAD + Math.floor(i / cols) * (H + BAR + PAD);
  composites.push({ input: tile.png, left, top });
  const text = tile.label.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  composites.push({
    input: Buffer.from(
      `<svg width="${W}" height="${BAR}"><text x="0" y="18" font-family="monospace" ` +
      `font-size="14" fill="#9ac3e6">${text}</text></svg>`,
    ),
    left,
    top: top + H + 4,
  });
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
await sharp({ create: { width: sheetW, height: sheetH, channels: 3, background: '#17222f' } })
  .composite(composites)
  .png()
  .toFile(OUT);

console.log(`\n-> ${path.relative(process.cwd(), OUT)} (${sheetW}x${sheetH})`);
