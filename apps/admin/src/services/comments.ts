import { apiClient } from './api';
import { AdminComment } from '../types';

export interface CommentListResult {
  items: AdminComment[];
  statusCounts: Record<string, number>;
  pagination: { page: number; limit: number; total: number; pages: number };
}

export async function fetchComments(
  page: number,
  limit: number,
  filters: { status?: string; search?: string; authorId?: string; postId?: number; sortBy?: 'createdAt' | 'updatedAt'; sortOrder?: 'asc' | 'desc' } = {},
): Promise<CommentListResult> {
  const response = await apiClient.get('/comments', {
    params: {
      page,
      limit,
      status: filters.status || undefined,
      search: filters.search || undefined,
      authorId: filters.authorId || undefined,
      postId: filters.postId || undefined,
      sortBy: filters.sortBy || undefined,
      sortOrder: filters.sortOrder || undefined,
    },
  });
  return response.data.data;
}

export async function setCommentStatus(id: number, status: string): Promise<AdminComment> {
  const response = await apiClient.put(`/comments/${id}/status`, { status });
  return response.data.data;
}

export async function deleteComment(id: number): Promise<void> {
  await apiClient.delete(`/comments/${id}`);
}
