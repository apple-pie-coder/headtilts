/**
 * Minimal GitHub REST client for the admin feedback button and issue tracker.
 * Configured with GITHUB_FEEDBACK_TOKEN / GITHUB_FEEDBACK_REPO; the token never
 * leaves the server.
 */

const API = process.env.GITHUB_API_URL || 'https://api.github.com';

export function github() {
  const token = process.env.GITHUB_FEEDBACK_TOKEN?.trim();
  const repo = process.env.GITHUB_FEEDBACK_REPO?.trim();
  return token && repo && /^[\w.-]+\/[\w.-]+$/.test(repo) ? { token, repo } : null;
}

export class GitHubError extends Error {
  constructor(public status: number, message: string) {
    super(`GitHub ${status}: ${message}`);
  }
}

/**
 * Call the GitHub API. With `html`, bodies come back as GitHub's own rendered,
 * sanitised HTML (`body_html`) alongside the markdown.
 */
export async function gh<T>(method: string, urlPath: string, body?: unknown, opts: { html?: boolean } = {}): Promise<T> {
  const cfg = github();
  if (!cfg) throw new Error('GitHub is not configured');
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: opts.html ? 'application/vnd.github.full+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'headtilts-admin',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({})) as { message?: string };
    throw new GitHubError(res.status, detail.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ETag cache for GET requests: GitHub answers "304 Not Modified" for free (it
// doesn't count against the rate limit), so lists can be re-checked often.
const etags = new Map<string, { etag: string; body: unknown }>();

export async function ghCachedGet<T>(urlPath: string): Promise<T> {
  const cfg = github();
  if (!cfg) throw new Error('GitHub is not configured');
  const hit = etags.get(urlPath);
  const res = await fetch(`${API}${urlPath}`, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'headtilts-admin',
      ...(hit ? { 'If-None-Match': hit.etag } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 304 && hit) return hit.body as T;
  if (!res.ok) {
    const detail = await res.json().catch(() => ({})) as { message?: string };
    throw new GitHubError(res.status, detail.message ?? res.statusText);
  }
  const body = await res.json();
  const etag = res.headers.get('etag');
  if (etag) {
    if (etags.size > 100) etags.delete(etags.keys().next().value as string);
    etags.set(urlPath, { etag, body });
  }
  return body as T;
}
