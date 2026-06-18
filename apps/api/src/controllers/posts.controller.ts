import crypto from 'crypto';
import { Request, Response } from 'express';
import * as postsService from '../services/posts.service';
import * as revisionsService from '../services/revisions.service';
import { sendSuccess, sendError } from '../utils/response';
import { ApiError, ForbiddenError, parseIntParam } from '../utils/errors';
import { PERMISSIONS } from '@headtilts/shared';
import { prisma } from '../config/database';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    sendError(res, error.code, error.message, error.statusCode, error.details);
  } else {
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

function assertCanSetStatus(req: Request, status: string | undefined): void {
  if (
    (status === 'published' || status === 'scheduled') &&
    !req.user!.permissions.includes(PERMISSIONS.POST_PUBLISH)
  ) {
    throw new ForbiddenError('You do not have permission to publish or schedule posts');
  }
}

function postInputFromBody(req: Request) {
  const {
    title,
    slug,
    content,
    excerpt,
    type,
    parentId,
    status,
    scheduledFor,
    featuredImage,
    template,
    isFeatured,
    showSidebar,
    commentStatus,
    showToc,
    categoryIds,
    tagNames,
    authorId,
    coAuthorIds,
    metaTitle,
    metaDescription,
    metaKeywords,
    canonicalUrl,
    ogTitle,
    ogDescription,
    ogImage,
  } = req.body;

  return {
    title,
    slug,
    content,
    excerpt,
    type,
    parentId: parentId !== undefined ? (parentId === null ? null : Number(parentId)) : undefined,
    status,
    scheduledFor,
    featuredImage,
    template: template !== undefined ? (template || null) : undefined,
    isFeatured: isFeatured !== undefined ? Boolean(isFeatured) : undefined,
    showSidebar: showSidebar !== undefined ? Boolean(showSidebar) : undefined,
    // 'open' / 'closed' override; anything else (incl. 'default') inherits the site setting
    commentStatus:
      commentStatus !== undefined
        ? (commentStatus === 'open' || commentStatus === 'closed' ? commentStatus : null)
        : undefined,
    // 'yes' / 'no' override; null = inherit site toc_enabled setting
    showToc:
      showToc !== undefined
        ? (showToc === 'yes' || showToc === 'no' ? showToc : null)
        : undefined,
    categoryIds,
    tagNames,
    authorId: authorId !== undefined ? (authorId || null) : undefined,
    coAuthorIds: Array.isArray(coAuthorIds) ? coAuthorIds.map(String) : undefined,
    metaTitle,
    metaDescription,
    metaKeywords,
    canonicalUrl,
    ogTitle,
    ogDescription,
    ogImage,
  };
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;

    const type = typeof req.query.type === 'string' ? req.query.type : 'post';
    const authorId = typeof req.query.authorId === 'string' ? req.query.authorId : undefined;
    const featuredRaw = typeof req.query.featured === 'string' ? req.query.featured : String(req.query.featured);
    const featured = featuredRaw === 'true' ? true : featuredRaw === 'false' ? false : undefined;
    const SORT_BY_VALUES = ['title', 'publishedAt', 'updatedAt'] as const;
    type SortBy = (typeof SORT_BY_VALUES)[number];
    const sortByRaw = typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined;
    const sortBy: SortBy | undefined =
      sortByRaw && (SORT_BY_VALUES as readonly string[]).includes(sortByRaw)
        ? (sortByRaw as SortBy)
        : undefined;
    const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : req.query.sortOrder === 'desc' ? 'desc' : 'desc';

    const { items, total, statusCounts } = await postsService.listPosts(page, limit, {
      search,
      status,
      categoryId,
      authorId,
      featured,
      sortBy,
      sortOrder,
      type,
    });

    const pages = Math.ceil(total / limit);
    sendSuccess(res, { items, pagination: { page, limit, total, pages }, statusCounts });
  } catch (error) {
    handleError(res, error);
  }
}

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const post = await postsService.getPostById(id);
    sendSuccess(res, post);
  } catch (error) {
    handleError(res, error);
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const input = postInputFromBody(req);
    assertCanSetStatus(req, input.status);
    const post = await postsService.createPost(input, req.user!.sub);
    revisionsService.recordRevision({
      postId: post.id,
      userId: req.user!.sub,
      action: post.status === 'published' ? 'published' : post.status === 'scheduled' ? 'scheduled' : 'created',
      changes: [
        { field: 'title',  label: 'Title',  note: post.title },
        { field: 'type',   label: 'Type',   note: post.type === 'page' ? 'Page' : 'Post' },
        { field: 'status', label: 'Status', note: post.status },
        ...(post.status === 'scheduled' && post.scheduledFor
          ? [{ field: 'scheduledFor', label: 'Scheduled for', note: new Date(post.scheduledFor).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) }]
          : []),
      ],
      snapshot: revisionsService.buildSnapshot(post),
    }).catch(() => {});
    sendSuccess(res, post, 201, 'Post created successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const input = postInputFromBody(req);
    assertCanSetStatus(req, input.status);
    const old = await postsService.getPostById(id);
    const post = await postsService.updatePost(id, input);
    const changes = revisionsService.computeDiff(old, post, input);
    const action = revisionsService.deriveAction(old.status, post.status);
    revisionsService.recordRevision({ postId: id, userId: req.user!.sub, action, changes, snapshot: revisionsService.buildSnapshot(post) }).catch(() => {});
    sendSuccess(res, post, 200, 'Post updated successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    await postsService.deletePost(id);
    sendSuccess(res, { message: 'Post deleted successfully' });
  } catch (error) {
    handleError(res, error);
  }
}

