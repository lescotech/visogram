# Visogram

Landing page for Visogram — 360º virtual tours for developers, real estate and
brands. Three parts: a boot screen built from the brand book's own readouts, a
hero whose background is real tours from the Lesco Viewer panning slowly and
cross-fading, and the body — sections 01–05, the WhatsApp CTA and the footer.

The hero and boot screen are measured off the brand book (`visogram.pdf`); the
body comes from `design_handoff_visogram_landing`. One conversion goal: start a
WhatsApp conversation.

```bash
npm install
npm run tours          # needs the Lesco Viewer project alongside this one
npm run dev
```

| script | what it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | typecheck, then build (strips `_`-prefixed dev assets) |
| `npm run tours` | pulls tour panoramas out of the viewer → `public/tours` + manifest |
| `npm run cards` | reprojects gallery thumbnails from those panoramas |
| `npm run icons` | crops the four feature icons out of the brand sprite |
| `npm run fonts` | subsets the installed PP Supply Mono to `public/fonts` |
| `npm run svg` | flattens the Illustrator exports into `src/assets/inline` |
| `npm run geometry` | derives the wireframe's 3D scene from its SVG |
| `npm run verify` | measures that derivation against the original vector |

`npm run tours` looks for the viewer at `../LESCO-VIEWER`; override with
`LESCO_VIEWER=<path>`.

## Deploying

