import { apiClient } from './api';

export type FeedbackType = 'bug' | 'idea' | 'question';

export interface FeedbackItem {
  id: number;
  type: FeedbackType;
  title: string;
  description: string;
  pagePath: string | null;
  screenshot: string | null;
  context: { browser?: string; viewport?: string; theme?: string; appVersion?: string; errors?: string[] } | null;
  syncStatus: 'pending' | 'synced' | 'failed' | 'disabled';
  syncError: string | null;
  issueNumber: number | null;
  issueUrl: string | null;
  issueState: 'open' | 'closed' | null;
  createdAt: string;
  user: { id: string; username: string; firstName: string | null; lastName: string | null; avatar: string | null } | null;
}

export interface FeedbackStatus {
  configured: boolean;
  repo: string | null;
  private: boolean | null;
}

export interface FeedbackInput {
  type: FeedbackType;
  title: string;
  description: string;
  pagePath: string;
  context?: FeedbackItem['context'];
  screenshot?: string | null;
}

export async function fetchFeedbackStatus(): Promise<FeedbackStatus> {
  return (await apiClient.get('/feedback/status')).data.data;
}

export async function sendFeedback(input: FeedbackInput): Promise<FeedbackItem> {
  return (await apiClient.post('/feedback', input)).data.data;
}

export async function fetchFeedback(page: number, limit: number, filters: { type?: string; state?: string } = {}) {
  const res = await apiClient.get('/feedback', { params: { page, limit, type: filters.type || undefined, state: filters.state || undefined } });
  return res.data.data as { items: FeedbackItem[]; pagination: { page: number; limit: number; total: number; pages: number } };
}

export async function resyncFeedback(id: number): Promise<FeedbackItem> {
  return (await apiClient.post(`/feedback/${id}/sync`)).data.data;
}

export async function deleteFeedback(id: number): Promise<void> {
  await apiClient.delete(`/feedback/${id}`);
}
