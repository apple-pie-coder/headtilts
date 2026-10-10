import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../config/database';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { uploadDir } from '../middleware/upload';
import { slugify } from '@headtilts/shared';

const uploaderInclude = {
  uploadedBy: { select: { id: true, username: true, firstName: true, lastName: true } },
  folder: { select: { id: true, name: true, slug: true } },
};

// Raster types sharp can re-encode. GIF is excluded so animation survives.
const RASTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Declared MIME → format sharp must detect in the actual bytes.
const SHARP_FORMAT: Record<string, string[]> = {
  'image/jpeg': ['jpeg'],
  'image/png': ['png'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'image/avif': ['heif'],
  'image/tiff': ['tiff'],
  'image/svg+xml': ['svg'],
};

// The multipart Content-Type is client-controlled; make sure the file really is
// the image type it claims to be before it is stored and served.
async function assertContentMatchesMime(absPath: string, mimetype: string, originalname: string): Promise<void> {
  const expected = SHARP_FORMAT[mimetype.toLowerCase()];
  if (!expected) return;
  let format: string | undefined;
  try {
    format = (await sharp(absPath).metadata()).format;
  } catch {
    format = undefined;
  }
  if (!format || !expected.includes(format)) {
    await unlinkSafe(absPath);
    throw new ValidationError(`"${originalname}" is not a valid ${mimetype} file`);
  }
}

interface MediaSettings {
  thumbW: number;
  thumbH: number;
  thumbCrop: boolean;
  mediumW: number;
  mediumH: number;
  largeW: number;
  largeH: number;
  useYearMonth: boolean;
  allowedMime: string[];
  maxBytes: number;
  format: 'original' | 'webp' | 'avif';
  quality: number;
}

async function getMediaSettings(): Promise<MediaSettings> {
  const keys = [
    'thumbnail_size_w', 'thumbnail_size_h', 'thumbnail_crop',
    'medium_size_w', 'medium_size_h', 'large_size_w', 'large_size_h',
    'uploads_use_yearmonth', 'upload_allowed_mime', 'max_upload_size',
    'media_format', 'media_quality',
  ];
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const map: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const num = (key: string, fallback: number) => Math.max(1, Number(map[key]) || fallback);

  const format = ['webp', 'avif'].includes(map.media_format) ? (map.media_format as 'webp' | 'avif') : 'original';
  const quality = Math.min(100, Math.max(1, Number(map.media_quality) || 82));
  const allowedMime = (map.upload_allowed_mime || 'image/jpeg,image/png,image/gif,image/webp')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

  return {
    thumbW: num('thumbnail_size_w', 150),
    thumbH: num('thumbnail_size_h', 150),
    thumbCrop: map.thumbnail_crop !== 'no',
    mediumW: num('medium_size_w', 300),
    mediumH: num('medium_size_h', 300),
    largeW: num('large_size_w', 1024),
    largeH: num('large_size_h', 1024),
    useYearMonth: map.uploads_use_yearmonth !== 'no',
    allowedMime,
    maxBytes: num('max_upload_size', 10) * 1024 * 1024,
    format,
    quality,
  };
}

function urlToPath(url: string | null | undefined): string | null {
  if (!url || !url.startsWith('/uploads/')) return null;
  const rel = path.normalize(url.slice('/uploads/'.length));
  if (rel.startsWith('..')) return null;
  return path.join(uploadDir, rel);
}

const toUrl = (rel: string) => `/uploads/${rel.split(path.sep).join('/')}`;

async function unlinkSafe(filePath: string | null) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

const FORMAT_EXT: Record<string, string> = { webp: 'webp', avif: 'avif' };

interface Dimensions {
  width: number | null;
  height: number | null;
}

/**
 * Read the intrinsic pixel dimensions of an image, accounting for EXIF
 * orientation (orientations 5–8 swap width/height when displayed). Returns
 * nulls for anything sharp can't measure (e.g. dimensionless SVGs).
 */
async function readDimensions(absPath: string): Promise<Dimensions> {
  try {
    const meta = await sharp(absPath).metadata();
    let width = meta.width ?? null;
    let height = meta.height ?? null;
    if (meta.orientation && meta.orientation >= 5) {
      [width, height] = [height, width];
    }
    return { width, height };
  } catch {
    return { width: null, height: null };
  }
}

interface ProcessedFiles {
  url: string;
  originalUrl: string;
  thumbnailUrl: string | null;
  mediumUrl: string | null;
  size: number;
}

/**
 * Build the delivery image (capped + optional format conversion), thumbnail,
 * and medium renditions from a freshly-uploaded raster file. The untouched
 * source is preserved as originalUrl.
 */
async function processRaster(
  absSource: string,
  relSource: string,
  settings: MediaSettings,
  mimeType: string,
): Promise<ProcessedFiles> {
  const dir = path.dirname(relSource);
  const base = path.basename(relSource, path.extname(relSource));
  const sourceFmt = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpeg';
  const outFmt = settings.format === 'original' ? sourceFmt : settings.format;
  const outExt = FORMAT_EXT[settings.format] || path.extname(relSource).slice(1) || sourceFmt;
  const rel = (suffix: string) => (dir === '.' ? `${base}-${suffix}.${outExt}` : path.join(dir, `${base}-${suffix}.${outExt}`));

  const encode = (pipeline: sharp.Sharp) =>
    pipeline.toFormat(outFmt as keyof sharp.FormatEnum, { quality: settings.quality });

  // Display (capped to "large", converted/quality-encoded)
  const displayRel = rel('display');
  await encode(
    sharp(absSource).rotate().resize(settings.largeW, settings.largeH, { fit: 'inside', withoutEnlargement: true }),
  ).toFile(path.join(uploadDir, displayRel));
  const displaySize = (await fs.stat(path.join(uploadDir, displayRel))).size;

  // Thumbnail
  const thumbRel = rel('thumb');
  await encode(
    sharp(absSource).rotate().resize(settings.thumbW, settings.thumbH, {
      fit: settings.thumbCrop ? 'cover' : 'inside',
      withoutEnlargement: true,
    }),
  ).toFile(path.join(uploadDir, thumbRel));

  // Medium
  const mediumRel = rel('medium');
  await encode(
    sharp(absSource).rotate().resize(settings.mediumW, settings.mediumH, { fit: 'inside', withoutEnlargement: true }),
  ).toFile(path.join(uploadDir, mediumRel));

  return {
    url: toUrl(displayRel),
    originalUrl: toUrl(relSource),
    thumbnailUrl: toUrl(thumbRel),
    mediumUrl: toUrl(mediumRel),
    size: displaySize,
  };
}

export interface CreateMediaResult {
  media: Awaited<ReturnType<typeof getMediaById>>;
  duplicate: boolean;
}

/**
 * Validate, dedup, process, and persist one uploaded file. On any validation
 * failure the temp file is removed. Duplicate uploads (same content hash)
 * resolve to the existing record instead of storing a copy.
 */
export async function createMedia(
  file: Express.Multer.File,
  uploadedById: string,
  folderId?: number | null,
): Promise<CreateMediaResult> {
  const settings = await getMediaSettings();
  const tempPath = path.join(uploadDir, file.filename);

  // ── Validation against admin settings ──
  if (!settings.allowedMime.includes(file.mimetype.toLowerCase())) {
    await unlinkSafe(tempPath);
    throw new ValidationError(`File type not allowed: ${file.mimetype}`);
  }
  if (file.size > settings.maxBytes) {
    await unlinkSafe(tempPath);
    throw new ValidationError(`"${file.originalname}" exceeds the ${Math.round(settings.maxBytes / (1024 * 1024))} MB limit`);
  }
  await assertContentMatchesMime(tempPath, file.mimetype, file.originalname);

  // ── Dedup by content hash ──
  const buffer = await fs.readFile(tempPath);
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const existing = await prisma.media.findFirst({ where: { contentHash } });
  if (existing) {
    await unlinkSafe(tempPath);
    const media = await getMediaById(existing.id);
    return { media, duplicate: true };
  }

  if (folderId != null) {
    const folder = await prisma.mediaFolder.findUnique({ where: { id: folderId } });
    if (!folder) {
      await unlinkSafe(tempPath);
      throw new ValidationError('Selected folder no longer exists');
    }
  }

  // ── Optional year/month foldering ──
  let relSource = file.filename;
  if (settings.useYearMonth) {
    const now = new Date();
    const relDir = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
    await fs.mkdir(path.join(uploadDir, relDir), { recursive: true });
    await fs.rename(tempPath, path.join(uploadDir, relDir, file.filename));
    relSource = path.join(relDir, file.filename);
  }
  const absSource = path.join(uploadDir, relSource);

  // ── Processing ──
  let urls: ProcessedFiles = {
    url: toUrl(relSource),
    originalUrl: toUrl(relSource),
    thumbnailUrl: null,
    mediumUrl: null,
    size: file.size,
  };
  if (RASTER_TYPES.includes(file.mimetype)) {
    try {
      urls = await processRaster(absSource, relSource, settings, file.mimetype);
    } catch (error) {
      console.error('Image processing failed, serving original only:', error);
    }
  }

  const dimensions = file.mimetype.startsWith('image/')
    ? await readDimensions(absSource)
    : { width: null, height: null };

  const created = await prisma.media.create({
    data: {
      filename: file.filename,
      originalName: file.originalname,
      url: urls.url,
      originalUrl: urls.originalUrl,
      mimeType: file.mimetype,
      size: urls.size,
      width: dimensions.width,
      height: dimensions.height,
      contentHash,
      thumbnailUrl: urls.thumbnailUrl,
      mediumUrl: urls.mediumUrl,
      folderId: folderId ?? null,
      uploadedById,
    },
    include: uploaderInclude,
  });
  return { media: created, duplicate: false };
}

export async function getUploadConfig() {
  const s = await getMediaSettings();
  return { allowedMime: s.allowedMime, maxBytes: s.maxBytes, format: s.format };
}

export async function listMedia(
  page: number,
  limit: number,
  filters: { search?: string; folderId?: number | null } = {},
) {
  const where = {
    ...(filters.search
      ? {
          OR: [
            { originalName: { contains: filters.search } },
            { altText: { contains: filters.search } },
            { title: { contains: filters.search } },
          ],
        }
      : {}),
    ...(filters.folderId !== undefined ? { folderId: filters.folderId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.media.findMany({
      where,
      include: uploaderInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.media.count({ where }),
  ]);

  return { items, total };
}

export async function getMediaById(id: number) {
  const media = await prisma.media.findUnique({ where: { id }, include: uploaderInclude });
  if (!media) throw new NotFoundError('Media not found');
  return media;
}

interface UpdateMediaInput {
  altText?: string | null;
  title?: string | null;
  caption?: string | null;
  description?: string | null;
  originalName?: string;
  folderId?: number | null;
}

export async function updateMedia(id: number, input: UpdateMediaInput) {
  const existing = await prisma.media.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Media not found');

  if (input.originalName !== undefined && !input.originalName.trim()) {
    throw new ValidationError('File name cannot be empty');
  }
  if (input.folderId != null) {
    const folder = await prisma.mediaFolder.findUnique({ where: { id: input.folderId } });
    if (!folder) throw new ValidationError('Selected folder no longer exists');
  }

  return prisma.media.update({
    where: { id },
    data: {
      ...(input.altText !== undefined ? { altText: input.altText } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.originalName !== undefined ? { originalName: input.originalName.trim() } : {}),
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
    },
    include: uploaderInclude,
  });
}

async function deleteMediaFiles(media: { url: string; originalUrl: string | null; thumbnailUrl: string | null; mediumUrl: string | null }) {
  const targets = [media.url, media.originalUrl, media.thumbnailUrl, media.mediumUrl]
    .map(urlToPath)
    .filter((p): p is string => p !== null);
  // de-dupe (originalUrl may equal url for non-rasters)
  for (const target of [...new Set(targets)]) {
    await unlinkSafe(target);
  }
}

/**
 * Replace the binary of an existing media item: re-processes the new file and
 * swaps URLs/metadata, deleting the old files. Note: embeds that hard-coded the
 * old URL will not update automatically.
 */
export async function replaceMedia(id: number, file: Express.Multer.File) {
  const existing = await prisma.media.findUnique({ where: { id } });
  if (!existing) {
    await unlinkSafe(path.join(uploadDir, file.filename));
    throw new NotFoundError('Media not found');
  }

  const settings = await getMediaSettings();
  const tempPath = path.join(uploadDir, file.filename);

  if (!settings.allowedMime.includes(file.mimetype.toLowerCase())) {
    await unlinkSafe(tempPath);
    throw new ValidationError(`File type not allowed: ${file.mimetype}`);
  }
  if (file.size > settings.maxBytes) {
    await unlinkSafe(tempPath);
    throw new ValidationError(`"${file.originalname}" exceeds the ${Math.round(settings.maxBytes / (1024 * 1024))} MB limit`);
  }
  await assertContentMatchesMime(tempPath, file.mimetype, file.originalname);

  const buffer = await fs.readFile(tempPath);
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

  let relSource = file.filename;
  if (settings.useYearMonth) {
    const now = new Date();
    const relDir = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
    await fs.mkdir(path.join(uploadDir, relDir), { recursive: true });
    await fs.rename(tempPath, path.join(uploadDir, relDir, file.filename));
    relSource = path.join(relDir, file.filename);
  }
  const absSource = path.join(uploadDir, relSource);

  let urls: ProcessedFiles = {
    url: toUrl(relSource), originalUrl: toUrl(relSource), thumbnailUrl: null, mediumUrl: null, size: file.size,
  };
  if (RASTER_TYPES.includes(file.mimetype)) {
    try {
      urls = await processRaster(absSource, relSource, settings, file.mimetype);
    } catch (error) {
      console.error('Image processing failed during replace, serving original only:', error);
    }
  }

  const dimensions = file.mimetype.startsWith('image/')
    ? await readDimensions(absSource)
    : { width: null, height: null };

  // Remove the previous files only after the new ones exist
  await deleteMediaFiles(existing);

  return prisma.media.update({
    where: { id },
    data: {
      filename: file.filename,
      url: urls.url,
      originalUrl: urls.originalUrl,
      mimeType: file.mimetype,
      size: urls.size,
      width: dimensions.width,
      height: dimensions.height,
      contentHash,
      thumbnailUrl: urls.thumbnailUrl,
      mediumUrl: urls.mediumUrl,
    },
    include: uploaderInclude,
  });
}

export async function deleteMedia(id: number) {
  const existing = await prisma.media.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Media not found');
  await prisma.media.delete({ where: { id } });
  await deleteMediaFiles(existing);
}

export async function bulkDeleteMedia(ids: number[]): Promise<number> {
  const items = await prisma.media.findMany({ where: { id: { in: ids } } });
  if (items.length === 0) return 0;
  await prisma.media.deleteMany({ where: { id: { in: items.map((m) => m.id) } } });
  for (const item of items) {
    await deleteMediaFiles(item);
  }
  return items.length;
}

// ── Folders ──

export async function listFolders() {
  const folders = await prisma.mediaFolder.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { media: true } } },
  });
  return folders.map((f) => ({ id: f.id, name: f.name, slug: f.slug, count: f._count.media }));
}

export async function createFolder(name: string) {
  const trimmed = name?.trim();
  if (!trimmed) throw new ValidationError('Folder name is required');
  const slug = slugify(trimmed);
  if (!slug) throw new ValidationError('Could not derive a folder slug');
  const conflict = await prisma.mediaFolder.findFirst({ where: { OR: [{ name: trimmed }, { slug }] } });
  if (conflict) throw new ConflictError('A folder with this name already exists');
  return prisma.mediaFolder.create({ data: { name: trimmed, slug } });
}

export async function deleteFolder(id: number) {
  const existing = await prisma.mediaFolder.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Folder not found');
  // Media keep their files; folderId is set null via the relation's onDelete.
  await prisma.mediaFolder.delete({ where: { id } });
}
