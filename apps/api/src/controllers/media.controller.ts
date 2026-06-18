import { Request, Response } from 'express';
import * as mediaService from '../services/media.service';
import { prisma } from '../config/database';
import { MAX_FILES } from '../middleware/upload';
import { sendSuccess, sendPaginatedSuccess, sendError } from '../utils/response';
import { ApiError, ValidationError, parseIntParam } from '../utils/errors';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ApiError) {
    sendError(res, error.code, error.message, error.statusCode, error.details);
  } else {
    sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}

function parseFolderId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '' || value === 'null') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const folderId = parseFolderId(req.query.folderId);

    const { items, total } = await mediaService.listMedia(page, limit, { search, folderId });
    sendPaginatedSuccess(res, items, total, page, limit);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getOne(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const media = await mediaService.getMediaById(id);
    sendSuccess(res, media);
  } catch (error) {
    handleError(res, error);
  }
}

// Batch upload (field "files"). Each file is validated/deduped independently;
// per-file failures are reported without failing the whole request.
export async function upload(req: Request, res: Response): Promise<void> {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw new ValidationError('No files were uploaded');
    }
    const folderId = parseFolderId(req.body?.folderId);

    const uploaded: unknown[] = [];
    const duplicates: unknown[] = [];
    const errors: { name: string; message: string }[] = [];
    const userId = req.user!.sub;

    for (const file of files) {
      try {
        const { media, duplicate } = await mediaService.createMedia(file, userId, folderId ?? null);
        if (duplicate) duplicates.push(media);
        else uploaded.push(media);
      } catch (err) {
        errors.push({
          name: file.originalname,
          message: err instanceof ApiError ? err.message : 'Failed to process file',
        });
      }
    }

    sendSuccess(res, { uploaded, duplicates, errors }, 201, 'Upload complete');
  } catch (error) {
    handleError(res, error);
  }
}

export async function replace(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) throw new ValidationError('No replacement file was uploaded');
    const id = parseIntParam(req.params.id);
    const media = await mediaService.replaceMedia(id, req.file);
    sendSuccess(res, media, 200, 'Media replaced successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const { altText, title, caption, description, originalName } = req.body;
    const media = await mediaService.updateMedia(id, {
      altText, title, caption, description, originalName,
      folderId: parseFolderId(req.body?.folderId),
    });
    sendSuccess(res, media, 200, 'Media updated successfully');
  } catch (error) {
    handleError(res, error);
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    await mediaService.deleteMedia(id);
    sendSuccess(res, { message: 'Media deleted successfully' });
  } catch (error) {
    handleError(res, error);
  }
}

export async function bulkRemove(req: Request, res: Response): Promise<void> {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? (req.body.ids as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    if (ids.length === 0) throw new ValidationError('No media ids provided');
    if (ids.length > 100) throw new ValidationError('Cannot bulk delete more than 100 items at once');
    const count = await mediaService.bulkDeleteMedia(ids);
    sendSuccess(res, { count });
  } catch (error) {
    handleError(res, error);
  }
}

export async function uploadConfig(_req: Request, res: Response): Promise<void> {
  try {
    const config = await mediaService.getUploadConfig();
    sendSuccess(res, { ...config, maxFiles: MAX_FILES });
  } catch (error) {
    handleError(res, error);
  }
}

export async function listFolders(_req: Request, res: Response): Promise<void> {
  try {
    sendSuccess(res, await mediaService.listFolders());
  } catch (error) {
    handleError(res, error);
  }
}

export async function createFolder(req: Request, res: Response): Promise<void> {
  try {
    const folder = await mediaService.createFolder(req.body?.name);
    sendSuccess(res, folder, 201, 'Folder created');
  } catch (error) {
    handleError(res, error);
  }
}

export async function deleteFolder(req: Request, res: Response): Promise<void> {
  try {
    await mediaService.deleteFolder(parseIntParam(req.params.id));
    sendSuccess(res, { message: 'Folder deleted' });
  } catch (error) {
    handleError(res, error);
  }
}

export async function usage(req: Request, res: Response): Promise<void> {
  try {
    const id = parseIntParam(req.params.id);
    const media = await prisma.media.findUnique({ where: { id }, select: { url: true, originalName: true } });
    if (!media) { sendError(res, 'NOT_FOUND', 'Media not found', 404); return; }

    const posts = await prisma.post.findMany({
      where: {
        status: { not: 'trash' },
        OR: [
          { content: { contains: media.url } },
          { featuredImage: { contains: media.url } },
          { ogImage: { contains: media.url } },
        ],
      },
      select: { id: true, title: true, slug: true, status: true, type: true },
    });

    sendSuccess(res, { count: posts.length, posts });
  } catch (error) {
    handleError(res, error);
  }
}
