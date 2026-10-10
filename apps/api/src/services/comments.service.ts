import crypto from 'crypto';
import { prisma } from '../config/database';
import { NotFoundError, ValidationError } from '../utils/errors';
import { sendMail } from './mail.service';
import * as notifications from './notifications.service';

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮'] as const;

export const COMMENT_STATUSES = ['pending', 'approved', 'spam', 'trash'] as const;

interface DiscussionSettings {
  commentsOpen: boolean;
  requireNameEmail: boolean;
  closeAfterDays: number;
  moderateAll: boolean;
  moderateFirst: boolean;
  notifyAuthor: boolean;
  notifyModeration: boolean;
  showAvatars: boolean;
  defaultAvatar: string;
  avatarRating: string;
  adminEmail: string;
}

async function getDiscussionSettings(): Promise<DiscussionSettings> {
  const keys = [
    'default_comment_status', 'require_name_email_for_comments', 'close_comments_days',
    'comment_moderation', 'moderate_first_comment',
    'comment_notify_author', 'comment_notify_moderation',
    'show_avatars', 'default_avatar', 'avatar_rating', 'admin_email',
  ];
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const map: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return {
    commentsOpen: map.default_comment_status !== 'closed',
    requireNameEmail: map.require_name_email_for_comments !== 'no',
    closeAfterDays: Math.max(0, Number(map.close_comments_days) || 0),
    moderateAll: map.comment_moderation === 'yes',
    moderateFirst: map.moderate_first_comment !== 'no',
    notifyAuthor: map.comment_notify_author !== 'no',
    notifyModeration: map.comment_notify_moderation !== 'no',
    showAvatars: map.show_avatars !== 'no',
    defaultAvatar: map.default_avatar || 'mystery',
    avatarRating: (map.avatar_rating || 'G').toLowerCase(),
    adminEmail: map.admin_email || '',
  };
}

function commentsOpenForPost(
  post: { publishedAt: Date | null; commentStatus: string | null },
  settings: DiscussionSettings,
): boolean {
  // A per-post override beats the site default; null means inherit the default.
  if (post.commentStatus === 'closed') return false;
  const effectiveOpen = post.commentStatus === 'open' ? true : settings.commentsOpen;
  if (!effectiveOpen) return false;

  // Age-based auto-close is an independent guard that applies regardless.
  if (settings.closeAfterDays > 0 && post.publishedAt) {
    const ageMs = Date.now() - post.publishedAt.getTime();
    if (ageMs > settings.closeAfterDays * 24 * 60 * 60 * 1000) return false;
  }
  return true;
}

// Gravatar default-image param for the stored setting value
const AVATAR_DEFAULTS: Record<string, string> = {
  mystery: 'mp',
  blank: 'blank',
  gravatar: '404',
  identicon: 'identicon',
  wavatar: 'wavatar',
  monsterid: 'monsterid',
  retro: 'retro',
};

function avatarUrl(email: string, settings: DiscussionSettings): string | null {
  if (!settings.showAvatars) return null;
  // HMAC with the app secret so the hash cannot be reverse-looked-up to
  // recover the commenter's email address via rainbow tables.
  // Gravatar won't find a personalised image (it expects plain MD5), so it
  // will serve the configured default avatar — which is the intended behaviour
  // for anonymous commenters anyway.
  const hash = crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'dev-secret')
    .update(email.trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
  const d = AVATAR_DEFAULTS[settings.defaultAvatar] || 'mp';
  return `https://www.gravatar.com/avatar/${hash}?s=96&d=${d}&r=${settings.avatarRating}`;
}

interface ReactionSummary {
  emoji: string;
  count: number;
  reacted: boolean;
}

