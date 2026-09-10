// Generates a labelled equirectangular test image for the projection harness at
// /pano-check.html. Twelve 30-degree bands, numbered, with band 0 marked in
// rose so it is obvious where u = 0 lands on screen and which way u runs.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const W = 2048, H = 1024, BANDS = 12;
const band = W / BANDS;
const parts = [];
for (let i = 0; i < BANDS; i++) {
  const fill = i === 0 ? '#d07078' : i % 2 ? '#17222f' : '#22303f';
  parts.push(`<rect x="${i * band}" y="0" width="${band}" height="${H}" fill="${fill}"/>`);
  parts.push(
    `<text x="${i * band + band / 2}" y="${H / 2}" fill="#e8f2fa" font-size="150"` +
    ` font-family="monospace" text-anchor="middle" dominant-baseline="central">${i}</text>`,
  );
  parts.push(
    `<text x="${i * band + band / 2}" y="${H / 2 + 130}" fill="#9ac3e6" font-size="46"` +
    ` font-family="monospace" text-anchor="middle">u=${(i / BANDS).toFixed(2)}</text>`,
  );
  parts.push(`<rect x="${i * band}" y="0" width="3" height="${H}" fill="#9ac3e6"/>`);
}
// Horizon and poles, to catch a vertical flip.
parts.push(`<rect x="0" y="${H / 2 - 1}" width="${W}" height="3" fill="#9ac3e6" opacity=".5"/>`);
parts.push(`<text x="${W / 2}" y="120" fill="#fff3f3" font-size="72" font-family="monospace" text-anchor="middle">TOPO</text>`);
parts.push(`<text x="${W / 2}" y="${H - 60}" fill="#fff3f3" font-size="72" font-family="monospace" text-anchor="middle">BASE</text>`);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`;

const out = path.resolve('public/tours/_probe.webp');
fs.mkdirSync(path.dirname(out), { recursive: true });
await sharp(Buffer.from(svg)).webp({ quality: 88 }).toFile(out);
console.log(`wrote ${path.relative(process.cwd(), out)}  ${W}x${H}, ${BANDS} bands`);
