import { prisma } from '../config/database';
import { NotFoundError, ValidationError } from '../utils/errors';
import * as telegram from './telegram.service';

/**
 * Live blog entries. Each update is its own row, written straight away rather
 * than with the post form, so reporters can post while someone else holds the
 * post's edit lock. Updates can exist on any post but are only shown publicly
 * while the post's type is "live".
 */

export interface LiveUpdateInput {
  headline?: string | null;
  /** "html" (default) or "text". */
  format?: string;
  body?: string;
  image?: string | null;
  pinned?: boolean;
}

const MAX_UPDATES = 500;

const authorSelect = { select: { id: true, username: true, firstName: true, lastName: true, avatar: true } } as const;

/** What readers get: no internal ids beyond the update's own anchor. */
export const liveUpdatePublicSelect = {
  id: true,
  headline: true,
  format: true,
  body: true,
  image: true,
  pinned: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { username: true, firstName: true, lastName: true, avatar: true } },
} as const;

const FORMATS = ['html', 'text'];

/** Whether a body says anything: text, or for HTML an image or embed. */
const hasContent = (body: string, format: string) =>
  format === 'text'
    ? !!body.trim()
    : /<(img|iframe)\b/i.test(body) || !!body.replace(/<[^>]*>/g, '').replace(/&nbsp;|\s/g, '');

function normalize(input: LiveUpdateInput, partial: boolean) {
  const out: { headline?: string | null; format?: string; body?: string; image?: string | null; pinned?: boolean } = {};
  if (input.format !== undefined || !partial) {
    const f = input.format ?? 'html';
    if (!FORMATS.includes(f)) throw new ValidationError('Format must be html or text');
    out.format = f;
  }
  if (input.headline !== undefined || !partial) {
    const h = typeof input.headline === 'string' ? input.headline.trim().replace(/\s+/g, ' ') : '';
    if (h.length > 200) throw new ValidationError('Headline is too long (max 200 characters)');
    out.headline = h || null;
  }
  if (input.body !== undefined || !partial) {
    // Keep paragraph breaks; just tidy the ends and runs of blank lines.
    let b = typeof input.body === 'string' ? input.body.trim().replace(/\n{3,}/g, '\n\n') : '';
    // iOS Safari's editor joins every word with &nbsp;, which stops lines wrapping.
    // A lone one between words becomes a plain space; deliberate runs stay.
    b = b.replace(/(?<=[^\s;>])&nbsp;(?=[^\s&<])/g, ' ');
    // HTML carries markup and inline image links, so it gets more room.
    if (b.length > 100_000) throw new ValidationError('Update is too long');
    out.body = b;
  }
  if (input.image !== undefined || !partial) {
    const i = typeof input.image === 'string' ? input.image.trim() : '';
    if (i && !/^(\/|https?:\/\/)/.test(i)) throw new ValidationError('Image must be a media library path or an http(s) link');
    if (i.length > 500) throw new ValidationError('Image link is too long');
    out.image = i || null;
  }
  if (input.pinned !== undefined) out.pinned = Boolean(input.pinned);
  return out;
}

async function assertPost(postId: number) {
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
  if (!post) throw new NotFoundError('Post not found');
}

export async function listUpdates(postId: number) {
  await assertPost(postId);
  const [post, updates] = await Promise.all([
    prisma.post.findUnique({ where: { id: postId }, select: { liveEndedAt: true } }),
    prisma.liveUpdate.findMany({
      where: { postId },
      orderBy: { createdAt: 'desc' },
      include: { author: authorSelect },
    }),
  ]);
  return { liveEndedAt: post?.liveEndedAt ?? null, updates };
}

export async function createUpdate(postId: number, authorId: string, input: LiveUpdateInput) {
  await assertPost(postId);
  const data = normalize(input, false);
  if (!hasContent(data.body ?? '', data.format!) && !data.image) throw new ValidationError('Write something or add an image');
  if ((await prisma.liveUpdate.count({ where: { postId } })) >= MAX_UPDATES) {
    throw new ValidationError(`A live blog can hold up to ${MAX_UPDATES} updates — start a new one`);
  }
  const created = await prisma.liveUpdate.create({
    data: { postId, authorId, headline: data.headline, format: data.format, body: data.body ?? '', image: data.image, pinned: data.pinned ?? false },
    include: { author: authorSelect },
  });
  telegram.announceLiveUpdate(created.id);
  return created;
}

export async function updateUpdate(postId: number, id: number, input: LiveUpdateInput) {
  const existing = await prisma.liveUpdate.findFirst({ where: { id, postId } });
  if (!existing) throw new NotFoundError('Update not found');
  const data = normalize(input, true);
  const body = data.body ?? existing.body;
  const image = data.image !== undefined ? data.image : existing.image;
  if (!hasContent(body, data.format ?? existing.format) && !image) throw new ValidationError('Write something or add an image');
  const updated = await prisma.liveUpdate.update({ where: { id }, data, include: { author: authorSelect } });
  // Pinning alone doesn't change what readers see in the channel.
  if (data.headline !== undefined || data.body !== undefined || data.format !== undefined) telegram.editLiveUpdate(id);
  return updated;
}

export async function deleteUpdate(postId: number, id: number) {
  const { count } = await prisma.liveUpdate.deleteMany({ where: { id, postId } });
  if (!count) throw new NotFoundError('Update not found');
  telegram.removeLiveUpdate(id);
}

/** Close coverage (readers stop polling) or reopen it. */
export async function setCoverage(postId: number, ended: boolean) {
  await assertPost(postId);
  const post = await prisma.post.update({
    where: { id: postId },
    data: { liveEndedAt: ended ? new Date() : null },
    select: { liveEndedAt: true },
  });
  if (ended) telegram.announceCoverageEnded(postId);
  return { liveEndedAt: post.liveEndedAt };
}

/** Public feed for a published live blog, or null when there is none. */
export async function publicFeed(slug: string) {
  const post = await prisma.post.findFirst({
    where: { slug, status: 'published', type: 'post', articleType: 'live' },
    select: {
      liveEndedAt: true,
      liveUpdates: { select: liveUpdatePublicSelect, orderBy: { createdAt: 'desc' } },
    },
  });
  return post ? { liveEndedAt: post.liveEndedAt, updates: post.liveUpdates } : null;
}
