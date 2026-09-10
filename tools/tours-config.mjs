// Editorial choices about the tours, shared by every tool that reads the viewer.
//
// build-tours.mjs picks one scene per tour for the hero and the gallery card;
// build-scenes.mjs exports all of them for the in-page viewer. Both need to
// agree on which scene a tour *opens* at, so the panorama someone clicks in the
// gallery is the one they land in. Hence one file rather than two copies.

import fs from 'node:fs';
import path from 'node:path';

/** Where the viewer project lives. Override with LESCO_VIEWER if it moves. */
export const VIEWER =
  process.env.LESCO_VIEWER ?? path.resolve(process.cwd(), '..', 'LESCO-VIEWER');

/**
 * Slideshow order. Deliberate rather than alphabetical: Biotique leads because
 * it is both the deepest tour in the viewer (15 scenes) and by far the lightest
 * to encode, so the first paint is immediate and the heavier panoramas stream
 * in while it is on screen. Editorial call — reorder freely.
 */
export const ORDER = ['biotique', 'lavvi', 'alpha-one', 'jha-boutique'];

export const rank = (slug) => {
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
export const SCENES = {
  // The cover scene, "Entrada Fitness", is a glazed corridor with almost none
  // of the slatted cladding in frame. c16 is the entrance hall proper, and at
  // this yaw the curved clad volume is the subject with the planting in front
  // of it giving depth. Its own vistaInicial looks 44º up; panorama.ts caps
  // pitch at 0.18, which is the framing this yaw was chosen against.
  // The pitch is the hero's own cap, written out so the in-page viewer opens
  // on exactly the frame the gallery card shows.
  biotique: { id: 'c16', yaw: 0.628, pitch: 0.18 },
};

/** Every published tour in the viewer, in ORDER. */
export function readTours() {
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
    .filter((t) => t.publicado)
    .sort((a, b) => rank(a.slug) - rank(b.slug));
}

/** The scene a tour opens at: the override, else its own cover, else the first. */
export function coverScene(tour) {
  const scenes = tour.cenas ?? [];
  const override = SCENES[tour.slug] ?? {};
  const cover =
    (override.id && scenes.find((c) => c.id === override.id)) ??
    scenes.find((c) => c.id === tour.capaCenaId) ??
    scenes[0];
  if (override.id && cover && cover.id !== override.id) {
    console.warn(`${tour.slug}: scene ${override.id} not found, using ${cover.id}`);
  }
  return cover ?? null;
}

/** Prefer the master; fall back to the viewer's own 4096 derivative. */
export function sourceFor(slug, sceneId) {
  const base = path.join(VIEWER, 'media', slug);
  for (const name of [`${sceneId}.jpg`, `${sceneId}.media.jpg`]) {
    const p = path.join(base, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
