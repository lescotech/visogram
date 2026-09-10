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
// composed view rather than on an arbitrary wall.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

/** Where the viewer project lives. Override with LESCO_VIEWER if it moves. */
const VIEWER =
  process.env.LESCO_VIEWER ??
  path.resolve(process.cwd(), '..', 'LESCO-VIEWER');

const OUT_DIR = path.resolve('public/tours');
const MANIFEST = path.resolve('src/hero/tours.json');

/**
 * Equirectangular width for the shipped texture. The masters are 11904 wide,
 * but this sits behind a scrim and under a slow pan, where softness reads as
 * depth of field. 2560 keeps the worst-compressing scene near 330KB; 3072
 * pushed it past 420KB for detail the scrim hides anyway.
 */
const WIDTH = 2560;
/** Narrow-viewport variant, so phones do not pull the desktop textures. */
const SMALL_WIDTH = 1280;
const QUALITY = 72;
/** Inline placeholder, encoded straight into the manifest as a data URI. */
const LQIP_WIDTH = 48;

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

function readTours() {
  const dir = path.join(VIEWER, 'data', 'tours');
  if (!fs.existsSync(dir)) {
    throw new Error(
      `Viewer tours not found at ${dir}. Set LESCO_VIEWER to the project root.`,
    );
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const file = path.join(dir, e.name, 'tour.json');
      if (!fs.existsSync(file)) return null;
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    })
    .filter(Boolean)
    .filter((t) => t.publicado);
}

/** Prefer the master; fall back to the viewer's own 4096 derivative. */
function sourceFor(slug, sceneId) {
  const base = path.join(VIEWER, 'media', slug);
  for (const name of [`${sceneId}.jpg`, `${sceneId}.media.jpg`]) {
    const p = path.join(base, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

/**
 * Slideshow order. Deliberate rather than alphabetical: Biotique leads because
 * it is both the deepest tour in the viewer (15 scenes) and by far the lightest
 * to encode, so the first paint is immediate and the heavier panoramas stream
 * in while it is on screen. Editorial call — reorder freely.
 */
const ORDER = ['biotique', 'lavvi', 'alpha-one', 'jha-boutique'];
const rank = (slug) => {
  const i = ORDER.indexOf(slug);
  return i === -1 ? ORDER.length : i;
};

/**
 * Scene and framing overrides, chosen by rendering candidates through
 * `tools/preview-hero.mjs` rather than judging from a flattened panorama — the
 * flat image tells you what is in the room, not what lands on screen.
 *
 * Without an entry here a tour uses its own cover scene (`capaCenaId`) at that
 * scene's `vistaInicial`.
 */
const SCENES = {
  // The cover scene, "Entrada Fitness", is a glazed corridor with almost none
  // of the slatted cladding in frame. c16 is the entrance hall proper, and at
  // this yaw the curved clad volume is the subject with the planting in front
  // of it giving depth. Its own vistaInicial looks 44º up; panorama.ts caps
  // pitch at 0.18, which is the framing this yaw was chosen against.
  biotique: { id: 'c16', yaw: 0.628 },
};

const tours = readTours().sort((a, b) => rank(a.slug) - rank(b.slug));
const manifest = [];

for (const tour of tours) {
  const scenes = tour.cenas ?? [];
  const override = SCENES[tour.slug] ?? {};
  const cover =
    (override.id && scenes.find((c) => c.id === override.id)) ??
    scenes.find((c) => c.id === tour.capaCenaId) ??
    scenes[0];
  if (!cover) {
    console.warn(`SKIP ${tour.slug} — no scenes`);
    continue;
  }
  if (override.id && cover.id !== override.id) {
    console.warn(`${tour.slug}: scene ${override.id} not found, using ${cover.id}`);
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

  const small = await encode(SMALL_WIDTH);
  fs.writeFileSync(path.join(OUT_DIR, `${tour.slug}@${SMALL_WIDTH}.webp`), small);

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
    cenas: scenes.length,
    /** Viewer convention: radians for yaw/pitch, degrees of *vertical* fov. */
    vista: {
      yaw: override.yaw ?? cover.vistaInicial?.yaw ?? 0,
      pitch: override.pitch ?? cover.vistaInicial?.pitch ?? 0,
      fov: override.fov ?? cover.vistaInicial?.fov ?? 76,
    },
    /** Mean luminance of the horizon band, 0-255. */
    luma,
    src: `/tours/${tour.slug}.webp`,
    srcSmall: `/tours/${tour.slug}@${SMALL_WIDTH}.webp`,
    lqip: `data:image/webp;base64,${lqip.toString('base64')}`,
  });

  console.log(
    `${tour.obra.padEnd(14)} ${String(cover.nome).padEnd(18)} ` +
    `${meta.width}x${meta.height} -> ` +
    `${WIDTH}:${kb(buf.length).padStart(6)}  ` +
    `${SMALL_WIDTH}:${kb(small.length).padStart(5)}  luma ${String(luma).padStart(3)}`,
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
