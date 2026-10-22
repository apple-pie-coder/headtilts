import fs from 'fs/promises';
import sharp from 'sharp';
import { Prisma } from '@prisma/client';
import { STREAMING_SERVICES } from '@headtilts/shared';
import { prisma } from '../config/database';
import { buildPostPath, getPermalinkStructure } from '../utils/permalinks';
import { imageFromContent } from '../utils/cardImage';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors';
import { absoluteUrl, siteUrl } from './feed.service';
import { urlToPath } from './media.service';
import { SECRET_MASK } from './settings.service';
import {
  CAPTION_LIMIT, TEXT_LIMIT, OutMessage, PostStyle, POST_STYLE, eventMessage, formatMoney, htmlToText,
  liveEndMessage, liveUpdateMessage, pollMessage, postMessage,
} from './telegramMessages';

/**
 * Announces new posts, events and polls in a Telegram channel, and keeps a
 * live blog's thread going with its updates. Every message has a
 * TelegramDelivery row: it stops anything being announced twice and is the
 * log shown in Settings → Telegram. Sending never blocks or fails a save.
 */

export type DeliveryKind = 'post' | 'event' | 'poll' | 'live_update' | 'live_end';
type ContentType = PostStyle | 'event' | 'poll';

export const CONTENT_TYPES: ContentType[] = ['article', 'news', 'review', 'qna', 'live', 'event', 'poll'];

export interface TelegramConfig {
  enabled: boolean;
  token: string;
  chatId: string;
  types: Record<ContentType, boolean>;
  liveUpdates: boolean;
  includeImage: boolean;
  categoryTags: boolean;
  silent: boolean;
}

const MAX_AUTO_ATTEMPTS = 3;

export async function loadConfig(): Promise<TelegramConfig> {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: 'telegram_' } } });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const on = (key: string, fallback = true) => (s[key] ? s[key] === 'yes' : fallback);
  return {
    enabled: on('telegram_enabled', false),
    token: s.telegram_bot_token?.trim() ?? '',
    chatId: s.telegram_chat_id?.trim() ?? '',
    types: Object.fromEntries(CONTENT_TYPES.map((t) => [t, on(`telegram_post_${t}`)])) as Record<ContentType, boolean>,
    liveUpdates: on('telegram_live_updates'),
    includeImage: on('telegram_include_image'),
    categoryTags: on('telegram_category_tags'),
    silent: on('telegram_silent', false),
  };
}

const ready = (c: TelegramConfig) => c.enabled && !!c.token && !!c.chatId;

// ─── Bot API ──────────────────────────────────────────────────────────────────

export class TelegramError extends Error {
  constructor(message: string, readonly code: number, readonly retryAfter?: number) {
    super(message);
  }
  /** Worth trying again later: network trouble, Telegram busy or down. */
  get retryable() { return this.code === 0 || this.code === 429 || this.code >= 500; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(token: string, method: string, body: Record<string, unknown> | FormData): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        ...(body instanceof FormData
          ? { body }
          : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new TelegramError(`Could not reach Telegram: ${error instanceof Error ? error.message : String(error)}`, 0);
    }
    const data = await res.json().catch(() => null) as
      { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } } | null;
    if (data?.ok) return data.result as T;
    const code = data?.error_code ?? res.status;
    const retryAfter = data?.parameters?.retry_after;
    // Flood control: wait it out a couple of times before giving up.
    if (code === 429 && retryAfter && retryAfter <= 30 && attempt < 2) {
      await sleep(retryAfter * 1000);
      continue;
    }
    throw new TelegramError(describe(code, data?.description ?? res.statusText), code, retryAfter);
  }
}

