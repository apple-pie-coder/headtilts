import { Request, Response } from 'express';
import * as liveUpdates from '../services/liveUpdates.service';
import { sendSuccess } from '../utils/response';
import { parseIntParam } from '../utils/errors';
import { assertCanModifyPosts } from './posts.controller';

// Errors propagate to asyncHandler → the shared error handler.

export async function list(req: Request, res: Response): Promise<void> {
  sendSuccess(res, await liveUpdates.listUpdates(parseIntParam(req.params.id)));
}

export async function create(req: Request, res: Response): Promise<void> {
  const postId = parseIntParam(req.params.id);
  // Posting to a published live blog publishes, so the usual ownership and
  // publish rules for the post apply.
  await assertCanModifyPosts(req, [postId]);
  sendSuccess(res, await liveUpdates.createUpdate(postId, req.user!.sub, req.body ?? {}), 201);
}

export async function update(req: Request, res: Response): Promise<void> {
  const postId = parseIntParam(req.params.id);
  await assertCanModifyPosts(req, [postId]);
  sendSuccess(res, await liveUpdates.updateUpdate(postId, parseIntParam(req.params.updateId, 'updateId'), req.body ?? {}));
}

export async function remove(req: Request, res: Response): Promise<void> {
  const postId = parseIntParam(req.params.id);
  await assertCanModifyPosts(req, [postId]);
  await liveUpdates.deleteUpdate(postId, parseIntParam(req.params.updateId, 'updateId'));
  sendSuccess(res, null);
}

export async function coverage(req: Request, res: Response): Promise<void> {
  const postId = parseIntParam(req.params.id);
  await assertCanModifyPosts(req, [postId]);
  sendSuccess(res, await liveUpdates.setCoverage(postId, Boolean(req.body?.ended)));
}
