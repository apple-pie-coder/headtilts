import { apiClient } from './api';
import { User } from '../types';

export interface MfaSetupData {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface MfaStatus {
  enabled: boolean;
  backupCodesRemaining: number;
  /** Number of passkeys on the account. */
  passkeys: number;
  /** One of the user's roles requires two-step sign-in. */
  required: boolean;
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

/** `code` is a current authenticator code or an unused backup code. */
export async function disableMfa(password: string, code: string): Promise<void> {
  await apiClient.post('/auth/mfa/disable', { password, code });
}

export async function regenerateBackupCodes(password: string, code: string): Promise<{ backupCodes: string[] }> {
  const res = await apiClient.post('/auth/mfa/backup-codes', { password, code });
  return res.data.data;
}

// ── Sign-in (after the password) ─────────────────────────────────────────────

export interface EnrollmentResult {
  accessToken: string;
  user: User;
  backupCodes: string[];
}

export async function startEnrollment(mfaToken: string): Promise<MfaSetupData> {
  const res = await apiClient.post('/auth/mfa/enroll/start', { mfaToken });
  return res.data.data;
}

export async function completeEnrollment(mfaToken: string, code: string): Promise<EnrollmentResult> {
  const res = await apiClient.post('/auth/mfa/enroll/complete', { mfaToken, code });
  return res.data.data;
}
