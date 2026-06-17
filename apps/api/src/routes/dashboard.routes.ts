import { Router, IRouter } from 'express';
import * as dashboardController from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';

const router: IRouter = Router();

router.use(authenticate);
router.get('/stats', asyncHandler(dashboardController.stats));

export default router;
