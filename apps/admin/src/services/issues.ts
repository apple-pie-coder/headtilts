import { apiClient } from './api';

export type ColumnId = 'todo' | 'in_progress' | 'review' | 'done';

export interface IssueUser { login: string; avatarUrl: string; url: string }
export interface IssueLabel { name: string; color: string; description?: string | null }

export interface IssueSummary {
  number: number;
  title: string;
  state: 'open' | 'closed';
  stateReason: string | null;
  column: ColumnId;
  labels: IssueLabel[];
  author: IssueUser | null;
  assignees: (IssueUser | null)[];
  comments: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  url: string;
}

export interface IssueComment { id: number; author: IssueUser | null; createdAt: string; updatedAt: string; bodyHtml: string; url: string }
export interface IssueDetail extends IssueSummary { body: string; bodyHtml: string; thread: IssueComment[]; screenshots?: string[] }

export interface IssueBoard { repo: string; columns: { id: ColumnId; name: string }[]; items: IssueSummary[] }

export type IssueSummaryInfo =
  | { configured: false }
  | { configured: true; repo: string; counts: Record<ColumnId, number>; recent: IssueSummary[]; createdAt: string[]; created?: { number: number; createdAt: string }[] };

/** Cached on the server for a minute; cheap enough for badges and the dashboard. */
export async function fetchIssueSummary(): Promise<IssueSummaryInfo> {
  return (await apiClient.get('/issues/summary')).data.data;
}

export async function fetchIssues(): Promise<IssueBoard> {
  return (await apiClient.get('/issues')).data.data;
}

export async function fetchIssueLabels(): Promise<IssueLabel[]> {
  return (await apiClient.get('/issues/labels')).data.data;
}

export async function fetchIssue(number: number): Promise<IssueDetail> {
  return (await apiClient.get(`/issues/${number}`)).data.data;
}

export async function createIssue(input: { title: string; body: string; labels: string[]; column: ColumnId }): Promise<IssueSummary> {
  return (await apiClient.post('/issues', input)).data.data;
}

export async function updateIssue(number: number, input: { title?: string; labels?: string[]; state?: 'open' | 'closed'; stateReason?: 'completed' | 'not_planned' }): Promise<IssueSummary> {
  return (await apiClient.patch(`/issues/${number}`, input)).data.data;
}

export async function moveIssue(number: number, column: ColumnId): Promise<IssueSummary> {
  return (await apiClient.put(`/issues/${number}/column`, { column })).data.data;
}

export async function commentOnIssue(number: number, body: string): Promise<IssueComment> {
  return (await apiClient.post(`/issues/${number}/comments`, { body })).data.data;
}
