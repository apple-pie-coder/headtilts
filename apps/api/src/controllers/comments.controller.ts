import { Request, Response } from 'express';
import * as commentsService from '../services/comments.service';
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
    const page = Number(req.query.page) || 1;
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    const { items, total, statusCounts } = await commentsService.listComments(page, limit, { status, search });
    const pages = Math.ceil(total / limit);
    sendSuccess(res, { items, statusCounts, pagination: { page, limit, total, pages } });
  } catch (error) {
    handleError(res, error);
  }
}

export async function setStatus(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const { status } = req.body as { status?: string };
    const comment = await commentsService.setCommentStatus(id, status ?? '');
    sendSuccess(res, comment);
  } catch (error) {
    handleError(res, error);
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    await commentsService.deleteComment(id);
    sendSuccess(res, { message: 'Comment deleted' });
  } catch (error) {
    handleError(res, error);
  }
}
