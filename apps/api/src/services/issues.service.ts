import { prisma } from '../config/database';
import { ApiError, NotFoundError, ValidationError } from '../utils/errors';
import { gh, ghCachedGet, github, GitHubError } from '../utils/github';

/**
 * A small project tracker over the repository's GitHub issues. Board columns
 * are GitHub state plus "status: …" labels, so the board stays in sync with
 * whatever is done on github.com.
 */

export const COLUMNS = [
  { id: 'todo', name: 'To do', label: null },
  { id: 'in_progress', name: 'In progress', label: 'status: in progress', color: 'fbca04', description: 'Being worked on' },
  { id: 'review', name: 'In review', label: 'status: in review', color: '1d76db', description: 'Done, waiting to be checked' },
  { id: 'done', name: 'Done', label: null },
] as const;
type ColumnId = (typeof COLUMNS)[number]['id'];
const STATUS_LABELS: string[] = COLUMNS.flatMap((c) => (c.label ? [c.label] : []));

interface GhLabel { name: string; color: string; description?: string | null }
interface GhUser { login: string; avatar_url: string; html_url: string }
interface GhIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  state_reason?: string | null;
  labels: GhLabel[];
  user: GhUser | null;
  assignees?: GhUser[];
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
  body?: string | null;
  body_html?: string | null;
  pull_request?: unknown;
}
interface GhComment { id: number; user: GhUser | null; created_at: string; updated_at: string; body?: string; body_html?: string; html_url: string }

function repo() {
  const cfg = github();
  if (!cfg) throw new ApiError('NOT_CONFIGURED', 'GitHub is not connected. Set GITHUB_FEEDBACK_TOKEN and GITHUB_FEEDBACK_REPO.', 503);
  return cfg.repo;
}

/** GitHub failures become API errors the admin can show. */
async function call<T>(method: string, path: string, body?: unknown, html = false): Promise<T> {
  try {
    return await gh<T>(method, path, body, { html });
  } catch (err) {
    if (err instanceof GitHubError) {
      if (err.status === 404) throw new NotFoundError('Issue not found on GitHub');
      if (err.status === 401 || err.status === 403) {
        throw new ApiError('GITHUB_FORBIDDEN', 'GitHub refused the request — check the token can read and write issues.', 502);
      }
      if (err.status === 422) throw new ValidationError(err.message.replace(/^GitHub 422: /, ''));
      throw new ApiError('GITHUB_ERROR', err.message, 502);
    }
    throw new ApiError('GITHUB_UNREACHABLE', 'Could not reach GitHub. Try again in a moment.', 502);
  }
}

/** GET through the ETag cache, with the same error mapping as call(). */
async function cachedCall<T>(path: string): Promise<T> {
  try {
    return await ghCachedGet<T>(path);
  } catch (err) {
    if (err instanceof GitHubError) return call<T>('GET', path); // let call() map the error
    throw new ApiError('GITHUB_UNREACHABLE', 'Could not reach GitHub. Try again in a moment.', 502);
  }
}

export function columnOf(issue: Pick<GhIssue, 'state' | 'labels'>): ColumnId {
  if (issue.state === 'closed') return 'done';
  const names = issue.labels.map((l) => l.name.toLowerCase());
  for (const c of COLUMNS) if (c.label && names.includes(c.label)) return c.id;
  return 'todo';
}

const user = (u: GhUser | null) => (u ? { login: u.login, avatarUrl: u.avatar_url, url: u.html_url } : null);

function summary(i: GhIssue) {
  return {
    number: i.number,
    title: i.title,
    state: i.state,
    stateReason: i.state_reason ?? null,
    column: columnOf(i),
    labels: i.labels.filter((l) => !STATUS_LABELS.includes(l.name.toLowerCase())).map((l) => ({ name: l.name, color: l.color })),
    author: user(i.user),
    assignees: (i.assignees ?? []).map(user),
    comments: i.comments,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    closedAt: i.closed_at,
    url: i.html_url,
  };
}

// The dashboard and sidebar badges poll this, so keep GitHub traffic down.
let summaryCache: { at: number; value: unknown } | null = null;
/** Called after anything changes issues from this site (board, feedback button). */
export const forgetSummary = () => { summaryCache = null; };

