import { Request, Response } from 'express';
import * as revisionsService from '../services/revisions.service';
import { sendSuccess, sendError } from '../utils/response';
import { ApiError, parseIntParam } from '../utils/errors';

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
