// Every scene of every published tour, prepared for the in-page 360 viewer.
//
// build-tours.mjs takes one frame per tour for the hero, at 2560 and behind a
// scrim, where softness reads as depth of field. This is the opposite job: the
// visitor is inside the room, looking wherever they like and free to zoom, so
// the texture is the only thing between them and the wall. 4096 is what the
// viewer itself serves for exactly that reason (its `.media.jpg` derivative),
// and matching it means the tour on this page is no softer than the tour on
// tours.lesco.com.br will be.
//
// Nothing here is eager: the manifest lives in its own module, the viewer chunk
// only loads when someone opens a tour, and a scene's panorama only downloads
// when they walk into it.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { reproject } from './reproject.mjs';
import { SCENES, coverScene, readTours, sourceFor } from './tours-config.mjs';

const OUT_DIR = path.resolve('public/tours');
const MANIFEST = path.resolve('src/tour/scenes.json');

/** Equirectangular width for the shipped texture; see the note above. */
const WIDTH = 4096;
/** Narrow-viewport and Save-Data variant. */
const SMALL_WIDTH = 2048;
const QUALITY = 72;
/** Inline placeholder, encoded into the manifest as a data URI. */
const LQIP_WIDTH = 48;

/** Strip thumbnails, reprojected through each scene's own framing. */
const THUMB_W = 320;
const THUMB_H = 200;
/** Wide, like the gallery cards: a small window has to read as a room. */
const THUMB_FOV = 92;
const THUMB_QUALITY = 70;

/**
 * How far from level a scene may *open*, in radians.
 *
 * The cover is the frame the gallery card shows, and the card is the door: you
 * should land looking at what you clicked. build-tour-cards.mjs clamps its
 * reprojection to 0.18, so the cover matches it exactly.
 *
 * Every other scene keeps the framing its author composed — that is what the
 * Lesco Viewer itself opens on, and it is their call, not ours. The guard is
 * only there so nobody arrives mid-tour staring at a ceiling: 0.5rad is 29º,
 * and no scene in the four tours reaches it.
 */
const COVER_PITCH = 0.18;
const OPEN_PITCH = 0.5;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

const tours = readTours();
const manifest = [];
let bytes = 0;

for (const tour of tours) {
  const scenes = (tour.cenas ?? []).filter((c) => c.temMedia !== false);
  if (!scenes.length) {
    console.warn(`SKIP ${tour.slug} — no scenes`);
    continue;
  }

  const override = SCENES[tour.slug] ?? {};
  const cover = coverScene(tour);
  const dir = path.join(OUT_DIR, tour.slug);
  fs.mkdirSync(dir, { recursive: true });

  const out = [];
  for (const scene of scenes) {
    const src = sourceFor(tour.slug, scene.id);
    if (!src) {
      console.warn(`  skip ${tour.slug}/${scene.id} — no media`);
      continue;
    }

    const isCover = Boolean(cover && scene.id === cover.id);
    // The cover carries the editorial override, so the viewer opens on the
    // frame the gallery card shows. Everything else opens where its author
    // framed it.
    const limit = isCover ? COVER_PITCH : OPEN_PITCH;
    const vista = {
      yaw: (isCover ? override.yaw : undefined) ?? scene.vistaInicial?.yaw ?? 0,
      pitch: clamp(
        (isCover ? override.pitch : undefined) ?? scene.vistaInicial?.pitch ?? 0,
        -limit,
        limit,
      ),
      fov: (isCover ? override.fov : undefined) ?? scene.vistaInicial?.fov ?? 76,
    };

    const pipeline = () => sharp(src, { limitInputPixels: 512e6 });
    const encode = async (width) =>
      pipeline()
        .resize(width, width / 2, { kernel: 'lanczos3' })
        .webp({ quality: QUALITY, effort: 6 })
        .toBuffer();

    const full = await encode(WIDTH);
    fs.writeFileSync(path.join(dir, `${scene.id}.webp`), full);

    const small = await encode(SMALL_WIDTH);
    fs.writeFileSync(path.join(dir, `${scene.id}@${SMALL_WIDTH}.webp`), small);

    const raw = await reproject({
      source: src,
      yaw: vista.yaw,
      pitch: vista.pitch,
      fov: THUMB_FOV,
      width: THUMB_W,
      height: THUMB_H,
    });
    const thumb = await sharp(raw, {
      raw: { width: THUMB_W, height: THUMB_H, channels: 3 },
    })
      .webp({ quality: THUMB_QUALITY, effort: 6 })
      .toBuffer();
    fs.writeFileSync(path.join(dir, `${scene.id}-thumb.webp`), thumb);

    const lqip = await pipeline()
      .resize(LQIP_WIDTH, LQIP_WIDTH / 2, { kernel: 'lanczos3' })
      .webp({ quality: 40 })
      .toBuffer();

    bytes += full.length + small.length + thumb.length;

    out.push({
      id: scene.id,
      nome: scene.nome,
      /** Viewer convention: radians for yaw/pitch, degrees of *vertical* fov. */
      vista,
      /**
       * Doorways, as placed in the viewer. Only Biotique has them; the other
       * tours were built as a set of rooms with no graph between them, which is
       * why the scene strip — not the hotspots — is the primary way around.
       */
      hotspots: (scene.hotspots ?? [])
        .filter((h) => h.tipo === 'navegacao' && h.destinoId)
        .map((h) => ({
          id: h.id,
          yaw: h.yaw,
          pitch: h.pitch,
          destino: h.destinoId,
          direcao: h.direcao ?? null,
        })),
      src: `/tours/${tour.slug}/${scene.id}.webp`,
      srcSmall: `/tours/${tour.slug}/${scene.id}@${SMALL_WIDTH}.webp`,
      thumb: `/tours/${tour.slug}/${scene.id}-thumb.webp`,
      lqip: `data:image/webp;base64,${lqip.toString('base64')}`,
    });

    console.log(
      `  ${scene.id.padEnd(4)} ${String(scene.nome).padEnd(24)} ` +
      `${WIDTH}:${kb(full.length).padStart(6)}  ` +
      `${SMALL_WIDTH}:${kb(small.length).padStart(6)}  ` +
      `thumb:${kb(thumb.length).padStart(5)}`,
    );
  }

  if (!out.length) continue;

  // A hotspot pointing at a scene we did not export would be a dead end.
  const ids = new Set(out.map((s) => s.id));
  for (const scene of out) {
    const kept = scene.hotspots.filter((h) => ids.has(h.destino));
    if (kept.length !== scene.hotspots.length) {
      console.warn(`  ${tour.slug}/${scene.id}: dropped a hotspot with no scene`);
    }
    scene.hotspots = kept;
  }

  manifest.push({
    slug: tour.slug,
    obra: tour.obra,
    cidade: tour.cidade,
    uf: tour.uf,
    escritorio: tour.escritorio || null,
    /** Where the tour opens, matching the gallery card and the hero. */
    capa: out.find((s) => cover && s.id === cover.id)?.id ?? out[0].id,
    cenas: out,
  });

  console.log(`${tour.obra} — ${out.length} cenas\n`);
}

if (!manifest.length) throw new Error('No scenes were prepared.');

fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

const count = manifest.reduce((n, t) => n + t.cenas.length, 0);
console.log(
  `${count} cenas em ${manifest.length} tours -> public/tours/<slug>/ ` +
  `(${(bytes / 1024 / 1024).toFixed(1)}MB total), ` +
  `manifest at ${path.relative(process.cwd(), MANIFEST)}`,
);
