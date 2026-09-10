/**
 * The hero geometry, measured off page 7 of visogram.pdf.
 *
 * Every number is in PostScript points, which is also the artwork's own unit:
 * the logo, the icon column, the card illustration and the wireframe are all
 * placed at exactly 1:1 in the source document, so one design point is one SVG
 * user unit throughout.
 *
 * Coordinates are relative to the top-left of the navy panel.
 */
export const DESIGN = {
  /** The navy panel, inset from the white page with a rounded corner. */
  panel: { w: 820, h: 566.4, radius: 16, inset: 11 },

  /** Placement of elemento-fundo.svg (viewBox 429.38 x 546). */
  art: { x: 337.78, y: 19.0, w: 429.38, h: 546 },

  /** Art-local position of the pupil — the composition's optical centre. */
  eye: { x: 177.23, y: 282.84 },

  /** Art-local centre of the fitted great circles (R = 238.38). */
  sphere: { x: 188.86, y: 282.15 },

  blocks: {
    logo: { x: 27.9, y: 27.1, w: 353.6, h: 55 },
    status: { x: 24.3, y: 106.4, w: 296.4, h: 70.7 },
    card: { x: 26.4, y: 205.7, w: 152.9, h: 235 },
    cardLabel: { x: 55, y: 218.6, w: 96.4, cap: 7.1 },
    cardArt: { x: 55, y: 240.7, w: 104.3, h: 164.3 },
    icons: { x: 205.7, y: 205, w: 31.4, h: 121.4 },
    stats: { x: 207.9, y: 357.1, w: 32.9, h: 37.1 },
    /** Cap-top of line 1; leading is 36.4pt on a 37.4pt body. */
    headline: { x: 30.7, y: 477.9, size: 37.4, leading: 36.4 },
  },
} as const;

export const PALETTE = {
  navy: '#17222F',
  ice: '#E8F2FA',
  sky: '#9AC3E6',
  rose: '#D07078',
  roseIce: '#FFF3F3',
  /** Stroke colour of all the wireframe linework. */
  line: '#BCC8FF',
} as const;

/**
 * Where the pupil sits as a fraction of the panel. The camera frames the scene
 * around this point so the composition keeps its optical centre at any aspect
 * ratio, instead of drifting as the viewport changes shape.
 */
export const EYE_ANCHOR = {
  fx: (DESIGN.art.x + DESIGN.eye.x) / DESIGN.panel.w,
  fy: (DESIGN.art.y + DESIGN.eye.y) / DESIGN.panel.h,
} as const;
