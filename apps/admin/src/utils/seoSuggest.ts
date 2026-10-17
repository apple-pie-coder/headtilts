import type { ArticleType, QnaSession, Review } from '../types';
import { META_DESCRIPTION_RANGE, SEO_TITLE_RANGE } from './seoAnalysis';

/**
 * SEO suggestions derived from what the editor already wrote: title, text and
 * the post type's details. Used for one-click "Fill from content" and for the
 * inline suggestions under each SEO field. Pure and synchronous.
 */

export interface SeoSuggestInput {
  title: string;
  contentHtml: string;
  excerpt: string;
  articleType: ArticleType;
  review: Review | null;
  qna: QnaSession | null;
  siteTitle: string;
  existingTags: string[];
}

export interface SeoSuggestions {
  focusKeyword: string | null;
  keywordOptions: string[];
  /** Only offered when the default title would be cut off or misses the keyword. */
  metaTitle: string | null;
  metaDescription: string | null;
  excerpt: string | null;
  tags: string[];
}

const STOP = new Set(('a an and are as at be but by for from has have he her his i in into is it its of on or our she so that the their them they this to was we were what when where which who will with you your about after all also any been before being can could did do does just more most new not now one only other out over said some than then there these those through up very would latest first').split(' '));

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const lower = (s: string) => s.toLowerCase();

function textOf(html: string): { text: string; paragraphs: string[] } {
  const doc = new DOMParser().parseFromString(html.replace(/\[poll[^\]]*\]/gi, ''), 'text/html');
  const paragraphs = [...doc.body.querySelectorAll('p, li')].map((p) => clean(p.textContent ?? '')).filter((p) => p.split(' ').length > 3);
  return { text: clean(doc.body.textContent ?? ''), paragraphs };
}

