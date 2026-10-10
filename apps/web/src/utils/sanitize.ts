import DOMPurify from 'dompurify';

const MAP_EMBED_PREFIXES = ['https://www.google.com/maps/embed', 'https://maps.google.com/maps?'];

// Only a Google Maps iframe survives; everything else in the embed is dropped.
export function sanitizeMapEmbed(html: string): string {
  const frame = new DOMParser().parseFromString(html, 'text/html').querySelector('iframe');
  const src = frame?.getAttribute('src') ?? '';
  if (!MAP_EMBED_PREFIXES.some((p) => src.startsWith(p))) return '';
  const clean = document.createElement('iframe');
  clean.src = src;
  clean.width = '100%';
  clean.height = frame?.getAttribute('height')?.match(/^\d{2,4}$/)?.[0] ?? '350';
  clean.style.border = '0';
  clean.loading = 'lazy';
  clean.referrerPolicy = 'no-referrer-when-downgrade';
  clean.allowFullscreen = true;
  return clean.outerHTML;
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'base'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
                  'onchange', 'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress', 'formaction'],
  });
}
