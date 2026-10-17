import { Router, IRouter, Request, Response } from 'express';
import { PERMISSIONS } from '@headtilts/shared';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { feedbackLimiter } from '../middleware/rateLimit';
import { sendSuccess } from '../utils/response';
import * as feedback from '../services/feedback.service';

const router: IRouter = Router();
router.use(authenticate);

// Anyone who can use the admin can report a problem.
router.get('/status', asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await feedback.getStatus());
}));

router.post('/', feedbackLimiter, asyncHandler(async (req: Request, res: Response) => {
  const item = await feedback.createFeedback(req.user!.sub, req.body ?? {});
  sendSuccess(res, item, 201, 'Thanks — feedback sent');
}));

// Reading and managing the queue is for operators.
router.get('/', requirePermission(PERMISSIONS.SETTING_READ), asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const { items, total } = await feedback.listFeedback(page, limit, {
    type: typeof req.query.type === 'string' ? req.query.type : undefined,
    state: typeof req.query.state === 'string' ? req.query.state : undefined,
  });
  sendSuccess(res, { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.post('/:id/sync', requirePermission(PERMISSIONS.SETTING_READ), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await feedback.syncToGithub(Number(req.params.id)));
}));

router.delete('/:id', requirePermission(PERMISSIONS.SETTING_EDIT), asyncHandler(async (req: Request, res: Response) => {
  await feedback.deleteFeedback(Number(req.params.id));
  sendSuccess(res, { message: 'Deleted' });
}));

export default router;
