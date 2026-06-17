import { Router, IRouter } from 'express';
import * as usersController from '../controllers/users.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

// Profile endpoints — any authenticated user
router.get('/me', asyncHandler(usersController.getMe));
router.put('/me', asyncHandler(usersController.updateMe));

router.get('/', requirePermission(PERMISSIONS.USER_READ), asyncHandler(usersController.list));
router.get('/:id', requirePermission(PERMISSIONS.USER_READ), asyncHandler(usersController.getOne));
router.post('/', requirePermission(PERMISSIONS.USER_CREATE), asyncHandler(usersController.create));
router.put('/:id', requirePermission(PERMISSIONS.USER_EDIT), asyncHandler(usersController.update));
router.delete('/:id', requirePermission(PERMISSIONS.USER_DELETE), asyncHandler(usersController.remove));

export default router;
