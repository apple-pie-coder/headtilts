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
  showSidebar: boolean;
  startsAt: string | null;
  endsAt: string | null;
  featuredImage: string | null;
  telegramPost?: string | null;
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
  showSidebar?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  featuredImage?: string | null;
  telegramPost?: string | null;
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

export interface PollOptionBreakdown {
  id: number;
  text: string;
  votes: number;
  percentage: number;
}

export interface PollBreakdownItem {
  id: number;
  title: string;
  status: string;
  slug: string;
  totalVotes: number;
  options: PollOptionBreakdown[];
}

export interface PollAnalyticsData {
  overview: {
    total: number;
    open: number;
    closed: number;
    draft: number;
    scheduled: number;
    totalVotes: number;
    mostVotedTitle: string | null;
    mostVotedCount: number;
  };
  pollBreakdown: PollBreakdownItem[];
  votesOverTime: { date: string; votes: number }[];
}

export async function fetchPollAnalytics() {
  const res = await apiClient.get('/polls/analytics');
  return res.data.data as PollAnalyticsData;
}

export async function resetPollVotes(id: number) {
  const res = await apiClient.post(`/polls/${id}/reset`, {});
  return res.data.data as Poll;
}

/**
 * Download a poll's votes as CSV. Fetched with the login attached (a plain link
 * can't send the Authorization header, so it always got 401), then saved.
 */
export async function downloadPollCsv(id: number, slug?: string) {
  const res = await apiClient.get(`/polls/${id}/export`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `${slug || `poll-${id}`}-votes.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface PollShareClick {
  id: number;
  shareId: number;
  name: string | null;
  gender: string | null;
  age: number | null;
  clickedAt: string;
}

export interface PollShare {
  id: number;
  pollId: number;
  token: string;
  sharerIdentifier: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  note: string | null;
  channel: string;
  clicks: number;
  firstClickAt: string | null;
  lastClickAt: string | null;
  createdAt: string;
  clickDetails: PollShareClick[];
}

export async function fetchPollShares(pollId: number): Promise<PollShare[]> {
  const res = await apiClient.get(`/polls/${pollId}/shares`);
  return res.data.data as PollShare[];
}

export type PollImageFormat = 'square' | 'story' | 'wide';

/** PNG of a finished poll's results, sized for sharing (see the API's pollImage.service). */
export async function fetchPollResultsImage(id: number, format: PollImageFormat): Promise<Blob> {
  const res = await apiClient.get(`/polls/${id}/results-image`, { params: { format }, responseType: 'blob' });
  return res.data as Blob;
}

/** Results are final once a poll is closed, or open past its end time. */
export function pollHasEnded(poll: Pick<Poll, 'status' | 'endsAt'>): boolean {
  return poll.status === 'closed' || (poll.status === 'open' && !!poll.endsAt && new Date(poll.endsAt) <= new Date());
}
