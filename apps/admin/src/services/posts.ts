import { PaginatedResponse } from '@headtilts/shared';
import { apiClient } from './api';
import { Post } from '../types';

export interface PostInput {
  title: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  type?: string;
  parentId?: number | null;
  status?: string;
  scheduledFor?: string | null;
  featuredImage?: string;
  template?: string | null;
  isFeatured?: boolean;
  showSidebar?: boolean;
  commentStatus?: string | null;
  showToc?: string | null;
  categoryIds?: number[];
  tagNames?: string[];
  authorId?: string | null;
  coAuthorIds?: string[];
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

export interface AuthorListItem {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
}

export async function fetchAuthorList(): Promise<AuthorListItem[]> {
  const response = await apiClient.get('/posts/author-list');
  return response.data.data;
}

export interface PostListResult extends PaginatedResponse<Post> {
  statusCounts: Record<string, number>;
}

export interface FetchPostsFilters {
  search?: string;
  status?: string;
  categoryId?: number;
  authorId?: string;
  featured?: boolean;
  type?: string;
  template?: string;
  sortBy?: 'publishedAt' | 'updatedAt' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export async function fetchPosts(
  page: number,
  limit: number,
  filters: FetchPostsFilters = {}
): Promise<PostListResult> {
  const response = await apiClient.get('/posts', {
    params: {
      page,
      limit,
      search: filters.search || undefined,
      status: filters.status || undefined,
      categoryId: filters.categoryId || undefined,
      authorId: filters.authorId || undefined,
      featured: filters.featured !== undefined ? String(filters.featured) : undefined,
      template: filters.template || undefined,
      sortBy: filters.sortBy || undefined,
      sortOrder: filters.sortOrder || undefined,
      type: filters.type || 'post',
    },
  });
  return response.data.data;
}

export async function fetchPost(id: number): Promise<Post> {
  const response = await apiClient.get(`/posts/${id}`);
  return response.data.data;
}

export async function createPost(input: PostInput): Promise<Post> {
  const response = await apiClient.post('/posts', input);
  return response.data.data;
}

export async function updatePost(id: number, input: Partial<PostInput>): Promise<Post> {
  const response = await apiClient.put(`/posts/${id}`, input);
  return response.data.data;
}

export async function deletePost(id: number): Promise<void> {
  await apiClient.delete(`/posts/${id}`);
}

export async function fetchPreviewLink(id: number): Promise<{ url: string; expiresAt: string }> {
  const response = await apiClient.get(`/posts/${id}/preview-link`);
  return response.data.data;
}

export async function duplicatePost(id: number): Promise<Post> {
  const response = await apiClient.post(`/posts/${id}/duplicate`);
  return response.data.data;
}

export async function bulkPosts(ids: number[], action: string): Promise<{ count: number }> {
  const response = await apiClient.post('/posts/bulk', { ids, action });
  return response.data.data;
}
