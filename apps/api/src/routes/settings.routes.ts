import { Router, IRouter } from 'express';
import * as settingsController from '../controllers/settings.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';
import { listPreviews, sendPreview } from '../services/emailPreviews';
import { sendSuccess, sendError } from '../utils/response';
import { ApiError } from '../utils/errors';

const router: IRouter = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.SETTING_READ), asyncHandler(settingsController.list));
router.put('/', requirePermission(PERMISSIONS.SETTING_EDIT), asyncHandler(settingsController.update));
router.post('/test-email', requirePermission(PERMISSIONS.SETTING_EDIT), asyncHandler(settingsController.testEmail));

// Settings → Email → Previews: every email the site sends, with sample data
router.get('/email-previews', requirePermission(PERMISSIONS.SETTING_EDIT), asyncHandler(async (_req, res) => {
  sendSuccess(res, await listPreviews());
}));
router.post('/email-previews/:id/send', requirePermission(PERMISSIONS.SETTING_EDIT), asyncHandler(async (req, res) => {
  const to = (req as typeof req & { user?: { email?: string } }).user?.email;
  if (!to) { sendError(res, 'VALIDATION_ERROR', 'Your account has no email address', 400); return; }
  try {
    const sent = await sendPreview(req.params.id, to);
    if (sent) sendSuccess(res, { sent: true, to });
    else sendError(res, 'SMTP_NOT_CONFIGURED', 'Email sending isn’t set up yet', 400);
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'SEND_FAILED', e instanceof Error ? e.message : 'Sending failed', 502);
  }
}));

export default router;
