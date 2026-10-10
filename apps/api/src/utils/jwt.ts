import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '15m') as SignOptions['expiresIn'];
const JWT_REFRESH_EXPIRES_IN = (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as SignOptions['expiresIn'];

export interface JWTPayload {
  sub: string;
  email: string;
  username: string;
  roles: string[];
  permissions: string[];
}

// Every token gets a random jwtid: without it, two tokens for the same user
// issued within the same second are byte-identical, which breaks refresh-token
// rotation (the "old" token stays valid) and the unique session-hash index.
export function signAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, jwtid: crypto.randomUUID() });
}

export function signRefreshToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN, jwtid: crypto.randomUUID() });
}

export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as unknown as JWTPayload;
  } catch {
    return null;
  }
}

const MFA_TOKEN_SECRET = (process.env.JWT_SECRET || 'dev-secret') + '_mfa';

export interface MfaTokenPayload {
  sub: string;
  type: 'mfa_pending';
}

export function signMfaToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'mfa_pending' }, MFA_TOKEN_SECRET, { expiresIn: '10m' });
}

export function verifyMfaToken(token: string): MfaTokenPayload | null {
  try {
    const payload = jwt.verify(token, MFA_TOKEN_SECRET) as unknown as MfaTokenPayload;
    if (payload.type !== 'mfa_pending') return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Single-use backup download tokens ───────────────────────────────────────
// Browser downloads (<a href>) can't send an Authorization header. Instead of
// putting the access token in the URL (where it lands in logs and history),
// the admin fetches a 60-second, single-use token bound to one backup.
const DOWNLOAD_TOKEN_SECRET = (process.env.JWT_SECRET || 'dev-secret') + '_download';
const usedDownloadTokens = new Map<string, number>(); // jti → expiry (ms)

export function signDownloadToken(userId: string, backupId: number): string {
  return jwt.sign(
    { sub: userId, bid: backupId, type: 'backup_download' },
    DOWNLOAD_TOKEN_SECRET,
    { expiresIn: '60s', jwtid: crypto.randomUUID() },
  );
}

export function consumeDownloadToken(token: string, backupId: number): string | null {
  try {
    const p = jwt.verify(token, DOWNLOAD_TOKEN_SECRET) as { sub: string; bid: number; type: string; jti?: string; exp?: number };
    if (p.type !== 'backup_download' || p.bid !== backupId || !p.jti) return null;
    const now = Date.now();
    for (const [jti, exp] of usedDownloadTokens) if (exp < now) usedDownloadTokens.delete(jti);
    if (usedDownloadTokens.has(p.jti)) return null;
    usedDownloadTokens.set(p.jti, (p.exp ?? 0) * 1000);
    return p.sub;
  } catch {
    return null;
  }
}
