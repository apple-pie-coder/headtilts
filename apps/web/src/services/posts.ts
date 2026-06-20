import { get, post } from './api';
import { CommentListResult, CommentReactionSummary, PostFull, PostListResult, PublicComment } from '../types';

export function fetchPosts(opts: {
  page?: number;
  limit?: number;
  category?: string;
  tag?: string;
  search?: string;
  featured?: boolean;
  year?: number;
  month?: number;
  day?: number;
}): Promise<PostListResult> {
  return get('/public/posts', {
    page: opts.page,
    limit: opts.limit,
    category: opts.category,
    tag: opts.tag,
    search: opts.search,
    featured: opts.featured === true ? 'true' : opts.featured === false ? 'false' : undefined,
    year: opts.year,
    month: opts.month,
    day: opts.day,
  });
}

export function fetchPost(slug: string): Promise<PostFull> {
  return get(`/public/posts/${slug}`);
}

export function fetchPage(slug: string): Promise<PostFull> {
  return get(`/public/pages/${slug}`);
}

export function resolvePath(path: string): Promise<PostFull> {
  return get('/public/resolve', { path });
}

export function fetchComments(slug: string, visitorId?: string): Promise<CommentListResult> {
  return get(`/public/posts/${slug}/comments`, { visitorId });
}

export function createComment(
  slug: string,
  input: { name: string; email: string; content: string; parentId?: number | null; visitorId?: string },
): Promise<PublicComment> {
  return post(`/public/posts/${slug}/comments`, input);
}

export function toggleCommentReaction(
  commentId: number,
  emoji: string,
  visitorId: string,
): Promise<{ id: number; reactions: CommentReactionSummary[] }> {
  return post(`/public/comments/${commentId}/reactions`, { emoji, visitorId });
}

export function fetchPreview(id: string, token: string, exp: string): Promise<PostFull> {
  return get(`/public/preview/${id}`, { token, exp });
}

export interface PostReactionSummary { emoji: string; count: number; reacted: boolean }

export function fetchPostReactions(slug: string, visitorId: string): Promise<PostReactionSummary[]> {
  return get(`/public/posts/${slug}/reactions`, { visitorId });
}

export function togglePostReaction(
  slug: string,
  emoji: string,
  visitorId: string,
): Promise<PostReactionSummary> {
  return post(`/public/posts/${slug}/reactions`, { emoji, visitorId });
}

export interface RelatedPost {
  id: number; title: string; slug: string; publishedAt: string | null;
  featuredImage: string | null; excerpt: string | null;
}

export function fetchRelatedPosts(slug: string, limit?: number): Promise<RelatedPost[]> {
  return get(`/public/posts/${slug}/related`, { limit });
}

export interface SeriesInfo {
  id: number; name: string; slug: string; totalParts: number; currentPart: number;
  prev: { title: string; slug: string } | null;
  next: { title: string; slug: string } | null;
}

export function fetchPostSeries(slug: string): Promise<SeriesInfo | null> {
  return get(`/public/posts/${slug}/series`);
}
