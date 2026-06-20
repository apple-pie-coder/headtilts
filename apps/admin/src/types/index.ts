export interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  bio?: string | null;
  isActive: boolean;
  mfaEnabled?: boolean;
  roles: Role[];
}

export interface Role {
  id: number;
  name: string;
  description?: string | null;
  isSystem?: boolean;
  mfaRequired?: boolean;
  permissions?: Permission[];
}

export interface Permission {
  id: number;
  module: string;
  action: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  parentId?: number | null;
  parent?: { id: number; name: string } | null;
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
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PostAuthor {
  id: number;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
}

export interface Post {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt?: string | null;
  type: string;
  parentId?: number | null;
  parent?: { id: number; title: string; slug: string } | null;
  status: string;
  publishedAt?: string | null;
  scheduledFor?: string | null;
  featuredImage?: string | null;
  template?: string | null;
  isFeatured?: boolean;
  showSidebar?: boolean;
  commentStatus?: string | null;
  showToc?: string | null;
  publicUrl?: string;
  authorId?: string | null;
  author?: PostAuthor | null;
  coAuthors?: { user: PostAuthor }[];
  categories: { category: Category }[];
  tags: { tag: Tag }[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  canonicalUrl?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaUploader {
  id: string;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface MediaFolder {
  id: number;
  name: string;
  slug: string;
  count?: number;
}

export interface Media {
  id: number;
  filename: string;
  originalName: string;
  url: string;
  originalUrl?: string | null;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  altText?: string | null;
  title?: string | null;
  caption?: string | null;
  description?: string | null;
  thumbnailUrl?: string | null;
  mediumUrl?: string | null;
  folderId?: number | null;
  folder?: { id: number; name: string; slug: string } | null;
  uploadedBy?: MediaUploader | null;
  createdAt: string;
}

export interface ContactSubmission {
  id: number;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface Setting {
  key: string;
  value: string;
  type: string;
}

export interface DashboardRecentPost {
  id: number;
  title: string;
  slug: string;
  status: string;
  author: { id: string; username: string; firstName: string | null; lastName: string | null } | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface DashboardRecentMedia {
  id: number;
  filename: string;
  originalName: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface DashboardRecentComment {
  id: number;
  authorName: string;
  content: string;
  status: string;
  createdAt: string;
  post: { id: number; title: string; slug: string };
}

export interface DashboardRecentUser {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatar: string | null;
  createdAt: string;
}

export interface DashboardUpcomingCelebration {
  id: number;
  name: string;
  type: CelebrationType;
  month: number;
  day: number;
  year: number | null;
  photo: string | null;
  message: string | null;
  daysUntil: number;
}

export interface DashboardStats {
  posts: { published: number; draft: number; scheduled: number; trash: number; total: number };
  pages: { count: number };
  media: { count: number; totalSize: number };
  categories: { count: number };
  tags: { count: number };
  users: { count: number; active: number };
  recentPosts: DashboardRecentPost[];
  recentMedia: DashboardRecentMedia[];
  comments: { pending: number; recent: DashboardRecentComment[] };
  recentUsers: DashboardRecentUser[];
  upcomingCelebrations: DashboardUpcomingCelebration[];
}

export interface MenuItem {
  id: number;
  menuId: number;
  parentId: number | null;
  title: string;
  url: string | null;
  postId: number | null;
  categoryId: number | null;
  tagId: number | null;
  position: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Menu {
  id: number;
  name: string;
  location: string;
  description: string | null;
  items: MenuItem[];
  createdAt: string;
  updatedAt: string;
}

export interface MenuSummary {
  id: number;
  name: string;
  location: string;
  description: string | null;
  _count: { items: number };
  createdAt: string;
  updatedAt: string;
}

export interface WidgetType {
  value: string;
  label: string;
}

export interface Widget {
  id: number;
  name: string;
  type: string;
  title: string | null;
  description: string | null;
  isActive: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ZoneWidget extends Widget {
  position: number;
}

export interface WidgetZone {
  id: number;
  name: string;
  description: string | null;
  maxWidgets: number;
  widgets: ZoneWidget[];
}

export interface SitemapEntry {
  id: number;
  url: string;
  priority: number;
  changefreq: string | null;
  lastmod: string | null;
}

export interface RevisionChangeEntry {
  field: string;
  label: string;
  from?: string;
  to?: string;
  note?: string;
}

export interface RevisionSnapshot {
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  featuredImage: string | null;
  template: string | null;
  isFeatured: boolean;
  showSidebar: boolean;
  commentStatus: string | null;
  showToc: string | null;
  parentId: number | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  categoryIds: number[];
  tagNames: string[];
}

export interface PostRevision {
  id: number;
  postId: number;
  action: string;
  changes: RevisionChangeEntry[] | null;
  snapshot: RevisionSnapshot | null;
  isArchived: boolean;
  createdAt: string;
  user: {
    id: string;
    username: string;
    firstName: string | null;
    lastName: string | null;
    avatar: string | null;
  };
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (identifier: string, password: string) => Promise<{ mfaRequired: true; mfaToken: string } | void>;
  completeMfaLogin: (mfaToken: string, code: string) => Promise<void>;
  completeMfaBackupLogin: (mfaToken: string, backupCode: string) => Promise<void>;
  setup: (input: SetupInput) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  hasPermission: (permission: string) => boolean;
}

export interface SetupInput {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AdminComment {
  id: number;
  postId: number;
  parentId: number | null;
  authorName: string;
  authorEmail: string;
  content: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  post: { id: number; title: string; slug: string };
  parent: { id: number; authorName: string } | null;
  _count: { reactions: number };
}
