import { Router, IRouter } from 'express';
import * as categoriesController from '../controllers/categories.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.CATEGORY_READ), asyncHandler(categoriesController.list));
router.get('/:id', requirePermission(PERMISSIONS.CATEGORY_READ), asyncHandler(categoriesController.getOne));
router.post('/', requirePermission(PERMISSIONS.CATEGORY_CREATE), asyncHandler(categoriesController.create));
router.put('/:id', requirePermission(PERMISSIONS.CATEGORY_EDIT), asyncHandler(categoriesController.update));
router.delete('/:id', requirePermission(PERMISSIONS.CATEGORY_DELETE), asyncHandler(categoriesController.remove));

export default router;
