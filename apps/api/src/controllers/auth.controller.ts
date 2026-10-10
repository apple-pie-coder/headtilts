import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import * as mfaService from '../services/mfa.service';
import { sendSuccess, sendError } from '../utils/response';
import { ApiError } from '../utils/errors';
import { log } from '../services/logger.service';
import { verifyMfaToken } from '../utils/jwt';

// ── Refresh-token cookie ─────────────────────────────────────────────────────
// Browser clients (the admin panel) opt in with `X-Auth-Transport: cookie`:
// the refresh token is then only ever sent as an HttpOnly cookie, so script on
// the page (e.g. an XSS payload) can never read or exfiltrate it. Other API
// clients keep receiving it in the JSON body as before.
const REFRESH_COOKIE = 'ht_refresh';
const REFRESH_COOKIE_PATH = '/api/auth';
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function wantsCookie(req: Request): boolean {
  return req.get('x-auth-transport') === 'cookie';
}

function readRefreshCookie(req: Request): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === REFRESH_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function cookieOptions(req: Request) {
  return { httpOnly: true, sameSite: 'strict' as const, secure: req.secure, path: REFRESH_COOKIE_PATH };
}

function clearRefreshCookie(req: Request, res: Response): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(req));
}

/** Moves the refresh token into the cookie for browser clients. */
function deliverSession<T extends object>(req: Request, res: Response, result: T): T | Omit<T, 'refreshToken'> {
  if (!wantsCookie(req) || !('refreshToken' in result)) return result;
  const { refreshToken, ...rest } = result as T & { refreshToken: string };
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions(req), maxAge: REFRESH_COOKIE_MAX_AGE });
  return rest;
}
import { clientIp } from '../utils/clientIp';

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, username, password, firstName, lastName } = req.body;

    const result = await authService.register(email, username, password, firstName, lastName);
    sendSuccess(res, result, 201, 'User registered successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function setupStatus(_req: Request, res: Response): Promise<void> {
  try {
    const result = await authService.getSetupStatus();
    sendSuccess(res, result);
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function setup(req: Request, res: Response): Promise<void> {
  try {
    const { email, username, password, firstName, lastName } = req.body;

    const result = await authService.setupFirstAdmin(email, username, password, firstName, lastName);
    sendSuccess(res, deliverSession(req, res, result), 201, 'Administrator account created successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    // Accept `identifier` (email or username); fall back to `email` for compatibility.
    const { identifier, email, password } = req.body;
    const loginId: string | undefined = identifier ?? email;

    if (!loginId || !password) {
      sendError(res, 'VALIDATION_ERROR', 'Email or username and password are required', 400);
      return;
    }

    const result = await authService.login(loginId, password);
    log({
      site: 'admin', level: 'info', category: 'auth', action: 'auth.login',
      actorEmail: loginId,
      ip: clientIp(req),
      userAgent: req.get('user-agent'),
      path: req.path, method: req.method, statusCode: 200,
    });
    sendSuccess(res, deliverSession(req, res, result), 200, 'Logged in successfully');
  } catch (error) {
    if (error instanceof ApiError) {
      log({
        site: 'admin', level: 'warn', category: 'auth', action: 'auth.login_failed',
        actorEmail: req.body.identifier ?? req.body.email,
        ip: clientIp(req),
        userAgent: req.get('user-agent'),
        path: req.path, method: req.method, statusCode: error.statusCode,
        meta: { reason: error.message },
      });
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Unauthorized', 401);
      return;
    }

    const user = await authService.getCurrentUser(req.user.sub);
    sendSuccess(res, user);
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const bodyToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
  const cookieToken = bodyToken ? undefined : readRefreshCookie(req);
  try {
    // Cookie refresh requires the custom header: a cross-origin page can't send
    // it without a CORS preflight, which the CORS policy rejects (CSRF guard).
    if (cookieToken && !wantsCookie(req)) {
      sendError(res, 'UNAUTHORIZED', 'Refresh token required', 401);
      return;
    }
    const result = await authService.refreshAccessToken(bodyToken ?? cookieToken ?? '');
    sendSuccess(res, cookieToken ? deliverSession(req, res, result) : result);
  } catch (error) {
    if (cookieToken) clearRefreshCookie(req, res);
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : readRefreshCookie(req);
    clearRefreshCookie(req, res);
    if (refreshToken) {
      await authService.logout(refreshToken);
    }
    log({
      site: 'admin', level: 'info', category: 'auth', action: 'auth.logout',
      actorId: req.user?.sub, actorEmail: req.user?.email,
      ip: clientIp(req),
      userAgent: req.get('user-agent'),
      path: req.path, method: req.method, statusCode: 200,
    });
    sendSuccess(res, { message: 'Logged out successfully' });
  } catch (error) {
    // Logout should always succeed from the client's perspective
    sendSuccess(res, { message: 'Logged out successfully' });
  }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body;
    if (!email) {
      sendError(res, 'VALIDATION_ERROR', 'Email is required', 400);
      return;
    }
    await authService.requestPasswordReset(email);
    // Always succeed — do not reveal whether the email exists
    sendSuccess(res, { message: 'If that email exists, a reset link has been sent' });
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { token, password } = req.body;
    await authService.resetPassword(token, password);
    sendSuccess(res, { message: 'Password updated. You can now log in.' });
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

// ── MFA endpoints ─────────────────────────────────────────────────────────────

export async function mfaVerify(req: Request, res: Response): Promise<void> {
  try {
    const { mfaToken, code } = req.body;
    if (!mfaToken || !code) {
      sendError(res, 'VALIDATION_ERROR', 'mfaToken and code are required', 400);
      return;
    }
    const payload = verifyMfaToken(mfaToken);
    if (!payload) {
      sendError(res, 'UNAUTHORIZED', 'Invalid or expired MFA token', 401);
      return;
    }
    const user = await import('../config/database').then((m) =>
      m.prisma.user.findUnique({ where: { id: payload.sub }, select: { mfaSecret: true, mfaEnabled: true } }),
    );
    if (!user?.mfaSecret || !mfaService.verifyTotp(user.mfaSecret, code)) {
      sendError(res, 'UNAUTHORIZED', 'Invalid authentication code', 401);
      return;
    }
    const result = await authService.completeMfaLogin(payload.sub);
    sendSuccess(res, deliverSession(req, res, result));
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function mfaVerifyBackup(req: Request, res: Response): Promise<void> {
  try {
    const { mfaToken, backupCode } = req.body;
    if (!mfaToken || !backupCode) {
      sendError(res, 'VALIDATION_ERROR', 'mfaToken and backupCode are required', 400);
      return;
    }
    const payload = verifyMfaToken(mfaToken);
    if (!payload) {
      sendError(res, 'UNAUTHORIZED', 'Invalid or expired MFA token', 401);
      return;
    }
    const ok = await mfaService.consumeBackupCode(payload.sub, backupCode);
    if (!ok) {
      sendError(res, 'UNAUTHORIZED', 'Invalid backup code', 401);
      return;
    }
    const result = await authService.completeMfaLogin(payload.sub);
    sendSuccess(res, deliverSession(req, res, result));
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function mfaSetup(req: Request, res: Response): Promise<void> {
  try {
    const result = await authService.setupMfa(req.user!.sub);
    sendSuccess(res, result);
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function mfaEnable(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.body;
    if (!code) {
      sendError(res, 'VALIDATION_ERROR', 'TOTP code is required', 400);
      return;
    }
    const result = await authService.enableMfa(req.user!.sub, code);
    sendSuccess(res, result);
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function mfaDisable(req: Request, res: Response): Promise<void> {
  try {
    const { password } = req.body;
    if (!password) {
      sendError(res, 'VALIDATION_ERROR', 'Password is required', 400);
      return;
    }
    await authService.disableMfa(req.user!.sub, password);
    sendSuccess(res, { message: 'MFA disabled' });
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}

export async function mfaStatus(req: Request, res: Response): Promise<void> {
  try {
    const result = await mfaService.getMfaStatus(req.user!.sub);
    sendSuccess(res, result);
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode, error.details);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}
