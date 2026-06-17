import { Router, IRouter } from 'express';
import * as rolesController from '../controllers/roles.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

// GET /roles is gated on USER_READ so the user-assignment picker works for admins
router.get('/', requirePermission(PERMISSIONS.USER_READ), asyncHandler(rolesController.list));
router.get('/permissions', requirePermission(PERMISSIONS.PERMISSION_READ), asyncHandler(rolesController.permissions));
router.get('/:id', requirePermission(PERMISSIONS.ROLE_READ), asyncHandler(rolesController.getOne));
router.post('/', requirePermission(PERMISSIONS.ROLE_CREATE), asyncHandler(rolesController.create));
router.put('/:id', requirePermission(PERMISSIONS.ROLE_EDIT), asyncHandler(rolesController.update));
router.delete('/:id', requirePermission(PERMISSIONS.ROLE_DELETE), asyncHandler(rolesController.remove));

export default router;
