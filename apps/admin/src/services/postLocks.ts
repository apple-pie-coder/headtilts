import { apiClient, getAccessToken } from './api';

export interface LockUser {
  id: string;
  name: string;
  avatar: string | null;
}

export interface PostLock {
  postId: number;
  user: LockUser;
  since: string;
}

export interface LockResult {
  status: 'acquired' | 'locked';
  lock: PostLock;
  ttlMs: number;
}

export async function acquirePostLock(postId: number, opts: { takeover?: boolean; heartbeat?: boolean } = {}): Promise<LockResult> {
  const response = await apiClient.post(`/posts/${postId}/lock`, opts);
  return response.data.data;
}

export async function releasePostLock(postId: number): Promise<void> {
  await apiClient.delete(`/posts/${postId}/lock`);
}

/** Release while the tab is closing — `keepalive` lets the request outlive the page. */
export function releasePostLockOnUnload(postId: number): void {
  const token = getAccessToken();
  const base = (apiClient.defaults.baseURL ?? '').replace(/\/$/, '');
  try {
    fetch(`${base}/posts/${postId}/lock`, {
      method: 'DELETE',
      keepalive: true,
      credentials: 'include',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Auth-Transport': 'cookie' },
    }).catch(() => {});
  } catch {
    /* the lock simply expires */
  }
}

export async function fetchPostLocks(postIds: number[]): Promise<PostLock[]> {
  if (postIds.length === 0) return [];
  const response = await apiClient.get('/posts/locks', { params: { ids: postIds.join(',') } });
  return response.data.data;
}
