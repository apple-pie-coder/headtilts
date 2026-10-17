import { Router, IRouter, Request, Response } from 'express';
import { PERMISSIONS } from '@headtilts/shared';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { feedbackLimiter } from '../middleware/rateLimit';
import { sendSuccess } from '../utils/response';
import { ValidationError } from '../utils/errors';
import { prisma } from '../config/database';
import * as issues from '../services/issues.service';

const router: IRouter = Router();
router.use(authenticate);

const num = (raw: string) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new ValidationError('Invalid issue number');
  return n;
};

/** Name shown on GitHub for things posted from the admin. */
async function actor(req: Request) {
  const u = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { username: true } });
  return u?.username || 'an admin user';
}

// Reading the tracker is for operators, like the feedback queue.
router.get('/', requirePermission(PERMISSIONS.SETTING_READ), asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await issues.listIssues());
}));

router.get('/summary', requirePermission(PERMISSIONS.SETTING_READ), asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await issues.getSummary());
}));

router.get('/labels', requirePermission(PERMISSIONS.SETTING_READ), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await issues.listLabels(req.query.fresh === '1'));
}));

router.get('/:number', requirePermission(PERMISSIONS.SETTING_READ), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await issues.getIssue(num(req.params.number)));
}));

// Changing issues writes to GitHub.
router.post('/', requirePermission(PERMISSIONS.SETTING_EDIT), feedbackLimiter, asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await issues.createIssue(req.body ?? {}, await actor(req)), 201, 'Issue created');
}));

router.patch('/:number', requirePermission(PERMISSIONS.SETTING_EDIT), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await issues.updateIssue(num(req.params.number), req.body ?? {}));
}));

router.put('/:number/column', requirePermission(PERMISSIONS.SETTING_EDIT), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await issues.moveIssue(num(req.params.number), req.body?.column));
}));

router.post('/:number/comments', requirePermission(PERMISSIONS.SETTING_EDIT), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await issues.addComment(num(req.params.number), req.body ?? {}, await actor(req)), 201);
}));

export default router;
