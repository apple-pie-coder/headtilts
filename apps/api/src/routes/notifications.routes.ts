import { Router, IRouter } from 'express';
import * as notificationsController from '../controllers/notifications.controller';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router: IRouter = Router();

// A user's own inbox — authentication only, no extra permission.
router.use(authenticate);

router.get('/', asyncHandler(notificationsController.list));
router.get('/unread-count', asyncHandler(notificationsController.unreadCount));
router.post('/read-all', asyncHandler(notificationsController.markAllRead));
router.post('/mark-read', asyncHandler(notificationsController.markRead));
router.post('/mark-unread', asyncHandler(notificationsController.markUnread));

export default router;
