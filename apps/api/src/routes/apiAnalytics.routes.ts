import { Router, IRouter } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, requirePermission } from '../middleware/auth';
import { PERMISSIONS } from '@headtilts/shared';
import * as ctrl from '../controllers/apiAnalytics.controller';

const router: IRouter = Router();

router.use(authenticate, requirePermission(PERMISSIONS.API_ANALYTICS_VIEW));

router.get('/overview', asyncHandler(ctrl.getOverview));
router.get('/calls-over-time', asyncHandler(ctrl.getCallsOverTime));
router.get('/calls-per-key', asyncHandler(ctrl.getCallsPerKey));
router.get('/top-endpoints', asyncHandler(ctrl.getTopEndpoints));
router.get('/error-rates', asyncHandler(ctrl.getErrorRateByEndpoint));
router.get('/peak-hours', asyncHandler(ctrl.getPeakHours));
router.get('/export', asyncHandler(ctrl.exportCsv));

export default router;
