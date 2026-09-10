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
  plugins: [dropDevAssets()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