const sentences = (s: string) => s.split(/(?<=[.!?…])\s+(?=[\p{Lu}"“‘(\d])/u).map(clean).filter(Boolean);

/** Cut on a word boundary and add an ellipsis when shortened. */
function fit(s: string, max: number): string {
  const t = clean(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 20)).replace(/[,;:–—-]+$/, '')}…`;
}

const count = (hay: string, needle: string) => {
  if (!needle) return 0;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'giu');
  return hay.match(re)?.length ?? 0;
};

/**
 * Names in a title: runs of Capitalised or ALL-CAPS words ("Gojira",
 * "ZYGNEMA", "Krishanu Bora"), skipping a leading section label like "INTERVIEW:".
 */
function entities(title: string): string[] {
  const body = title.replace(/^[A-Z][A-Z ]{2,20}:\s*/, '');
  const words = body.split(/\s+/);
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => { if (run.length) out.push(run.join(' ')); run = []; };
  words.forEach((raw, i) => {
    const w = raw.replace(/^[“"'‘(]+|[”"'’),.:;!?]+$/g, '');
    const isName = /^[\p{Lu}][\p{L}\p{N}.'’&-]*$/u.test(w) && !(i === 0 && STOP.has(lower(w))) && !STOP.has(lower(w));
    if (isName && w.length > 1) run.push(w); else flush();
  });
  flush();
  return [...new Set(out)];
}

function topicBigram(title: string, text: string): string | null {
  const words = lower(title).replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  let best: { p: string; n: number } | null = null;
  for (let i = 0; i < words.length - 1; i++) {
    const p = `${words[i]} ${words[i + 1]}`;
    const n = count(lower(text), p);
    if (n > 0 && (!best || n > best.n)) best = { p, n };
  }
  return best?.p ?? null;
}

export function suggestSeo(input: SeoSuggestInput): SeoSuggestions {
  const { text, paragraphs } = textOf(input.contentHtml);
  const r = input.articleType === 'review' ? input.review : null;
  const q = input.articleType === 'qna' ? input.qna : null;
  const title = clean(input.title);

  // ── Focus keyword ──
  const options: string[] = [];
  if (r?.artist && r.subjectTitle) {
    options.push(`${r.artist} ${r.subjectTitle} review`, `${r.subjectTitle} review`, `${r.artist} new ${r.subjectType === 'single' ? 'single' : r.subjectType === 'ep' ? 'EP' : 'album'}`);
  } else if (q?.subject) {
    options.push(`${q.subject} Q&A`, `${q.subject} interview`);
  } else if (title) {
    const names = entities(title).map((e) => ({ e, n: count(text, e) + 1 })).sort((a, b) => b.n - a.n);
    const topic = topicBigram(title, text);
    if (names[0] && topic && !lower(topic).includes(lower(names[0].e))) options.push(`${names[0].e} ${topic}`);
    names.slice(0, 2).forEach(({ e }) => options.push(e));
    if (topic) options.push(topic);
  }
  const keywordOptions = [...new Set(options.map(clean))].slice(0, 4);
  const focusKeyword = keywordOptions[0] ?? null;

  // ── SEO title: only when the default would be cut or misses the keyword ──
  const defaultTitle = `${title}${input.siteTitle ? ` — ${input.siteTitle}` : ''}`;
  let metaTitle: string | null = null;
  if (r?.artist && r.subjectTitle) {
    const base = `${r.artist} — ${r.subjectTitle} review`;
    metaTitle = r.rating != null && base.length + 8 <= SEO_TITLE_RANGE[1] ? `${base} (${r.rating}/10)` : fit(base, SEO_TITLE_RANGE[1]);
  } else if (q?.subject) {
    metaTitle = fit(`${q.subject} answer your questions${q.host ? ` — ${q.host}` : ''}`, SEO_TITLE_RANGE[1]);
    if (q.subjectType !== 'band') metaTitle = fit(`${q.subject} answers your questions${q.host ? ` — ${q.host}` : ''}`, SEO_TITLE_RANGE[1]);
  } else if (title && (defaultTitle.length > SEO_TITLE_RANGE[1] || (focusKeyword && !count(defaultTitle, focusKeyword)))) {
    // Drop a shouty section prefix ("INTERVIEW: …") and fit the rest.
    metaTitle = fit(title.replace(/^[A-Z][A-Z ]{2,20}:\s*/, ''), SEO_TITLE_RANGE[1]);
  }

  // ── Meta description ──
  let metaDescription: string | null = null;
  if (r && (r.verdict || r.artist)) {
    const lead = r.verdict ? clean(r.verdict) : `Our review of ${r.artist}’s ${r.subjectTitle}.`;
    const tail = [r.rating != null ? `Rated ${r.rating}/10.` : '', r.highlights?.length ? `Standout: ${r.highlights.slice(0, 2).join(', ')}.` : ''].filter(Boolean).join(' ');
    metaDescription = fit(`${lead}${/[.!?]$/.test(lead) ? '' : '.'} ${tail}`.trim(), META_DESCRIPTION_RANGE[1]);
  } else if (q?.subject && q.items.length) {
    const first = q.items.find((i) => i.question.trim())?.question.trim();
    metaDescription = fit(`${q.subject} answered ${q.items.length} question${q.items.length === 1 ? '' : 's'}${q.host ? ` in a ${q.host}` : ''}${first ? `, including: “${clean(first)}”` : '.'}`, META_DESCRIPTION_RANGE[1]);
  } else {
    // Prefer the opening sentences that mention the keyword; otherwise the lead.
    const lead = sentences(paragraphs.slice(0, 3).join(' '));
    const withKw = focusKeyword ? lead.filter((s) => count(s, focusKeyword) || count(s, focusKeyword.split(' ')[0])) : [];
    const pool = withKw.length ? withKw : lead;
    let desc = '';
    for (const s of pool) {
      if ((desc + ' ' + s).trim().length > META_DESCRIPTION_RANGE[1]) break;
      desc = `${desc} ${s}`.trim();
    }
    metaDescription = desc.length >= 60 ? desc : pool[0] ? fit(pool[0], META_DESCRIPTION_RANGE[1]) : input.excerpt ? fit(input.excerpt, META_DESCRIPTION_RANGE[1]) : null;
  }

  // ── Excerpt ──
  const excerpt = paragraphs[0] ? fit(paragraphs[0], 280) : r?.verdict ? clean(r.verdict) : null;

  // ── Tags: the artist plus names that recur in the text ──
  const have = new Set(input.existingTags.map(lower));
  const tagSet: string[] = [];
  const push = (t: string | null | undefined) => {
    const v = t ? clean(t) : '';
    if (v && v.length <= 40 && !have.has(lower(v)) && !tagSet.some((x) => lower(x) === lower(v))) tagSet.push(v);
  };
  if (r) { push(r.artist); push(r.genre); }
  if (q) push(q.subject);
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/\b([\p{Lu}][\p{L}'’&-]+(?:\s+[\p{Lu}][\p{L}'’&-]+){0,2})\b/gu)) {
    const name = m[1];
    if (STOP.has(lower(name)) || name.length < 3) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([n]) => push(n));
  entities(title).forEach(push);

  return { focusKeyword, keywordOptions, metaTitle, metaDescription, excerpt, tags: tagSet.slice(0, 6) };
}
