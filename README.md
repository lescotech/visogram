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
| `npm run scenes` | exports *every* scene of every tour for the in-page 360 viewer |
| `npm run cards` | reprojects gallery thumbnails from those panoramas |
| `npm run icons` | crops the four feature icons out of the brand sprite |
| `npm run fonts` | subsets the installed PP Supply Mono to `public/fonts` |
| `npm run svg` | flattens the Illustrator exports into `src/assets/inline` |
| `npm run geometry` | derives the wireframe's 3D scene from its SVG |
| `npm run verify` | measures that derivation against the original vector |
| `npm run verify:tour` | raycasts the viewer's camera convention against three.js |

`npm run tours` looks for the viewer at `../LESCO-VIEWER`; override with
`LESCO_VIEWER=<path>`.

## Install scripts

npm 11.6+ will not run a dependency's install script until the project says so,
and esbuild — which Vite pulls in — has one: it puts the platform binary in
`node_modules/esbuild/bin`. `allowScripts` in `package.json` approves that one
script; without it `npm install` warns on every run. The entry is pinned to a
version, so when Vite moves to a new esbuild the warning comes back and
`npm approve-scripts esbuild` clears it once you have looked at what changed.

## Deploying

Vercel builds the page and deploys it: `main` goes to production, and every
pull request gets a preview deployment of the same build. `npm run build`
typechecks before it bundles, so a type error fails the deploy rather than
shipping.

Vercel serves from the domain root, so `base` in `vite.config.ts` is `/`. One
thing still follows from it:

- **Vite only rebases the paths it can see**: attributes in `index.html`, and
  `url()` in the CSS. The panorama paths in `tours.json` reach the texture
  loader as plain data, so they are rebased at runtime in `src/hero/tours.ts`
  instead. Anything else built from a string at runtime needs the same
  treatment — `asset()` there is the one place that knows how. That is worth
  keeping even with `base` at the root: it is what makes a move to a subpath,
  or back to a project page, a one-line change in `vite.config.ts`.

`npm run preview` serves the real build the way Vercel does, which is the only
way to catch a base-path mistake before it ships; `npm run dev` does too.

## The two screens

**Boot screen** (`.loader` in `index.html`). The status box, the "Accessing ...."
card, the icon column, the `Build / FPS / Ping` readouts and the wordmark. Most
of it used to sit in the hero, where a panel reporting `Visual operator....Ready`
and a frame counter described a page that had already finished loading; here
they describe something true. Add `?boot` to the URL to hold the screen open —
it is otherwise gone in 3.3s, which is long enough to watch once and far too
short to judge.

The sequence: each label lands, its value reports back a beat later, and the
readouts settle at 1.91s. Then the wordmark writes itself on — nine outlines
drawn in reading order, the last corner landing at 2.73s. `LOADER_MIN` in
`src/main.ts` holds the screen to 3.3s so the sequence always completes and the
finished composition gets a beat of its own; `LOADER_MAX` stops waiting at 7s no
matter what. The indeterminate bar under the block waits until 3.9s, past the
hand-over, so a loaded page never shows one: it appears only when the wait
outlives the sequence.

Two things the boot screen does that page 7 does not, both in `src/style.css`
under *boot screen* and marked there as such:

- **The right column fills the card.** The sheet's readouts sit at 250.7pt and
  its icons stand ~16pt apart, which is right when the block is the hero's left
  margin and leaves a third of the column empty when it is not. The readouts
  moved down to put their last baseline on the card's foot, and the icons were
  enlarged 1.2654× and stood 26.8pt apart to fill what that opened up. The
  spacing is done by `spreadIcons()` in `src/main.ts`, which slides the sprite's
  four groups down it and grows the viewBox — no icon is resized, re-drawn or
  re-clipped.
- **The wordmark is vertical and outlined.** A quarter turn clockwise down the
  right-hand column, the card's height, its right edge on the readouts' own
  right edge. It is the only place the logo is a stroke rather than a solid,
  because the entrance *is* the stroke: `prepareLogoDraw()` puts `pathLength="1"`
  on all nine shapes so one dash pattern fits contours from 28 to 420 units, and
  hands each its place in the word — the file's document order is `S R V A I O M
  · G`, and sorting by the left edge of each box recovers `VISOGRAM`.

Those two are read off a reference render rather than measured off the print,
which is the only part of either screen that is not.

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
SHAPE=phone SCRIM=1 node tools/preview-hero.mjs biotique c16 0.628 0.18
```

`SHAPE=phone` renders 355x792 and switches to the mobile scrim. Use it for any
framing judgement about phones: the desktop preview says nothing about them,
because the aspect ratio decides the horizontal angle (below).

An explicit fov is the effective vertical angle, unclamped, so framings outside
the page's range can be explored; omit it and the preview reproduces exactly what
the page does.

| | 2560 `src` | 4096 `srcDense` | 1280 `srcLite` |
| --- | --- | --- | --- |
| Biotique | 221KB | 442KB | 69KB |
| Alpha One | 129KB | 290KB | 37KB |
| JHA Boutique | 253KB | 643KB | 66KB |
| Lavvi | 329KB | 735KB | 90KB |

