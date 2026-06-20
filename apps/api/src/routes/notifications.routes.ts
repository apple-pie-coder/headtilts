import { Router, IRouter } from 'express';
import * as notificationsController from '../controllers/notifications.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

// A user's own inbox — authentication only, no extra permission.
router.use(authenticate);

router.get('/', asyncHandler(notificationsController.list));
router.get('/unread-count', asyncHandler(notificationsController.unreadCount));
router.post('/read-all', asyncHandler(notificationsController.markAllRead));
router.post('/mark-read', asyncHandler(notificationsController.markRead));
router.post('/mark-unread', asyncHandler(notificationsController.markUnread));

// Preferences — requires notifications_manage permission
router.get('/preferences', requirePermission(PERMISSIONS.NOTIFICATION_MANAGE), asyncHandler(notificationsController.listPreferences));
router.put('/preferences', requirePermission(PERMISSIONS.NOTIFICATION_MANAGE), asyncHandler(notificationsController.updatePreferences));
router.post('/test', requirePermission(PERMISSIONS.NOTIFICATION_MANAGE), asyncHandler(notificationsController.sendTestNotification));

export default router;
