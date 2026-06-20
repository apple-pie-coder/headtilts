import { Router, IRouter } from 'express';
import * as settingsController from '../controllers/settings.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.SETTING_READ), asyncHandler(settingsController.list));
router.put('/', requirePermission(PERMISSIONS.SETTING_EDIT), asyncHandler(settingsController.update));
router.post('/test-email', requirePermission(PERMISSIONS.SETTING_EDIT), asyncHandler(settingsController.testEmail));

export default router;
