import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, requirePermission } from '../middleware/auth';
import { backupController } from '../controllers/backup.controller';

const router: Router = Router();
router.use(authenticate);

const backupUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/gzip' || file.originalname.endsWith('.tar.gz')) {
      cb(null, true);
    } else {
      cb(new Error('Only .tar.gz backup files are accepted'));
    }
  },
});

const perm = requirePermission('system_backup');

// Specific paths before parameterized /:id routes
router.get('/settings',  perm, asyncHandler(backupController.getSettings));
router.put('/settings',  perm, asyncHandler(backupController.updateSettings));
router.post('/upload',   perm, backupUpload.single('file'), asyncHandler(backupController.upload));

// Collection
router.get('/',   perm, asyncHandler(backupController.list));
router.post('/',  perm, asyncHandler(backupController.create));

// Item routes
router.get('/:id',           perm, asyncHandler(backupController.get));
router.get('/:id/download',  perm, asyncHandler(backupController.download));
router.post('/:id/verify',   perm, asyncHandler(backupController.verify));
router.post('/:id/restore',  perm, asyncHandler(backupController.restore));
router.delete('/:id',        perm, asyncHandler(backupController.remove));

export default router;
