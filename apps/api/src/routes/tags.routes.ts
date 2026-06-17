import { Router, IRouter } from 'express';
import * as tagsController from '../controllers/tags.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.TAG_READ), asyncHandler(tagsController.list));
router.get('/:id', requirePermission(PERMISSIONS.TAG_READ), asyncHandler(tagsController.getOne));
router.post('/', requirePermission(PERMISSIONS.TAG_CREATE), asyncHandler(tagsController.create));
router.put('/:id', requirePermission(PERMISSIONS.TAG_EDIT), asyncHandler(tagsController.update));
router.delete('/:id', requirePermission(PERMISSIONS.TAG_DELETE), asyncHandler(tagsController.remove));

export default router;
