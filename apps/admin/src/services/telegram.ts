import { apiClient } from './api';

export type TelegramItemKind = 'post' | 'event' | 'poll';

export interface TelegramDelivery {
  id: number;
  kind: 'post' | 'event' | 'poll' | 'live_update' | 'live_end';
  refId: number;
  postId: number | null;
  title: string;
  status: 'pending' | 'sent' | 'failed';
  error: string | null;
  attempts: number;
  retryAt: string | null;
  sentAt: string | null;
  createdAt: string;
  messageUrl: string | null;
  adminUrl: string | null;
}

export interface TelegramItemStatus {
  configured: boolean;
  enabled: boolean;
  /** Published (or open, for polls): only live items can be posted. */
  live: boolean;
  /** The site and per-item settings would send it automatically. */
  allowed: boolean;
  reason: string | null;
  delivery: TelegramDelivery | null;
  liveUpdates: { enabled: boolean; sent: number; failed: number } | null;
  preview: { html: string; image: string | null; buttons: { text: string; url: string }[][] };
}

const BASE: Record<TelegramItemKind, string> = { post: '/posts', event: '/events', poll: '/polls' };

export async function fetchTelegramStatus(kind: TelegramItemKind, id: number): Promise<TelegramItemStatus> {
  const response = await apiClient.get(`${BASE[kind]}/${id}/telegram`);
  return response.data.data;
}

/** Post it to the channel now (again = a second time, after it was already sent). */
export async function postToTelegram(kind: TelegramItemKind, id: number, again = false): Promise<TelegramItemStatus> {
  const response = await apiClient.post(`${BASE[kind]}/${id}/telegram`, { again });
  return response.data.data;
}

/** Check the bot and channel, and send a short message there. Unsaved values may be passed. */
export async function sendTelegramTest(input: { token?: string; chatId?: string }): Promise<{ bot: string; chat: string; chatType: string }> {
  const response = await apiClient.post('/telegram/test', input);
  return response.data.data;
}

export async function fetchTelegramDeliveries(page = 1, limit = 20, status?: string): Promise<{ items: TelegramDelivery[]; pagination: { page: number; pages: number; total: number } }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) params.set('status', status);
  const response = await apiClient.get(`/telegram/deliveries?${params}`);
  return response.data.data;
}

export async function retryTelegramDelivery(id: number): Promise<TelegramDelivery> {
  const response = await apiClient.post(`/telegram/deliveries/${id}/retry`);
  return response.data.data;
}
