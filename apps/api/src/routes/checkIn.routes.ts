import { Router, IRouter, Request, Response } from 'express';
import { PERMISSIONS } from '@headtilts/shared';
import { authenticate, loadPermissions, requireAnyPermission, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import { parseIntParam } from '../utils/errors';
import * as checkIn from '../services/checkIn.service';

// The door scanner (mounted under /events, ahead of the events router).
// Door staff hold only events_check_in; anyone who manages bookings can scan too.
const router: IRouter = Router();
router.use(authenticate);

const canScan = requireAnyPermission(PERMISSIONS.EVENT_CHECK_IN, PERMISSIONS.EVENT_MANAGE_REGISTRATIONS);

async function actor(req: Request): Promise<checkIn.DoorActor> {
  const device = req.get('X-Door-Device');
  return { userId: req.user!.sub, permissions: await loadPermissions(req), device: device ? decodeURIComponent(device) : undefined };
}

router.get('/check-in/events', canScan, asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await checkIn.scannableEvents(await actor(req)));
}));

router.get('/:id/check-in/manifest', canScan, asyncHandler(async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  sendSuccess(res, await checkIn.manifest(parseIntParam(req.params.id), await actor(req)));
}));

router.get('/:id/check-in/changes', canScan, asyncHandler(async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const since = Math.max(0, Number(req.query.since) || 0);
  sendSuccess(res, await checkIn.changes(parseIntParam(req.params.id), since, await actor(req)));
}));

router.post('/:id/check-in/scan', canScan, asyncHandler(async (req: Request, res: Response) => {
  const { payload, count, scannedAt, offline } = req.body ?? {};
  sendSuccess(res, await checkIn.scan(parseIntParam(req.params.id), {
    payload: String(payload ?? ''),
    count: count == null ? undefined : Number(count),
    scannedAt: scannedAt == null ? undefined : Number(scannedAt),
    offline: offline === true,
  }, await actor(req)));
}));

router.post('/:id/check-in/admit', canScan, asyncHandler(async (req: Request, res: Response) => {
  const { registrationId, count, override, reason } = req.body ?? {};
  sendSuccess(res, await checkIn.admitManually(parseIntParam(req.params.id), {
    registrationId: Number(registrationId),
    count: count == null ? undefined : Number(count),
    override: override === true,
    reason: typeof reason === 'string' ? reason : undefined,
  }, await actor(req)));
}));

router.post('/:id/check-in/undo', canScan, asyncHandler(async (req: Request, res: Response) => {
  const { registrationId, count } = req.body ?? {};
  sendSuccess(res, await checkIn.undo(parseIntParam(req.params.id), {
    registrationId: Number(registrationId), count: Number(count),
  }, await actor(req)));
}));

router.get('/:id/check-in/search', canScan, asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await checkIn.search(parseIntParam(req.params.id), String(req.query.q ?? ''), await actor(req)));
}));

router.get('/:id/check-in/log', requirePermission(PERMISSIONS.EVENT_MANAGE_REGISTRATIONS), asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const { items, total, stats } = await checkIn.checkInLog(parseIntParam(req.params.id), page, limit);
  sendSuccess(res, { items, total, page, limit, stats });
}));

export default router;
