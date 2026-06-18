import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { NotFoundError } from '../utils/errors';

export interface ChangeEntry {
  field: string;
  label: string;
  from?: string;
  to?: string;
  note?: string;
}

// Fields that are snapshotted and restored
export interface PostSnapshot {
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

const revisionUserSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  avatar: true,
} as const;

export async function recordRevision(data: {
  postId: number;
  userId: string;
  action: string;
  changes: ChangeEntry[];
  snapshot?: PostSnapshot;
}): Promise<void> {
  await prisma.postRevision.create({
    data: {
      postId: data.postId,
      userId: data.userId,
      action: data.action,
      changes: data.changes.length ? (data.changes as unknown as Prisma.InputJsonValue) : undefined,
      snapshot: data.snapshot ? (data.snapshot as unknown as Prisma.InputJsonValue) : undefined,
      isArchived: false,
    },
  });
}

export async function getRevisions(postId: number, includeArchived = false) {
  return prisma.postRevision.findMany({
    where: {
      postId,
      ...(includeArchived ? {} : { isArchived: false }),
    },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: revisionUserSelect } },
  });
}

export async function archiveRevision(id: number, postId: number) {
  const revision = await prisma.postRevision.findFirst({ where: { id, postId } });
  if (!revision) throw new NotFoundError('Revision not found');
  return prisma.postRevision.update({ where: { id }, data: { isArchived: true } });
}

export async function restoreRevision(id: number, postId: number): Promise<PostSnapshot> {
  const revision = await prisma.postRevision.findFirst({ where: { id, postId } });
  if (!revision) throw new NotFoundError('Revision not found');
  if (!revision.snapshot) throw new NotFoundError('This revision has no saved snapshot — it was created before content snapshots were enabled');
  return revision.snapshot as unknown as PostSnapshot;
}

// ── Diff helpers (used by posts.controller) ────────────────────────────────

interface OldSnapshot {
  title: string;
  slug: string;
  status: string;
  content: string;
  excerpt: string | null;
  featuredImage: string | null;
  template: string | null;
  isFeatured: boolean;
  showSidebar: boolean;
  commentStatus: string | null;
  parentId: number | null;
  scheduledFor: Date | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  categories: { category: { name: string } }[];
  tags: { tag: { name: string } }[];
}

interface PostInput {
  title?: string;
  slug?: string;
  status?: string;
  content?: string;
  excerpt?: string;
  featuredImage?: string;
  template?: string | null;
  isFeatured?: boolean;
  showSidebar?: boolean;
  commentStatus?: string | null;
  parentId?: number | null;
  scheduledFor?: string | null;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  categoryIds?: number[];
  tagNames?: string[];
}

