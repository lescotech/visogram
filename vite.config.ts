import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Everything in public/ is copied verbatim into the build, including the
 * projection probe that /pano-check.html needs in dev. Anything named with a
 * leading underscore is a harness asset and has no business shipping.
 */
function dropDevAssets(): Plugin {
  return {
    name: 'visogram:drop-dev-assets',
    apply: 'build',
    closeBundle() {
      const dir = path.resolve('dist');
      const removed: string[] = [];
      const walk = (at: string) => {
        for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
          const full = path.join(at, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.startsWith('_')) {
            fs.rmSync(full);
            removed.push(path.relative(dir, full));
          }
        }
      };
      if (fs.existsSync(dir)) walk(dir);
      if (removed.length) {
        this.info(`dropped dev assets: ${removed.join(', ')}`);
      }
    },
  };
}

export default defineConfig({
  /**
   * Served from a GitHub Pages project page, so the site lives under
   * /visogram/ instead of the domain root. Vite rewrites the asset URLs it can
   * see — index.html attributes and CSS url() — to match. Anything addressed at
   * runtime has to rebase itself on import.meta.env.BASE_URL; see
   * src/hero/tours.ts, where the manifest's panorama paths are.
   */
  base: '/visogram/',
  plugins: [dropDevAssets()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        /**
         * Both renderers — the hero's slideshow and the tour viewer — load
         * three.js, so Rollup lifts it into a chunk they share. Left alone it
         * names that chunk after whichever small module happens to be shared
         * too; naming it here means the 470KB in the network panel says what
         * it actually is.
         */
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
