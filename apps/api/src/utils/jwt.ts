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

export function signAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function signRefreshToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
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
