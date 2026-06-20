import { get } from './api';

export type SearchType = 'all' | 'posts' | 'pages' | 'tags' | 'categories' | 'polls';

export interface PostResult {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
  featuredImage: string | null;
  author: { username: string; firstName: string | null; lastName: string | null } | null;
  categories: { category: { name: string; slug: string } }[];
}

export interface PageResult {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
}

export interface TagResult {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  postCount: number;
}

export interface CategoryResult {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  postCount: number;
}

export interface PollResult {
  id: number;
  title: string;
  slug: string;
  question: string;
  status: string;
  totalVotes: number;
}

export interface SearchGrouped {
  query: string;
  type: 'all';
  grouped: {
    posts: { items: PostResult[]; total: number };
    pages: { items: PageResult[]; total: number };
    tags: { items: TagResult[]; total: number };
    categories: { items: CategoryResult[]; total: number };
    polls: { items: PollResult[]; total: number };
  };
  total: number;
}

export interface SearchPaged {
  query: string;
  type: string;
  items: (PostResult | PageResult | TagResult | CategoryResult | PollResult)[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

export function searchAll(q: string): Promise<SearchGrouped> {
  return get('/public/search', { q, type: 'all' });
}

export function searchType(q: string, type: SearchType, page = 1): Promise<SearchPaged> {
  return get('/public/search', { q, type, page });
}
