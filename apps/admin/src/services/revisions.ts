import { apiClient } from './api';
import { Post, PostRevision } from '../types';

export async function fetchRevisions(postId: number, includeArchived = false): Promise<PostRevision[]> {
  const res = await apiClient.get(`/posts/${postId}/revisions`, {
    params: includeArchived ? { archived: 'true' } : {},
  });
  return res.data.data;
}

export async function archiveRevision(postId: number, revisionId: number): Promise<void> {
  await apiClient.patch(`/posts/${postId}/revisions/${revisionId}/archive`);
}

export async function restoreRevision(postId: number, revisionId: number): Promise<Post> {
  const res = await apiClient.post(`/posts/${postId}/revisions/${revisionId}/restore`);
  return res.data.data;
}
