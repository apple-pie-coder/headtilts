import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { PERMISSIONS } from '@headtilts/shared';
import { pushNotification } from '../realtime/notifications.gateway';
import { sendMail } from './mail.service';

export type NotificationType =
  | 'comment'
  | 'contact'
  | 'post_published'
  | 'post_scheduled'
  | 'user_registered'
  | 'failed_login'
  | 'security_alert'
  | 'api_key_created'
  | 'user_deactivated'
  | 'media_storage_high';

export type NotificationChannel = 'email' | 'inapp' | 'both' | 'none';

export interface NotificationTypeDef {
  type: NotificationType;
  label: string;
  description: string;
  defaultChannel: NotificationChannel;
  hasThreshold: boolean;
  thresholdLabel?: string;
  thresholdDefault?: number;
}

export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  {
    type: 'user_registered',
    label: 'New User Registration',
    description: 'When a new user creates an account.',
    defaultChannel: 'inapp',
    hasThreshold: false,
  },
  {
    type: 'comment',
    label: 'New Comments',
    description: 'When a new comment is submitted or needs moderation.',
    defaultChannel: 'inapp',
    hasThreshold: false,
  },
  {
    type: 'contact',
    label: 'Contact Form Submissions',
    description: 'When someone submits the contact form on the public site.',
    defaultChannel: 'inapp',
    hasThreshold: false,
  },
  {
    type: 'post_published',
    label: 'Post Published',
    description: 'When a scheduled post is automatically published.',
    defaultChannel: 'inapp',
    hasThreshold: false,
  },
  {
    type: 'post_scheduled',
    label: 'Post Scheduled',
    description: 'When a post is scheduled for future publishing.',
    defaultChannel: 'inapp',
    hasThreshold: false,
  },
  {
    type: 'failed_login',
    label: 'Failed Login Attempts',
    description: 'When there are repeated failed login attempts on an account.',
    defaultChannel: 'both',
    hasThreshold: true,
    thresholdLabel: 'Alert after N failed attempts',
    thresholdDefault: 5,
  },
  {
    type: 'security_alert',
    label: 'Security Alerts',
    description: 'Critical security events such as suspicious IP access or account compromise.',
    defaultChannel: 'both',
    hasThreshold: false,
  },
  {
    type: 'api_key_created',
    label: 'New API Key Created',
    description: 'When a new API key is created for any user.',
    defaultChannel: 'inapp',
    hasThreshold: false,
  },
  {
    type: 'user_deactivated',
    label: 'User Account Deactivated',
    description: 'When a user account is deactivated by an administrator.',
    defaultChannel: 'inapp',
    hasThreshold: false,
  },
  {
    type: 'media_storage_high',
    label: 'High Media Storage Usage',
    description: 'When media storage usage exceeds a configured percentage of the disk limit.',
    defaultChannel: 'inapp',
    hasThreshold: true,
    thresholdLabel: 'Alert at % disk usage',
    thresholdDefault: 80,
  },
];

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
 * Get a user's notification preference for a given type.
 * Falls back to the type's default channel if no preference is set.
 */
async function getPreference(userId: string, type: NotificationType): Promise<{ channel: NotificationChannel; enabled: boolean }> {
  const pref = await prisma.userNotificationPreference.findUnique({
    where: { userId_type: { userId, type } },
  });
  if (pref) {
    return { channel: pref.channel as NotificationChannel, enabled: pref.enabled };
  }
  const def = NOTIFICATION_TYPES.find((t) => t.type === type);
  return { channel: def?.defaultChannel ?? 'inapp', enabled: true };
}

/**
 * Persist one notification per recipient, filtering by their preferences,
 * and push it live to connected sockets. Optionally send email.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const recipients = Array.from(new Set(input.recipientIds)).filter(Boolean);
  if (recipients.length === 0) return;

  await Promise.all(
    recipients.map(async (userId) => {
      const { channel, enabled } = await getPreference(userId, input.type);
      if (!enabled || channel === 'none') return;

      const sendInApp = channel === 'inapp' || channel === 'both';
      const sendEmail = channel === 'email' || channel === 'both';

      let row: { id: number; userId: string; type: string; title: string; body: string | null; link: string | null; data: unknown; readAt: Date | null; createdAt: Date } | null = null;

      if (sendInApp) {
        row = await prisma.notification.create({
          data: {
            userId,
            type: input.type,
            title: input.title,
            body: input.body ?? null,
            link: input.link ?? null,
            ...(input.data ? { data: input.data as Prisma.InputJsonValue } : {}),
          },
        });
        pushNotification(userId, row);
      }

      if (sendEmail) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (user?.email) {
          sendMail({
            to: user.email,
            subject: input.title,
            text: [input.title, input.body].filter(Boolean).join('\n\n'),
            html: `<p><strong>${input.title}</strong></p>${input.body ? `<p>${input.body}</p>` : ''}${input.link ? `<p><a href="${input.link}">View in admin</a></p>` : ''}`,
          }).catch(() => {
            /* non-fatal — email failure should not break the in-app flow */
          });
        }
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Per-event helpers
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

export async function notifyApiKeyCreated(input: {
  userId: string;
  name: string;
}): Promise<void> {
  const recipientIds = await getUserIdsWithPermission(PERMISSIONS.USER_MANAGE_ROLES);
  await notify({
    type: 'api_key_created',
    title: `New API key created: "${input.name}"`,
    body: `A new API key was created by user ${input.userId}.`,
    link: '/admin/api-keys',
    recipientIds,
  });
}

// ---------------------------------------------------------------------------
// Notification preferences CRUD
// ---------------------------------------------------------------------------

export interface NotificationPreferenceRow {
  type: string;
  channel: string;
  enabled: boolean;
  threshold: number | null;
}

export async function getPreferences(userId: string): Promise<NotificationPreferenceRow[]> {
  const rows = await prisma.userNotificationPreference.findMany({ where: { userId } });
  // Merge with defaults so all types are always represented
  return NOTIFICATION_TYPES.map((def) => {
    const saved = rows.find((r) => r.type === def.type);
    return {
      type: def.type,
      channel: saved?.channel ?? def.defaultChannel,
      enabled: saved?.enabled ?? true,
      threshold: saved?.threshold ?? def.thresholdDefault ?? null,
    };
  });
}

export async function updatePreferences(
  userId: string,
  prefs: Array<{ type: string; channel: NotificationChannel; enabled: boolean; threshold?: number | null }>,
): Promise<void> {
  await Promise.all(
    prefs.map((p) =>
      prisma.userNotificationPreference.upsert({
        where: { userId_type: { userId, type: p.type } },
        create: {
          userId,
          type: p.type,
          channel: p.channel,
          enabled: p.enabled,
          threshold: p.threshold ?? null,
        },
        update: {
          channel: p.channel,
          enabled: p.enabled,
          threshold: p.threshold ?? null,
        },
      }),
    ),
  );
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