/** Counts per column, the latest activity and creation times (for "new since you looked"). */
export async function getSummary() {
  if (!github()) return { configured: false as const };
  // Short: re-checks are cheap thanks to ETags, and counts should feel live.
  if (summaryCache && Date.now() - summaryCache.at < 15_000) return summaryCache.value;
  const board = await listIssues();
  const counts = Object.fromEntries(COLUMNS.map((c) => [c.id, board.items.filter((i) => i.column === c.id).length]));
  const open = board.items.filter((i) => i.state === 'open');
  const value = {
    configured: true as const,
    repo: board.repo,
    counts,
    recent: [...open].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 4),
    createdAt: open.map((i) => i.createdAt).sort().reverse().slice(0, 50),
    // With numbers, so the admin can leave out issues raised from your own feedback.
    created: open.map((i) => ({ number: i.number, createdAt: i.createdAt })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50),
  };
  summaryCache = { at: Date.now(), value };
  return value;
}

/** Open issues plus the most recently closed ones — what a board needs. */
export async function listIssues() {
  const r = repo();
  const [open, closed] = await Promise.all([
    cachedCall<GhIssue[]>(`/repos/${r}/issues?state=open&per_page=100&sort=updated`),
    cachedCall<GhIssue[]>(`/repos/${r}/issues?state=closed&per_page=40&sort=updated`),
  ]);
  const items = [...open, ...closed].filter((i) => !i.pull_request).map(summary);
  return { repo: r, columns: COLUMNS.map(({ id, name }) => ({ id, name })), items };
}

let labelCache: { at: number; labels: GhLabel[] } | null = null;

export async function listLabels(fresh = false) {
  const r = repo();
  if (fresh || !labelCache || Date.now() - labelCache.at > 5 * 60_000) {
    const labels = await call<GhLabel[]>('GET', `/repos/${r}/labels?per_page=100`);
    labelCache = { at: Date.now(), labels };
  }
  return labelCache.labels
    .filter((l) => !STATUS_LABELS.includes(l.name.toLowerCase()))
    .map((l) => ({ name: l.name, color: l.color, description: l.description ?? null }));
}

export async function getIssue(number: number) {
  const r = repo();
  const [issue, comments] = await Promise.all([
    call<GhIssue>('GET', `/repos/${r}/issues/${number}`, undefined, true),
    call<GhComment[]>('GET', `/repos/${r}/issues/${number}/comments?per_page=100`, undefined, true),
  ]);
  if (issue.pull_request) throw new NotFoundError('That number is a pull request, not an issue');
  // Screenshots from the feedback button live on our server, not on GitHub.
  const shots = await prisma.feedback.findMany({ where: { issueNumber: number, screenshot: { not: null } }, select: { screenshot: true } });
  return {
    ...summary(issue),
    body: issue.body ?? '',
    bodyHtml: localImages(issue.body_html ?? ''),
    screenshots: shots.map((s) => s.screenshot!).filter((s) => s.startsWith('/uploads/feedback/')),
    thread: comments.map((c) => ({
      id: c.id, author: user(c.user), createdAt: c.created_at, updatedAt: c.updated_at, bodyHtml: c.body_html ?? '', url: c.html_url,
    })),
  };
}

/**
 * Older issues embed screenshots by our own site address, which GitHub's image
 * proxy can't reach. Point those images back at the file on this server.
 */
function localImages(html: string) {
  const site = (process.env.ADMIN_URL || process.env.SITE_URL || '').replace(/\/admin\/?$/, '').replace(/\/$/, '');
  if (!site) return html;
  const esc = site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html
    .replace(new RegExp(`<img([^>]*?)src="[^"]*"([^>]*?)data-canonical-src="${esc}(/uploads/[^"]+)"`, 'g'), '<img$1src="$3"$2data-canonical-src="$3"')
    .replace(new RegExp(`href="${esc}(/uploads/[^"]+)"`, 'g'), 'href="$1"');
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// Everything is posted with one token, so say who did it in the admin.
const signed = (body: string, by: string) => `${body}\n\n<sub>— ${by} via the Headtilts admin</sub>`;

/** Only labels that exist in the repo (minus the status ones the board manages). */
async function validLabels(raw: unknown): Promise<string[] | undefined> {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) throw new ValidationError('labels must be a list');
  const known = new Map((await listLabels()).map((l) => [l.name.toLowerCase(), l.name]));
  const out = raw.slice(0, 20).map((n) => known.get(String(n).toLowerCase())).filter((n): n is string => !!n);
  return [...new Set(out)];
}

