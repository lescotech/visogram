// Subsets the installed PP Supply Mono weights to woff2 for the web build.
//
// NOTE ON LICENSING: these OTFs are the *desktop* licence installed on this
// machine. Shipping them as webfonts needs a separate web licence from Pangram
// Pangram. Nothing here is published by running it.

import fs from 'node:fs';
import path from 'node:path';
import subsetFont from 'subset-font';

const FONT_DIRS = [
  path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft/Windows/Fonts'),
  'C:/Windows/Fonts',
];

const WEIGHTS = [
  { file: 'PPSupplyMono-Ultralight.otf', out: 'supply-mono-200.woff2', weight: 200 },
  { file: 'PPSupplyMono-Regular.otf',    out: 'supply-mono-400.woff2', weight: 400 },
  { file: 'PPSupplyMono-Medium.otf',     out: 'supply-mono-500.woff2', weight: 500 },
];

// Latin + the Portuguese accents and the few symbols the brand book uses.
const CHARSET = [
  ...Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i)),
  ...'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
  ...'ºª°–—‘’“”…•·→×✓',
].join('');

const OUT_DIR = path.resolve('public/fonts');
fs.mkdirSync(OUT_DIR, { recursive: true });

const resolve = (name) => {
  for (const dir of FONT_DIRS) {
    const p = path.join(dir, name);
    if (dir && fs.existsSync(p)) return p;
  }
  return null;
};

let built = 0;
for (const w of WEIGHTS) {
  const src = resolve(w.file);
  if (!src) {
    console.warn(`SKIP ${w.file} — not found in ${FONT_DIRS.join(' or ')}`);
    continue;
  }
  const buf = await subsetFont(fs.readFileSync(src), CHARSET, { targetFormat: 'woff2' });
  const dest = path.join(OUT_DIR, w.out);
  fs.writeFileSync(dest, buf);
  const before = fs.statSync(src).size, after = buf.length;
  console.log(
    `${w.out.padEnd(22)} weight ${w.weight}  ` +
    `${(before / 1024).toFixed(0)}KB -> ${(after / 1024).toFixed(1)}KB`,
  );
  built++;
}
console.log(`\n${built}/${WEIGHTS.length} weights written to public/fonts`);
if (built < WEIGHTS.length) process.exitCode = 1;
