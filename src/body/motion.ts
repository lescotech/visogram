/**
 * Reveal-on-scroll and parallax for the page body.
 *
 * Two rules from the handoff drive the shape of this:
 *
 * 1. The page must never be blank if the script fails. So the hidden state is
 *    added *by JS* — no `opacity: 0` in the stylesheet waiting for a class that
 *    might never arrive — and a 1.6s timer reveals anything still hidden that is
 *    already in view, in case the observer never fires.
 * 2. Parallax is one rAF loop, scheduled from a passive scroll listener behind a
 *    ticking flag, and switched off entirely under prefers-reduced-motion.
 */

/** Handoff intensities; "Marcante" is the design's default. */
const INTENSITY = { sutil: 0.45, medio: 0.8, marcante: 1.25 } as const;

export type ParallaxIntensity = keyof typeof INTENSITY;

export interface MotionOptions {
  intensity?: ParallaxIntensity;
}

interface Layer {
  el: HTMLElement;
  speed: number;
  /** Layers centred with translate(-50%,-50%) must keep it. */
  centered: boolean;
}

export function startMotion(root: ParentNode, options: MotionOptions = {}) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const intensity = INTENSITY[options.intensity ?? 'marcante'];

  // ------------------------------------------------------------------ reveal

  const reveals = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
  const pending = new Set<HTMLElement>();

  const show = (el: HTMLElement) => {
    el.classList.remove('is-hidden');
    pending.delete(el);
  };

  if (!reduced) {
    reveals.forEach((el, i) => {
      el.classList.add('is-hidden');
      // Items of the same four-column grid cascade rather than land together.
      const delay = `${(i % 4) * 70}ms`;
      el.style.transitionDelay = `${delay}, ${delay}`;
      pending.add(el);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        }
      },
      // Matches the prototype's `rect.top < innerHeight * 0.92`.
      { rootMargin: '0px 0px -8% 0px' },
    );
    for (const el of reveals) observer.observe(el);

    // The safety net the handoff calls non-negotiable.
    window.setTimeout(() => {
      for (const el of [...pending]) {
        if (el.getBoundingClientRect().top < window.innerHeight) show(el);
      }
    }, 1600);
  }

  // ---------------------------------------------------------------- parallax

  const layers: Layer[] = Array.from(
    root.querySelectorAll<HTMLElement>('[data-par]'),
  ).map((el) => ({
    el,
    speed: Number.parseFloat(el.dataset.par ?? '0') || 0,
    centered: el.hasAttribute('data-centered'),
  }));
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-tilt]'));

  // Under reduced motion nothing is hidden and nothing moves, so there is no
  // loop to run.
  if (reduced) return () => {};

  let ticking = false;

  const frame = () => {
    ticking = false;
    const vh = window.innerHeight;

    // Phones get 40% of the movement: the same offset reads as jitter on a
    // short viewport, and costs more there.
    const k = intensity * (window.innerWidth < 760 ? 0.4 : 1);

    for (const layer of layers) {
      const r = layer.el.getBoundingClientRect();
      const d = (r.top + r.height / 2 - vh / 2) / vh;
      const y = -d * 120 * layer.speed * k;
      layer.el.style.transform =
        (layer.centered ? 'translate(-50%,-50%) ' : '') +
        `translate3d(0,${y.toFixed(1)}px,0) rotate(${(y * 0.02).toFixed(2)}deg)`;
    }

    for (const card of cards) {
      const r = card.getBoundingClientRect();
      const d = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
      card.style.transform = `translate3d(0,${(-d * 16 * k).toFixed(1)}px,0)`;
    }
  };

  /**
   * Sweep the reveal queue. Deliberately *not* inside the rAF frame: animation
   * frames are paused for a hidden document, so a page scrolled while
   * backgrounded — or living in an embedded preview, which is where the handoff
   * saw the observer stay silent — would never reveal anything. This runs on the
   * scroll event itself, and the queue empties to nothing, so it costs nothing
   * for the rest of the session.
   */
  const sweep = () => {
    if (!pending.size) return;
    const limit = window.innerHeight * 0.92;
    for (const el of [...pending]) {
      if (el.getBoundingClientRect().top < limit) show(el);
    }
  };

  const onScroll = () => {
    sweep();
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  window.addEventListener('load', onScroll);
  sweep();
  frame();
  requestAnimationFrame(frame);

  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    window.removeEventListener('load', onScroll);
  };
}
