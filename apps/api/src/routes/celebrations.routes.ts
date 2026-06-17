import { Router, IRouter } from 'express';
import * as celebrationsController from '../controllers/celebrations.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.CELEBRATION_READ), asyncHandler(celebrationsController.list));
router.get('/:id', requirePermission(PERMISSIONS.CELEBRATION_READ), asyncHandler(celebrationsController.getOne));
router.post('/', requirePermission(PERMISSIONS.CELEBRATION_CREATE), asyncHandler(celebrationsController.create));
router.put('/:id', requirePermission(PERMISSIONS.CELEBRATION_EDIT), asyncHandler(celebrationsController.update));
router.delete('/:id', requirePermission(PERMISSIONS.CELEBRATION_DELETE), asyncHandler(celebrationsController.remove));

export default router;