/** Telegram's errors, in words that say what to fix. */
function describe(code: number, description: string): string {
  if (code === 401 || code === 404) return 'Telegram doesn’t recognise the bot token. Copy it again from @BotFather.';
  if (/chat not found/i.test(description)) return 'Telegram can’t find that channel. Check the @username or ID, and that the bot has been added to it.';
  if (/not enough rights|have no rights|not a member|bot was kicked|CHAT_WRITE_FORBIDDEN|need administrator rights/i.test(description)) {
    return 'The bot can’t post in that channel. Make it an admin there with permission to post messages.';
  }
  return `Telegram said: ${description}`;
}

interface SentMessage { message_id: number; chat: { id: number; title?: string; username?: string } }

const buttonsMarkup = (msg: OutMessage) =>
  msg.buttons?.length ? { reply_markup: { inline_keyboard: msg.buttons.map((row) => row.map((b) => ({ text: b.text, url: b.url }))) } } : {};

/** Button links must be public http(s) addresses; a LAN or localhost SITE_URL isn't. */
const badButton = (e: unknown) => e instanceof TelegramError && /BUTTON_URL_INVALID|wrong http url|wrong url/i.test(e.message);

/** A photo Telegram will take: our own uploads go up as JPEG bytes, anything else as a link. */
async function photoInput(image: string): Promise<Blob | string | null> {
  const file = urlToPath(image);
  if (file) {
    const bytes = await fs.readFile(file).catch(() => null);
    if (!bytes) return null;
    const jpeg = await sharp(bytes, { animated: false })
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer()
      .catch(() => null);
    return jpeg ? new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }) : null;
  }
  return /^https:\/\//i.test(image) ? image : absoluteUrl(image);
}

async function send(cfg: TelegramConfig, msg: OutMessage, replyTo?: number | null): Promise<{ messageId: number; hasMedia: boolean }> {
  const common = {
    chat_id: cfg.chatId,
    parse_mode: 'HTML',
    ...(cfg.silent ? { disable_notification: true } : {}),
    ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
  };

  const sendText = async (withButtons: boolean) => {
    let text = msg.build(TEXT_LIMIT);
    if (!withButtons && msg.buttons?.[0]?.[0]) text += `\n\n🔗 ${msg.buttons[0][0].url}`;
    const r = await api<SentMessage>(cfg.token, 'sendMessage', {
      ...common,
      text,
      link_preview_options: msg.previewUrl ? { url: msg.previewUrl, prefer_large_media: true } : { is_disabled: true },
      ...(withButtons ? buttonsMarkup(msg) : {}),
    });
    return { messageId: r.message_id, hasMedia: false };
  };

  const sendPhoto = async (photo: Blob | string, withButtons: boolean) => {
    let caption = msg.build(CAPTION_LIMIT);
    if (!withButtons && msg.buttons?.[0]?.[0]) caption = msg.build(CAPTION_LIMIT - 120) + `\n\n🔗 ${msg.buttons[0][0].url}`;
    const fields: Record<string, unknown> = { ...common, caption, ...(withButtons ? buttonsMarkup(msg) : {}) };
    let body: Record<string, unknown> | FormData;
    if (typeof photo === 'string') {
      body = { ...fields, photo };
    } else {
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
      form.append('photo', photo, 'image.jpg');
      body = form;
    }
    const r = await api<SentMessage>(cfg.token, 'sendPhoto', body);
    return { messageId: r.message_id, hasMedia: true };
  };

  const attempt = async (withButtons: boolean) => {
    const photo = cfg.includeImage && msg.image ? await photoInput(msg.image) : null;
    if (photo) {
      try {
        return await sendPhoto(photo, withButtons);
      } catch (e) {
        // A picture Telegram won't take shouldn't stop the announcement.
        if (!(e instanceof TelegramError) || e.code !== 400 || badButton(e)) throw e;
      }
    }
    return sendText(withButtons);
  };

  try {
    return await attempt(true);
  } catch (e) {
    if (!badButton(e)) throw e;
    return attempt(false);
  }
}

// One message at a time, in order: a live blog's first message goes out before its updates.
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => {});
  return run;
}

// ─── What gets sent ───────────────────────────────────────────────────────────