function summarizeReactions(
  reactions: { emoji: string; visitorId: string }[],
  visitorId?: string,
): ReactionSummary[] {
  // Always return every emoji so the UI can render the full reaction bar
  return REACTION_EMOJIS.map((emoji) => {
    const matching = reactions.filter((r) => r.emoji === emoji);
    return {
      emoji,
      count: matching.length,
      reacted: visitorId ? matching.some((r) => r.visitorId === visitorId) : false,
    };
  });
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export async function listPublicComments(slug: string, visitorId?: string) {
  const post = await prisma.post.findFirst({
    where: { slug, status: 'published', type: 'post' },
    select: { id: true, publishedAt: true, commentStatus: true },
  });
  if (!post) throw new NotFoundError('Post not found');

  const settings = await getDiscussionSettings();

  const comments = await prisma.comment.findMany({
    where: { postId: post.id, status: 'approved' },
    orderBy: { createdAt: 'asc' },
    take: 500,
    include: { reactions: { select: { emoji: true, visitorId: true } } },
  });

  return {
    open: commentsOpenForPost(post, settings),
    requireNameEmail: settings.requireNameEmail,
    total: comments.length,
    items: comments.map((comment) => ({
      id: comment.id,
      parentId: comment.parentId,
      authorName: comment.authorName,
      avatarUrl: avatarUrl(comment.authorEmail, settings),
      content: comment.content,
      createdAt: comment.createdAt,
      reactions: summarizeReactions(comment.reactions, visitorId),
    })),
  };
}

interface CreateCommentInput {
  slug: string;
  name?: string;
  email?: string;
  content?: string;
  parentId?: number | null;
  visitorId?: string;
}

export async function createPublicComment(input: CreateCommentInput) {
  const post = await prisma.post.findFirst({
    where: { slug: input.slug, status: 'published', type: 'post' },
    select: { id: true, title: true, slug: true, publishedAt: true, commentStatus: true, author: { select: { email: true } } },
  });
  if (!post) throw new NotFoundError('Post not found');

  const settings = await getDiscussionSettings();
  if (!commentsOpenForPost(post, settings)) {
    throw new ValidationError('Comments are closed for this post');
  }

  const content = input.content?.trim();
  if (!content) throw new ValidationError('Comment text is required');
  if (content.length > 5000) throw new ValidationError('Comment is too long (max 5000 characters)');

  const name = input.name?.trim() || '';
  const email = input.email?.trim().toLowerCase() || '';
  if (settings.requireNameEmail && (!name || !email)) {
    throw new ValidationError('Name and email are required to comment');
  }
  if (name.length > 100) throw new ValidationError('Name is too long (max 100 characters)');
  if (email.length > 254) throw new ValidationError('Email is too long');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError('Invalid email address');
  }

  if (input.parentId != null) {
    const parent = await prisma.comment.findUnique({
      where: { id: input.parentId },
      select: { postId: true, status: true },
    });
    if (!parent || parent.postId !== post.id || parent.status !== 'approved') {
      throw new ValidationError('The comment you are replying to is not available');
    }
  }

  // Moderation policy
  let status = 'approved';
  if (settings.moderateAll) {
    status = 'pending';
  } else if (settings.moderateFirst) {
    // The email is self-asserted (anyone can type a regular's address), so a
    // previous approval only counts when it came from the same browser too —
    // visitorId is a random per-browser id that is never exposed publicly.
    const visitorId = input.visitorId?.trim();
    const previouslyApproved = email && visitorId && visitorId.length >= 8
      ? await prisma.comment.findFirst({
        where: { authorEmail: email, visitorId, status: 'approved' },
        select: { id: true },
      })
      : null;
    if (!previouslyApproved) status = 'pending';
  }

  const comment = await prisma.comment.create({
    data: {
      postId: post.id,
      parentId: input.parentId ?? null,
      authorName: name || 'Anonymous',
      authorEmail: email,
      content,
      status,
      visitorId: input.visitorId || null,
    },
  });

  // Notifications are fire-and-forget; comment creation never fails on email.
  if (status === 'pending' && settings.notifyModeration && settings.adminEmail) {
    sendMail({
      to: settings.adminEmail,
      subject: `Comment awaiting moderation on "${post.title}"`,
      text: `${comment.authorName} <${email}> wrote:\n\n${content}`,
    }).catch((error) => console.error('Moderation notification failed:', error));
  }
  if (status === 'approved' && settings.notifyAuthor && post.author?.email) {
    sendMail({
      to: post.author.email,
      subject: `New comment on "${post.title}"`,
      text: `${comment.authorName} wrote:\n\n${content}`,
    }).catch((error) => console.error('Author notification failed:', error));
  }

  // Real-time in-app notification to moderators (fire-and-forget).
  notifications
    .notifyNewComment({
      postTitle: post.title,
      authorName: comment.authorName,
      content,
      pending: status === 'pending',
    })
    .catch((error) => console.error('Comment notification failed:', error));

  return {
    id: comment.id,
    parentId: comment.parentId,
    authorName: comment.authorName,
    avatarUrl: avatarUrl(email, settings),
    content: comment.content,
    createdAt: comment.createdAt,
    status,
    reactions: summarizeReactions([], input.visitorId),
  };
}

