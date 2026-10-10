import { apiClient } from './api';

export interface Backup {
  id: number;
  filename: string;
  label: string | null;
  sizeBytes: number;
  status: 'pending' | 'ready' | 'failed';
  errorMsg: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface BackupSettings {
  schedule: 'disabled' | 'daily' | 'weekly';
  scheduleTime: string;
  scheduleDay: number;
  retentionDays: number;
  retentionCount: number;
  notifyEmail: string;
  preRestoreBackup: boolean;
  storage: 'local' | 's3';
  s3Bucket: string;
  s3Region: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3Endpoint: string;
}

export type RestoreScope = 'all' | 'db' | 'uploads';

export async function listBackups(): Promise<Backup[]> {
  const res = await apiClient.get('/backups');
  return res.data.data;
}

export async function createBackup(label?: string): Promise<{ id: number; status: string }> {
  const res = await apiClient.post('/backups', { label });
  return res.data.data;
}

export async function pollBackup(id: number): Promise<Backup> {
  const res = await apiClient.get(`/backups/${id}`);
  return res.data.data;
}

export async function deleteBackup(id: number): Promise<void> {
  await apiClient.delete(`/backups/${id}`);
}

// Starts a browser download using a single-use, 60-second token so the
// access token never appears in a URL.
export async function downloadBackup(id: number): Promise<void> {
  const res = await apiClient.post(`/backups/${id}/download-token`);
  const base = (import.meta.env.VITE_API_URL as string) || '/api';
  const a = document.createElement('a');
  a.href = `${base}/backups/${id}/download?dt=${encodeURIComponent(res.data.data.token)}`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function restoreBackup(id: number, scope: RestoreScope = 'all'): Promise<void> {
  await apiClient.post(`/backups/${id}/restore`, { scope });
}

export async function verifyBackup(id: number): Promise<{ valid: boolean; manifest: object | null; error?: string }> {
  const res = await apiClient.post(`/backups/${id}/verify`);
  return res.data.data;
}

export async function uploadBackup(file: File): Promise<Backup> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.post('/backups/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.data;
}

export async function getBackupSettings(): Promise<BackupSettings> {
  const res = await apiClient.get('/backups/settings');
  return res.data.data;
}

export async function updateBackupSettings(settings: Partial<Record<string, string>>): Promise<void> {
  await apiClient.put('/backups/settings', settings);
}
