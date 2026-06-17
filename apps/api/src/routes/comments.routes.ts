import { Router, IRouter } from 'express';
import * as commentsController from '../controllers/comments.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.COMMENT_READ), asyncHandler(commentsController.list));
router.put('/:id/status', requirePermission(PERMISSIONS.COMMENT_MODERATE), asyncHandler(commentsController.setStatus));
router.delete('/:id', requirePermission(PERMISSIONS.COMMENT_MODERATE), asyncHandler(commentsController.remove));

export default router;
