import './style.css';
import './body.css';

import logoSvg from './assets/inline/logo.svg?raw';
import iconsSvg from './assets/inline/icones.svg?raw';
import illustrationSvg from './assets/inline/ilustracao.svg?raw';
import backgroundSvg from './assets/inline/elemento-fundo.svg?raw';
import whatsappSvg from './assets/whatsapp.svg?raw';

import iconPanoramica from './assets/inline/icon-panoramica.svg?raw';
import iconPercepcao from './assets/inline/icon-percepcao.svg?raw';
import iconMapeamento from './assets/inline/icon-mapeamento.svg?raw';
import iconEcossistema from './assets/inline/icon-ecossistema.svg?raw';

import { CONTACT, whatsappHref, phoneLabel } from './hero/contact';
import { TOURS, describe } from './hero/tours';
import { startMotion } from './body/motion';
import { startFaq } from './body/faq';
import type { Panorama } from './hero/panorama';

/**
 * The boot sequence in style.css settles at 1.91s; holding to 2.5s lets it
 * complete and gives it a beat before the hero, instead of cutting it off.
 */
const LOADER_MIN = 2500;
/** Above this we stop waiting, whatever is still in flight, ms. */
const LOADER_MAX = 7000;

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const settle = (p: Promise<unknown>) => p.then(() => {}).catch(() => {});

const inject = (selector: string, svg: string) => {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    el.innerHTML = svg;
  }
};

inject('[data-logo]', logoSvg);
inject('[data-icons]', iconsSvg);
inject('[data-illustration]', illustrationSvg);
inject('[data-whatsapp]', whatsappSvg);
inject('[data-bg]', backgroundSvg);

for (const [role, svg] of [
  ['panoramica', iconPanoramica],
  ['percepcao', iconPercepcao],
  ['mapeamento', iconMapeamento],
  ['ecossistema', iconEcossistema],
] as const) {
  inject(`[data-icon="${role}"]`, svg);
}

// ------------------------------------------------------------ calls to action

/** Every converting element on the page resolves through one href. */
function wireCta(id: string, href: string | null) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLAnchorElement)) return false;
  if (!href) {
    el.dataset.unconfigured = '';
    el.setAttribute('aria-disabled', 'true');
    el.addEventListener('click', (event) => event.preventDefault());
    return false;
  }
  el.href = href;
  el.target = '_blank';
  el.rel = 'noopener noreferrer';
  return true;
}

const wa = whatsappHref(CONTACT);
const wired = ['cta-quote', 'cta-gallery', 'cta-primary'].map((id) => wireCta(id, wa));
if (wired.some((ok) => !ok)) {
  console.warn('[visogram] a CTA could not be wired — check src/hero/contact.ts');
}

const phoneEl = document.getElementById('cta-phone');
if (phoneEl) phoneEl.textContent = phoneLabel(CONTACT);

// -------------------------------------------------- the tour reel and its dots

const obraEl = document.getElementById('tour-obra');
const whereEl = document.getElementById('tour-where');
const dotsEl = document.getElementById('tour-dots');

let panorama: Panorama | null = null;

const dots = TOURS.map((tour, i) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', `Ver ${tour.obra}`);
  button.addEventListener('click', () => panorama?.go(i));
  const item = document.createElement('li');
  item.append(button);
  dotsEl?.append(item);
  return button;
});

function showSlide(index: number) {
  const tour = TOURS[index];
  if (!tour) return;
  if (obraEl) obraEl.textContent = tour.obra;
  if (whereEl) whereEl.textContent = describe(tour);
  dots.forEach((dot, i) => {
    dot.setAttribute('aria-current', String(i === index));
  });
}

// Fill the caption from the manifest straight away, so the reel reads correctly
// even if WebGL never starts.
showSlide(0);

// ------------------------------------------------------------- gallery cards

/**
 * The cards ship as plain blocks and become links only once a tour has a
 * published URL. Nothing is published yet — the viewer's config.js names
 * tours.lesco.com.br but leaves URL_BASE blank — so today they all stay inert
 * rather than pretending to be clickable.
 */
for (const card of document.querySelectorAll<HTMLElement>('.tour[data-slug]')) {
  const tour = TOURS.find((t) => t.slug === card.dataset.slug);
  if (!tour?.url) continue;
  const link = document.createElement('a');
  link.className = card.className;
  link.href = tour.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  for (const attr of ['data-reveal', 'data-tilt', 'data-slug'] as const) {
    if (card.hasAttribute(attr)) link.setAttribute(attr, card.getAttribute(attr) ?? '');
  }
  link.setAttribute('aria-label', `Abrir o tour ${tour.obra} em nova aba`);
  link.innerHTML = card.innerHTML;
  card.replaceWith(link);
}

// ------------------------------------------------------- body behaviour

startFaq(document.getElementById('faq'));
const stopMotion = startMotion(document, { intensity: 'marcante' });
void stopMotion;

// ------------------------------------------------------------------- the tour

const panel = document.getElementById('panel');
const canvas = document.getElementById('tour');

/** Resolves when the hero has something real behind the scrim, or gives up. */
const heroReady: Promise<void> = (async () => {
  if (!panel || !(canvas instanceof HTMLCanvasElement) || !TOURS.length) return;
  try {
    const { createPanorama } = await import('./hero/panorama');
    panorama = createPanorama(canvas, panel);
    panorama.onSlide((_tour, index) => showSlide(index));
    await panorama.ready;
    // The canvas fades up only once there is something drawn in it.
    canvas.dataset.ready = '';
  } catch (error) {
    // No WebGL, or a chunk that failed to load. The navy panel and the scrim
    // are a complete design on their own, so there is nothing to fall back to.
    console.warn('[visogram] tour background unavailable', error);
  }
})();

// ----------------------------------------------------------------- the loader

/**
 * The loader waits on the work that actually matters — the webfonts and the
 * first panorama decoding — rather than on a fixed timer. A floor keeps a warm
 * cache from flashing it for 40ms; a ceiling keeps a slow connection from
 * holding the page hostage behind it.
 */
void (async () => {
  const loader = document.getElementById('loader');
  if (!loader) return;

  const fonts = document.fonts ? settle(document.fonts.ready) : Promise.resolve();

  await Promise.all([
    wait(LOADER_MIN),
    Promise.race([Promise.all([fonts, settle(heroReady)]), wait(LOADER_MAX)]),
  ]);

  loader.dataset.done = '';
  const drop = () => loader.remove();
  loader.addEventListener('transitionend', drop, { once: true });
  // Belt and braces: if the transition never fires (reduced motion, a display
  // change mid-fade), the overlay must still leave the accessibility tree.
  window.setTimeout(drop, 1200);
})();
