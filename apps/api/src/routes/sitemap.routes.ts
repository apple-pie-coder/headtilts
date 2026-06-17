import { Router, IRouter } from 'express';
import * as sitemapController from '../controllers/sitemap.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

// Public XML endpoint — no auth
router.get('/xml', asyncHandler(sitemapController.xml));

router.use(authenticate);

router.get('/', requirePermission(PERMISSIONS.SEO_READ), asyncHandler(sitemapController.list));
router.get('/:id', requirePermission(PERMISSIONS.SEO_READ), asyncHandler(sitemapController.getOne));
router.post('/', requirePermission(PERMISSIONS.SEO_MANAGE), asyncHandler(sitemapController.create));
router.put('/:id', requirePermission(PERMISSIONS.SEO_MANAGE), asyncHandler(sitemapController.update));
router.delete('/:id', requirePermission(PERMISSIONS.SEO_MANAGE), asyncHandler(sitemapController.remove));

export default router;