Only the first slide blocks; the rest are warmed while the previous one is on
screen. `Save-Data` gets `srcLite` and holds a single slide instead of cycling.

**A phone gets the *biggest* texture, not the smallest.** This is the one thing
about the pipeline that reads as a mistake, so: the camera's fov is the vertical
angle, and the aspect ratio decides how much you get across. A phone panel is
355x792, so 76º vertical is 41º horizontal — a phone spends the same screen on a
tenth of the room a desktop shows. Fewer degrees over the same pixels, at DPR 2,
is about 21 device px/degree against 12 on a monitor.

Shipping the 1280 set to phones therefore magnified it **5.8x** and the panorama
arrived as mush. The tiers now go by what the device needs: `srcDense` is 11.4
texels/degree, so a phone renders at 1.34x. Desktop is unchanged at 1.9x, which
is the level that was already judged fine.

Full-fat is 2.1MB across four slides, 442KB of it before first paint. That is
deliberate — the brief was to spend data for quality here — but it is the
*download*; what actually bounds a phone is texture memory, which is why
`CACHE_MAX` in `panorama.ts` keeps three panoramas resident rather than all four.
A 4096x2048 texture is 43MB mipmapped, and four would ask iOS for 170MB, which
is where it starts dropping the WebGL context and the hero vanishes mid-cycle.

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
`PITCH_LIMIT` (0.18), `H_SWEEP` (88), `FOV_MAX_TALL` (104), `CACHE_MAX` (3 on
narrow viewports).

`H_SWEEP` and `FOV_MAX_TALL` are the mobile framing, and the only two numbers
here with no measurement behind them — the print has no mobile counterpart. The
scene's own vertical angle is treated as a floor: the camera widens until at
least `H_SWEEP` degrees are on screen, capped at `FOV_MAX_TALL` vertical before
the projection starts to fisheye. There is deliberately no aspect threshold —
at any aspect above 1.24 the scene's own angle already wins, so desktop framing
is untouched and a window resized across the crossover has nothing to jump over.

| panel | vertical | horizontal |
| --- | --- | --- |
| 1440x900 desktop | 76º (the scene's) | 104º |
| 768x1024 tablet | 104º | 88º |
| 375x812 phone | 104º | 60º |
| 375x812 phone, before | 76º | **41º** |

`PITCH_LIMIT` is **not** tightened on a tall panel, though an early pass did
tighten it. Each cover's pitch is where whoever built the tour centred the shot;
a wider vertical angle opens up symmetrically around that centre, so keeping it
keeps their composition. Clamping towards the horizon instead quietly re-framed
Biotique, whose whole subject is the clad volume above eye level.

`src/style.css`: `--scrim-near` .52, `--scrim-far` .18, `--scrim-foot` .72.
Light sideways so the room still reads, and weighted at the foot, because that is
where all the small type lives. Picked by compositing the darkest scene
(Biotique, luma 97) against the brightest (Alpha One, 157) with the type mocked
in place — a single sideways value bright enough for one washes out the other.
The headline and the reel also carry a `text-shadow`, which buys the last of the
contrast more cheaply than darkening the tour further.

## The 360 viewer

The gallery cards in section 03 open the tour on the page: a full-screen overlay
you drag to look around, with the tour's other rooms in a strip along the bottom
and, where the tour has them, its doorways placed in the panorama itself.
`src/tour/viewer.ts`, `src/tour/viewer.css`.

**Nothing of it loads until someone opens a tour.** three.js, the viewer, its
stylesheet and a manifest of thirty scenes are all behind one dynamic import,
warmed on `pointerenter`/`focus` so the click opens rather than waits. The chunk
is 14KB gzipped on top of the three.js the hero already pulls.

| chunk | | |
| --- | --- | --- |
| `three` | 470KB | 118KB gzip — shared with the hero |
| `viewer` | 31KB | 14KB gzip, manifest included |
| `viewer.css` | 4.4KB | 1.4KB gzip |

**Two renderers, one convention.** The hero turns two *spheres* slowly and
cross-fades between tours; the viewer turns the *camera*, because one camera can
carry the visitor's heading across a scene change. Both centre the same texture
column — `src/projection.ts` derives why, and `npm run verify:tour` proves it by
raycasting a real three.js sphere rather than by re-deriving the maths. It also
checks all 20 hotspot markers project to the centre of frame when faced, and
behind the camera from the opposite side.

**Assets.** `npm run scenes` exports every scene of every published tour to
`public/tours/<slug>/`: 4096 wide (what the Lesco Viewer itself serves for a tour
you explore), a 2048 variant for narrow viewports and `Save-Data`, a reprojected
thumbnail for the strip, and a ~250-byte inline placeholder. 30 scenes, 13.3MB,
none of it fetched until you walk into the room. The manifest is
`src/tour/scenes.json`; its paths are rebased at runtime like the hero's.

**Where a tour opens.** On the cover scene — the same frame the gallery card
shows, clamped to the card's own 0.18 pitch so the door and the room agree. Every
other scene keeps the framing its author composed in the viewer, guarded at
0.5rad. Check any of it with `node tools/preview-tour.mjs [slug] [scene]`, which
reprojects on the CPU and writes a contact sheet to `./preview-tours.png`.

**Moving between rooms.** A doorway keeps your heading — you walked through it.
A jump from the strip lands on that scene's own framing instead. Only Biotique
has doorways (20 of them); the other three were built as a set of rooms with no
graph between them, which is why the strip, not the hotspots, is the primary way
around.

**Knobs.** `FOV_MIN`/`FOV_MAX` 32/100, `PITCH_LIMIT` 85º, `FADE` 0.5s, `DAMPING`
5.5 (inertia falls to 1/e in 180ms), `DRAG_SLOP` 6px, `KEY_STEP` 0.08rad.
A drag moves the room by the distance the finger travels — `rad(fov) / height`
per pixel — so zooming in slows the turn to match.

**Behaviour.** Esc and the browser's back gesture both close it (the overlay
pushes one history entry and unwinds only its own). `.page` and `.body-wrap` go
`inert` while it is up, Tab is trapped inside, focus returns to the card that
opened it, and the hero's renderer is paused — two WebGL contexts drawing at once
is a real cost on a phone for a picture nobody can see. Nothing animates on its
own: a settled view draws one frame and stops.

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
| headline baseline | 504.0 | 504.01 |
| "Imersive" advance | 175.8 | 175.90 |
| boot block offsets | card 2.1 / 99.3 | exact |

