import { apiClient } from './api';
import { PostRevision } from '../types';

export async function fetchRevisions(postId: number, includeArchived = false): Promise<PostRevision[]> {
  const res = await apiClient.get(`/posts/${postId}/revisions`, {
    params: includeArchived ? { archived: 'true' } : {},
  });
  return res.data.data;
}

export async function archiveRevision(postId: number, revisionId: number): Promise<void> {
  await apiClient.patch(`/posts/${postId}/revisions/${revisionId}/archive`);
}