function trunc(s: string, max = 60): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function fmtDate(d: Date | null): string {
  if (!d) return 'none';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtBool(v: boolean): string { return v ? 'Yes' : 'No'; }

export function computeDiff(old: OldSnapshot, updated: OldSnapshot, input: PostInput): ChangeEntry[] {
  const c: ChangeEntry[] = [];
  const str = (v: string | null | undefined) => v ?? '';

  if (input.title !== undefined && old.title !== updated.title)
    c.push({ field: 'title', label: 'Title', from: trunc(old.title), to: trunc(updated.title) });

  if (input.slug !== undefined && old.slug !== updated.slug)
    c.push({ field: 'slug', label: 'Slug', from: trunc(old.slug, 50), to: trunc(updated.slug, 50) });

  if (old.status !== updated.status)
    c.push({ field: 'status', label: 'Status', from: old.status, to: updated.status });

  if (input.scheduledFor !== undefined) {
    const oldDate = old.scheduledFor ? old.scheduledFor.getTime() : null;
    const newDate = updated.scheduledFor ? updated.scheduledFor.getTime() : null;
    if (oldDate !== newDate)
      c.push({ field: 'scheduledFor', label: 'Scheduled for', from: fmtDate(old.scheduledFor), to: fmtDate(updated.scheduledFor) });
  }

  if (input.content !== undefined && old.content !== updated.content) {
    const delta = updated.content.length - old.content.length;
    const sign = delta >= 0 ? '+' : '';
    c.push({ field: 'content', label: 'Content', note: `Updated (${sign}${delta.toLocaleString()} chars, ${updated.content.length.toLocaleString()} total)` });
  }

  if (input.excerpt !== undefined && str(old.excerpt) !== str(updated.excerpt)) {
    const hadExcerpt = !!old.excerpt?.trim();
    const hasExcerpt = !!updated.excerpt?.trim();
    const note = !hadExcerpt && hasExcerpt ? 'Added' : hadExcerpt && !hasExcerpt ? 'Removed' : 'Updated';
    c.push({ field: 'excerpt', label: 'Excerpt', note });
  }

  if (input.featuredImage !== undefined) {
    const o = str(old.featuredImage), n = str(updated.featuredImage);
    if (o !== n)
      c.push({ field: 'featuredImage', label: 'Featured Image', note: !o && n ? 'Added' : o && !n ? 'Removed' : 'Changed' });
  }

  if (input.template !== undefined && str(old.template) !== str(updated.template))
    c.push({ field: 'template', label: 'Template', from: old.template || 'Default', to: updated.template || 'Default' });

  if (input.isFeatured !== undefined && old.isFeatured !== updated.isFeatured)
    c.push({ field: 'isFeatured', label: 'Featured on homepage', from: fmtBool(old.isFeatured), to: fmtBool(updated.isFeatured) });

  if (input.showSidebar !== undefined && old.showSidebar !== updated.showSidebar)
    c.push({ field: 'showSidebar', label: 'Sidebar', from: old.showSidebar ? 'Shown' : 'Hidden', to: updated.showSidebar ? 'Shown' : 'Hidden' });

  if (input.commentStatus !== undefined && str(old.commentStatus) !== str(updated.commentStatus))
    c.push({ field: 'commentStatus', label: 'Comments', from: old.commentStatus || 'Site default', to: updated.commentStatus || 'Site default' });

  if (input.parentId !== undefined && old.parentId !== updated.parentId)
    c.push({ field: 'parentId', label: 'Parent page', from: old.parentId ? String(old.parentId) : 'None', to: updated.parentId ? String(updated.parentId) : 'None' });

  // Categories
  if (input.categoryIds !== undefined) {
    const oldNames = old.categories.map((x) => x.category.name).sort();
    const newNames = updated.categories.map((x) => x.category.name).sort();
    const added = newNames.filter((n) => !oldNames.includes(n));
    const removed = oldNames.filter((n) => !newNames.includes(n));
    if (added.length || removed.length) {
      const parts: string[] = [];
      if (added.length)   parts.push(`+${added.join(', +')}`);
      if (removed.length) parts.push(`-${removed.join(', -')}`);
      c.push({ field: 'categories', label: 'Categories', note: parts.join('  ') });
    }
  }

  // Tags
  if (input.tagNames !== undefined) {
    const oldNames = old.tags.map((x) => x.tag.name).sort();
    const newNames = updated.tags.map((x) => x.tag.name).sort();
    const added = newNames.filter((n) => !oldNames.includes(n));
    const removed = oldNames.filter((n) => !newNames.includes(n));
    if (added.length || removed.length) {
      const parts: string[] = [];
      if (added.length)   parts.push(`+${added.join(', +')}`);
      if (removed.length) parts.push(`-${removed.join(', -')}`);
      c.push({ field: 'tags', label: 'Tags', note: parts.join('  ') });
    }
  }

  // SEO fields — list which ones changed
  const seoFields: [keyof PostInput, string][] = [
    ['metaTitle', 'Meta Title'], ['metaDescription', 'Meta Description'],
    ['metaKeywords', 'Meta Keywords'], ['canonicalUrl', 'Canonical URL'],
    ['ogTitle', 'OG Title'], ['ogDescription', 'OG Description'], ['ogImage', 'OG Image'],
  ];
  const changedSeo: string[] = [];
  for (const [key, label] of seoFields) {
    if (input[key] !== undefined && str(old[key as keyof OldSnapshot] as string) !== str(input[key] as string))
      changedSeo.push(label);
  }
  if (changedSeo.length)
    c.push({ field: 'seo', label: 'SEO', note: changedSeo.join(', ') });

  return c;
}

export function deriveAction(oldStatus: string, newStatus: string): string {
  if (newStatus === 'published' && oldStatus !== 'published') return 'published';
  if (newStatus === 'scheduled') return 'scheduled';
  if (newStatus === 'trash') return 'trashed';
  if (oldStatus === 'published' && newStatus !== 'published') return 'unpublished';
  return 'updated';
}

// Build a restorable snapshot from the current post state returned by getPostById
export function buildSnapshot(post: {
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
  categories: { categoryId: number; category: { name: string } }[];
  tags: { tag: { name: string } }[];
}): PostSnapshot {
  return {
    title: post.title,
    slug: post.slug,
    content: post.content,
    excerpt: post.excerpt,
    featuredImage: post.featuredImage,
    template: post.template,
    isFeatured: post.isFeatured,
    showSidebar: post.showSidebar,
    commentStatus: post.commentStatus,
    showToc: post.showToc,
    parentId: post.parentId,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    metaKeywords: post.metaKeywords,
    canonicalUrl: post.canonicalUrl,
    ogTitle: post.ogTitle,
    ogDescription: post.ogDescription,
    ogImage: post.ogImage,
    categoryIds: post.categories.map((c) => c.categoryId),
    tagNames: post.tags.map((t) => t.tag.name),
  };
}
