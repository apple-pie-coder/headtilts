/**
 * Telegram message text: the HTML subset Telegram accepts, its length limits,
 * and one template per kind of content so each reads differently in the channel.
 * Everything here is pure; telegram.service.ts loads the rows and sends.
 */

/** Telegram limits, in visible characters (tags don't count). */
export const CAPTION_LIMIT = 1024;
export const TEXT_LIMIT = 4096;

export interface Button { text: string; url: string }

/** A message ready to send: the text is built once the limit (caption or text) is known. */
export interface OutMessage {
  build: (limit: number) => string;
  image?: string | null;
  buttons?: Button[][];
  /** Text-only messages: show this page's link preview (its card image) under the text. */
  previewUrl?: string;
}

export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»', middot: '·', bull: '•',
  copy: '©', reg: '®', trade: '™', times: '×', eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö', auml: 'ä',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}

/** What Telegram counts against its limits: the text with tags removed. */
export function visibleLength(html: string): number {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).length;
}

/** Plain text, cut at a word where possible, with an ellipsis when it was cut. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return '';
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, '')}…`;
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  ).replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const INLINE: Record<string, string> = {
  b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', ins: 'u', s: 's', strike: 's', del: 's',
  code: 'code', pre: 'pre', blockquote: 'blockquote', a: 'a',
};
const HEADINGS = /^h[1-6]$/;
const PARAGRAPH = /^(p|h[1-6]|blockquote|pre|ul|ol|table|figure|hr)$/;
const LINE = /^(br|div|li|tr|figcaption|section|article|header|footer)$/;

/**
 * Rich text (an editor's HTML) as Telegram HTML: bold, italics, links, quotes
 * and code survive, paragraphs become blank lines, list items bullets, and
 * everything else is dropped. Stops at `max` visible characters, closing any
 * open tags, so the result is always valid for Telegram's parser.
 */
export function htmlToTelegram(html: string, max: number, toAbsolute: (url: string) => string | null): string {
  const source = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe)[\s\S]*?<\/\1>/gi, '');
  const stack: { tag: string; src: string }[] = [];
  let out = '';
  let count = 0;
  let pendingBreak = 0;
  let bullet = false;
  let done = false;
  // Just inside a quote or code block: its first line needs no break before it.
  let fresh = false;

  const breakAtLeast = (n: number) => { if (count > 0 && !fresh) pendingBreak = Math.max(pendingBreak, n); };
  const inPre = () => stack.some((s) => s.tag === 'pre');

  const token = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while (!done && (m = token.exec(source))) {
    const [, closing, rawName, attrs, rawText] = m;
    if (rawText !== undefined || (!rawName && m[0] === '<')) {
      let text = decodeEntities(rawText ?? '<');
      if (!inPre()) text = text.replace(/\s+/g, ' ');
      if (count === 0 || pendingBreak || fresh) text = text.replace(/^\s+/, '');
      if (!text) continue;
      fresh = false;
      let prefix = '';
      if (pendingBreak && count > 0) prefix = '\n'.repeat(Math.min(pendingBreak, 2));
      if (bullet) prefix += '• ';
      pendingBreak = 0;
      bullet = false;
      const room = max - count - prefix.length;
      if (room <= 1) { done = true; break; }
      if (text.length > room) { text = truncate(text, room); done = true; }
      out += esc(prefix) + esc(text);
      count += prefix.length + text.length;
      continue;
    }

    const name = rawName.toLowerCase();
    if (closing) {
      if (PARAGRAPH.test(name)) breakAtLeast(2); else if (LINE.test(name)) breakAtLeast(1);
      const at = stack.map((s) => s.src).lastIndexOf(name);
      if (at === -1) continue;
      while (stack.length > at) out += `</${stack.pop()!.tag}>`;
      continue;
    }

    if (name === 'br') { breakAtLeast(1); continue; }
    if (PARAGRAPH.test(name)) breakAtLeast(2); else if (LINE.test(name)) breakAtLeast(1);
    if (name === 'li') bullet = true;
    if (/\/\s*$/.test(attrs)) continue; // self-closing

    const tag = INLINE[name] ?? (HEADINGS.test(name) ? 'b' : null);
    if (!tag) continue;
    // Telegram rejects formatting inside <pre> and nested links.
    if (inPre() || (tag === 'a' && stack.some((s) => s.tag === 'a'))) continue;
    // Block tags start on their own line, which the pending break takes care of.
    if ((tag === 'blockquote' || tag === 'pre') && pendingBreak && count > 0) {
      out += '\n'.repeat(Math.min(pendingBreak, 2));
      count += Math.min(pendingBreak, 2);
      pendingBreak = 0;
    }
    if (tag === 'a') {
      const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      const url = href ? toAbsolute(decodeEntities(href[2] ?? href[3] ?? '')) : null;
      if (!url) continue;
      out += `<a href="${esc(url).replace(/"/g, '&quot;')}">`;
    } else {
      out += `<${tag}>`;
    }
    stack.push({ tag, src: name });
    if (tag === 'blockquote' || tag === 'pre') { pendingBreak = 0; fresh = true; }
  }

  out = out.replace(/\s+$/, '');
  while (stack.length) out += `</${stack.pop()!.tag}>`;
  // Empty formatting left behind by dropped content.
  return out.replace(/<(b|i|u|s|code|pre|blockquote)><\/\1>/g, '').trim();
}

