import { apiClient } from './api';

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

export interface NotificationPreference {
  type: NotificationType;
  label: string;
  description: string;
  defaultChannel: NotificationChannel;
  hasThreshold: boolean;
  thresholdLabel?: string;
  thresholdDefault?: number;
  channel: NotificationChannel;
  enabled: boolean;
  threshold: number | null;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  data?: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: AppNotification[];
  nextCursor: number | null;
}

export async function fetchNotifications(cursor?: number, limit = 20): Promise<NotificationPage> {
  const res = await apiClient.get('/notifications', { params: { cursor, limit } });
  return res.data.data;
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await apiClient.get('/notifications/unread-count');
  return res.data.data.count;
}

export async function markNotificationsRead(ids: number[]): Promise<void> {
  await apiClient.post('/notifications/mark-read', { ids });
}

export async function markNotificationsUnread(ids: number[]): Promise<void> {
  await apiClient.post('/notifications/mark-unread', { ids });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.post('/notifications/read-all');
}

export async function fetchNotificationPreferences(): Promise<NotificationPreference[]> {
  const res = await apiClient.get('/notifications/preferences');
  return res.data.data;
}

export async function updateNotificationPreferences(
  prefs: Array<{ type: string; channel: NotificationChannel; enabled: boolean; threshold?: number | null }>,
): Promise<NotificationPreference[]> {
  const res = await apiClient.put('/notifications/preferences', prefs);
  return res.data.data;
}

export async function sendTestNotification(type: string): Promise<void> {
  await apiClient.post('/notifications/test', { type });
}