interface Prepared {
  title: string;
  message: OutMessage;
  /** Live and public, so the link works. Required even for a manual send. */
  live: boolean;
  /** Allowed by the site and per-item settings; why not, when it isn't. */
  allowed: boolean;
  reason?: string;
  postId?: number;
  replyTo?: number | null;
}

const overrideAllows = (override: string | null, typeOn: boolean) => (override === 'yes' ? true : override === 'no' ? false : typeOn);

async function siteTimeZone(): Promise<string> {
  return (await prisma.setting.findUnique({ where: { key: 'timezone' } }))?.value || 'UTC';
}

const toAbsolute = (url: string) => (/^(https?:)?\/\//i.test(url) || url.startsWith('/') ? absoluteUrl(url) : null);

async function preparePost(id: number, cfg: TelegramConfig): Promise<Prepared> {
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      review: true,
      qna: true,
      categories: { include: { category: { select: { name: true, slug: true } } } },
    },
  });
  if (!post || post.type !== 'post') throw new NotFoundError('Post not found');
  const articleType = (post.articleType in POST_STYLE ? post.articleType : 'article') as PostStyle;
  const url = `${siteUrl()}${buildPostPath(await getPermalinkStructure(), post)}`;
  const excerpt = htmlToText(post.excerpt || '') || htmlToText(post.content).slice(0, 1200);

  const streaming = (post.review?.streaming ?? {}) as Record<string, string>;
  const qnaItems = (post.qna?.items ?? []) as { question?: string; answer?: string }[];
  const firstQna = qnaItems.find((i) => i.question && i.answer);
  const threaded = articleType === 'live' && cfg.liveUpdates && post.telegramLiveUpdates;

  const message = postMessage({
    articleType,
    title: post.title,
    excerpt,
    url,
    image: (articleType === 'review' && post.review?.coverImage) || post.featuredImage || imageFromContent(post.content, post.videoUrl),
    categories: cfg.categoryTags
      ? post.categories.map((c) => c.category).filter((c) => c.slug !== 'uncategorized').slice(0, 3).map((c) => c.name)
      : [],
    review: articleType === 'review' && post.review ? {
      subjectType: post.review.subjectType,
      subjectTitle: post.review.subjectTitle,
      artist: post.review.artist,
      rating: post.review.rating,
      verdict: post.review.verdict,
      genre: post.review.genre,
      label: post.review.label,
      streaming: STREAMING_SERVICES
        .filter((s) => typeof streaming[s.key] === 'string' && /^https:\/\//.test(streaming[s.key]))
        .map((s) => ({ label: s.label, url: streaming[s.key] })),
    } : null,
    qna: articleType === 'qna' && post.qna ? {
      subject: post.qna.subject,
      question: firstQna ? htmlToText(firstQna.question!) : null,
      answer: firstQna ? htmlToText(firstQna.answer!) : null,
    } : null,
    threaded,
  });

  const typeOn = cfg.types[articleType];
  const allowed = overrideAllows(post.telegramPost, typeOn);
  return {
    title: post.title,
    message,
    live: post.status === 'published',
    allowed,
    reason: allowed ? undefined : post.telegramPost === 'no' ? 'Turned off for this post' : `Turned off for ${POST_STYLE[articleType].label.toLowerCase()} posts`,
  };
}

