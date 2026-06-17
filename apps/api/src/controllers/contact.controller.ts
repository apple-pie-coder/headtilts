import { Request, Response } from 'express';
import * as contactService from '../services/contact.service';
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
    const unreadOnly = req.query.unread === 'true';

    const { items, total, unread } = await contactService.listSubmissions(page, limit, unreadOnly);
    const pages = Math.ceil(total / limit);
    sendSuccess(res, { items, unread, pagination: { page, limit, total, pages } });
  } catch (error) {
    handleError(res, error);
  }
}

export async function markRead(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const isRead = req.body.isRead !== false;
    const submission = await contactService.markRead(id, isRead);
    sendSuccess(res, submission);
  } catch (error) {
    handleError(res, error);
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    await contactService.deleteSubmission(id);
    sendSuccess(res, { message: 'Submission deleted' });
  } catch (error) {
    handleError(res, error);
  }
}
