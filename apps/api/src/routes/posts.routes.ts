import { Router, IRouter } from 'express';
import * as postsController from '../controllers/posts.controller';
import * as revisionsController from '../controllers/revisions.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.POST_READ), asyncHandler(postsController.list));
router.get('/author-list', requirePermission(PERMISSIONS.POST_EDIT), asyncHandler(postsController.authorList));
router.get('/:id', requirePermission(PERMISSIONS.POST_READ), asyncHandler(postsController.getOne));
router.get('/:id/preview-link', requirePermission(PERMISSIONS.POST_READ), asyncHandler(postsController.previewLink));
router.get('/:postId/revisions', requirePermission(PERMISSIONS.REVISION_READ), asyncHandler(revisionsController.list));
router.patch('/:postId/revisions/:id/archive', requirePermission(PERMISSIONS.REVISION_ARCHIVE), asyncHandler(revisionsController.archive));
router.post('/:postId/revisions/:id/restore', requirePermission(PERMISSIONS.POST_EDIT), asyncHandler(revisionsController.restore));
router.post('/bulk', requirePermission(PERMISSIONS.POST_EDIT), asyncHandler(postsController.bulk));
router.post('/', requirePermission(PERMISSIONS.POST_CREATE), asyncHandler(postsController.create));
router.post('/:id/duplicate', requirePermission(PERMISSIONS.POST_CREATE), asyncHandler(postsController.duplicate));
router.put('/:id', requirePermission(PERMISSIONS.POST_EDIT), asyncHandler(postsController.update));
router.delete('/:id', requirePermission(PERMISSIONS.POST_DELETE), asyncHandler(postsController.remove));

export default router;
