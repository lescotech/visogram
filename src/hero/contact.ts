/**
 * Where the page's calls to action point.
 *
 * The number and the message come from the design handoff, which is where they
 * were finally confirmed. Everything on the page that converts — the hero's
 * WhatsApp mark, the gallery's ghost button, the final CTA — resolves through
 * here, so there is one place to change it.
 */
export interface Contact {
  /** Local digits, no country code: '47999201576'. */
  whatsapp: string;
  /** Prepended to the digits for the wa.me link. */
  countryCode: string;
  /** Pre-filled into WhatsApp. Client-reviewed copy — do not rewrite. */
  message: string;
  instagram: string;
}

export const CONTACT: Contact = {
  whatsapp: '47999201576',
  countryCode: '55',
  message: 'Olá! Quero um orçamento de tour virtual 360º.',
  instagram: 'https://instagram.com/visogram.tours',
};

const digits = (contact: Contact) => contact.whatsapp.replace(/\D/g, '');

/** `https://wa.me/5547999201576?text=…` */
export function whatsappHref(contact: Contact = CONTACT): string | null {
  const d = digits(contact);
  if (!d) return null;
  return `https://wa.me/${contact.countryCode}${d}?text=${encodeURIComponent(
    contact.message,
  )}`;
}

/** `(47) 99920-1576`, derived from the same digits rather than typed twice. */
export function phoneLabel(contact: Contact = CONTACT): string {
  const d = digits(contact);
  if (d.length < 10) return d;
  return `(${d.slice(0, 2)}) ${d.slice(2, -4)}-${d.slice(-4)}`;
}
