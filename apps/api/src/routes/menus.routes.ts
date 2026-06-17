import { Router, IRouter } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, requirePermission } from '../middleware/auth';
import * as menusController from '../controllers/menus.controller';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.MENU_READ), asyncHandler(menusController.list));
router.get('/:id', requirePermission(PERMISSIONS.MENU_READ), asyncHandler(menusController.getOne));
router.post('/', requirePermission(PERMISSIONS.MENU_CREATE), asyncHandler(menusController.create));
router.put('/:id', requirePermission(PERMISSIONS.MENU_EDIT), asyncHandler(menusController.update));
router.put('/:id/items', requirePermission(PERMISSIONS.MENU_EDIT), asyncHandler(menusController.setItems));
router.delete('/:id', requirePermission(PERMISSIONS.MENU_DELETE), asyncHandler(menusController.remove));

export default router;
