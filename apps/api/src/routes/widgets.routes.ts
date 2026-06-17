import { Router, IRouter } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, requirePermission } from '../middleware/auth';
import * as widgetsController from '../controllers/widgets.controller';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

// Static paths before /:id to prevent segment conflicts
router.get('/types', requirePermission(PERMISSIONS.WIDGET_READ), asyncHandler(widgetsController.listTypes));
router.get('/zones', requirePermission(PERMISSIONS.WIDGET_READ), asyncHandler(widgetsController.listZones));
router.put('/zones/:name', requirePermission(PERMISSIONS.WIDGET_EDIT), asyncHandler(widgetsController.setZoneWidgets));

router.get('/', requirePermission(PERMISSIONS.WIDGET_READ), asyncHandler(widgetsController.list));
router.post('/', requirePermission(PERMISSIONS.WIDGET_CREATE), asyncHandler(widgetsController.create));
router.get('/:id', requirePermission(PERMISSIONS.WIDGET_READ), asyncHandler(widgetsController.getOne));
router.put('/:id', requirePermission(PERMISSIONS.WIDGET_EDIT), asyncHandler(widgetsController.update));
router.delete('/:id', requirePermission(PERMISSIONS.WIDGET_DELETE), asyncHandler(widgetsController.remove));

export default router;