/**
 * Join blocks with blank lines, giving the flexible block (an excerpt or a
 * body) whatever room the fixed ones leave under the limit.
 */
export function compose(limit: number, before: (string | null | undefined | false)[], flexible: ((room: number) => string) | null, after: (string | null | undefined | false)[] = []): string {
  const head = before.filter(Boolean) as string[];
  const tail = after.filter(Boolean) as string[];
  const fixed = [...head, ...tail];
  const used = fixed.reduce((n, b) => n + visibleLength(b), 0) + Math.max(0, fixed.length) * 2;
  const room = limit - used - 2;
  const middle = flexible && room >= 40 ? flexible(room) : '';
  const blocks = [...head, ...(middle ? [middle] : []), ...tail];
  let text = blocks.join('\n\n');
  // A very long title could still overflow; never send something Telegram will refuse.
  if (visibleLength(text) > limit) text = esc(truncate(htmlToText(text), limit));
  return text;
}

export function hashtag(name: string): string | null {
  const words = name.normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const tag = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return tag && !/^\d+$/.test(tag) ? `#${tag}` : null;
}

export function hashtags(tags: (string | null | undefined)[]): string | null {
  const unique = [...new Set(tags.filter(Boolean) as string[])];
  return unique.length ? unique.join(' ') : null;
}

/** 8.5 → ★★★★☆ (out of five, rounded to the nearest star). */
export function stars(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating / 2)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function fmt(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(date);
  }
}

