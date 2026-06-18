import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors';
import { slugify } from '@headtilts/shared';
import { buildPostPath, getPermalinkStructure } from '../utils/permalinks';
import * as notifications from './notifications.service';

const VALID_STATUSES = ['draft', 'published', 'scheduled', 'trash'];

// Decorate an admin post response with its public-facing URL
async function withPublicUrl<T extends { id: number; slug: string; type: string; publishedAt: Date | null }>(
  post: T,
): Promise<T & { publicUrl: string }> {
  const publicUrl =
    post.type === 'page'
      ? `/pages/${post.slug}`
      : buildPostPath(await getPermalinkStructure(), post);
  return { ...post, publicUrl };
}

const authorSelect = { id: true, username: true, firstName: true, lastName: true, avatar: true } as const;

const postInclude = {
  author: { select: authorSelect },
  coAuthors: { include: { user: { select: authorSelect } }, orderBy: { order: 'asc' as const } },
  categories: { include: { category: true } },
  tags: { include: { tag: true } },
  parent: { select: { id: true, title: true, slug: true } },
};

async function assertSlugAvailable(slug: string, excludeId?: number) {
  const existing = await prisma.post.findFirst({
    where: { slug, ...(excludeId !== undefined ? { id: { not: excludeId } } : {}) },
  });

  if (existing) {
    throw new ConflictError('A post with this slug already exists');
  }
}

export async function resolveTagsByName(
  tx: Prisma.TransactionClient,
  names: string[]
): Promise<number[]> {
  const trimmed = Array.from(new Set(names.map((name) => name.trim()).filter((name) => name.length > 0)));

  const tagIds: number[] = [];

  for (const name of trimmed) {
    const slug = slugify(name);
    if (!slug) {
      continue;
    }

    let tag = await tx.tag.findFirst({ where: { OR: [{ name }, { slug }] } });
    if (!tag) {
      tag = await tx.tag.create({ data: { name, slug } });
    }

    tagIds.push(tag.id);
  }

  return tagIds;
}

export async function publishDuePosts(): Promise<void> {
  // Select the due posts first so we can notify their authors/editors with a
  // working link, then flip them to published.
  const due = await prisma.post.findMany({
    where: { status: 'scheduled', scheduledFor: { lte: new Date() } },
    select: { id: true, title: true, authorId: true },
  });
  if (due.length === 0) return;

  await prisma.post.updateMany({
    where: { id: { in: due.map((p) => p.id) } },
    data: { status: 'published', publishedAt: new Date(), scheduledFor: null },
  });

  // Real-time in-app notifications (fire-and-forget).
  for (const post of due) {
    notifications
      .notifyPostPublished({ id: post.id, title: post.title, authorId: post.authorId })
      .catch((error) => console.error('Post-published notification failed:', error));
  }
}

