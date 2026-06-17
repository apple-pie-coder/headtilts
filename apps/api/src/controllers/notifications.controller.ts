import { Request, Response } from 'express';
import * as notificationsService from '../services/notifications.service';
import { sendSuccess, sendError } from '../utils/response';
import { ApiError } from '../utils/errors';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    sendError(res, error.code, error.message, error.statusCode, error.details);
  } else {
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const result = await notificationsService.listForUser(req.user!.sub, cursor, limit);
    sendSuccess(res, result);
  } catch (error) {
    handleError(res, error);
  }
}

export async function unreadCount(req: Request, res: Response): Promise<void> {
  try {
    const count = await notificationsService.unreadCount(req.user!.sub);
    sendSuccess(res, { count });
  } catch (error) {
    handleError(res, error);
  }
}

function parseIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

export async function markRead(req: Request, res: Response): Promise<void> {
  try {
    await notificationsService.setReadState(req.user!.sub, parseIds(req.body.ids), true);
    sendSuccess(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}

export async function markUnread(req: Request, res: Response): Promise<void> {
  try {
    await notificationsService.setReadState(req.user!.sub, parseIds(req.body.ids), false);
    sendSuccess(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  try {
    await notificationsService.markAllRead(req.user!.sub);
    sendSuccess(res, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}
