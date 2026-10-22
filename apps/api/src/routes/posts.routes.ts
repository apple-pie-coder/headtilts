import { Router, IRouter } from 'express';
import * as postsController from '../controllers/posts.controller';
import * as revisionsController from '../controllers/revisions.controller';
import * as liveUpdatesController from '../controllers/liveUpdates.controller';
import * as telegramController from '../controllers/telegram.controller';
import { authenticate, requireAnyPermission, requireContentPermission, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

router.get('/', requireContentPermission('read', 'query'), asyncHandler(postsController.list));
router.get('/locks', requireAnyPermission(PERMISSIONS.POST_READ, PERMISSIONS.PAGE_READ), asyncHandler(postsController.locks));
router.get('/author-list', requireAnyPermission(PERMISSIONS.POST_EDIT, PERMISSIONS.PAGE_EDIT), asyncHandler(postsController.authorList));
router.get('/:id', requireContentPermission('read', 'id'), asyncHandler(postsController.getOne));
// Preview links expose unpublished content publicly — only for people who can edit it.
router.get('/:id/preview-link', requireContentPermission('update', 'id'), asyncHandler(postsController.previewLink));
router.get('/:postId/revisions', requirePermission(PERMISSIONS.REVISION_READ), requireContentPermission('read', 'postId'), asyncHandler(revisionsController.list));
router.patch('/:postId/revisions/:id/archive', requirePermission(PERMISSIONS.REVISION_ARCHIVE), requireContentPermission('read', 'postId'), asyncHandler(revisionsController.archive));
router.post('/:postId/revisions/:id/restore', requireContentPermission('update', 'postId'), asyncHandler(revisionsController.restore));
// Bulk actions check each item's type in the controller.
router.post('/bulk', requireAnyPermission(PERMISSIONS.POST_EDIT, PERMISSIONS.PAGE_EDIT), asyncHandler(postsController.bulk));
router.post('/', requireContentPermission('create', 'body'), asyncHandler(postsController.create));
router.post('/:id/duplicate', requireContentPermission('create', 'id'), asyncHandler(postsController.duplicate));
router.put('/:id', requireContentPermission('update', 'id'), asyncHandler(postsController.update));
router.post('/:id/lock', requireContentPermission('update', 'id'), asyncHandler(postsController.acquireLock));
router.delete('/:id/lock', requireContentPermission('update', 'id'), asyncHandler(postsController.releaseLock));
// Live blog desk: updates are saved on their own, without the post's edit lock.
router.get('/:id/live-updates', requireContentPermission('read', 'id'), asyncHandler(liveUpdatesController.list));
router.post('/:id/live-updates', requireContentPermission('update', 'id'), asyncHandler(liveUpdatesController.create));
router.put('/:id/live-updates/:updateId', requireContentPermission('update', 'id'), asyncHandler(liveUpdatesController.update));
router.delete('/:id/live-updates/:updateId', requireContentPermission('update', 'id'), asyncHandler(liveUpdatesController.remove));
router.put('/:id/live-coverage', requireContentPermission('update', 'id'), asyncHandler(liveUpdatesController.coverage));
// Telegram channel: what was sent, a preview, and Post now.
router.get('/:id/telegram', requireContentPermission('read', 'id'), asyncHandler(telegramController.itemStatus('post')));
router.post('/:id/telegram', requireContentPermission('update', 'id'), asyncHandler(telegramController.itemSend('post')));
router.delete('/:id', requireContentPermission('delete', 'id'), asyncHandler(postsController.remove));

export default router;
