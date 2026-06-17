import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ValidationError } from '../utils/errors';

// Absolute safety ceiling. The admin-configured per-upload limit (Settings →
// Media) is enforced afterwards in the service; this just caps pathological
// uploads regardless of settings.
function parseSize(value: string | undefined, fallback: number): number {
  const match = /^(\d+)\s*(kb|mb|gb)?$/i.exec((value || '').trim());
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = (match[2] || 'mb').toLowerCase();
  const multiplier = unit === 'gb' ? 1024 ** 3 : unit === 'kb' ? 1024 : 1024 ** 2;
  return amount * multiplier;
}

const HARD_CEILING = parseSize(process.env.MAX_UPLOAD_SIZE, 100 * 1024 * 1024);
export const MAX_FILES = 20;

// Always-blocked types regardless of admin settings (defense in depth).
const BLOCKED_MIME = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-sh',
  'application/x-httpd-php',
  'text/x-php',
  'application/x-executable',
]);

export const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: HARD_CEILING, files: MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (BLOCKED_MIME.has(file.mimetype)) {
      cb(new ValidationError(`File type not allowed: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

function handleMulterError(err: unknown, next: NextFunction): boolean {
  if (!err) return false;
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    next(new ValidationError('A file exceeds the maximum upload size'));
  } else if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_COUNT') {
    next(new ValidationError(`You can upload at most ${MAX_FILES} files at once`));
  } else if (err instanceof multer.MulterError) {
    next(new ValidationError(err.message));
  } else {
    next(err);
  }
  return true;
}

// Single file under field "file" — used by replace-in-place.
export function uploadSingleImage(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!handleMulterError(err, next)) next();
  });
}

// Multiple files under field "files" — used by the batch uploader.
export function uploadManyImages(req: Request, res: Response, next: NextFunction): void {
  upload.array('files', MAX_FILES)(req, res, (err: unknown) => {
    if (!handleMulterError(err, next)) next();
  });
}
