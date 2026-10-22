import { Router, IRouter } from 'express';
import * as telegramController from '../controllers/telegram.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

// Settings → Telegram. The settings themselves are saved through /settings.
const router: IRouter = Router();

router.use(authenticate);

router.post('/test', requirePermission(PERMISSIONS.SETTING_EDIT), asyncHandler(telegramController.test));
router.get('/deliveries', requirePermission(PERMISSIONS.SETTING_READ), asyncHandler(telegramController.deliveries));
router.post('/deliveries/:id/retry', requirePermission(PERMISSIONS.SETTING_EDIT), asyncHandler(telegramController.retry));

export default router;