async function prepareEvent(id: number, cfg: TelegramConfig): Promise<Prepared> {
  const event = await prisma.event.findUnique({
    where: { id },
    include: { ticketTiers: { where: { isVisible: true }, select: { price: true, currency: true } } },
  });
  if (!event) throw new NotFoundError('Event not found');
  const prices = event.ticketTiers.map((t) => t.price);
  const paid = event.ticketTiers.filter((t) => t.price > 0).sort((a, b) => a.price - b.price);
  const price = !event.ticketTiers.length
    ? null
    : !paid.length
      ? 'Free'
      : `${prices.length > 1 && Math.min(...prices) !== Math.max(...prices) ? 'From ' : ''}${formatMoney(Math.min(...paid.map((t) => t.price)), paid[0].currency)}${paid.length < prices.length ? ' · free tickets too' : ''}`;
  const message = eventMessage({
    title: event.title,
    excerpt: htmlToText(event.excerpt || '') || htmlToText(event.description || '').slice(0, 1200),
    url: `${siteUrl()}/events/${event.slug}`,
    image: event.bannerImage || event.featuredImage,
    type: event.type,
    startAt: event.startAt,
    endAt: event.endAt,
    timeZone: event.timezone || 'UTC',
    venue: event.venueName,
    city: event.venueCity,
    streamPlatform: event.streamPlatform,
    price,
    registrationDeadline: event.registrationDeadline,
    isRegistrationRequired: event.isRegistrationRequired,
  });
  const allowed = overrideAllows(event.telegramPost, cfg.types.event);
  return {
    title: event.title,
    message,
    live: event.status === 'published' && !event.parentEventId,
    allowed,
    reason: allowed ? undefined : event.telegramPost === 'no' ? 'Turned off for this event' : 'Turned off for events',
  };
}

async function preparePoll(id: number, cfg: TelegramConfig): Promise<Prepared> {
  const poll = await prisma.poll.findUnique({ where: { id }, include: { options: { orderBy: { order: 'asc' } } } });
  if (!poll) throw new NotFoundError('Poll not found');
  const message = pollMessage({
    question: poll.question,
    description: poll.description ?? '',
    options: poll.options.map((o) => o.text),
    multiple: poll.voteMode === 'multiple',
    endsAt: poll.endsAt,
    timeZone: await siteTimeZone(),
    url: `${siteUrl()}/polls/${poll.slug}`,
    image: poll.featuredImage,
  });
  const allowed = overrideAllows(poll.telegramPost, cfg.types.poll);
  return {
    title: poll.title,
    message,
    live: poll.status === 'open',
    allowed,
    reason: allowed ? undefined : poll.telegramPost === 'no' ? 'Turned off for this poll' : 'Turned off for polls',
  };
}

/** The live blog's own message, which updates reply to. */
async function rootMessage(postId: number): Promise<number | null> {
  const root = await prisma.telegramDelivery.findUnique({ where: { kind_refId: { kind: 'post', refId: postId } } });
  return root?.status === 'sent' ? root.messageId : null;
}

async function prepareLiveUpdate(id: number, cfg: TelegramConfig): Promise<Prepared> {
  const update = await prisma.liveUpdate.findUnique({
    where: { id },
    include: { post: { select: { id: true, title: true, status: true, articleType: true, telegramLiveUpdates: true } } },
  });
  if (!update) throw new NotFoundError('Live update not found');
  const replyTo = await rootMessage(update.postId);
  const message = liveUpdateMessage({
    headline: update.headline,
    body: update.body,
    format: update.format,
    image: update.image || (update.format === 'html' ? imageFromContent(update.body) : null),
    createdAt: update.createdAt,
    timeZone: await siteTimeZone(),
  }, toAbsolute);
  const allowed = cfg.liveUpdates && update.post.telegramLiveUpdates && update.post.articleType === 'live' && replyTo !== null;
  return {
    title: update.headline || `Update on ${update.post.title}`,
    message,
    live: update.post.status === 'published',
    allowed,
    reason: allowed ? undefined : 'Live updates are off, or the live blog isn’t on Telegram',
    postId: update.postId,
    replyTo,
  };
}

async function prepareLiveEnd(postId: number, cfg: TelegramConfig): Promise<Prepared> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, slug: true, title: true, status: true, publishedAt: true, liveEndedAt: true, telegramLiveUpdates: true, _count: { select: { liveUpdates: true } } },
  });
  if (!post) throw new NotFoundError('Post not found');
  const replyTo = await rootMessage(postId);
  const url = `${siteUrl()}${buildPostPath(await getPermalinkStructure(), post)}`;
  const allowed = cfg.liveUpdates && post.telegramLiveUpdates && replyTo !== null;
  return {
    title: `Coverage ended: ${post.title}`,
    message: liveEndMessage(post.title, post._count.liveUpdates, url),
    live: post.status === 'published' && !!post.liveEndedAt,
    allowed,
    reason: allowed ? undefined : 'Live updates are off, or the live blog isn’t on Telegram',
    postId,
    replyTo,
  };
}

