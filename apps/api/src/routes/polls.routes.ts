import { Router, IRouter, Request, Response } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';
import { sendSuccess, sendError, sendPaginatedSuccess } from '../utils/response';
import { ApiError } from '../utils/errors';
import { prisma } from '../config/database';
import * as pollsService from '../services/polls.service';
import * as telegramController from '../controllers/telegram.controller';
import { POLL_IMAGE_FORMATS, PollImageFormat, renderPollResultsImage } from '../services/pollImage.service';

const router: IRouter = Router();
router.use(authenticate);

// List
router.get('/', requirePermission(PERMISSIONS.POLL_READ), asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const { items, total } = await pollsService.listPolls(page, limit, search, status);
  sendPaginatedSuccess(res, items, total, page, limit);
}));

// Telegram channel: what was sent, a preview, and Post now.
router.get('/:id/telegram', requirePermission(PERMISSIONS.POLL_READ), asyncHandler(telegramController.itemStatus('poll')));
router.post('/:id/telegram', requirePermission(PERMISSIONS.POLL_EDIT), asyncHandler(telegramController.itemSend('poll')));

// Analytics overview — must be before /:id
router.get('/analytics', requirePermission(PERMISSIONS.POLL_READ), asyncHandler(async (_req: Request, res: Response) => {
  const data = await pollsService.getPollAnalytics();
  sendSuccess(res, data);
}));

// Get one
router.get('/:id', requirePermission(PERMISSIONS.POLL_READ), asyncHandler(async (req: Request, res: Response) => {
  try {
    const poll = await pollsService.getPoll(req.params.id);
    sendSuccess(res, poll);
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

// Results as a shareable PNG (?format=square|story|wide), once the poll has ended
router.get('/:id/results-image', requirePermission(PERMISSIONS.POLL_READ), asyncHandler(async (req: Request, res: Response) => {
  const requested = String(req.query.format ?? 'square');
  const format: PollImageFormat = Object.prototype.hasOwnProperty.call(POLL_IMAGE_FORMATS, requested) ? (requested as PollImageFormat) : 'square';
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { sendError(res, 'VALIDATION_ERROR', 'Invalid poll id', 400); return; }
  try {
    const { png, filename } = await renderPollResultsImage(id, format);
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': String(png.byteLength),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    });
    res.end(png);
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

// Create
router.post('/', requirePermission(PERMISSIONS.POLL_CREATE), asyncHandler(async (req: Request, res: Response) => {
  try {
    const poll = await pollsService.createPoll(req.body);
    sendSuccess(res, poll, 201);
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

// Update
router.put('/:id', requirePermission(PERMISSIONS.POLL_EDIT), asyncHandler(async (req: Request, res: Response) => {
  try {
    const poll = await pollsService.updatePoll(Number(req.params.id), req.body);
    sendSuccess(res, poll);
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

// Delete
router.delete('/:id', requirePermission(PERMISSIONS.POLL_DELETE), asyncHandler(async (req: Request, res: Response) => {
  try {
    await pollsService.deletePoll(Number(req.params.id));
    sendSuccess(res, { ok: true });
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

// Reset votes
router.post('/:id/reset', requirePermission(PERMISSIONS.POLL_RESET), asyncHandler(async (req: Request, res: Response) => {
  try {
    const poll = await pollsService.resetVotes(Number(req.params.id));
    sendSuccess(res, poll);
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

// Share analytics
router.get('/:id/shares', requirePermission(PERMISSIONS.POLL_READ), asyncHandler(async (req: Request, res: Response) => {
  try {
    const shares = await prisma.pollShare.findMany({
      where: { pollId: Number(req.params.id) },
      orderBy: { createdAt: 'desc' },
      include: { clickDetails: { orderBy: { clickedAt: 'desc' } } },
    });
    sendSuccess(res, shares);
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

// Export CSV
router.get('/:id/export', requirePermission(PERMISSIONS.POLL_READ), asyncHandler(async (req: Request, res: Response) => {
  try {
    const csv = await pollsService.exportVotesCsv(Number(req.params.id));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="poll-${req.params.id}-results.csv"`);
    res.send(csv);
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

export default router;
