import type { ArticleType, QnaSession, Review } from '../types';

/**
 * Live, in-browser SEO analysis for the post editor. Pure function of the
 * editor's fields, so it can run on every keystroke (debounced by the caller).
 *
 * Each check has a weight; good = full weight, improve = half, problem = none.
 * The score is the weighted share, 0–100.
 */

export type CheckStatus = 'good' | 'improve' | 'problem';
export type CheckGroup = 'basics' | 'content' | 'readability' | 'type';
/** Which editor field fixes this check, so the panel can jump to it. */
export type CheckTarget = 'keyword' | 'seoTitle' | 'metaDescription' | 'slug' | 'content' | 'featuredImage' | 'review' | 'qna' | 'categories';

export interface SeoCheck {
  id: string;
  group: CheckGroup;
  status: CheckStatus;
  title: string;
  hint?: string;
  weight: number;
  target?: CheckTarget;
}

export interface SeoInput {
  title: string;
  slug: string;
  contentHtml: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  focusKeyword: string;
  featuredImage: string;
  articleType: ArticleType;
  review: Review | null;
  qna: QnaSession | null;
  videoUrl: string;
  categoryCount: number;
  tagCount: number;
  siteTitle: string;
  siteOrigin: string;
}

export interface SeoStats {
  words: number;
  sentences: number;
  paragraphs: number;
  avgSentenceWords: number;
  subheadings: number;
  images: number;
  imagesWithoutAlt: number;
  internalLinks: number;
  externalLinks: number;
  keywordCount: number;
  keywordDensity: number;
  readingMinutes: number;
}

export interface SeoResult {
  score: number;
  readability: number | null;
  checks: SeoCheck[];
  stats: SeoStats;
  /** What the search result will actually use. */
  effectiveTitle: string;
  effectiveDescription: string;
}

