const BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000/api';
const BASE_ORIGIN = BASE.replace(/\/api\/?$/, '');

export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${BASE_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data as T;
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || `HTTP ${res.status}`);
  }
  const json = await res.json();
  return json.data as T;
}

export { get, post };

export async function fetchAuthorProfile(username: string, page = 1) {
  return get<import('../types').AuthorProfileResult>(`/public/authors/${encodeURIComponent(username)}`, { page });
}
