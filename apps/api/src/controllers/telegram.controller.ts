import { Request, Response } from 'express';
import * as telegram from '../services/telegram.service';
import { sendPaginatedSuccess, sendSuccess } from '../utils/response';
import { ValidationError } from '../utils/errors';

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new ValidationError('Invalid id');
  return id;
}

/** GET /:id/telegram on posts, events and polls: the editor's Telegram box. */
export const itemStatus = (kind: 'post' | 'event' | 'poll') => async (req: Request, res: Response) => {
  sendSuccess(res, await telegram.itemStatus(kind, idParam(req)));
};

/** POST /:id/telegram: post it now, or again with { again: true }. */
export const itemSend = (kind: 'post' | 'event' | 'poll') => async (req: Request, res: Response) => {
  const id = idParam(req);
  await telegram.sendNow(kind, id, req.body?.again === true);
  sendSuccess(res, await telegram.itemStatus(kind, id));
};

export async function test(req: Request, res: Response) {
  const { token, chatId } = (req.body ?? {}) as { token?: unknown; chatId?: unknown };
  sendSuccess(res, await telegram.sendTest({
    token: typeof token === 'string' ? token : undefined,
    chatId: typeof chatId === 'string' ? chatId : undefined,
  }));
}

export async function deliveries(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const status = ['sent', 'failed', 'pending'].includes(String(req.query.status)) ? String(req.query.status) : undefined;
  const { items, total } = await telegram.listDeliveries(page, limit, status);
  sendPaginatedSuccess(res, items, total, page, limit);
}

export async function retry(req: Request, res: Response) {
  sendSuccess(res, await telegram.retryDelivery(idParam(req)));
}
