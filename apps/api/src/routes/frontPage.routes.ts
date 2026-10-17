import { Router, IRouter, Request, Response } from 'express';
import { PERMISSIONS } from '@headtilts/shared';
import { normalizeLayout } from '@headtilts/shared';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import * as frontPage from '../services/frontPage.service';

/** Admin: the front page builder. Uses the Widgets permissions (Appearance). */
const router: IRouter = Router();
router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.WIDGET_READ), asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await frontPage.getEditorState());
}));

// Data for the live preview of an unsaved layout.
router.post('/resolve', requirePermission(PERMISSIONS.WIDGET_READ), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, { sections: await frontPage.resolveLayout(normalizeLayout(req.body?.layout)) });
}));

router.put('/draft', requirePermission(PERMISSIONS.WIDGET_EDIT), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await frontPage.saveDraft(req.body?.layout, req.user!.sub), 200, 'Draft saved');
}));

router.delete('/draft', requirePermission(PERMISSIONS.WIDGET_EDIT), asyncHandler(async (_req: Request, res: Response) => {
  await frontPage.discardDraft();
  sendSuccess(res, { message: 'Draft discarded' });
}));

router.post('/publish', requirePermission(PERMISSIONS.WIDGET_EDIT), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await frontPage.publish(req.body?.layout, req.user!.sub), 200, 'Front page published');
}));

router.get('/history/:id', requirePermission(PERMISSIONS.WIDGET_READ), asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await frontPage.getVersion(req.params.id));
}));

export default router;
