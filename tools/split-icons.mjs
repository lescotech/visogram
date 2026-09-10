// Splits the brand icon sprite into the four icons the body's feature strip
// needs, cropping by viewBox exactly as the design handoff specifies.
//
// The handoff ships its own pre-cropped copies, but its README says they were
// reconstructed as line art because the SVGs it received had lost their <style>
// block — and asks for the originals to be preferred if they turn up styled.
// They are: tools/inline-svg.mjs resolves the real stylesheet into presentation
// attributes, so these crops carry the authored stroke weights and dash
// patterns rather than a redrawing of them, and they inherit currentColor.
//
// One wrinkle worth knowing: the handoff's filenames do not match the shapes it
// crops — what it calls `icon-eye` is the four-lobed aperture, and what it calls
// `icon-layers` is the eye. The *crops* are what the design pairs with each
// label, so these files are named after their role instead.

import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('src/assets/inline/icones.svg');
const OUT_DIR = path.resolve('src/assets/inline');

/** Sibling <g> index in the sprite -> role, with the handoff's crop. */
const ICONS = [
  { role: 'panoramica', group: 1, viewBox: '0 -1 30.82 23.5', shape: 'four-lobed aperture' },
  { role: 'percepcao', group: 0, viewBox: '0 71 30.82 23', shape: 'eye' },
  { role: 'mapeamento', group: 2, viewBox: '0 33 30.82 26', shape: 'gridded globe' },
  { role: 'ecossistema', group: 3, viewBox: '-7.5 104 45.8 18.5', shape: 'paired orbs' },
];

const svg = fs.readFileSync(SRC, 'utf8');

/** The sprite's four icons are sibling <g> elements three levels deep. */
function siblingGroups(source) {
  const groups = [];
  let depth = 0;
  let start = null;
  for (const m of source.matchAll(/<(\/?)g\b[^>]*>/g)) {
    if (m[1] === '') {
      depth++;
      if (depth === 3) start = m.index;
    } else {
      if (depth === 3 && start !== null) {
        groups.push(source.slice(start, m.index + m[0].length));
        start = null;
      }
      depth--;
    }
  }
  return groups;
}

const groups = siblingGroups(svg);
if (groups.length !== 4) {
  throw new Error(`Expected 4 icons in the sprite, found ${groups.length}.`);
}

/** The paired orbs are clipped, so that icon needs the sprite's <defs>. */
const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)?.[0] ?? '';

for (const icon of ICONS) {
  const body = groups[icon.group];
  const needsDefs = /clip-path/.test(body);
  const out =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" ` +
    `fill="none" aria-hidden="true" focusable="false">\n` +
    (needsDefs ? `${defs}\n` : '') +
    `${body}\n</svg>\n`;

  const file = path.join(OUT_DIR, `icon-${icon.role}.svg`);
  fs.writeFileSync(file, out);
  console.log(
    `icon-${icon.role}.svg`.padEnd(24) +
    `${icon.shape.padEnd(22)} viewBox="${icon.viewBox}"` +
    `${needsDefs ? '  +defs' : ''}  ${(out.length / 1024).toFixed(1)}KB`,
  );
}

console.log(`\n${ICONS.length} icons -> ${path.relative(process.cwd(), OUT_DIR)}`);