// Minimal list of users that can be selected as post authors
export async function authorList(_req: Request, res: Response): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, username: true, firstName: true, lastName: true, avatar: true },
      orderBy: [{ firstName: 'asc' }, { username: 'asc' }],
    });
    sendSuccess(res, users);
  } catch (error) {
    handleError(res, error);
  }
}

export async function duplicate(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const post = await postsService.duplicatePost(id, req.user!.sub);
    revisionsService.recordRevision({
      postId: post.id,
      userId: req.user!.sub,
      action: 'created',
      changes: [{ field: 'title', label: 'Title', note: `Duplicated from post #${id}` }],
    }).catch(() => {});
    sendSuccess(res, post, 201, 'Post duplicated');
  } catch (error) {
    handleError(res, error);
  }
}

export async function bulk(req: Request, res: Response): Promise<void> {
  try {
    const { ids, action } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      sendError(res, 'VALIDATION_ERROR', 'ids must be a non-empty array', 422);
      return;
    }
    const validActions = ['publish', 'draft', 'trash', 'delete'];
    if (!validActions.includes(action)) {
      sendError(res, 'VALIDATION_ERROR', `action must be one of: ${validActions.join(', ')}`, 422);
      return;
    }
    if (action === 'publish') assertCanSetStatus(req, 'published');
    if (action === 'delete' && !req.user!.permissions.includes(PERMISSIONS.POST_DELETE)) {
      throw new ForbiddenError('You do not have permission to delete posts');
    }
    const count = await postsService.bulkUpdatePosts(ids.map(Number), action);
    sendSuccess(res, { count });
  } catch (error) {
    handleError(res, error);
  }
}

// Signed, expiring link for previewing drafts on the public site
export async function previewLink(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    await postsService.getPostById(id); // 404s when the post doesn't exist

    const exp = Date.now() + 30 * 60 * 1000; // 30 minutes
    const token = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'dev-secret')
      .update(`preview.${id}.${exp}`)
      .digest('hex');

    sendSuccess(res, { url: `/preview/${id}?token=${token}&exp=${exp}`, expiresAt: new Date(exp) });
  } catch (error) {
    handleError(res, error);
  }
}
