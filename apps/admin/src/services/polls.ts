import { apiClient } from './api';

export interface PollOption {
  id?: number;
  text: string;
  order: number;
}

export interface Poll {
  id: number;
  title: string;
  question: string;
  slug: string;
  description: string | null;
  status: string;
  voteMode: string;
  resultVisibility: string;
  voterRestriction: string;
  allowVoteChange: boolean;
  startsAt: string | null;
  endsAt: string | null;
  featuredImage: string | null;
  postId: number | null;
  createdAt: string;
  updatedAt: string;
  options: (PollOption & { _count: { votes: number } })[];
  _count: { votes: number };
}

export interface PollInput {
  title: string;
  question: string;
  slug?: string;
  description?: string;
  status?: string;
  voteMode?: string;
  resultVisibility?: string;
  voterRestriction?: string;
  allowVoteChange?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  featuredImage?: string | null;
  postId?: number | null;
  options: PollOption[];
}

export async function fetchPolls(page = 1, limit = 20, search?: string, status?: string) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  const res = await apiClient.get(`/polls?${params}`);
  return res.data.data as { items: Poll[]; pagination: { page: number; limit: number; total: number; pages: number } };
}

export async function fetchPoll(id: number) {
  const res = await apiClient.get(`/polls/${id}`);
  return res.data.data as Poll;
}

export async function createPoll(input: PollInput) {
  const res = await apiClient.post('/polls', input);
  return res.data.data as Poll;
}

export async function updatePoll(id: number, input: Partial<PollInput>) {
  const res = await apiClient.put(`/polls/${id}`, input);
  return res.data.data as Poll;
}

export async function deletePoll(id: number) {
  await apiClient.delete(`/polls/${id}`);
}

export async function resetPollVotes(id: number) {
  const res = await apiClient.post(`/polls/${id}/reset`, {});
  return res.data.data as Poll;
}

export function exportPollUrl(id: number) {
  const base = (import.meta.env.VITE_API_URL as string) || '/api';
  return `${base}/polls/${id}/export`;
}