interface ListPostsFilters {
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

export async function listPosts(page: number, limit: number, filters: ListPostsFilters = {}) {
  await publishDuePosts();

  const typeFilter = filters.type ?? 'post';

  const where: Prisma.PostWhereInput = {
    type: typeFilter,
    ...(filters.search
      ? { OR: [{ title: { contains: filters.search } }, { slug: { contains: filters.search } }] }
      : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.categoryId !== undefined ? { categories: { some: { categoryId: filters.categoryId } } } : {}),
    ...(filters.authorId !== undefined ? { authorId: filters.authorId } : {}),
    ...(filters.featured !== undefined ? { isFeatured: filters.featured } : {}),
    ...(filters.template !== undefined ? { template: filters.template || null } : {}),
  };

  const orderBy: Prisma.Enumerable<Prisma.PostOrderByWithRelationInput> = [];
  const direction = filters.sortOrder ?? 'desc';
  if (filters.sortBy === 'updatedAt') {
    orderBy.push({ updatedAt: direction });
    orderBy.push({ publishedAt: 'desc' });
  } else if (filters.sortBy === 'title') {
    orderBy.push({ title: direction });
    orderBy.push({ publishedAt: 'desc' });
  } else {
    orderBy.push({ publishedAt: direction });
    orderBy.push({ updatedAt: 'desc' });
  }

  const [posts, total, statusGroups] = await Promise.all([
    prisma.post.findMany({
      where,
      include: postInclude,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.post.count({ where }),
    prisma.post.groupBy({ by: ['status'], where: { type: typeFilter }, _count: { _all: true } }),
  ]);

  const statusCounts: Record<string, number> = { draft: 0, published: 0, scheduled: 0, trash: 0 };
  for (const group of statusGroups) {
    statusCounts[group.status] = group._count._all;
  }

  return { items: posts, total, statusCounts };
}

export async function getPostById(id: number) {
  await publishDuePosts();

  const post = await prisma.post.findUnique({ where: { id }, include: postInclude });
  if (!post) {
    throw new NotFoundError('Post not found');
  }

  return withPublicUrl(post);
}

interface PostInput {
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

interface ResolvedStatus {
  status: string;
  publishedAt: Date | null;
  scheduledFor: Date | null;
}

function resolveStatusForCreate(input: PostInput): ResolvedStatus {
  const status = input.status?.trim() || 'draft';
  if (!VALID_STATUSES.includes(status)) {
    throw new ValidationError('Invalid post status');
  }

  if (status === 'scheduled') {
    const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
    if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) {
      throw new ValidationError('A scheduled post requires a valid scheduledFor date');
    }
    if (scheduledFor.getTime() <= Date.now()) {
      throw new ValidationError('The scheduled date must be in the future');
    }
    return { status, publishedAt: null, scheduledFor };
  }

  if (status === 'published') {
    return { status, publishedAt: new Date(), scheduledFor: null };
  }

  return { status, publishedAt: null, scheduledFor: null };
}

function resolveStatusForUpdate(
  input: PostInput,
  existing: { status: string; publishedAt: Date | null }
): ResolvedStatus {
  const status = input.status?.trim() || existing.status;
  if (!VALID_STATUSES.includes(status)) {
    throw new ValidationError('Invalid post status');
  }

  if (status === 'scheduled') {
    const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
    if (!scheduledFor || Number.isNaN(scheduledFor.getTime())) {
      throw new ValidationError('A scheduled post requires a valid scheduledFor date');
    }
    if (scheduledFor.getTime() <= Date.now()) {
      throw new ValidationError('The scheduled date must be in the future');
    }
    return { status, publishedAt: null, scheduledFor };
  }

  if (status === 'published') {
    return { status, publishedAt: existing.publishedAt ?? new Date(), scheduledFor: null };
  }

  return { status, publishedAt: existing.publishedAt, scheduledFor: null };
}

export async function createPost(input: PostInput, authorId: string) {
  const title = input.title?.trim();
  if (!title) {
    throw new ValidationError('Title is required');
  }

  const content = input.content ?? '';

  const slug = input.slug?.trim() ? slugify(input.slug) : slugify(title);
  if (!slug) {
    throw new ValidationError('Could not derive a valid slug from the title');
  }

  await assertSlugAvailable(slug);

  const { status, publishedAt, scheduledFor } = resolveStatusForCreate(input);

  if (input.categoryIds?.length) {
    const count = await prisma.category.count({ where: { id: { in: input.categoryIds } } });
    if (count !== input.categoryIds.length) {
      throw new ValidationError('One or more categories were not found');
    }
  }

  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        title,
        slug,
        content,
        excerpt: input.excerpt || undefined,
        type: input.type || 'post',
        parentId: input.parentId ?? null,
        authorId,
        status,
        publishedAt,
        scheduledFor,
        featuredImage: input.featuredImage || undefined,
        template: input.template ?? null,
        isFeatured: input.isFeatured ?? false,
        showSidebar: input.showSidebar ?? false,
        commentStatus: input.commentStatus ?? null,
        showToc: input.showToc ?? null,
        metaTitle: input.metaTitle || undefined,
        metaDescription: input.metaDescription || undefined,
        metaKeywords: input.metaKeywords || undefined,
        canonicalUrl: input.canonicalUrl || undefined,
        ogTitle: input.ogTitle || undefined,
        ogDescription: input.ogDescription || undefined,
        ogImage: input.ogImage || undefined,
      },
    });

    if (input.categoryIds?.length) {
      await tx.postCategory.createMany({
        data: input.categoryIds.map((categoryId) => ({ postId: created.id, categoryId })),
      });
    }

    if (input.tagNames?.length) {
      const tagIds = await resolveTagsByName(tx, input.tagNames);
      if (tagIds.length) {
        await tx.postTag.createMany({ data: tagIds.map((tagId) => ({ postId: created.id, tagId })) });
      }
    }

    if (input.coAuthorIds !== undefined) {
      const valid = input.coAuthorIds.filter((uid) => uid && uid !== authorId);
      if (valid.length) {
        await tx.postCoAuthor.createMany({
          data: valid.map((userId, order) => ({ postId: created.id, userId, order })),
        });
      }
    }

    return tx.post.findUniqueOrThrow({ where: { id: created.id }, include: postInclude });
  });

  return withPublicUrl(post);
}

