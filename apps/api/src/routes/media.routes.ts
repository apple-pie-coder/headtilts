import { Router, IRouter } from 'express';
import * as mediaController from '../controllers/media.controller';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { uploadSingleImage, uploadManyImages } from '../middleware/upload';
import { PERMISSIONS } from '@headtilts/shared';

const router: IRouter = Router();

router.use(authenticate);

// Folders (static paths before /:id)
router.get('/folders', requirePermission(PERMISSIONS.MEDIA_READ), asyncHandler(mediaController.listFolders));
router.post('/folders', requirePermission(PERMISSIONS.MEDIA_UPLOAD), asyncHandler(mediaController.createFolder));
router.delete('/folders/:id', requirePermission(PERMISSIONS.MEDIA_DELETE), asyncHandler(mediaController.deleteFolder));

// Bulk delete
router.post('/bulk-delete', requirePermission(PERMISSIONS.MEDIA_DELETE), asyncHandler(mediaController.bulkRemove));

// Upload constraints for client-side pre-checks
router.get('/upload-config', requirePermission(PERMISSIONS.MEDIA_READ), asyncHandler(mediaController.uploadConfig));

router.get('/', requirePermission(PERMISSIONS.MEDIA_READ), asyncHandler(mediaController.list));
router.get('/:id', requirePermission(PERMISSIONS.MEDIA_READ), asyncHandler(mediaController.getOne));
router.post('/', requirePermission(PERMISSIONS.MEDIA_UPLOAD), uploadManyImages, asyncHandler(mediaController.upload));
router.get('/:id/usage', requirePermission(PERMISSIONS.MEDIA_READ), asyncHandler(mediaController.usage));
router.post('/:id/replace', requirePermission(PERMISSIONS.MEDIA_UPLOAD), uploadSingleImage, asyncHandler(mediaController.replace));
router.put('/:id', requirePermission(PERMISSIONS.MEDIA_UPLOAD), asyncHandler(mediaController.update));
router.delete('/:id', requirePermission(PERMISSIONS.MEDIA_DELETE), asyncHandler(mediaController.remove));

export default router;
