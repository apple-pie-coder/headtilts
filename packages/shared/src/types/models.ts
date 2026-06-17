// Database model types

export interface User {
  id: string;
  email: string;
  username: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  bio?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Post {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  authorId: number;
  status: PostStatus;
  publishedAt?: Date;
  scheduledFor?: Date;
  createdAt: Date;
  updatedAt: Date;
  featuredImage?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

export type PostStatus = 'draft' | 'published' | 'scheduled' | 'archived';

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  parentId?: number;
  icon?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Menu {
  id: number;
  name: string;
  location: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MenuItem {
  id: number;
  menuId: number;
  parentId?: number;
  title: string;
  url?: string;
  postId?: number;
  categoryId?: number;
  tagId?: number;
  position: number;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Widget {
  id: number;
  name: string;
  type: string;
  title?: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WidgetZone {
  id: number;
  name: string;
  description?: string;
  maxWidgets: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Setting {
  id: number;
  key: string;
  value: string;
  type: string;
}