export async function updatePost(id: number, input: PostInput) {
  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Post not found');
  }

  const title = input.title !== undefined ? input.title.trim() : undefined;
  if (title !== undefined && !title) {
    throw new ValidationError('Title is required');
  }

  let slug: string | undefined;
  if (input.slug !== undefined || title !== undefined) {
    slug = input.slug?.trim() ? slugify(input.slug) : slugify(title ?? existing.title);
    if (!slug) {
      throw new ValidationError('Could not derive a valid slug');
    }
    await assertSlugAvailable(slug, id);
  }

  let resolvedStatus: ResolvedStatus | undefined;
  if (input.status !== undefined || input.scheduledFor !== undefined) {
    resolvedStatus = resolveStatusForUpdate(input, existing);
  }

  if (input.categoryIds?.length) {
    const count = await prisma.category.count({ where: { id: { in: input.categoryIds } } });
    if (count !== input.categoryIds.length) {
      throw new ValidationError('One or more categories were not found');
    }
  }

  const post = await prisma.$transaction(async (tx) => {
    await tx.post.update({
      where: { id },
      data: {
        title,
        slug,
        content: input.content,
        excerpt: input.excerpt,
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        featuredImage: input.featuredImage,
        ...(input.template !== undefined ? { template: input.template } : {}),
        ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
        ...(input.showSidebar !== undefined ? { showSidebar: input.showSidebar } : {}),
        ...(input.commentStatus !== undefined ? { commentStatus: input.commentStatus } : {}),
        ...(input.showToc !== undefined ? { showToc: input.showToc } : {}),
        ...(input.authorId !== undefined ? { authorId: input.authorId || null } : {}),
        ...(resolvedStatus
          ? {
              status: resolvedStatus.status,
              publishedAt: resolvedStatus.publishedAt,
              scheduledFor: resolvedStatus.scheduledFor,
            }
          : {}),
        metaTitle: input.metaTitle,
        metaDescription: input.metaDescription,
        metaKeywords: input.metaKeywords,
        canonicalUrl: input.canonicalUrl,
        ogTitle: input.ogTitle,
        ogDescription: input.ogDescription,
        ogImage: input.ogImage,
      },
    });

    if (input.categoryIds !== undefined) {
      await tx.postCategory.deleteMany({ where: { postId: id } });
      if (input.categoryIds.length) {
        await tx.postCategory.createMany({
          data: input.categoryIds.map((categoryId) => ({ postId: id, categoryId })),
        });
      }
    }

    if (input.tagNames !== undefined) {
      await tx.postTag.deleteMany({ where: { postId: id } });
      const tagIds = await resolveTagsByName(tx, input.tagNames);
      if (tagIds.length) {
        await tx.postTag.createMany({ data: tagIds.map((tagId) => ({ postId: id, tagId })) });
      }
    }

    if (input.coAuthorIds !== undefined) {
      await tx.postCoAuthor.deleteMany({ where: { postId: id } });
      // Get the authorId that will be set after this update (use input value if provided, else existing)
      const effectivePrimaryId = input.authorId !== undefined ? (input.authorId || null) : existing.authorId;
      const valid = input.coAuthorIds.filter((uid) => uid && uid !== effectivePrimaryId);
      if (valid.length) {
        await tx.postCoAuthor.createMany({
          data: valid.map((userId, order) => ({ postId: id, userId, order })),
        });
      }
    }

    return tx.post.findUniqueOrThrow({ where: { id }, include: postInclude });
  });

  return withPublicUrl(post);
}

export async function deletePost(id: number) {
  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Post not found');
  }

  await prisma.post.delete({ where: { id } });
}

export async function duplicatePost(id: number, authorId: string) {
  const original = await prisma.post.findUnique({
    where: { id },
    include: { categories: true, tags: true },
  });
  if (!original) throw new NotFoundError('Post not found');

  const baseSlug = slugify(`copy-of-${original.title}`);
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.post.findFirst({ where: { slug } })) {
    slug = `${baseSlug}-${counter++}`;
  }

  const copy = await prisma.post.create({
    data: {
      title: `Copy of ${original.title}`,
      slug,
      content: original.content,
      excerpt: original.excerpt,
      type: original.type,
      parentId: original.parentId,
      status: 'draft',
      featuredImage: original.featuredImage,
      template: original.template,
      isFeatured: false,
      showSidebar: original.showSidebar,
      commentStatus: original.commentStatus,
      showToc: original.showToc,
      metaTitle: original.metaTitle,
      metaDescription: original.metaDescription,
      metaKeywords: original.metaKeywords,
      ogTitle: original.ogTitle,
      ogDescription: original.ogDescription,
      ogImage: original.ogImage,
      authorId,
      categories: { create: original.categories.map((c) => ({ categoryId: c.categoryId })) },
      tags: { create: original.tags.map((t) => ({ tagId: t.tagId })) },
    },
    include: postInclude,
  });

  return withPublicUrl(copy);
}

export async function bulkUpdatePosts(ids: number[], action: string) {
  if (action === 'delete') {
    const { count } = await prisma.post.deleteMany({ where: { id: { in: ids } } });
    return count;
  }
  const statusMap: Record<string, string> = { publish: 'published', draft: 'draft', trash: 'trash' };
  const status = statusMap[action];
  if (!status) throw new ValidationError(`Unknown action: ${action}`);
  const { count } = await prisma.post.updateMany({
    where: { id: { in: ids } },
    data: { status, ...(action === 'publish' ? { publishedAt: new Date() } : {}) },
  });
  return count;
}
