import { Router, IRouter } from 'express';
import * as redirectsController from '../controllers/redirects.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.REDIRECT_READ), asyncHandler(redirectsController.list));
router.post('/', requirePermission(PERMISSIONS.REDIRECT_MANAGE), asyncHandler(redirectsController.create));
router.put('/:id', requirePermission(PERMISSIONS.REDIRECT_MANAGE), asyncHandler(redirectsController.update));
router.delete('/:id', requirePermission(PERMISSIONS.REDIRECT_MANAGE), asyncHandler(redirectsController.remove));

export default router;
