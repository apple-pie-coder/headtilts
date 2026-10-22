import { PaginatedResponse } from '@headtilts/shared';
import { apiClient } from './api';
import { ArticleType, Post, QnaSession, Review } from '../types';

export interface PostInput {
  title: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  type?: string;
  parentId?: number | null;
  status?: string;
  scheduledFor?: string | null;
  /** Publish date for a published post; future dates are rejected (use scheduledFor). */
  publishedAt?: string | null;
  featuredImage?: string;
  featuredImageFocus?: string | null;
  template?: string | null;
  isFeatured?: boolean;
  showSidebar?: boolean;
  commentStatus?: string | null;
  showToc?: string | null;
  /** 'yes' / 'no' overrides the Telegram setting for the post's type; null follows it. */
  telegramPost?: string | null;
  telegramLiveUpdates?: boolean;
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
  articleType?: ArticleType;
  videoUrl?: string | null;
  /** Object = save, null = remove, omitted = leave as is. */
  review?: Review | null;
  qna?: QnaSession | null;
  seo?: { focusKeyword: string | null; seoScore: number | null; readabilityScore: number | null };
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
  articleType?: string;
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
      articleType: filters.articleType || undefined,
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

/**
 * `fromEditor` marks saves made from the post editor: the API refuses them
 * while another user holds the edit lock (HTTP 423).
 */
export async function updatePost(id: number, input: Partial<PostInput>, opts: { fromEditor?: boolean } = {}): Promise<Post> {
  const response = await apiClient.put(`/posts/${id}`, input, opts.fromEditor ? { headers: { 'X-Post-Lock': '1' } } : undefined);
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