export async function toggleReaction(commentId: number, emoji: string, visitorId?: string) {
  if (!REACTION_EMOJIS.includes(emoji as typeof REACTION_EMOJIS[number])) {
    throw new ValidationError('Unknown reaction');
  }
  const visitor = visitorId?.trim();
  if (!visitor || visitor.length < 8 || visitor.length > 64) {
    throw new ValidationError('A visitor id is required to react');
  }

  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, status: true },
  });
  if (!comment || comment.status !== 'approved') {
    throw new NotFoundError('Comment not found');
  }

  const existing = await prisma.commentReaction.findUnique({
    where: { commentId_emoji_visitorId: { commentId, emoji, visitorId: visitor } },
  });

  if (existing) {
    await prisma.commentReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.commentReaction.create({ data: { commentId, emoji, visitorId: visitor } });
  }

  const reactions = await prisma.commentReaction.findMany({
    where: { commentId },
    select: { emoji: true, visitorId: true },
  });
  return { id: commentId, reactions: summarizeReactions(reactions, visitor) };
}

// ---------------------------------------------------------------------------
// Admin moderation
// ---------------------------------------------------------------------------

export async function listComments(
  page: number,
  limit: number,
  filters: { status?: string; search?: string; authorId?: string; postId?: number; sortBy?: 'createdAt' | 'updatedAt'; sortOrder?: 'asc' | 'desc' } = {},
) {
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.authorId ? { authorEmail: filters.authorId } : {}),
    ...(filters.postId ? { postId: filters.postId } : {}),
    ...(filters.search
      ? {
          OR: [
            { content: { contains: filters.search } },
            { authorName: { contains: filters.search } },
            { authorEmail: { contains: filters.search } },
          ],
        }
      : {}),
  };

  const sortBy = filters.sortBy || 'createdAt';
  const sortOrder = filters.sortOrder || 'desc';

  const [items, total, grouped] = await Promise.all([
    prisma.comment.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        post: { select: { id: true, title: true, slug: true } },
        parent: { select: { id: true, authorName: true } },
        _count: { select: { reactions: true } },
      },
    }),
    prisma.comment.count({ where }),
    prisma.comment.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const statusCounts: Record<string, number> = { pending: 0, approved: 0, spam: 0, trash: 0 };
  for (const group of grouped) {
    statusCounts[group.status] = group._count._all;
  }

  return { items, total, statusCounts };
}

export async function setCommentStatus(id: number, status: string) {
  if (!COMMENT_STATUSES.includes(status as typeof COMMENT_STATUSES[number])) {
    throw new ValidationError('Invalid comment status');
  }
  const existing = await prisma.comment.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Comment not found');

  return prisma.comment.update({
    where: { id },
    data: { status },
    include: {
      post: { select: { id: true, title: true, slug: true } },
      parent: { select: { id: true, authorName: true } },
      _count: { select: { reactions: true } },
    },
  });
}

export async function deleteComment(id: number) {
  const existing = await prisma.comment.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Comment not found');
  await prisma.comment.delete({ where: { id } });
}
