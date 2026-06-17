export interface Author {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  bio?: string | null;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: number | null;
  icon?: string | null;
  showSidebar?: boolean;
  _count?: { posts: number };
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  _count?: { posts: number };
}

export interface PostSummary {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  type: string;
  parentId?: number | null;
  publishedAt: string | null;
  updatedAt: string;
  featuredImage: string | null;
  template?: string | null;
  isFeatured?: boolean;
  showSidebar?: boolean;
  author: Author | null;
  coAuthors: { user: Author }[];
  categories: { category: Category }[];
  tags: { tag: Tag }[];
}

export interface PostFull extends PostSummary {
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PostListResult {
  items: PostSummary[];
  pagination: Pagination;
}

export interface MenuItem {
  id: number;
  parentId: number | null;
  title: string;
  url: string | null;
  position: number;
}

export interface Menu {
  id: number;
  name: string;
  location: string;
  items: MenuItem[];
}

export interface SiteSettings {
  site_title: string;
  site_tagline: string;
  show_tagline: string;
  site_logo: string;
  site_logo_dark: string;
  site_description: string;
  timezone: string;
  date_format: string;
  time_format: string;
  posts_per_page: string;
  front_page_display: string;
  search_engine_visibility?: string;
  permalink_structure?: string;
  front_page_id: string;
  posts_page_id: string;
  contact_page_id: string;
  about_page_id: string;
  // Resolved page slugs (populated by API alongside the IDs)
  front_page_slug?: string;
  posts_page_slug?: string;
  contact_page_slug?: string;
  about_page_slug?: string;
}

export interface CommentReactionSummary {
  emoji: string;
  count: number;
  reacted: boolean;
}

export interface PublicComment {
  id: number;
  parentId: number | null;
  authorName: string;
  avatarUrl: string | null;
  content: string;
  createdAt: string;
  status?: string;
  reactions: CommentReactionSummary[];
}

export interface CommentListResult {
  open: boolean;
  requireNameEmail: boolean;
  total: number;
  items: PublicComment[];
}

export interface CalendarMonth {
  year: number;
  month: number;
  weekStartsOn: number;
  days: Record<number, number>;
  prev: { year: number; month: number } | null;
  next: { year: number; month: number } | null;
}

export type CelebrationType = 'birthday' | 'remembrance';

export interface Celebration {
  id: number;
  name: string;
  type: CelebrationType;
  month: number;
  day: number;
  year: number | null;
  photo: string | null;
  message: string | null;
}

export interface TodaysCelebrations {
  date: string; // YYYY-MM-DD in the site timezone
  items: Celebration[];
}

export interface PublicWidget {
  id: number;
  type: string;
  title: string | null;
  config: Record<string, unknown>;
  data: unknown;
}

export interface PublicWidgetZone {
  name: string;
  description: string | null;
  widgets: PublicWidget[];
}

export interface AuthorProfile {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  bio: string | null;
}

export interface AuthorProfileResult {
  author: AuthorProfile;
  posts: PostListResult;
}