export function formatDate(date: Date, timeZone: string): string {
  return fmt(date, timeZone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(date: Date, timeZone: string): string {
  return fmt(date, timeZone, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function zoneName(date: Date, timeZone: string): string {
  const parts = (() => {
    try {
      // en-IN names Indian time "IST" where en-GB says "GMT+5:30".
      return new Intl.DateTimeFormat('en-IN', { timeZone, timeZoneName: 'short' }).formatToParts(date);
    } catch {
      return [];
    }
  })();
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;
}

/** "Sat, 14 Nov 2026 · 19:00–23:00 IST", or both dates when it runs over several days. */
export function formatRange(start: Date, end: Date, timeZone: string): string {
  const zone = zoneName(start, timeZone);
  if (formatDate(start, timeZone) === formatDate(end, timeZone)) {
    return `${formatDate(start, timeZone)} · ${formatTime(start, timeZone)}–${formatTime(end, timeZone)} ${zone}`;
  }
  return `${formatDate(start, timeZone)}, ${formatTime(start, timeZone)} – ${formatDate(end, timeZone)}, ${formatTime(end, timeZone)} ${zone}`;
}

/** Ticket prices are stored in the currency's minor unit (paise, cents). */
export function formatMoney(minor: number, currency: string): string {
  const value = minor / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency, maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

export const POST_STYLE = {
  article: { emoji: '✍️', label: 'ARTICLE', tag: '#Article', button: 'Read the article' },
  news:    { emoji: '🗞', label: 'NEWS', tag: '#News', button: 'Read the story' },
  review:  { emoji: '💿', label: 'REVIEW', tag: '#Review', button: 'Read the review' },
  qna:     { emoji: '🎙', label: 'INTERVIEW', tag: '#Interview', button: 'Read the interview' },
  live:    { emoji: '🔴', label: 'LIVE NOW', tag: '#Live', button: 'Follow live' },
} as const;

export type PostStyle = keyof typeof POST_STYLE;

const header = (emoji: string, label: string, extra?: string | null) =>
  `${emoji} <b>${esc(label)}</b>${extra ? ` · ${esc(extra)}` : ''}`;

export interface PostCard {
  articleType: PostStyle;
  title: string;
  excerpt: string;
  url: string;
  image: string | null;
  categories: string[];
  review?: {
    subjectType: string; subjectTitle: string; artist: string; rating: number | null;
    verdict: string | null; genre: string | null; label: string | null;
    streaming: { label: string; url: string }[];
  } | null;
  qna?: { subject: string; question: string | null; answer: string | null } | null;
  /** Live blogs: whether updates will follow in the thread. */
  threaded?: boolean;
}

const SUBJECT_LABEL: Record<string, string> = { album: 'Album', ep: 'EP', single: 'Single' };

export function postMessage(card: PostCard): OutMessage {
  const style = POST_STYLE[card.articleType] ?? POST_STYLE.article;
  const tags = hashtags([style.tag, ...card.categories.map(hashtag)]);
  const excerpt = (room: number) => (card.excerpt ? esc(truncate(card.excerpt, room)) : '');
  const buttons: Button[][] = [[{ text: style.button, url: card.url }]];

  let build: (limit: number) => string;
  if (card.articleType === 'review' && card.review) {
    const r = card.review;
    const rating = r.rating !== null ? `${stars(r.rating)}  <b>${r.rating % 1 ? r.rating.toFixed(1) : r.rating}</b>/10` : null;
    const facts = [r.genre, r.label].filter(Boolean).map((v) => esc(v!)).join(' · ');
    build = (limit) => compose(limit, [
      header(style.emoji, style.label, SUBJECT_LABEL[r.subjectType] ?? null),
      [
        `<b>${esc(card.title)}</b>`,
        `🎧 ${esc(r.artist)} — <i>${esc(r.subjectTitle)}</i>`,
        rating,
        facts || null,
      ].filter(Boolean).join('\n'),
      r.verdict ? `<blockquote>${esc(r.verdict)}</blockquote>` : null,
    ], r.verdict ? null : excerpt, [tags]);
    if (r.streaming.length) buttons.push(r.streaming.slice(0, 3).map((s) => ({ text: `▶ ${s.label}`, url: s.url })));
  } else if (card.articleType === 'qna' && card.qna) {
    const q = card.qna;
    build = (limit) => compose(limit, [
      header(style.emoji, style.label),
      `<b>${esc(card.title)}</b>\nwith ${esc(q.subject)}`,
    ], q.question && q.answer
      ? (room) => {
        // A taste of the conversation, not the whole answer.
        const question = truncate(q.question!, Math.min(200, Math.floor(room / 3)));
        const answer = truncate(q.answer!, Math.min(350, room - question.length - 10));
        return answer ? `<blockquote><b>Q.</b> ${esc(question)}\n<b>A.</b> ${esc(answer)}</blockquote>` : '';
      }
      : excerpt, [tags]);
  } else if (card.articleType === 'live') {
    build = (limit) => compose(limit, [
      header(style.emoji, style.label),
      `<b>${esc(card.title)}</b>`,
    ], excerpt, [card.threaded ? '<i>Updates follow as replies to this message.</i>' : null, tags]);
  } else {
    build = (limit) => compose(limit, [header(style.emoji, style.label), `<b>${esc(card.title)}</b>`], excerpt, [tags]);
  }

  return { build, image: card.image, buttons, previewUrl: card.url };
}

export interface LiveUpdateCard {
  headline: string | null;
  body: string;
  format: string;
  image: string | null;
  createdAt: Date;
  timeZone: string;
}

export function liveUpdateMessage(card: LiveUpdateCard, toAbsolute: (url: string) => string | null): OutMessage {
  const build = (limit: number) => compose(limit, [
    `🔴 <b>LIVE</b> · ${esc(formatTime(card.createdAt, card.timeZone))}${card.headline ? `\n<b>${esc(card.headline)}</b>` : ''}`,
  ], (room) => (card.format === 'text'
    ? esc(truncate(card.body.trim(), room))
    : htmlToTelegram(card.body, room, toAbsolute)));
  return { build, image: card.image };
}

export function liveEndMessage(title: string, updates: number, url: string): OutMessage {
  return {
    build: (limit) => compose(limit, [
      '⏹ <b>COVERAGE ENDED</b>',
      `<b>${esc(title)}</b>${updates ? `\n${updates} update${updates === 1 ? '' : 's'}` : ''}`,
    ], null, ['#Live']),
    buttons: [[{ text: 'Read the full blog', url }]],
  };
}

export interface EventCard {
  title: string;
  excerpt: string;
  url: string;
  image: string | null;
  type: string;
  startAt: Date;
  endAt: Date;
  timeZone: string;
  venue: string | null;
  city: string | null;
  streamPlatform: string | null;
  price: string | null;
  registrationDeadline: Date | null;
  isRegistrationRequired: boolean;
}

const EVENT_KIND: Record<string, string> = { online: 'Online', hybrid: 'Hybrid' };
const STREAM_PLATFORM: Record<string, string> = { youtube: 'YouTube', twitch: 'Twitch' };

export function eventMessage(card: EventCard): OutMessage {
  const lines = [`🗓 ${esc(formatRange(card.startAt, card.endAt, card.timeZone))}`];
  if (card.type !== 'online' && (card.venue || card.city)) {
    lines.push(`📍 ${esc([card.venue, card.city].filter(Boolean).join(', '))}`);
  }
  if (card.type !== 'in_person') {
    const platform = card.streamPlatform ? STREAM_PLATFORM[card.streamPlatform] : null;
    lines.push(`💻 Online${platform ? ` · ${platform}` : ''}`);
  }
  if (card.price) lines.push(`🎟 ${esc(card.price)}`);
  if (card.isRegistrationRequired && card.registrationDeadline && card.registrationDeadline > new Date()) {
    lines.push(`⏳ Register by ${esc(formatDate(card.registrationDeadline, card.timeZone))}`);
  }
  const tags = hashtags(['#Event', card.city ? hashtag(card.city) : null]);
  return {
    build: (limit) => compose(limit, [
      header('📅', 'EVENT', EVENT_KIND[card.type] ?? null),
      `<b>${esc(card.title)}</b>`,
      lines.join('\n'),
    ], card.excerpt ? (room) => esc(truncate(card.excerpt, room)) : null, [tags]),
    image: card.image,
    buttons: [[{ text: card.isRegistrationRequired ? 'Details & tickets' : 'Event details', url: card.url }]],
    previewUrl: card.url,
  };
}

export interface PollCard {
  question: string;
  description: string;
  options: string[];
  multiple: boolean;
  endsAt: Date | null;
  timeZone: string;
  url: string;
  image: string | null;
}

export function pollMessage(card: PollCard): OutMessage {
  const rules = [
    card.multiple ? 'Pick as many as you like' : 'Pick one',
    card.endsAt ? `closes ${formatDate(card.endsAt, card.timeZone)}, ${formatTime(card.endsAt, card.timeZone)}` : null,
  ].filter(Boolean).join(' · ');
  return {
    build: (limit) => compose(limit, [
      header('📊', 'POLL'),
      `<b>${esc(card.question)}</b>`,
      card.options.map((o) => `▫️ ${esc(truncate(o, 100))}`).join('\n'),
    ], card.description ? (room) => esc(truncate(card.description, room)) : null, [`🗳 ${esc(rules)}`, '#Poll']),
    image: card.image,
    buttons: [[{ text: 'Vote now', url: card.url }]],
    previewUrl: card.url,
  };
}