Pushing to `main` builds the page and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`) at
<https://matheusrgoularte.github.io/visogram/>.

That is a *project* page, so the site is served from `/visogram/` rather than a
domain root, and `base` in `vite.config.ts` carries that path. Two things follow
from it:

- **`base` must match the repository name.** Rename the repo, or move to a
  custom domain — which serves from the root — and `base` changes with it.
- **Vite only rebases the paths it can see**: attributes in `index.html`, and
  `url()` in the CSS. The panorama paths in `tours.json` reach the texture
  loader as plain data, so they are rebased at runtime in `src/hero/tours.ts`
  instead. Anything else built from a string at runtime needs the same
  treatment — `asset()` there is the one place that knows how.

`npm run preview` serves the real build under `/visogram/`, which is the only
way to catch a base-path mistake before it ships; `npm run dev` does too.

## The two screens

**Boot screen** (`.loader` in `index.html`). The status box, the "Accessing ...."
card, the icon column and the `Build / FPS / Ping` readouts. All of it used to
sit in the hero, where a panel reporting `Visual operator....Ready` and a frame
counter described a page that had already finished loading; here they describe
something true. The arrangement is the print's own left column at its measured
proportions, and the sequence — each label landing, then its value reporting
back — settles at 1.91s. `LOADER_MIN` in `src/main.ts` holds the screen to 2.5s
so it always completes; `LOADER_MAX` stops waiting at 7s no matter what.

The overlay's ground and a CSS bail-out animation are inlined in `<head>`: the
first painted frame has to be right before the stylesheet arrives, and if the
script never runs at all the overlay still gets out of the way.

**Hero.** Logo, the WhatsApp quote button, the headline, and a reel showing
which tour is on screen. The tour fills the background behind an opacity mask.

## The tour background

Equirectangular panoramas rendered the way the viewer renders them — a
perspective camera inside a textured sphere. Scrolling the flat image sideways
would be far cheaper, but an equirectangular projection shown flat bows every
vertical line, which on a page selling 360º tours is exactly the wrong artefact.

`tools/build-tours.mjs` takes one scene per tour, downscales from the 11904×5952
master, and emits two WebP sizes plus a ~230-byte inline placeholder.
`vista.yaw`, `vista.pitch` and `vista.fov` come along, so the pan starts on a
framing the tour itself defines.

By default that is the cover scene (`capaCenaId`) at its own `vistaInicial`. The
`SCENES` map overrides it per tour — Biotique points at `c16`, the entrance hall,
because its cover is a glazed corridor with almost none of the slatted cladding
in frame.

**Choose scenes with `preview-hero.mjs`, not from the flat panorama.** A
flattened equirect tells you what is in the room; it does not tell you what lands
on screen. That tool caught two things guesswork had missed: `FOV_SCALE = 0.72`
was filling the frame with whichever wall was nearest, and the default yaw was
pointing at a seam.

```bash
node tools/preview-hero.mjs biotique c16 0.628 0.18 76
SCRIM=1 node tools/preview-hero.mjs biotique c16     # with the mask composited
```

An explicit fov is the effective vertical angle, unclamped, so framings outside
the page's range can be explored; omit it and the preview reproduces exactly what
the page does.

| | 2560 | 1280 |
| --- | --- | --- |
| Biotique | 50KB | 17KB |
| Alpha One | 129KB | 37KB |
| JHA Boutique | 253KB | 66KB |
| Lavvi | 329KB | 90KB |

Only the first slide blocks; the rest are warmed while the previous one is on
screen. Narrow viewports and `Save-Data` get the 1280 set, and `Save-Data` holds
a single slide instead of cycling.

### Matching the viewer's projection

The viewer's shader samples `u = atan2(d.x, -d.z) / 2π + 0.5` along a ray matrix
built by `raioDeTela`, **which negates its third column** — so the centre ray at
yaw 0 is −Z and lands on `u = 0.5`. In general the viewer centres
`u = 0.5 − yaw/2π`, and note that its yaw grows towards *lower* u.

Three's `SphereGeometry` lays out `x = -cos(2πu)`, `z = sin(2πu)`; mirroring it
with `geometry.scale(-1, 1, 1)` to face inwards flips x, so a mesh rotation of
`t` centres `u = t/2π − 0.25`. Equating the two gives `YAW_ORIGIN`:
`t = 1.5π − yaw`.

Missing that negation put every slide half a turn out at first, and the probe
did **not** catch it — a self-consistency check cannot tell you that the
convention you are targeting is the wrong one. `/pano-check.html` now asserts
both ends:

| frame | expectation |
| --- | --- |
| yaw = 0 | the 5\|6 boundary (u = 0.5) sits on the crosshair |
| yaw = π | the rose band's leading edge (u = 0) sits on the crosshair |

Band numbers must climb left to right in both, or the sphere is mirrored.

```bash
node tools/make-pano-probe.mjs     # regenerate the probe
```

### Knobs

`src/hero/panorama.ts`: `PAN_SPEED` (1.2 deg/s), `HOLD` (9s), `FADE` (2.2s),
`FOV_SCALE` (1 — each scene's own angle), `FOV_MIN`/`FOV_MAX` (46/84),
`PITCH_LIMIT` (0.18).

`src/style.css`: `--scrim-near` .52, `--scrim-far` .18, `--scrim-foot` .72.
Light sideways so the room still reads, and weighted at the foot, because that is
where all the small type lives. Picked by compositing the darkest scene
(Biotique, luma 97) against the brightest (Alpha One, 157) with the type mocked
in place — a single sideways value bright enough for one washes out the other.
The headline and the reel also carry a `text-shadow`, which buys the last of the
contrast more cheaply than darkening the tour further.

## Measurements

Every number in `src/hero/design.ts` is a PostScript point, which is also the
artwork's unit — the logo, the icon column and the card illustration are all
placed at exactly 1:1 in the source document. The panel is 820 × 566.4.

Both screens define `--pt` and nothing else hardcodes a size, so the shared
components keep their measured proportions in either place:

```css
hero   --pt: min(0.176554cqh, 0.121951cqw);   /* 100/566.4, 100/820 */
boot   --pt: min(0.2333dvh, 0.2969vw);        /* 334.3pt in 78dvh, 296.4pt in 88vw */
```

> Careful with container query units on an element that itself declares
> `container-type`: they resolve against the *ancestor* container, not the
> element. That is how the card's 5pt corner became a 46px one.

Verified against the print by measuring the DOM (baselines via a zero-height
inline-block probe, which is unambiguous where font metrics are not):

| | target | measured |
| --- | --- | --- |
| status box | 24.3, 106.4, 296.4 × 70.7 | exact |
| status row baselines | 121.3 … 166.2 | ±0.09 |
| status row width | 272.9 | 272.61 |
| stats baselines | 362.6 / 377.6 / 392.6 | 0.00 |
| headline baseline | 504.0 | 504.01 |
| "Imersive" advance | 175.8 | 175.90 |
| boot block offsets | card 2.1/99.3, icons 181.4/98.6, stats 183.6/246.9 | exact |

## Type

**PP Supply Mono** (Pangram Pangram), natural advance 0.593em, Regular (400)
throughout — including the headline, which the PDF's advance width identifies as
Regular, not Medium.

> The OTFs on this machine are a **desktop** licence. Shipping them as webfonts
> needs a separate web licence from Pangram Pangram.

| | size | tracking | leading |
| --- | --- | --- | --- |
| headline | 37.4pt | −0.005em | 36.9pt |
| mono UI | 7pt | −0.08em | 15pt |
| "Stasis" row | 7pt | −0.0365em | — |
| "Accessing ...." | 7pt | +0.62em | — |

The status rows are literal strings with literal dot leaders, because that is
what the source does: all four are 272.9pt wide, and the fourth is tracked
differently so its shorter value still lands on the same right edge. Watch the
whitespace between `</dt>` and `<dd>` — an inline newline renders as a real
space and widens every row by exactly one glyph.

## The wireframe illustration

Parked, not deleted. `src/hero/wireframe.ts`, `src/hero/geometry.json` and
`/verify.html` are intact, and the derivation still verifies:

```bash
npm run verify
# mean 0.023 design units (0.039px on a 1400px panel), max 0.311 (0.53px)
```

`tools/extract-geometry.mjs` least-squares fits a conic to each curve in
`elemento-fundo.svg` and inverts the projection: an ellipse with semi-axes
`a > b` is a circle of radius `a` tilted by `acos(b/a)`. The artwork turns out
to be a sphere of radius 238.4 drawn as five great circles whose fitted radii
spread 229.1…243.0 — hand-drawn slop that is preserved, not averaged. Depth sign
comes from the art direction: solid strokes are the near hemisphere, dashes the
far one. `/verify.html` difference-blends the render against the untouched
vector; black means agreement.

## The body — sections 01–05, CTA and footer

Built from `design_handoff_visogram_landing`. Structure, spacing, copy, grids and
behaviour follow it as specified; `src/body.css` is organised in the handoff's
own order so the two read side by side. House rules applied throughout:
border-radius 0 everywhere, no shadows, no media queries — everything reflows
through `clamp()` and `auto-fit`/`minmax`.

Copy is verbatim and client-reviewed. Do not rewrite it.

### Where this departs from the handoff, and why

**Palette and mono typeface.** The handoff specifies `#262e38` / `#e07a6e` /
`#a9c4dd` and JetBrains Mono. Those read as the design tool's stand-ins rather
than a rebrand: its coral and blue land within a few percent of the brand book's
rose and sky, and PP Supply Mono — which the brand book embeds and this project
already self-hosts — is a paid face the tool could not load. The same README
makes the same concession about the SVGs it rebuilt, asking for the originals to
be preferred if they turn up styled. So the body inherits the hero's measured
palette and typeface, and the handoff's literal values sit in
`:root[data-tokens='handoff']`.

