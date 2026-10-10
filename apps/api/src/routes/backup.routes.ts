import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import os from 'os';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate, requirePermission } from '../middleware/auth';
import { backupController } from '../controllers/backup.controller';
import { signDownloadToken, consumeDownloadToken } from '../utils/jwt';
import { sendSuccess, sendError } from '../utils/response';

const router: Router = Router();
// Browser download via <a href>: authenticated by a single-use token from
// POST /:id/download-token, then the usual permission check. Registered before
// router.use(authenticate) because it carries no Authorization header.
router.get('/:id/download', (req: Request, res: Response, next: NextFunction) => {
  const userId = typeof req.query.dt === 'string' ? consumeDownloadToken(req.query.dt, Number(req.params.id)) : null;
  if (!userId) { sendError(res, 'UNAUTHORIZED', 'Download link is invalid or has expired', 401); return; }
  req.user = { sub: userId, email: '', username: '', roles: [], permissions: [] };
  next();
}, requirePermission('system_backup'), asyncHandler(backupController.download));

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
router.post('/:id/download-token', perm, asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, { token: signDownloadToken(req.user!.sub, Number(req.params.id)) });
}));
router.post('/:id/verify',   perm, asyncHandler(backupController.verify));
router.post('/:id/restore',  perm, asyncHandler(backupController.restore));
router.delete('/:id',        perm, asyncHandler(backupController.remove));

export default router;
