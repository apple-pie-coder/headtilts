import { Router, IRouter } from 'express';
import * as contactController from '../controllers/contact.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.CONTACT_READ), asyncHandler(contactController.list));
router.put('/:id/read', requirePermission(PERMISSIONS.CONTACT_MANAGE), asyncHandler(contactController.markRead));
router.delete('/:id', requirePermission(PERMISSIONS.CONTACT_MANAGE), asyncHandler(contactController.remove));

export default router;
