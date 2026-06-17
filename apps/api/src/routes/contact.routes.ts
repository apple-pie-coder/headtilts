import { Router, IRouter } from 'express';
import * as contactController from '../controllers/contact.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.SETTING_READ), asyncHandler(contactController.list));
router.put('/:id/read', requirePermission(PERMISSIONS.SETTING_EDIT), asyncHandler(contactController.markRead));
router.delete('/:id', requirePermission(PERMISSIONS.SETTING_EDIT), asyncHandler(contactController.remove));

export default router;
