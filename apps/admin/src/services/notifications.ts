import { apiClient } from './api';

export type NotificationType = 'comment' | 'contact' | 'post_published' | 'user_registered';

export interface AppNotification {
  id: number;
  type: NotificationType;
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
