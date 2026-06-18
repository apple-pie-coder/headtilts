const BASE = (import.meta.env.VITE_API_URL as string) || '/api';

export interface PollOptionResult {
  id: number;
  text: string;
  order: number;
  votes: number | null;
  percentage: number | null;
  isMyVote: boolean;
}

export interface PublicPoll {
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
  totalVotes: number;
  hasVoted: boolean;
  showResults: boolean;
  options: PollOptionResult[];
}

export async function fetchPublicPoll(slug: string, voterIdentifier?: string): Promise<PublicPoll> {
  const url = new URL(`${BASE}/public/polls/${slug}`, window.location.origin);
  if (voterIdentifier) url.searchParams.set('voterIdentifier', voterIdentifier);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Poll not found');
  const json = await res.json();
  return json.data;
}

export interface PublicPollSummary {
  id: number;
  title: string;
  question: string;
  slug: string;
  description: string | null;
  status: string;
  featuredImage: string | null;
  endsAt: string | null;
  _count: { votes: number };
}

export async function fetchPublicPolls(page = 1, limit = 20): Promise<{ items: PublicPollSummary[]; total: number; page: number; limit: number }> {
  const url = new URL(`${BASE}/public/polls`, window.location.origin);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Failed to load polls');
  const json = await res.json();
  return json.data;
}

export async function submitVote(slug: string, optionIds: number[], voterIdentifier: string): Promise<PublicPoll> {
  const url = new URL(`${BASE}/public/polls/${slug}/vote`, window.location.origin);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ optionIds, voterIdentifier }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || 'Vote failed');
  return json.data;
}