const PREPARE: Record<DeliveryKind, (id: number, cfg: TelegramConfig) => Promise<Prepared>> = {
  post: preparePost,
  event: prepareEvent,
  poll: preparePoll,
  live_update: prepareLiveUpdate,
  live_end: prepareLiveEnd,
};

// ─── Deliveries ───────────────────────────────────────────────────────────────

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/**
 * Send one item. Automatic sends respect every switch and skip anything
 * already announced; manual ones (Post now, Retry) only need it to be live.
 * An automatic retry reuses its failed row but still respects the switches.
 */
async function deliver(kind: DeliveryKind, refId: number, opts: { manual?: boolean; again?: boolean; retry?: boolean } = {}) {
  const cfg = await loadConfig();
  if (!ready(cfg)) {
    if (opts.manual) throw new ValidationError('Turn Telegram on and add the bot token and channel in Settings → Telegram first');
    return null;
  }
  const prep = await PREPARE[kind](refId, cfg);
  if (!prep.live) {
    if (opts.manual) throw new ValidationError('Only live content can be posted: publish it (or open the poll) first');
    return null;
  }
  if (!prep.allowed && !opts.manual) return null;

  const existing = await prisma.telegramDelivery.findUnique({ where: { kind_refId: { kind, refId } } });
  if (existing && !opts.manual && !(opts.retry && existing.status === 'failed')) return null;
  if (existing?.status === 'sent' && !opts.again) throw new ConflictError('Already posted to Telegram');
  if (existing?.status === 'pending') throw new ConflictError('Already being posted');

  const data = { title: prep.title.slice(0, 255), chatId: cfg.chatId, postId: prep.postId ?? null, status: 'pending', error: null, retryAt: null };
  let row;
  try {
    row = existing
      ? await prisma.telegramDelivery.update({ where: { id: existing.id }, data: { ...data, messageId: null, sentAt: null } })
      : await prisma.telegramDelivery.create({ data: { kind, refId, ...data } });
  } catch (e) {
    if (isUnique(e)) return null; // another save got there first
    throw e;
  }

  try {
    const { messageId, hasMedia } = await send(cfg, prep.message, prep.replyTo);
    return await prisma.telegramDelivery.update({
      where: { id: row.id },
      data: { status: 'sent', messageId, hasMedia, sentAt: new Date(), error: null, retryAt: null, attempts: { increment: 1 } },
    });
  } catch (error) {
    const attempts = row.attempts + 1;
    const retryable = error instanceof TelegramError ? error.retryable : true;
    const failed = await prisma.telegramDelivery.update({
      where: { id: row.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        attempts,
        // 2, 4, 8 minutes: Telegram or the network usually recovers by then.
        retryAt: retryable && attempts < MAX_AUTO_ATTEMPTS ? new Date(Date.now() + 2 ** attempts * 60_000) : null,
      },
    });
    if (!opts.manual) console.error(`Telegram: ${kind} ${refId} failed:`, failed.error);
    return failed;
  }
}

function background(kind: DeliveryKind, refId: number) {
  enqueue(() => deliver(kind, refId)).catch((error) => console.error(`Telegram: ${kind} ${refId} not sent:`, error));
}

/** Something just went live (post published, event published, poll opened). */
export function announce(kind: 'post' | 'event' | 'poll', id: number) {
  background(kind, id);
}

export function announceLiveUpdate(updateId: number) {
  background('live_update', updateId);
}

export function announceCoverageEnded(postId: number) {
  background('live_end', postId);
}

