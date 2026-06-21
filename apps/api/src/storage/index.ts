import path from 'path';
import { LocalStorageProvider } from './local.provider';
import { S3StorageProvider } from './s3.provider';
import { StorageProvider } from './provider';

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');

export const localStorageProvider = new LocalStorageProvider(BACKUP_DIR);

// Resolves the active storage provider based on current DB settings.
// Falls back to local if S3 is misconfigured or DB is unavailable.
export async function resolveStorageProvider(): Promise<StorageProvider> {
  try {
    const { prisma } = await import('../config/database');
    const keys = ['backup_storage', 'backup_s3_bucket', 'backup_s3_region', 'backup_s3_access_key', 'backup_s3_secret_key', 'backup_s3_endpoint'];
    const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    if (
      s.backup_storage === 's3' &&
      s.backup_s3_bucket && s.backup_s3_region &&
      s.backup_s3_access_key && s.backup_s3_secret_key
    ) {
      return new S3StorageProvider({
        bucket: s.backup_s3_bucket,
        region: s.backup_s3_region,
        accessKeyId: s.backup_s3_access_key,
        secretAccessKey: s.backup_s3_secret_key,
        endpoint: s.backup_s3_endpoint || undefined,
      });
    }
  } catch { /* DB not ready — fall back to local */ }

  return localStorageProvider;
}

// Backward-compatible alias used by the upload controller
export const storageProvider = localStorageProvider;
