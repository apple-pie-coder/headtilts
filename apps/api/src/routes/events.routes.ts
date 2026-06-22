import { Router, IRouter, Request, Response } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';
import { sendSuccess, sendError, sendPaginatedSuccess } from '../utils/response';
import { ApiError } from '../utils/errors';
import * as eventsService from '../services/events.service';

const router: IRouter = Router();
router.use(authenticate);

// ─── Events CRUD ──────────────────────────────────────────────────────────────

router.get('/', requirePermission(PERMISSIONS.EVENT_READ), asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const type = typeof req.query.type === 'string' ? req.query.type : undefined;
  const timeframe = typeof req.query.timeframe === 'string' ? req.query.timeframe : undefined;
  const { items, total } = await eventsService.listEvents(page, limit, { search, status, type, timeframe });
  sendPaginatedSuccess(res, items, total, page, limit);
}));

router.get('/:id', requirePermission(PERMISSIONS.EVENT_READ), asyncHandler(async (req: Request, res: Response) => {
  try {
    const event = await eventsService.getEvent(req.params.id);
    sendSuccess(res, event);
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

router.post('/', requirePermission(PERMISSIONS.EVENT_CREATE), asyncHandler(async (req: Request, res: Response) => {
  try {
    const event = await eventsService.createEvent(req.body);
    sendSuccess(res, event, 201);
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

router.put('/:id', requirePermission(PERMISSIONS.EVENT_EDIT), asyncHandler(async (req: Request, res: Response) => {
  try {
    const scope = (req.query.scope as 'this' | 'future' | 'all') || 'this';
    const event = await eventsService.updateEvent(Number(req.params.id), req.body, scope);
    sendSuccess(res, event);
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

router.delete('/:id', requirePermission(PERMISSIONS.EVENT_DELETE), asyncHandler(async (req: Request, res: Response) => {
  try {
    await eventsService.deleteEvent(Number(req.params.id));
    sendSuccess(res, { deleted: true });
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

// ─── Registration management ──────────────────────────────────────────────────

router.get(
  '/:id/registrations',
  requirePermission(PERMISSIONS.EVENT_MANAGE_REGISTRATIONS),
  asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const { items, total } = await eventsService.listRegistrations(
      Number(req.params.id), page, limit, { status, search },
    );
    sendPaginatedSuccess(res, items, total, page, limit);
  }),
);

router.get(
  '/:id/registrations/export',
  requirePermission(PERMISSIONS.EVENT_MANAGE_REGISTRATIONS),
  asyncHandler(async (req: Request, res: Response) => {
    const csv = await eventsService.exportRegistrationsCsv(Number(req.params.id));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="event-${req.params.id}-registrations.csv"`);
    res.send(csv);
  }),
);

router.patch(
  '/:eventId/registrations/:regId',
  requirePermission(PERMISSIONS.EVENT_MANAGE_REGISTRATIONS),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { action } = req.body as { action: 'approve' | 'cancel' | 'check-in' };
      const reg = await eventsService.updateRegistration(Number(req.params.regId), action);
      sendSuccess(res, reg);
    } catch (e) {
      if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
      else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }),
);

export default router;
