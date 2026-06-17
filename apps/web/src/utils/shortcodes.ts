import { formatDate } from './date';

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export interface ShortcodeContext {
  siteName?: string;
  siteTagline?: string;
  siteDescription?: string;
  siteUrl?: string;
  dateFormat?: string;
  timezone?: string;
  post?: {
    title?: string;
    authorName?: string;
    publishedAt?: string | null;
    excerpt?: string | null;
  };
}

type Handler = (attrs: Record<string, string>, ctx: ShortcodeContext) => string;

const HANDLERS: Record<string, Handler> = {
  site_name:        (_, ctx) => escHtml(ctx.siteName ?? ''),
  site_tagline:     (_, ctx) => escHtml(ctx.siteTagline ?? ''),
  site_description: (_, ctx) => escHtml(ctx.siteDescription ?? ''),
  site_url:         (_, ctx) => escHtml(ctx.siteUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')),

  year:         () => String(new Date().getFullYear()),
  current_date: (attrs, ctx) =>
    escHtml(formatDate(new Date().toISOString(), attrs.format ?? ctx.dateFormat ?? 'F j, Y', ctx.timezone)),

  post_title:   (_, ctx) => escHtml(ctx.post?.title ?? ''),
  post_author:  (_, ctx) => escHtml(ctx.post?.authorName ?? ''),
  post_date: (attrs, ctx) => {
    const iso = ctx.post?.publishedAt;
    if (!iso) return '';
    return escHtml(formatDate(iso, attrs.format ?? ctx.dateFormat ?? 'F j, Y', ctx.timezone));
  },
  post_excerpt: (_, ctx) => escHtml(ctx.post?.excerpt ?? ''),
};

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/** Replace all recognised `[shortcode attr="…"]` tokens in an HTML string. */
export function resolveShortcodes(html: string, ctx: ShortcodeContext): string {
  if (!html) return html;
  return html.replace(
    /\[([a-z_]+)((?:\s+\w+\s*=\s*(?:"[^"]*"|'[^']*'|\S+))*)\s*\]/gi,
    (match, tag: string, attrsRaw: string) => {
      const handler = HANDLERS[tag.toLowerCase()];
      return handler ? handler(parseAttrs(attrsRaw ?? ''), ctx) : match;
    },
  );
}
