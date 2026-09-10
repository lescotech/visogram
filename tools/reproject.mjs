// Equirectangular -> perspective reprojection, in the Lesco Viewer's own
// camera convention. Shared so the projection maths lives in exactly one place:
// the yaw origin was already wrong once, and two copies would have meant two
// chances to be wrong differently.
//
// The viewer builds its ray matrix in raioDeTela(), which scales column 0 by
// tanX, column 1 by tanY and *negates column 2*. That negation is why the
// centre ray at yaw 0 is -Z and lands on u = 0.5 rather than u = 0.

import sharp from 'sharp';

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * @param {object} o
 * @param {string} o.source      path to an equirectangular image
 * @param {number} o.yaw         radians, viewer convention
 * @param {number} o.pitch       radians
 * @param {number} o.fov         effective *vertical* field of view, degrees
 * @param {number} o.width       output width
 * @param {number} o.height      output height
 * @param {number} [o.srcWidth]  equirect width to sample from
 * @returns {Promise<Buffer>}    raw RGB, width * height * 3
 */
export async function reproject({
  source,
  yaw,
  pitch,
  fov,
  width,
  height,
  srcWidth = 4096,
}) {
  const { data, info } = await sharp(source, { limitInputPixels: 512e6 })
    .resize(srcWidth, srcWidth / 2, { kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const sw = info.width;
  const sh = info.height;

  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const col0 = [cy, 0, -sy];
  const col1 = [sy * sp, cp, cy * sp];
  const col2 = [-sy * cp, sp, -cy * cp];

  const tanY = Math.tan((fov * Math.PI) / 180 / 2);
  const tanX = tanY * (width / height);

  const out = Buffer.alloc(width * height * 3);
  const wrap = (n) => ((n % sw) + sw) % sw;

  for (let py = 0; py < height; py++) {
    const ndcY = 1 - (2 * (py + 0.5)) / height;
    for (let px = 0; px < width; px++) {
      const ndcX = (2 * (px + 0.5)) / width - 1;
      const ax = ndcX * tanX, ay = ndcY * tanY;
      let dx = ax * col0[0] + ay * col1[0] + col2[0];
      let dy = ax * col0[1] + ay * col1[1] + col2[1];
      let dz = ax * col0[2] + ay * col1[2] + col2[2];
      const len = Math.hypot(dx, dy, dz);
      dx /= len; dy /= len; dz /= len;

      const u = Math.atan2(dx, -dz) / (2 * Math.PI) + 0.5;
      const v = Math.acos(clamp(dy, -1, 1)) / Math.PI;

      // Bilinear, wrapping across the seam and clamping at the poles.
      const x = u * sw - 0.5;
      const y = clamp(v * sh - 0.5, 0, sh - 1);
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = x - x0, fy = y - y0;
      const xa = wrap(x0), xb = wrap(x0 + 1);
      const ya = clamp(y0, 0, sh - 1), yb = clamp(y0 + 1, 0, sh - 1);
      const at = (py * width + px) * 3;
      for (let c = 0; c < 3; c++) {
        const p00 = data[(ya * sw + xa) * 3 + c];
        const p10 = data[(ya * sw + xb) * 3 + c];
        const p01 = data[(yb * sw + xa) * 3 + c];
        const p11 = data[(yb * sw + xb) * 3 + c];
        const top = p00 + (p10 - p00) * fx;
        const bot = p01 + (p11 - p01) * fx;
        out[at + c] = top + (bot - top) * fy;
      }
    }
  }
  return out;
}

/** Where u ends up in the centre of frame, for logging. */
export const centredU = (yaw) => (((0.5 - yaw / (2 * Math.PI)) % 1) + 1) % 1;