/** A correction to a live update shows up in the channel too. */
export function editLiveUpdate(updateId: number) {
  enqueue(async () => {
    const row = await prisma.telegramDelivery.findUnique({ where: { kind_refId: { kind: 'live_update', refId: updateId } } });
    if (row?.status !== 'sent' || !row.messageId) return;
    const cfg = await loadConfig();
    if (!cfg.token) return;
    const prep = await prepareLiveUpdate(updateId, cfg);
    try {
      if (row.hasMedia) {
        await api(cfg.token, 'editMessageCaption', { chat_id: row.chatId, message_id: row.messageId, caption: prep.message.build(CAPTION_LIMIT), parse_mode: 'HTML' });
      } else {
        await api(cfg.token, 'editMessageText', {
          chat_id: row.chatId, message_id: row.messageId, text: prep.message.build(TEXT_LIMIT), parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        });
      }
    } catch (e) {
      if (!(e instanceof TelegramError && /message is not modified/i.test(e.message))) throw e;
    }
  }).catch((error) => console.error(`Telegram: editing live update ${updateId} failed:`, error));
}

/** A deleted live update is taken out of the channel. */
export function removeLiveUpdate(updateId: number) {
  enqueue(async () => {
    const row = await prisma.telegramDelivery.findUnique({ where: { kind_refId: { kind: 'live_update', refId: updateId } } });
    if (!row) return;
    const cfg = await loadConfig();
    if (row.status === 'sent' && row.messageId && cfg.token) {
      await api(cfg.token, 'deleteMessage', { chat_id: row.chatId, message_id: row.messageId })
        .catch((e) => console.error(`Telegram: deleting live update ${updateId} failed:`, e instanceof Error ? e.message : e));
    }
    await prisma.telegramDelivery.delete({ where: { id: row.id } }).catch(() => {});
  }).catch((error) => console.error(`Telegram: removing live update ${updateId} failed:`, error));
}

/** Post now / Post again, from an editor. Waits for Telegram's answer. */
export async function sendNow(kind: 'post' | 'event' | 'poll', id: number, again = false) {
  return enqueue(() => deliver(kind, id, { manual: true, again }));
}

export async function retryDelivery(id: number) {
  const row = await prisma.telegramDelivery.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Delivery not found');
  if (row.status === 'sent') throw new ConflictError('Already posted to Telegram');
  return enqueue(() => deliver(row.kind as DeliveryKind, row.refId, { manual: true }));
}

