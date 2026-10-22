import { AxiosError } from 'axios';
import { startAuthentication, startRegistration, WebAuthnError } from '@simplewebauthn/browser';
import { apiClient } from './api';
import { User } from '../types';

export { browserSupportsWebAuthn as passkeysSupported, browserSupportsWebAuthnAutofill } from '@simplewebauthn/browser';

export interface Passkey {
  id: number;
  name: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface SessionResult {
  accessToken: string;
  user: User;
  backupCodes?: string[];
}

/**
 * Passwordless sign-in. With `autofill`, the request waits quietly for the
 * person to pick a passkey from the username field's suggestions.
 */
export async function signInWithPasskey(autofill = false): Promise<SessionResult> {
  const { data } = await apiClient.post('/auth/passkey/login/options');
  const { challengeId, options } = data.data;
  const response = await startAuthentication({ optionsJSON: options, useBrowserAutofill: autofill });
  const res = await apiClient.post('/auth/passkey/login/verify', { challengeId, response });
  return res.data.data;
}

/** Second step after the password. */
export async function verifyWithPasskey(mfaToken: string): Promise<SessionResult> {
  const { data } = await apiClient.post('/auth/mfa/passkey/options', { mfaToken });
  const { challengeId, options } = data.data;
  const response = await startAuthentication({ optionsJSON: options });
  const res = await apiClient.post('/auth/mfa/passkey/verify', { mfaToken, challengeId, response });
  return res.data.data;
}

/** Login-time enrolment when the role requires two-step sign-in. */
export async function enrollPasskeyAtLogin(mfaToken: string): Promise<SessionResult & { backupCodes: string[] }> {
  const { data } = await apiClient.post('/auth/mfa/enroll/passkey/options', { mfaToken });
  const { challengeId, options } = data.data;
  const response = await startRegistration({ optionsJSON: options });
  const res = await apiClient.post('/auth/mfa/enroll/passkey/complete', { mfaToken, challengeId, response });
  return res.data.data;
}

export async function listPasskeys(): Promise<Passkey[]> {
  const res = await apiClient.get('/auth/passkeys');
  return res.data.data;
}

export async function addPasskey(password: string, name?: string): Promise<Passkey> {
  const { data } = await apiClient.post('/auth/passkeys/options', { password });
  const { challengeId, options } = data.data;
  const response = await startRegistration({ optionsJSON: options });
  const res = await apiClient.post('/auth/passkeys', { challengeId, response, name });
  return res.data.data;
}

export async function renamePasskey(id: number, name: string): Promise<Passkey> {
  const res = await apiClient.patch(`/auth/passkeys/${id}`, { name });
  return res.data.data;
}

export async function removePasskey(id: number): Promise<void> {
  await apiClient.delete(`/auth/passkeys/${id}`);
}

/**
 * A message for a failed passkey request, or null when there is nothing to
 * report (a newer request replaced this one).
 */
export function passkeyError(err: unknown, fallback: string): string | null {
  const name = (err as Error)?.name;
  const code = err instanceof WebAuthnError ? err.code : undefined;
  if (name === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED') return null;
  // Cancelled, timed out, or no passkey for this site on the device.
  if (name === 'NotAllowedError') return 'No passkey was used. Try again, or use another way to sign in.';
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return 'That passkey is already on your account.';
  if (code === 'ERROR_INVALID_DOMAIN' || code === 'ERROR_INVALID_RP_ID') {
    return 'Passkeys only work when the admin is opened at its own HTTPS address.';
  }
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}