To switch: put `data-tokens="handoff"` on `<html>` and add `JetBrains+Mono:wght@300;400;500;700`
to the Google Fonts link in `index.html`. **This is the one call left open** —
see the questions below.

**Assets.** `tools/split-icons.mjs` crops the four feature icons out of the real
`icones.svg`, at the handoff's own viewBoxes, so they carry the authored stroke
weights and dashes and inherit `currentColor`. Note the handoff's filenames do
not match the shapes it crops (its `icon-eye` is the four-lobed aperture, its
`icon-layers` is the eye); these are named after their role instead.

**Gallery thumbnails.** The handoff lists these as a client pendency and ships
`<image-slot>` placeholders. Not needed — the panoramas are already here, so
`tools/build-tour-cards.mjs` reprojects each tour's own framing at a wider 88º
and crops it to the card (155KB for all four). All four cards carry real names,
cities and clients from the tour manifest.

**Still pending: the tour URLs.** Cards ship as plain blocks and are upgraded to
`<a target="_blank">` by `main.ts` only for tours that have a `url` in the
manifest. Nothing is published yet, so today they are all inert rather than
pretending to be clickable.

**Two type/layout adjustments** forced by the different font metrics and worth
knowing about:

- `.h2--lead` is `19ch`, not the handoff's `16ch`. At 16ch PP Supply Mono reflows
  the second line and drops "360º" to a third, breaking the authored `<br>`.
