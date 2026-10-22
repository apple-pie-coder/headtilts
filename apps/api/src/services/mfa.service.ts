import { generateSecret as otpGenerateSecret, verifySync, generateURI } from 'otplib';
import * as qrcode from 'qrcode';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { ApiError } from '../utils/errors';

const APP_NAME = process.env.APP_NAME || 'Headtilts CMS';

export function generateSecret(): string {
  return otpGenerateSecret();
}

export function getOtpAuthUrl(secret: string, email: string): string {
  return generateURI({ secret, label: email, issuer: APP_NAME });
}

export async function getQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return qrcode.toDataURL(otpauthUrl);
}

export function verifyTotp(secret: string, token: string): boolean {
  const result = verifySync({ token, secret });
  return typeof result === 'object' ? result.valid : result;
}

/**
 * Verifies a TOTP code and atomically records the time-step it matched, so the
 * same code can never be accepted twice (e.g. one shoulder-surfed or phished
 * moments after the user typed it).
 */
export async function verifyAndConsumeTotp(userId: string, secret: string, token: string): Promise<boolean> {
  if (typeof token !== 'string' || !/^\d{6}$/.test(token)) return false;
  const result = verifySync({ token, secret }) as unknown;
  if (typeof result !== 'object' || result === null) return false;
  const { valid, timeStep, delta } = result as { valid: boolean; timeStep?: number; delta?: number };
  if (!valid || typeof timeStep !== 'number') return false;
  const step = timeStep + (delta ?? 0);
  const { count } = await prisma.user.updateMany({
    where: { id: userId, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] },
    data: { mfaLastUsedStep: step },
  });
  return count === 1;
}

function generateCode(): string {
  return crypto.randomBytes(5).toString('hex').toUpperCase();
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export function generateBackupCodes(): { plain: string[]; hashed: string[] } {
  const codes = Array.from({ length: 8 }, generateCode);
  return { plain: codes, hashed: codes.map(hashCode) };
}

export async function consumeBackupCode(userId: string, inputCode: string): Promise<boolean> {
  if (typeof inputCode !== 'string') return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaBackupCodes: true } });
  if (!user?.mfaBackupCodes) return false;

  const stored: string[] = JSON.parse(user.mfaBackupCodes);
  const inputHash = hashCode(inputCode.toUpperCase().replace(/-/g, ''));
  const idx = stored.indexOf(inputHash);
  if (idx === -1) return false;

  stored.splice(idx, 1);
  // Compare-and-swap: if two requests race with the same code, only one wins.
  const { count } = await prisma.user.updateMany({
    where: { id: userId, mfaBackupCodes: user.mfaBackupCodes },
    data: { mfaBackupCodes: JSON.stringify(stored) },
  });
  return count === 1;
}

export function backupCodesRemaining(stored: string | null): number {
  return stored ? (JSON.parse(stored) as string[]).length : 0;
}

export async function getMfaStatus(userId: string): Promise<{
  enabled: boolean; backupCodesRemaining: number; passkeys: number; required: boolean;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true, mfaBackupCodes: true, _count: { select: { passkeys: true } } },
  });
  if (!user) throw new ApiError('USER_NOT_FOUND', 'User not found', 404);

  return {
    enabled: user.mfaEnabled,
    backupCodesRemaining: backupCodesRemaining(user.mfaBackupCodes),
    passkeys: user._count.passkeys,
    required: await isMfaRequiredForUser(userId),
  };
}

export async function isMfaRequiredForUser(userId: string): Promise<boolean> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { select: { mfaRequired: true } } },
  });
  return userRoles.some((ur) => ur.role.mfaRequired);
}
