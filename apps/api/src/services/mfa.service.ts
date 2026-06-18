import { generateSecret as otpGenerateSecret, generateSync, verifySync, generateURI } from 'otplib';
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
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaBackupCodes: true } });
  if (!user?.mfaBackupCodes) return false;

  const stored: string[] = JSON.parse(user.mfaBackupCodes);
  const inputHash = hashCode(inputCode.toUpperCase().replace(/-/g, ''));
  const idx = stored.indexOf(inputHash);
  if (idx === -1) return false;

  stored.splice(idx, 1);
  await prisma.user.update({ where: { id: userId }, data: { mfaBackupCodes: JSON.stringify(stored) } });
  return true;
}

export async function getMfaStatus(userId: string): Promise<{ enabled: boolean; backupCodesRemaining: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabled: true, mfaBackupCodes: true } });
  if (!user) throw new ApiError('USER_NOT_FOUND', 'User not found', 404);

  const backupCodesRemaining = user.mfaBackupCodes ? (JSON.parse(user.mfaBackupCodes) as string[]).length : 0;
  return { enabled: user.mfaEnabled, backupCodesRemaining };
}

export async function isMfaRequiredForUser(userId: string): Promise<boolean> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { select: { mfaRequired: true } } },
  });
  return userRoles.some((ur) => ur.role.mfaRequired);
}

// Suppress unused import warning — generateSync is available for future use
void generateSync;