export const SEO_TITLE_RANGE = [30, 60] as const;
export const META_DESCRIPTION_RANGE = [120, 160] as const;
const MIN_WORDS: Record<ArticleType, [number, number]> = {
  news: [150, 250],
  review: [250, 400],
  article: [300, 600],
  qna: [200, 400],
  // Counts the intro and every update on the live desk.
  live: [300, 600],
};
const TYPE_NOUN: Record<ArticleType, [string, string]> = {
  news: ['news', 'News'], review: ['a review', 'Reviews'], article: ['an article', 'Articles'], qna: ['a Q&A', 'Q&As'], live: ['a live blog', 'Live blogs'],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

function keywordRe(keyword: string): RegExp | null {
  const k = norm(keyword);
  if (!k) return null;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${k.split(' ').map(escapeRe).join('[\\s\\-]+')}(?=$|[^\\p{L}\\p{N}])`, 'giu');
}

const countMatches = (re: RegExp | null, text: string) => (re ? norm(text).match(re)?.length ?? 0 : 0);
const contains = (re: RegExp | null, text: string) => countMatches(re, text) > 0;

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

const words = (text: string) => text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];

function parse(html: string) {
  const doc = new DOMParser().parseFromString(html.replace(/\[poll[^\]]*\]/gi, ''), 'text/html');
  return doc.body;
}

export function analyzeSeo(input: SeoInput): SeoResult {
  const body = parse(input.contentHtml);
  const text = (body.textContent ?? '').replace(/\s+/g, ' ').trim();
  const allWords = words(text);
  const paragraphs = [...body.querySelectorAll('p, li')].map((p) => (p.textContent ?? '').trim()).filter(Boolean);
  const sentences = text.split(/(?<=[.!?…])\s+(?=[\p{Lu}"“‘(\d])/u).map((s) => s.trim()).filter((s) => words(s).length > 0);
  const headings = [...body.querySelectorAll('h2, h3, h4')].map((h) => h.textContent ?? '');
  const images = [...body.querySelectorAll('img')];
  const links = [...body.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') ?? '');
  const isInternal = (href: string) => href.startsWith('/') || href.startsWith('#') || (!!input.siteOrigin && href.startsWith(input.siteOrigin));
  const internalLinks = links.filter(isInternal).length;
  const externalLinks = links.filter((h) => /^https?:\/\//.test(h) && !isInternal(h)).length;

  const effectiveTitle = input.metaTitle.trim() || `${input.title.trim()}${input.siteTitle ? ` — ${input.siteTitle}` : ''}`;
  const effectiveDescription = (input.metaDescription.trim() || input.excerpt.trim()).replace(/\s+/g, ' ');

  const kw = input.focusKeyword.trim();
  const re = keywordRe(kw);
  const keywordCount = countMatches(re, text);
  const kwWords = Math.max(1, words(kw).length);
  const density = allWords.length ? (keywordCount * kwWords * 100) / allWords.length : 0;

  const checks: SeoCheck[] = [];
  const add = (c: SeoCheck) => checks.push(c);

  /* ── Basics ── */
  if (!kw) {
    add({ id: 'keyword', group: 'basics', status: 'problem', weight: 8, target: 'keyword',
      title: 'Set a focus keyword', hint: 'The phrase readers would search to find this post. Most checks measure against it.' });
  } else {
    add({ id: 'keyword', group: 'basics', status: 'good', weight: 8, title: `Focus keyword: “${kw}”` });
  }

  const tLen = effectiveTitle.length;
  add(tLen >= SEO_TITLE_RANGE[0] && tLen <= SEO_TITLE_RANGE[1]
    ? { id: 'titleLength', group: 'basics', status: 'good', weight: 6, title: `SEO title length is good (${tLen} characters)` }
    : { id: 'titleLength', group: 'basics', status: 'improve', weight: 6, target: 'seoTitle',
        title: tLen > SEO_TITLE_RANGE[1] ? `SEO title is long (${tLen} characters)` : `SEO title is short (${tLen} characters)`,
        hint: tLen > SEO_TITLE_RANGE[1] ? `Google cuts titles after about ${SEO_TITLE_RANGE[1]} characters. Lead with the important words.` : `Aim for ${SEO_TITLE_RANGE[0]}–${SEO_TITLE_RANGE[1]} characters so the result stands out.` });

  if (kw) {
    const inTitle = contains(re, effectiveTitle);
    const atStart = inTitle && norm(effectiveTitle).indexOf(norm(kw)) < 15;
    add(inTitle
      ? { id: 'kwTitle', group: 'basics', status: atStart ? 'good' : 'improve', weight: 8, target: 'seoTitle',
          title: atStart ? 'Focus keyword appears early in the SEO title' : 'Focus keyword is in the SEO title',
          hint: atStart ? undefined : 'Moving it towards the start makes the result easier to scan.' }
      : { id: 'kwTitle', group: 'basics', status: 'problem', weight: 8, target: 'seoTitle',
          title: 'Focus keyword is missing from the SEO title', hint: 'Searchers decide from the title — include the phrase they typed.' });
  }

  const dLen = effectiveDescription.length;
  if (!dLen) {
    add({ id: 'metaLength', group: 'basics', status: 'problem', weight: 8, target: 'metaDescription',
      title: 'No meta description', hint: 'Without one, Google picks a random snippet from the page. Write one or two sentences that sell the click.' });
  } else {
    add(dLen >= META_DESCRIPTION_RANGE[0] && dLen <= META_DESCRIPTION_RANGE[1]
      ? { id: 'metaLength', group: 'basics', status: 'good', weight: 8, title: `Meta description length is good (${dLen} characters)` }
      : { id: 'metaLength', group: 'basics', status: 'improve', weight: 8, target: 'metaDescription',
          title: dLen > META_DESCRIPTION_RANGE[1] ? `Meta description is long (${dLen} characters)` : `Meta description is short (${dLen} characters)`,
          hint: `Aim for ${META_DESCRIPTION_RANGE[0]}–${META_DESCRIPTION_RANGE[1]} characters.${!input.metaDescription.trim() ? ' It currently falls back to the excerpt.' : ''}` });
  }

  if (kw) {
    add(contains(re, effectiveDescription)
      ? { id: 'kwMeta', group: 'basics', status: 'good', weight: 5, title: 'Focus keyword is in the meta description' }
      : { id: 'kwMeta', group: 'basics', status: 'improve', weight: 5, target: 'metaDescription',
          title: 'Focus keyword is not in the meta description', hint: 'Google bolds matching words in the snippet, which draws the eye.' });

    const slugWords = input.slug.toLowerCase().split('-');
    const kwSlug = norm(kw).replace(/[^a-z0-9\s]/g, '').split(' ').filter((w) => w.length > 2);
    const inSlug = kwSlug.length > 0 && kwSlug.every((w) => slugWords.some((s) => s.startsWith(w)));
    add(inSlug
      ? { id: 'kwSlug', group: 'basics', status: 'good', weight: 5, title: 'Focus keyword is in the URL' }
      : { id: 'kwSlug', group: 'basics', status: 'improve', weight: 5, target: 'slug',
          title: 'Focus keyword is not in the URL', hint: 'A short, descriptive URL with the keyword helps search engines and people.' });
  }

  if (input.slug.length > 75) {
    add({ id: 'slugLength', group: 'basics', status: 'improve', weight: 2, target: 'slug',
      title: `URL is long (${input.slug.length} characters)`, hint: 'Trim filler words like “a”, “the” and “with”.' });
  }

  /* ── Content ── */
  const [minOk, minGood] = MIN_WORDS[input.articleType];
  const n = allWords.length;
  add(n >= minGood
    ? { id: 'length', group: 'content', status: 'good', weight: 10, title: `${n.toLocaleString()} words — good length for ${TYPE_NOUN[input.articleType][0]}` }
    : { id: 'length', group: 'content', status: n >= minOk ? 'improve' : 'problem', weight: 10, target: 'content',
        title: `${n.toLocaleString()} words — on the short side`,
        hint: `${TYPE_NOUN[input.articleType][1]} usually rank better from about ${minGood} words. Add context, background or detail.` });

  if (kw && n > 0) {
    const first = paragraphs[0] ?? text.slice(0, 600);
    add(contains(re, first)
      ? { id: 'kwIntro', group: 'content', status: 'good', weight: 6, title: 'Focus keyword appears in the first paragraph' }
      : { id: 'kwIntro', group: 'content', status: 'improve', weight: 6, target: 'content',
          title: 'Focus keyword is not in the first paragraph', hint: 'Mention it early so readers and search engines know what the post is about.' });

    const d = Math.round(density * 10) / 10;
    add(keywordCount === 0
      ? { id: 'density', group: 'content', status: 'problem', weight: 6, target: 'content', title: 'Focus keyword never appears in the text' }
      : density > 3
        ? { id: 'density', group: 'content', status: 'problem', weight: 6, target: 'content', title: `Keyword density is high (${d}%)`, hint: 'Repeating the phrase too often reads as spam. Use synonyms.' }
        : density < 0.5 && n > 300
          ? { id: 'density', group: 'content', status: 'improve', weight: 6, target: 'content', title: `Keyword used ${keywordCount}× (${d}%)`, hint: 'Use it a couple more times where it reads naturally.' }
          : { id: 'density', group: 'content', status: 'good', weight: 6, title: `Keyword used ${keywordCount}× (${d}%) — natural` });
  }

  if (n > 300) {
    add(headings.length
      ? { id: 'headings', group: 'content', status: 'good', weight: 4, title: `${headings.length} subheading${headings.length === 1 ? '' : 's'} break up the text` }
      : { id: 'headings', group: 'content', status: 'improve', weight: 4, target: 'content',
          title: 'No subheadings', hint: 'Add H2 headings every 250–350 words so the post is easy to skim.' });
    if (kw && headings.length) {
      add(headings.some((h) => contains(re, h))
        ? { id: 'kwHeading', group: 'content', status: 'good', weight: 3, title: 'Focus keyword is used in a subheading' }
        : { id: 'kwHeading', group: 'content', status: 'improve', weight: 3, target: 'content', title: 'No subheading mentions the focus keyword' });
    }
  }

  add(input.featuredImage
    ? { id: 'featured', group: 'content', status: 'good', weight: 6, title: 'Featured image set' }
    : { id: 'featured', group: 'content', status: 'problem', weight: 6, target: 'featuredImage',
        title: 'No featured image', hint: 'Needed for social cards, Google Discover and rich results. Use at least 1200 px wide.' });

  if (images.length) {
    const missing = images.filter((i) => !(i.getAttribute('alt') ?? '').trim()).length;
    add(missing === 0
      ? { id: 'alt', group: 'content', status: 'good', weight: 3, title: 'All images have alt text' }
      : { id: 'alt', group: 'content', status: 'improve', weight: 3, target: 'content',
          title: `${missing} image${missing === 1 ? '' : 's'} without alt text`, hint: 'Describe each image — it helps image search and screen readers.' });
  }

  add(internalLinks
    ? { id: 'internal', group: 'content', status: 'good', weight: 4, title: `${internalLinks} internal link${internalLinks === 1 ? '' : 's'}` }
    : { id: 'internal', group: 'content', status: 'improve', weight: 4, target: 'content',
        title: 'No links to other posts on this site', hint: 'Link to a related review, band interview or news story to keep readers around.' });

  if (input.articleType !== 'review') {
    add(externalLinks
      ? { id: 'external', group: 'content', status: 'good', weight: 3, title: `${externalLinks} outbound link${externalLinks === 1 ? '' : 's'}` }
      : { id: 'external', group: 'content', status: 'improve', weight: 3, target: 'content',
          title: 'No outbound links', hint: input.articleType === 'news' ? 'Cite the source — label, band statement or press release.' : 'Linking to sources builds trust.' });
  }

  add(input.categoryCount
    ? { id: 'categories', group: 'content', status: 'good', weight: 2, title: 'Category assigned' }
    : { id: 'categories', group: 'content', status: 'improve', weight: 2, target: 'categories', title: 'No category', hint: 'Categories feed the breadcrumb shown in search results.' });

  /* ── Readability ── */
  let readability: number | null = null;
  if (n >= 50 && sentences.length) {
    const syl = allWords.reduce((sum, w) => sum + syllables(w), 0);
    readability = Math.round(Math.max(0, Math.min(100, 206.835 - 1.015 * (n / sentences.length) - 84.6 * (syl / n))));
    add(readability >= 60
      ? { id: 'flesch', group: 'readability', status: 'good', weight: 5, title: `Easy to read (score ${readability})` }
      : { id: 'flesch', group: 'readability', status: readability >= 40 ? 'improve' : 'problem', weight: 5, target: 'content',
          title: `${readability >= 40 ? 'Fairly hard' : 'Hard'} to read (score ${readability})`, hint: 'Use shorter sentences and simpler words. Aim for 60+.' });

    const long = sentences.filter((s) => words(s).length > 25).length;
    const pct = Math.round((long / sentences.length) * 100);
    add(pct <= 25
      ? { id: 'sentences', group: 'readability', status: 'good', weight: 3, title: 'Sentence length is varied and comfortable' }
      : { id: 'sentences', group: 'readability', status: 'improve', weight: 3, target: 'content',
          title: `${pct}% of sentences are over 25 words`, hint: 'Split some long sentences — keep it under a quarter.' });

    const longParas = paragraphs.filter((p) => words(p).length > 150).length;
    add(longParas === 0
      ? { id: 'paragraphs', group: 'readability', status: 'good', weight: 3, title: 'Paragraphs are a comfortable length' }
      : { id: 'paragraphs', group: 'readability', status: 'improve', weight: 3, target: 'content',
          title: `${longParas} paragraph${longParas === 1 ? ' is' : 's are'} over 150 words`, hint: 'Break them up — walls of text lose readers on phones.' });
  }

  /* ── Post type ── */
  if (input.articleType === 'review') {
    const r = input.review;
    add(r?.artist && r?.subjectTitle
      ? { id: 'reviewSubject', group: 'type', status: 'good', weight: 8, title: `Reviewing ${r.artist} — ${r.subjectTitle}` }
      : { id: 'reviewSubject', group: 'type', status: 'problem', weight: 8, target: 'review',
          title: 'Add the artist and title being reviewed', hint: 'Required for Review markup — without it search engines can’t tell what you reviewed.' });
    add(r?.rating != null
      ? { id: 'reviewRating', group: 'type', status: 'good', weight: 5, title: `Rated ${r.rating}/10` }
      : { id: 'reviewRating', group: 'type', status: 'improve', weight: 5, target: 'review', title: 'No rating', hint: 'A score gives readers the verdict at a glance and is part of the Review markup.' });
    add(r?.verdict
      ? { id: 'reviewVerdict', group: 'type', status: 'good', weight: 3, title: 'One-line verdict written' }
      : { id: 'reviewVerdict', group: 'type', status: 'improve', weight: 3, target: 'review', title: 'No verdict', hint: 'Sum the record up in a sentence — it’s shown in the review card.' });
    add(r?.coverImage || input.featuredImage
      ? { id: 'reviewCover', group: 'type', status: 'good', weight: 3, title: 'Cover art set' }
      : { id: 'reviewCover', group: 'type', status: 'improve', weight: 3, target: 'review', title: 'No cover art' });
    add(r?.streaming && Object.keys(r.streaming).length
      ? { id: 'reviewStreaming', group: 'type', status: 'good', weight: 3, title: `${Object.keys(r.streaming).length} streaming link${Object.keys(r.streaming).length === 1 ? '' : 's'}` }
      : { id: 'reviewStreaming', group: 'type', status: 'improve', weight: 3, target: 'review', title: 'No streaming links', hint: 'Let readers listen while they read — paste a Spotify, Apple Music or Bandcamp link.' });
    add(r?.releaseDate
      ? { id: 'reviewDate', group: 'type', status: 'good', weight: 2, title: 'Release date set' }
      : { id: 'reviewDate', group: 'type', status: 'improve', weight: 2, target: 'review', title: 'No release date' });
  } else if (input.articleType === 'news') {
    add(input.title.length <= 110
      ? { id: 'newsHeadline', group: 'type', status: 'good', weight: 3, title: 'Headline fits Google News (110 characters)' }
      : { id: 'newsHeadline', group: 'type', status: 'problem', weight: 3, target: 'seoTitle', title: `Headline is ${input.title.length} characters`, hint: 'NewsArticle headlines over 110 characters are truncated or rejected.' });
    add(input.excerpt.trim()
      ? { id: 'newsSummary', group: 'type', status: 'good', weight: 3, title: 'Summary written' }
      : { id: 'newsSummary', group: 'type', status: 'improve', weight: 3, target: 'metaDescription', title: 'No summary', hint: 'Write a one-paragraph excerpt answering who, what and when.' });
  } else if (input.articleType === 'qna') {
    const q = input.qna;
    const answered = q?.items.filter((i) => i.question.trim() && i.answer.trim()).length ?? 0;
    const total = q?.items.filter((i) => i.question.trim() || i.answer.trim()).length ?? 0;
    add(q?.subject
      ? { id: 'qnaSubject', group: 'type', status: 'good', weight: 8, title: `${q.subject} answering` }
      : { id: 'qnaSubject', group: 'type', status: 'problem', weight: 8, target: 'qna', title: 'Add who is answering', hint: 'The band or artist name is what people search for.' });
    add(answered >= 3
      ? { id: 'qnaCount', group: 'type', status: 'good', weight: 5, title: `${answered} answered questions` }
      : { id: 'qnaCount', group: 'type', status: answered ? 'improve' : 'problem', weight: 5, target: 'qna',
          title: answered ? `Only ${answered} answered question${answered === 1 ? '' : 's'}` : 'No answered questions yet', hint: 'Q&As read best with at least three or four exchanges.' });
    if (total > answered) {
      add({ id: 'qnaUnanswered', group: 'type', status: 'improve', weight: 3, target: 'qna', title: `${total - answered} question${total - answered === 1 ? ' has' : 's have'} no answer`, hint: 'Fill in or remove unanswered questions before publishing.' });
    }
  }
  if (input.videoUrl) {
    add({ id: 'video', group: 'type', status: 'good', weight: 2, title: 'Featured video adds VideoObject markup' });
  }

  const total = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => s + c.weight * (c.status === 'good' ? 1 : c.status === 'improve' ? 0.5 : 0), 0);

  return {
    score: total ? Math.round((earned / total) * 100) : 0,
    readability,
    checks,
    effectiveTitle,
    effectiveDescription,
    stats: {
      words: n,
      sentences: sentences.length,
      paragraphs: paragraphs.length,
      avgSentenceWords: sentences.length ? Math.round(n / sentences.length) : 0,
      subheadings: headings.length,
      images: images.length,
      imagesWithoutAlt: images.filter((i) => !(i.getAttribute('alt') ?? '').trim()).length,
      internalLinks,
      externalLinks,
      keywordCount,
      keywordDensity: Math.round(density * 10) / 10,
      readingMinutes: Math.max(1, Math.round(n / 230)),
    },
  };
}

export function scoreLabel(score: number): { label: string; tone: 'good' | 'improve' | 'problem' } {
  if (score >= 80) return { label: 'Good', tone: 'good' };
  if (score >= 50) return { label: 'Needs work', tone: 'improve' };
  return { label: 'Poor', tone: 'problem' };
}

/** Schema.org type the public page will emit for this post. */
export function schemaTypeFor(articleType: ArticleType): string {
  return articleType === 'news' ? 'NewsArticle' : articleType === 'review' ? 'Review' : 'Article';
  // qna is an Article about the band, with Question/Answer parts.
}

/** First ~155 characters of the content, cut on a word boundary — a starting point for a description. */
export function suggestDescription(contentHtml: string, excerpt: string): string {
  const source = excerpt.trim() || (parse(contentHtml).querySelector('p')?.textContent ?? '');
  const clean = source.replace(/\s+/g, ' ').trim();
  if (clean.length <= META_DESCRIPTION_RANGE[1]) return clean;
  const cut = clean.slice(0, META_DESCRIPTION_RANGE[1] - 1);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}
