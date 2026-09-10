// Flattens the Illustrator exports so they can be inlined into one document.
//
// All four assets use the same generated class names (.cls-1, .cls-3, ...) for
// different things, so inlining them as-is makes their <style> blocks collide.
// This resolves each class into presentation attributes, prefixes the internal
// ids, and swaps the hardcoded linework colour for currentColor so the page can
// drive it from CSS.

import fs from 'node:fs';
import path from 'node:path';
import { parseStyles } from './svg-read.mjs';

const LINE_COLOUR = /#bcc8ff/gi;

/** Declarations we forward from CSS to presentation attributes. */
const FORWARD = [
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-miterlimit',
  'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'fill-opacity',
  'opacity', 'clip-path', 'mix-blend-mode',
];

const ASSETS = [
  { file: 'logo.svg', prefix: 'lg', recolour: false },
  { file: 'icones.svg', prefix: 'ic', recolour: true },
  { file: 'ilustracao.svg', prefix: 'il', recolour: true },
  { file: 'elemento-fundo.svg', prefix: 'bg', recolour: true },
];

const SRC_DIR = path.resolve('src/assets');
const OUT_DIR = path.resolve('src/assets/inline');
fs.mkdirSync(OUT_DIR, { recursive: true });

const escapeAttr = (v) => v.replace(/"/g, '&quot;');

for (const asset of ASSETS) {
  let svg = fs.readFileSync(path.join(SRC_DIR, asset.file), 'utf8');

  // 1. Prefix every id and the url(#...) references that point at them. This
  //    has to happen before the <style> block is parsed, because the rules
  //    reference those ids (clip-path: url(#clippath)).
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids) {
    const next = `${asset.prefix}-${id}`;
    svg = svg.replaceAll(`id="${id}"`, `id="${next}"`);
    svg = svg.replaceAll(`url(#${id})`, `url(#${next})`);
    svg = svg.replaceAll(`url("#${id}")`, `url(#${next})`);
    svg = svg.replaceAll(`url('#${id}')`, `url(#${next})`);
  }

  const rules = parseStyles(svg);

  // 2. Turn class="cls-n ..." into presentation attributes.
  svg = svg.replace(/\sclass="([^"]*)"/g, (_m, classList) => {
    const classes = classList.split(/\s+/).filter(Boolean);
    let decls = {};
    for (const c of classes) decls = { ...decls, ...rules[c] };
    const attrs = FORWARD
      .filter((k) => decls[k] !== undefined)
      // SVG 1.1 presentation attributes take bare numbers; `.5px` from the CSS
      // block works in browsers but is invalid markup, so drop the unit.
      .map((k) => ` ${k}="${escapeAttr(decls[k].replace(/^([\d.]+)px$/, '$1'))}"`)
      .join('');
    // Keep a data hook so the markup stays traceable back to the export.
    return `${attrs} data-cls="${escapeAttr(classes.join(' '))}"`;
  });

  // 3. Drop the now-redundant <style>, and any <defs> left empty by it.
  svg = svg.replace(/\s*<style>[\s\S]*?<\/style>/g, '');
  svg = svg.replace(/\s*<defs>\s*<\/defs>/g, '');

  // 4. Let CSS own the colour.
  if (asset.recolour) svg = svg.replace(LINE_COLOUR, 'currentColor');
  else svg = svg.replace(/<svg\b/, '<svg fill="currentColor"');

  // 5. Strip the XML prolog and the Illustrator comment; these are inlined.
  svg = svg
    .replace(/<\?xml[^>]*\?>\s*/g, '')
    .replace(/<!--[\s\S]*?-->\s*/g, '')
    .replace(/\n{3,}/g, '\n')
    .trim();

  const out = path.join(OUT_DIR, asset.file);
  fs.writeFileSync(out, `${svg}\n`);
  const remaining = (svg.match(/class="/g) ?? []).length;
  console.log(
    `${asset.file.padEnd(22)} ${(svg.length / 1024).toFixed(1)}KB  ` +
    `ids=[${ids.join(', ') || '-'}]  leftover class attrs=${remaining}`,
  );
}
console.log(`\nwrote ${path.relative(process.cwd(), OUT_DIR)}`);
