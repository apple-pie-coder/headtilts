import { prisma } from '../config/database';

export interface BackupSettings {
  schedule: 'disabled' | 'daily' | 'weekly';
  scheduleTime: string;   // HH:MM 24h
  scheduleDay: number;    // 0-6, Sunday=0 (weekly only)
  retentionDays: number;  // 0 = disabled
  retentionCount: number; // 0 = disabled
  notifyEmail: string;    // empty = disabled
  preRestoreBackup: boolean;
  storage: 'local' | 's3';
  s3Bucket: string;
  s3Region: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3Endpoint: string;     // optional custom endpoint (Backblaze, Cloudflare R2, MinIO)
}

const KEYS = [
  'backup_schedule', 'backup_schedule_time', 'backup_schedule_day',
  'backup_retention_days', 'backup_retention_count',
  'backup_notify_email', 'backup_pre_restore',
  'backup_storage', 'backup_s3_bucket', 'backup_s3_region',
  'backup_s3_access_key', 'backup_s3_secret_key', 'backup_s3_endpoint',
] as const;

export const BACKUP_SETTING_KEYS = new Set<string>(KEYS);

export async function getBackupSettings(): Promise<BackupSettings> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...KEYS] } } });
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    schedule: (s.backup_schedule as BackupSettings['schedule']) ?? 'disabled',
    scheduleTime: s.backup_schedule_time ?? '02:00',
    scheduleDay: parseInt(s.backup_schedule_day ?? '1', 10), // Monday default
    retentionDays: parseInt(s.backup_retention_days ?? '0', 10),
    retentionCount: parseInt(s.backup_retention_count ?? '0', 10),
    notifyEmail: s.backup_notify_email ?? '',
    preRestoreBackup: s.backup_pre_restore !== 'false', // default true
    storage: (s.backup_storage as 'local' | 's3') ?? 'local',
    s3Bucket: s.backup_s3_bucket ?? '',
    s3Region: s.backup_s3_region ?? '',
    s3AccessKey: s.backup_s3_access_key ?? '',
    s3SecretKey: s.backup_s3_secret_key ?? '',
    s3Endpoint: s.backup_s3_endpoint ?? '',
  };
}