- The ghost button is padded `15px 20px`, not `12px 20px`, so it clears the 44px
  touch target the handoff also asks for. Type is untouched.

### Motion

`src/body/motion.ts`. Reveal-on-scroll with a `(index % 4) * 70ms` stagger, and
a single-rAF parallax loop at the handoff's speeds (0.22 / −0.16 / 0.3 / 0.14),
scaled by intensity × 0.4 on viewports under 760px × 0 under
`prefers-reduced-motion`.

The handoff's non-negotiable rule — *the page must never be blank if the script
fails* — shapes this more than anything else:

- The hidden state is applied **by JS**, never by CSS, so a blocked or broken
  script leaves a complete page.
- Reveal has three independent triggers: `IntersectionObserver`, a sweep on the
  `scroll` event, and a 1.6s timeout. The sweep is deliberately **not** inside
  the rAF frame — animation frames are paused for a hidden document, so a page
  scrolled while backgrounded would never reveal anything.

That redundancy is not theoretical. In the Browser pane used to develop this,
`document.hidden` is true, and `IntersectionObserver`, `requestAnimationFrame`
**and** `scroll` events are all inert — `window.scrollTo` moves the document but
dispatches no event. The handoff had hit the same wall ("o observer não
disparava no ambiente de preview e a página abria em branco"). Motion therefore
cannot be verified in that pane; it needs a real browser.

`.body-wrap` uses `overflow-x: clip`, not `hidden`: `hidden` promotes
`overflow-y` to `auto` and silently makes the element a scroll container.

### FAQ

`src/body/faq.ts`. Single-open accordion, first item open, clicking the open one
closes it. The markup ships with the first answer visible and the rest `hidden`,
so every answer is in the DOM for crawlers and the section is readable without
JS. The handoff's prototype had no accessibility to port, so `aria-expanded` and
`aria-controls`/`role="region"` are added here.

### Contact

One source: `src/hero/contact.ts`. The hero's WhatsApp mark, the gallery's ghost
button and the final CTA all resolve through `whatsappHref()`, and the displayed
`(47) 99920-1576` is derived from the same digits rather than typed twice.

## Open questions

- **Palette and typeface: brand book or handoff?** The body currently uses the
  hero's measured tokens (see above). Flipping to the handoff's literal values is
  one attribute plus one font link. This is the only decision in the bundle that
  was not mine to make, and it changes every section.
- **The white page ground is gone.** The print's page is white, which worked
  when the hero was the whole design; with sections below it that became a white
  band mid-page. `body` now uses `--bg-alt`, so the hero keeps its inset rounded
  panel as a lighter panel on a darker ground and the scroll into section 01 is
  seamless.
- **The telemetry strip repeats the boot screen.** Its six readouts are the same
  ones the loader now shows. The handoff could not have known that — the boot
  screen came later. It is on by default per the spec; deleting the
  `<section class="telemetry">` is the whole toggle.
- **The gallery is 3 + 1 on desktop.** With the handoff's own numbers — 1180px
  container, `minmax(290px, 1fr)` — four cards never fit one row, so the fourth
  wraps. Faithful, but `minmax` at 260 would give four across if that was the
  intent.
- **Linework colour.** The delivered SVGs specify `#BCC8FF`; the PDF renders the
  same artwork as `#ACC5E5`. Currently following the SVGs — `--line`.
- **"Imersive"** is spelled that way in the brand book. Kept as-is.
- The hero's **mobile layout**, **CTA placement**, **reel** and **slideshow
  order** are extensions — the print has no counterpart for any of them.
- The tours are named client work (Setin, Lavvi, Construcompany). Portfolio use,
  but worth a conscious decision before the page is public.
- Fonts: Archivo comes from Google Fonts at runtime. Self-hosting it alongside
  PP Supply Mono would remove the third-party request.
