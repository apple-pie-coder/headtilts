import { Request, Response } from 'express';
import * as revisionsService from '../services/revisions.service';
import * as postsService from '../services/posts.service';
import { sendSuccess, sendError } from '../utils/response';
import { ApiError, parseIntParam } from '../utils/errors';
import { assertCanModifyPosts } from './posts.controller';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    sendError(res, error.code, error.message, error.statusCode, error.details);
  } else {
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const postId = parseIntParam(req.params.postId, 'postId');
    const includeArchived = req.query.archived === 'true';
    const revisions = await revisionsService.getRevisions(postId, includeArchived);
    sendSuccess(res, revisions);
  } catch (error) {
    handleError(res, error);
  }
}

export async function archive(req: Request, res: Response): Promise<void> {
  try {
    const postId = parseIntParam(req.params.postId, 'postId');
    const id = parseIntParam(req.params.id);
    await revisionsService.archiveRevision(id, postId);
    sendSuccess(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}

export async function restore(req: Request, res: Response): Promise<void> {
  try {
    const postId = parseIntParam(req.params.postId, 'postId');
    const id = parseIntParam(req.params.id);
    await assertCanModifyPosts(req, [postId]);
    const snapshot = await revisionsService.restoreRevision(id, postId);

    // 1. Fetch current state and save it as a pre-restore checkpoint so it can be recovered
    const current = await postsService.getPostById(postId);
    await revisionsService.recordRevision({
      postId,
      userId: req.user!.sub,
      action: 'updated',
      changes: [{ field: 'content', label: 'Auto-saved before restore', note: `Checkpoint before restoring revision #${id}` }],
      snapshot: revisionsService.buildSnapshot(current),
    });

    // 2. Apply the snapshot (preserves current status — does not publish/unpublish)
    const restored = await postsService.updatePost(postId, {
      title: snapshot.title,
      slug: snapshot.slug,
      content: snapshot.content,
      excerpt: snapshot.excerpt ?? undefined,
      featuredImage: snapshot.featuredImage ?? undefined,
      template: snapshot.template,
      isFeatured: snapshot.isFeatured,
      showSidebar: snapshot.showSidebar,
      commentStatus: snapshot.commentStatus,
      showToc: snapshot.showToc,
      parentId: snapshot.parentId,
      metaTitle: snapshot.metaTitle ?? undefined,
      metaDescription: snapshot.metaDescription ?? undefined,
      metaKeywords: snapshot.metaKeywords ?? undefined,
      canonicalUrl: snapshot.canonicalUrl ?? undefined,
      ogTitle: snapshot.ogTitle ?? undefined,
      ogDescription: snapshot.ogDescription ?? undefined,
      ogImage: snapshot.ogImage ?? undefined,
      categoryIds: snapshot.categoryIds,
      tagNames: snapshot.tagNames,
    });

    // 3. Record the restore itself with the resulting snapshot
    revisionsService.recordRevision({
      postId,
      userId: req.user!.sub,
      action: 'updated',
      changes: [{ field: 'content', label: 'Restored from revision', note: `Revision #${id} (saved ${new Date(current.updatedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })})` }],
      snapshot: revisionsService.buildSnapshot(restored),
    }).catch(() => {});

    sendSuccess(res, restored);
  } catch (error) {
    handleError(res, error);
  }
}
