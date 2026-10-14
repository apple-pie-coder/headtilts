/**
 * The .docx bulk-import format, shared by the template generator and the parser
 * so the two can never drift apart.
 *
 * A document holds any number of posts. Each post is:
 *   1. a "Heading 1" paragraph — the post title
 *   2. (optional) a two-column "Field | Value" table right under the title
 *   3. the body — everything up to the next Heading 1
 * Anything before the first Heading 1 (the instructions) is ignored.
 */

export type FieldKey =
  | 'status' | 'publishDate' | 'categories' | 'tags' | 'author' | 'excerpt'
  | 'slug' | 'featuredImage' | 'featured' | 'metaTitle' | 'metaDescription';

export interface FieldDef {
  key: FieldKey;
  label: string;
  /** What to enter, shown in the template's reference table and the importer help. */
  hint: string;
  /** Other labels people might type, matched case-insensitively. */
  aliases?: string[];
}

export const FIELDS: FieldDef[] = [
  { key: 'status', label: 'Status', hint: 'draft, published or scheduled. Blank = draft.' },
  { key: 'publishDate', label: 'Publish date', hint: 'e.g. 2026-12-01 09:30 (your local time). Scheduled posts: a future date. Published posts: the original date, to keep their place in the archive. Blank = now.', aliases: ['date', 'schedule', 'scheduled for', 'publish on', 'published on'] },
  { key: 'categories', label: 'Categories', hint: 'Category names, separated by commas.', aliases: ['category'] },
  { key: 'tags', label: 'Tags', hint: 'Tag names, separated by commas. New tags are created automatically.', aliases: ['tag', 'keywords'] },
  { key: 'author', label: 'Author', hint: 'Username or full name of the author. Blank = you.' },
  { key: 'excerpt', label: 'Excerpt', hint: 'Short summary shown in post lists.', aliases: ['summary'] },
  { key: 'slug', label: 'Slug', hint: 'URL part, e.g. my-first-post. Blank = made from the title.', aliases: ['url', 'permalink'] },
  { key: 'featuredImage', label: 'Featured image', hint: 'Paste an image into the cell, or an image URL.', aliases: ['image', 'cover', 'cover image', 'thumbnail'] },
  { key: 'featured', label: 'Featured', hint: 'yes or no. Featured posts are highlighted on the site.', aliases: ['is featured', 'pin', 'pinned'] },
  { key: 'metaTitle', label: 'SEO title', hint: 'Title for search engines. Blank = post title.', aliases: ['meta title'] },
  { key: 'metaDescription', label: 'SEO description', hint: 'One or two sentences for search results.', aliases: ['meta description', 'description'] },
];

const LABEL_INDEX = new Map<string, FieldKey>();
for (const f of FIELDS) {
  for (const name of [f.label, f.key, ...(f.aliases ?? [])]) LABEL_INDEX.set(normalizeLabel(name), f.key);
}

function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[:*]/g, '').replace(/\s+/g, ' ').trim();
}

export function fieldForLabel(label: string): FieldKey | undefined {
  return LABEL_INDEX.get(normalizeLabel(label));
}

/** Example posts in the template; the importer leaves these unticked. */
export const EXAMPLE_POSTS = {
  welcome: 'Welcome to our new website',
  scheduled: 'Five things to look forward to this season',
} as const;
export const EXAMPLE_TITLES = new Set<string>(Object.values(EXAMPLE_POSTS).map((t) => t.toLowerCase()));

export const TEMPLATE_FILENAME = 'headtilts-post-import-template.docx';

/* ── Value helpers ─────────────────────────────────────────── */

export type ImportStatus = 'draft' | 'published' | 'scheduled';

export function parseStatus(raw: string): ImportStatus | null | undefined {
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  if (['draft', 'drafts', 'unpublished'].includes(v)) return 'draft';
  if (['published', 'publish', 'live', 'public'].includes(v)) return 'published';
  if (['scheduled', 'schedule', 'later', 'future'].includes(v)) return 'scheduled';
  return null;
}

export function parseYesNo(raw: string): boolean | null | undefined {
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  if (['yes', 'y', 'true', '1', 'on', 'featured'].includes(v)) return true;
  if (['no', 'n', 'false', '0', 'off'].includes(v)) return false;
  return null;
}

export function splitList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;|\n]/)) {
    const v = part.trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}

/**
 * Parse a publish date typed into Word. Accepts ISO-style dates
 * ("2026-12-01", "2026-12-01 09:30", "2026-12-01T09:30") as local time,
 * falling back to the browser's own parser for anything else.
 */
export function parseDate(raw: string): Date | null {
  const v = raw.trim();
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) {
    const [, y, mo, d, h = '9', mi = '0'] = m;
    const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(v);
  return Number.isNaN(date.getTime()) ? null : date;
}
