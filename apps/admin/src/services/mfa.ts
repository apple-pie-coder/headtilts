import { apiClient } from './api';

export interface MfaSetupData {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface MfaStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

export async function getMfaStatus(): Promise<MfaStatus> {
  const res = await apiClient.get('/auth/mfa/status');
  return res.data.data;
}

export async function setupMfa(): Promise<MfaSetupData> {
  const res = await apiClient.post('/auth/mfa/setup');
  return res.data.data;
}

export async function enableMfa(code: string): Promise<{ backupCodes: string[] }> {
  const res = await apiClient.post('/auth/mfa/enable', { code });
  return res.data.data;
}

export async function disableMfa(password: string): Promise<void> {
  await apiClient.post('/auth/mfa/disable', { password });
}