The boot screen's right-hand column has no counterpart on the sheet, so it is
verified against itself instead — every figure block-relative, and every one of
them a consequence of the two rules in *The two screens* rather than a number
chosen on its own:

| | intent | measured |
| --- | --- | --- |
| readout baselines | last one on the card's foot, 334.29 | ±0.2 |
| icon ink | starts at the sheet's 98.85 | 98.85 |
| icon gaps | four equal ones, the last to the readouts' cap-line | 26.82 ×3, 27.46 |
| icons and readouts | one left edge | 175.40 / 175.40 |
| wordmark | the card's own top and foot | 99.30 … 334.30 |
| wordmark right edge | the readouts' right edge, 284.6 | 284.58 |

Both `?boot` and the DOM probes above are how to re-check this after a change:
the numbers in `src/style.css` are line-box tops and viewBox corners, and none
of them is the thing that has to be true.

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

**The cards open the tour.** They ship as plain blocks and `main.ts` upgrades
each one to a `<button>`, so a page whose script never ran shows a gallery rather
than four controls that do nothing. See *The 360 viewer* below. `tours.lesco.com.br`
is still unpublished — the viewer's `config.js` leaves `URL_BASE` blank — and
nothing on the page waits for it any more.

**Two type/layout adjustments** forced by the different font metrics and worth
knowing about:

- `.h2--lead` is `19ch`, not the handoff's `16ch`. At 16ch PP Supply Mono reflows
  the second line and drops "360º" to a third, breaking the authored `<br>`.

**Removed from the handoff: the gallery's "Ver todos no WhatsApp" ghost button.**
The tours are entered on the page now, so a link sending people to a chat to see
them would have been sending them away from them. Its `.ghost` rules went with
it; nothing else used them.

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

One source: `src/hero/contact.ts`. The hero's WhatsApp mark and the final CTA
both resolve through `whatsappHref()`, and the displayed `(47) 99920-1576` is
derived from the same digits rather than typed twice.

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
  order** are extensions — the print has no counterpart for any of them. On a
  phone the logo and the WhatsApp mark now share a row, logo left and mark
  right, which is the print's own arrangement; they were stacked before, where
  the mark read as a second brand element rather than a control. The row is
  `.layout__head`, which is `display: contents` on desktop so both children
  keep their measured positions on the 1:1 grid.
- **The mobile framing** is the same kind of extension and is the one with real
  numbers attached: `H_SWEEP` and `FOV_MAX_TALL` under Knobs, above.
- The tours are named client work (Setin, Lavvi, Construcompany). Portfolio use,
  but worth a conscious decision before the page is public — and a larger one
  now: the page no longer shows a frame of each tour, it hands over all 30
  scenes of all four. `ORDER` in `tools/tours-config.mjs` is where a tour would
  be dropped from the set.
- **The "Explorar" chip on each card** is mine, not the handoff's — a persistent
  10px mono label bottom-right of the frame, coral on hover, mirroring the
  existing `360º` badge. It is there because a card that opens something has to
  say so on a touch screen too, where there is no hover to reveal it.
- **The hero has no way in.** Its background is a real tour and the reel already
  names which one, but the only control there is the WhatsApp mark, trimmed to
  one CTA on purpose. Adding "explorar este tour" to the reel is a composition
  change and was left alone.
- **The viewer's chrome** — the top bar, the scene strip, the doorway markers,
  their pulse — has no counterpart in the brand book or the handoff. It is built
  from the same tokens and house rules as everything else, but it is new design
  and should be looked at as such.
- Fonts: Archivo comes from Google Fonts at runtime. Self-hosting it alongside
  PP Supply Mono would remove the third-party request.
