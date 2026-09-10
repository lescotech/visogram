/**
 * Single-open accordion for section 05.
 *
 * The markup ships with the first item open and the rest `hidden`, so the FAQ
 * is readable and expandable-by-nothing if the script never runs — and every
 * answer is in the DOM for crawlers either way. The handoff's prototype had no
 * accessibility to port, so the button/region wiring is added here: each
 * question owns `aria-expanded` and points at its answer with `aria-controls`.
 */
export function startFaq(container: Element | null) {
  if (!container) return;

  const items = Array.from(container.querySelectorAll('.faq__item'))
    .map((item) => ({
      button: item.querySelector<HTMLButtonElement>('.faq__q'),
      answer: item.querySelector<HTMLElement>('.faq__a'),
      sign: item.querySelector<HTMLElement>('.faq__sign'),
    }))
    .filter((i): i is { button: HTMLButtonElement; answer: HTMLElement; sign: HTMLElement | null } =>
      Boolean(i.button && i.answer),
    );

  if (!items.length) return;

  const setOpen = (index: number) => {
    items.forEach((item, i) => {
      const open = i === index;
      item.button.setAttribute('aria-expanded', String(open));
      item.answer.hidden = !open;
      if (item.sign) item.sign.textContent = open ? '−' : '+';
    });
  };

  // Whichever item the markup left expanded is the starting state.
  let open = items.findIndex(
    (item) => item.button.getAttribute('aria-expanded') === 'true',
  );
  setOpen(open);

  items.forEach((item, i) => {
    item.button.addEventListener('click', () => {
      // Clicking the open item closes it, leaving nothing expanded.
      open = open === i ? -1 : i;
      setOpen(open);
    });
  });
}