/** Make sure the board's status labels exist (created on first use). */
async function ensureStatusLabel(name: string) {
  const col = COLUMNS.find((c) => c.label === name)!;
  try {
    await call('POST', `/repos/${repo()}/labels`, { name, color: 'color' in col ? col.color : 'ededed', description: 'description' in col ? col.description : '' });
  } catch (err) {
    if (!(err instanceof ValidationError)) throw err; // 422 = it already exists
  }
}

export async function createIssue(input: Record<string, unknown>, by: string) {
  forgetSummary();
  const title = text(input.title, 256);
  if (!title) throw new ValidationError('A title is required');
  const body = text(input.body, 60_000);
  const labels = (await validLabels(input.labels)) ?? [];
  const column = COLUMNS.find((c) => c.id === input.column && c.label);
  if (column?.label) { await ensureStatusLabel(column.label); labels.push(column.label); }
  const issue = await call<GhIssue>('POST', `/repos/${repo()}/issues`, { title, body: signed(body || '_No description._', by), labels });
  return summary(issue);
}

export async function updateIssue(number: number, input: Record<string, unknown>) {
  forgetSummary();
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = text(input.title, 256);
    if (!title) throw new ValidationError('A title is required');
    patch.title = title;
  }
  const labels = await validLabels(input.labels);
  if (labels) {
    // Keep the issue's status label; the board owns that one.
    const current = await call<GhIssue>('GET', `/repos/${repo()}/issues/${number}`);
    const status = current.labels.map((l) => l.name).filter((n) => STATUS_LABELS.includes(n.toLowerCase()));
    patch.labels = [...labels, ...status];
  }
  if (input.state === 'open' || input.state === 'closed') {
    patch.state = input.state;
    if (input.state === 'closed') patch.state_reason = input.stateReason === 'not_planned' ? 'not_planned' : 'completed';
  }
  if (!Object.keys(patch).length) throw new ValidationError('Nothing to change');
  return summary(await call<GhIssue>('PATCH', `/repos/${repo()}/issues/${number}`, patch));
}

/** Move a card between board columns: swaps status labels and opens/closes as needed. */
export async function moveIssue(number: number, columnId: unknown) {
  forgetSummary();
  const target = COLUMNS.find((c) => c.id === columnId);
  if (!target) throw new ValidationError('Unknown column');
  const current = await call<GhIssue>('GET', `/repos/${repo()}/issues/${number}`);
  if (current.pull_request) throw new NotFoundError('That number is a pull request, not an issue');
  const keep = current.labels.map((l) => l.name).filter((n) => !STATUS_LABELS.includes(n.toLowerCase()));
  if (target.label) await ensureStatusLabel(target.label);
  const patch: Record<string, unknown> = { labels: target.label ? [...keep, target.label] : keep };
  if (target.id === 'done') { patch.state = 'closed'; patch.state_reason = 'completed'; }
  else if (current.state === 'closed') patch.state = 'open';
  return summary(await call<GhIssue>('PATCH', `/repos/${repo()}/issues/${number}`, patch));
}

export async function addComment(number: number, input: Record<string, unknown>, by: string) {
  forgetSummary();
  const body = text(input.body, 60_000);
  if (!body) throw new ValidationError('Write a comment first');
  const c = await call<GhComment>('POST', `/repos/${repo()}/issues/${number}/comments`, { body: signed(body, by) }, true);
  return { id: c.id, author: user(c.user), createdAt: c.created_at, updatedAt: c.updated_at, bodyHtml: c.body_html ?? '', url: c.html_url };
}
