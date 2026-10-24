import DOMPurify from 'dompurify';

// Post HTML is stored as sent, so anything rendered from it in the admin goes
// through here first. Iframes stay because Quill's video embeds are iframes;
// DOMPurify still drops event handlers and javascript: URLs on them.
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allowfullscreen', 'frameborder'],
    FORBID_TAGS: ['script', 'style', 'object', 'embed', 'link', 'base', 'form'],
    FORBID_ATTR: ['formaction'],
  });
}