/** Publisher tick: failed sends whose wait is over get another go. */
export async function retryDueDeliveries(): Promise<void> {
  const due = await prisma.telegramDelivery.findMany({
    where: { status: 'failed', retryAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });
  for (const row of due) {
    await prisma.telegramDelivery.update({ where: { id: row.id }, data: { retryAt: null } });
    await enqueue(() => deliver(row.kind as DeliveryKind, row.refId, { retry: true }))
      .catch((error) => console.error(`Telegram: retry of ${row.kind} ${row.refId} failed:`, error));
  }
}

/** On start-up: a send cut off by a restart may or may not have arrived, so it's left for a person to retry. */
export async function failInterruptedDeliveries(): Promise<void> {
  await prisma.telegramDelivery.updateMany({
    where: { status: 'pending' },
    data: { status: 'failed', error: 'Interrupted by a server restart. Check the channel, then retry if it’s missing.', retryAt: null },
  });
}

// ─── Admin views ──────────────────────────────────────────────────────────────

/** A link to the message: public for @channels, members-only for private ones. */
export function messageUrl(chatId: string, messageId: number | null): string | null {
  if (!messageId) return null;
  if (chatId.startsWith('@')) return `https://t.me/${chatId.slice(1)}/${messageId}`;
  if (chatId.startsWith('-100')) return `https://t.me/c/${chatId.slice(4)}/${messageId}`;
  return null;
}

const ADMIN_LINK: Record<DeliveryKind, (row: { refId: number; postId: number | null }) => string> = {
  post: (r) => `/admin/posts/${r.refId}/edit`,
  event: (r) => `/admin/events/${r.refId}/edit`,
  poll: (r) => `/admin/polls/${r.refId}/edit`,
  live_update: (r) => `/admin/posts/${r.postId}/edit`,
  live_end: (r) => `/admin/posts/${r.refId}/edit`,
};

function present<T extends { kind: string; refId: number; postId: number | null; chatId: string; messageId: number | null }>(row: T) {
  return { ...row, messageUrl: messageUrl(row.chatId, row.messageId), adminUrl: ADMIN_LINK[row.kind as DeliveryKind]?.(row) ?? null };
}

export async function listDeliveries(page: number, limit: number, status?: string) {
  const where = status ? { status } : {};
  const [items, total] = await Promise.all([
    prisma.telegramDelivery.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    prisma.telegramDelivery.count({ where }),
  ]);
  return { items: items.map(present), total };
}

/** The Telegram box in an editor: what was sent, what would be, and a preview. */
export async function itemStatus(kind: 'post' | 'event' | 'poll', id: number) {
  const cfg = await loadConfig();
  const [delivery, prep] = await Promise.all([
    prisma.telegramDelivery.findUnique({ where: { kind_refId: { kind, refId: id } } }),
    PREPARE[kind](id, cfg),
  ]);
  const withImage = cfg.includeImage && !!prep.message.image;
  const updates = kind === 'post'
    ? await prisma.telegramDelivery.groupBy({ by: ['status'], where: { kind: 'live_update', postId: id }, _count: true })
    : [];
  return {
    configured: !!cfg.token && !!cfg.chatId,
    enabled: cfg.enabled,
    live: prep.live,
    allowed: prep.allowed,
    reason: prep.reason ?? null,
    delivery: delivery ? present(delivery) : null,
    liveUpdates: kind === 'post'
      ? { enabled: cfg.liveUpdates, sent: updates.find((u) => u.status === 'sent')?._count ?? 0, failed: updates.find((u) => u.status === 'failed')?._count ?? 0 }
      : null,
    preview: {
      html: prep.message.build(withImage ? CAPTION_LIMIT : TEXT_LIMIT),
      image: withImage ? prep.message.image : null,
      buttons: prep.message.buttons ?? [],
    },
  };
}

/** Settings → Telegram → Send test message. Unsaved values can be tried before saving. */
export async function sendTest(input: { token?: string; chatId?: string }) {
  const cfg = await loadConfig();
  const token = input.token && input.token !== SECRET_MASK ? input.token.trim() : cfg.token;
  const chatId = input.chatId?.trim() || cfg.chatId;
  if (!token) throw new ValidationError('Add the bot token first');
  if (!chatId) throw new ValidationError('Add the channel first');

  try {
    const bot = await api<{ id: number; username: string }>(token, 'getMe', {});
    const chat = await api<{ id: number; title?: string; username?: string; type: string }>(token, 'getChat', { chat_id: chatId });
    const member = await api<{ status: string; can_post_messages?: boolean }>(token, 'getChatMember', { chat_id: chatId, user_id: bot.id });
    if (chat.type === 'channel' && (member.status !== 'administrator' || member.can_post_messages === false)) {
      throw new ValidationError(`@${bot.username} isn’t allowed to post in ${chat.title ?? chatId}. Make it an admin with “Post messages” on.`);
    }
    const title = (await prisma.setting.findUnique({ where: { key: 'site_title' } }))?.value || 'the site';
    await api(token, 'sendMessage', {
      chat_id: chatId,
      parse_mode: 'HTML',
      text: `✅ <b>Connected</b>\n\nNew posts, events and polls from ${title.replace(/[&<>]/g, '')} will appear here.`,
      disable_notification: true,
    });
    return { bot: bot.username, chat: chat.title ?? chat.username ?? String(chat.id), chatType: chat.type };
  } catch (e) {
    if (e instanceof TelegramError) throw new ValidationError(e.message);
    throw e;
  }
}
