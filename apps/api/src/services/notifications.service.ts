import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { PERMISSIONS } from '@headtilts/shared';
import { pushNotification } from '../realtime/notifications.gateway';

export type NotificationType = 'comment' | 'contact' | 'post_published' | 'user_registered';

interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  data?: Record<string, unknown> | null;
  recipientIds: string[];
}

/**
 * Resolve active users holding a given permission string ("module_action").
 * Mirrors how the JWT permission strings are built in auth.service
 * (`${permission.module}_${permission.action}`), so it splits on the first
 * underscore to keep multi-word actions like "manage_roles" intact.
 */
export async function getUserIdsWithPermission(permission: string): Promise<string[]> {
  const idx = permission.indexOf('_');
  if (idx === -1) return [];
  const module = permission.slice(0, idx);
  const action = permission.slice(idx + 1);

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      userRoles: { some: { role: { permissions: { some: { permission: { module, action } } } } } },
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * Persist one notification per recipient and push it live to any connected
 * sockets. Recipient counts are small (admins), so individual creates are fine
 * and give us the real row (id/createdAt) to push.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const recipients = Array.from(new Set(input.recipientIds)).filter(Boolean);
  if (recipients.length === 0) return;

  const rows = await Promise.all(
    recipients.map((userId) =>
      prisma.notification.create({
        data: {
          userId,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          link: input.link ?? null,
          ...(input.data ? { data: input.data as Prisma.InputJsonValue } : {}),
        },
      }),
    ),
  );

  for (const row of rows) {
    pushNotification(row.userId, row);
  }
}

// ---------------------------------------------------------------------------
// Per-event helpers — resolve recipients by permission, then notify.
// Call these fire-and-forget at the trigger sites (never block the request).
// ---------------------------------------------------------------------------

export async function notifyNewComment(input: {
  postTitle: string;
  authorName: string;
  content: string;
  pending: boolean;
}): Promise<void> {
  const recipientIds = await getUserIdsWithPermission(PERMISSIONS.COMMENT_MODERATE);
  await notify({
    type: 'comment',
    title: input.pending
      ? `Comment awaiting moderation on "${input.postTitle}"`
      : `New comment on "${input.postTitle}"`,
    body: `${input.authorName}: ${input.content.slice(0, 140)}`,
    link: '/admin/comments',
    recipientIds,
  });
}

export async function notifyNewContact(input: {
  id: number;
  name: string;
  subject?: string | null;
}): Promise<void> {
  const recipientIds = await getUserIdsWithPermission(PERMISSIONS.SETTING_READ);
  await notify({
    type: 'contact',
    title: `New contact submission${input.subject ? `: ${input.subject}` : ''}`,
    body: `From ${input.name}`,
    link: '/admin/contact',
    data: { id: input.id },
    recipientIds,
  });
}

export async function notifyPostPublished(input: {
  id: number;
  title: string;
  authorId: string | null;
}): Promise<void> {
  const byPermission = await getUserIdsWithPermission(PERMISSIONS.POST_PUBLISH);
  const recipientIds = input.authorId ? [...byPermission, input.authorId] : byPermission;
  await notify({
    type: 'post_published',
    title: `Scheduled post published: "${input.title}"`,
    body: 'Your scheduled post is now live.',
    link: `/admin/posts/${input.id}/edit`,
    data: { id: input.id },
    recipientIds,
  });
}

export async function notifyNewUser(input: {
  id: string;
  username: string;
  email: string;
}): Promise<void> {
  const recipientIds = await getUserIdsWithPermission(PERMISSIONS.USER_READ);
  await notify({
    type: 'user_registered',
    title: `New user: ${input.username}`,
    body: input.email,
    link: '/admin/users',
    data: { id: input.id },
    recipientIds,
  });
}

// ---------------------------------------------------------------------------
// Inbox queries (a user's own notifications)
// ---------------------------------------------------------------------------

export async function listForUser(userId: string, cursor: number | undefined, limit: number) {
  const take = Math.min(Math.max(limit, 1), 50);
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function setReadState(userId: string, ids: number[], read: boolean): Promise<void> {
  if (ids.length === 0) return;
  await prisma.notification.updateMany({
    where: { id: { in: ids }, userId },
    data: { readAt: read ? new Date() : null },
  });
}

export async function markAllRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
