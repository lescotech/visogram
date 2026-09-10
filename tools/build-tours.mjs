// Pulls published tours out of the Lesco Viewer project and prepares them as
// web-ready equirectangular backgrounds.
//
// The viewer stores 11904x5952 masters — roughly 19MB each, which is right for
// a tour you actually explore and hopeless for a page background. We downscale
// from the master (rather than re-encoding the viewer's already-compressed
// 4096 derivative) and emit one WebP per tour plus a tiny inline placeholder so
// the hero never shows an empty panel while the real texture is in flight.
//
// Only the cover scene of each tour is taken: `capaCenaId` is the frame whoever
// built the tour chose to represent it, and its `vistaInicial` gives us the yaw,
// pitch and field of view they framed it at — so the slow pan starts on the
// composed view rather than on an arbitrary wall. Which scene that is, and the
// ordering, live in tools/tours-config.mjs, shared with build-scenes.mjs so the
// hero and the in-page viewer open on the same frame.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { SCENES, coverScene, readTours, sourceFor } from './tours-config.mjs';

const OUT_DIR = path.resolve('public/tours');
const MANIFEST = path.resolve('src/hero/tours.json');

/**
 * Equirectangular width for the shipped texture. The masters are 11904 wide,
 * but this sits behind a scrim and under a slow pan, where softness reads as
 * depth of field. 2560 keeps the worst-compressing scene near 330KB; 3072
 * pushed it past 420KB for detail the scrim hides anyway.
 */
const WIDTH = 2560;
/**
 * The phone tier — and it is the *largest* one, which reads as a mistake until
 * you work out what a narrow viewport does to this projection.
 *
 * The camera fixes the vertical field of view, so a portrait panel crops the
 * horizontal rather than scaling it: 375x792 shows about 41 of the 360 degrees
 * on offer. Fewer degrees across the same screen, at DPR 2, comes to roughly
 * 21 device pixels per degree against about 12 on a desktop monitor. A phone
 * therefore wants nearly twice the texel density of a desktop, and the 1280
 * variant that used to ship here was magnified 5.8x: the panorama arrived as
 * mush. 4096 gives 11.4 texels/degree, so the worst case is 1.8x.
 *
 * Costs 290-735KB a tour. What bounds this on a phone is not the download but
 * GPU memory, which the runtime's cache handles — see panorama.ts.
 */
const DENSE_WIDTH = 4096;
/** Save-Data: one panorama, no cycling, the smallest thing worth showing. */
const LITE_WIDTH = 1280;
const QUALITY = 72;
/** Inline placeholder, encoded straight into the manifest as a data URI. */
const LQIP_WIDTH = 48;

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

fs.mkdirSync(OUT_DIR, { recursive: true });

const tours = readTours();
const manifest = [];

for (const tour of tours) {
  const override = SCENES[tour.slug] ?? {};
  const cover = coverScene(tour);
  if (!cover) {
    console.warn(`SKIP ${tour.slug} — no scenes`);
    continue;
  }
  const src = sourceFor(tour.slug, cover.id);
  if (!src) {
    console.warn(`SKIP ${tour.slug} — no media for scene ${cover.id}`);
    continue;
  }

  const meta = await sharp(src).metadata();
  const pipeline = () => sharp(src, { limitInputPixels: 512e6 });

  const encode = async (width) =>
    pipeline()
      .resize(width, width / 2, { kernel: 'lanczos3' })
      .webp({ quality: QUALITY, effort: 6 })
      .toBuffer();

  const buf = await encode(WIDTH);
  fs.writeFileSync(path.join(OUT_DIR, `${tour.slug}.webp`), buf);

  const dense = await encode(DENSE_WIDTH);
  fs.writeFileSync(path.join(OUT_DIR, `${tour.slug}@${DENSE_WIDTH}.webp`), dense);

  const lite = await encode(LITE_WIDTH);
  fs.writeFileSync(path.join(OUT_DIR, `${tour.slug}@${LITE_WIDTH}.webp`), lite);

  const lqip = await pipeline()
    .resize(LQIP_WIDTH, LQIP_WIDTH / 2, { kernel: 'lanczos3' })
    .webp({ quality: 40 })
    .toBuffer();

  // Mean luminance of the horizon band — the half of the sphere that is
  // actually on screen. A daylit street and a dim interior differ by more than
  // two stops, and a single scrim cannot keep type legible over both, so the
  // runtime uses this to even them out instead of guessing.
  const probe = 256;
  const stats = await pipeline()
    .resize(probe, probe / 2, { kernel: 'lanczos3' })
    .extract({ left: 0, top: probe / 8, width: probe, height: probe / 4 })
    .stats();
  const [r, g, b] = stats.channels;
  const luma = Math.round(0.2126 * r.mean + 0.7152 * g.mean + 0.0722 * b.mean);

  manifest.push({
    slug: tour.slug,
    obra: tour.obra,
    cidade: tour.cidade,
    uf: tour.uf,
    tipo: tour.tipo,
    ano: tour.ano,
    escritorio: tour.escritorio || null,
    cena: cover.nome,
    cenas: (tour.cenas ?? []).length,
    /** Viewer convention: radians for yaw/pitch, degrees of *vertical* fov. */
    vista: {
      yaw: override.yaw ?? cover.vistaInicial?.yaw ?? 0,
      pitch: override.pitch ?? cover.vistaInicial?.pitch ?? 0,
      fov: override.fov ?? cover.vistaInicial?.fov ?? 76,
    },
    /** Mean luminance of the horizon band, 0-255. */
    luma,
    src: `/tours/${tour.slug}.webp`,
    srcDense: `/tours/${tour.slug}@${DENSE_WIDTH}.webp`,
    srcLite: `/tours/${tour.slug}@${LITE_WIDTH}.webp`,
    lqip: `data:image/webp;base64,${lqip.toString('base64')}`,
  });

  console.log(
    `${tour.obra.padEnd(14)} ${String(cover.nome).padEnd(18)} ` +
    `${meta.width}x${meta.height} -> ` +
    `${WIDTH}:${kb(buf.length).padStart(6)}  ` +
    `${DENSE_WIDTH}:${kb(dense.length).padStart(6)}  ` +
    `${LITE_WIDTH}:${kb(lite.length).padStart(5)}  luma ${String(luma).padStart(3)}`,
  );
}

if (!manifest.length) throw new Error('No tours were prepared.');

fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

const total = manifest.reduce(
  (n, t) => n + fs.statSync(path.join(OUT_DIR, `${t.slug}.webp`)).size,
  0,
);
console.log(
  `\n${manifest.length} tours -> public/tours (${kb(total)} total), ` +
  `manifest at ${path.relative(process.cwd(), MANIFEST)}`,
);
