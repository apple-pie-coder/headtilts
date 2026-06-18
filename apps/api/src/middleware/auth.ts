import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JWTPayload } from '../utils/jwt';
import { sendError } from '../utils/response';
import { validateApiKey } from '../services/apiKey.service';

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      apiKeyScopes?: string[];
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

// Scope inferred from HTTP method + path for API key requests
// Patterns matched against req.baseUrl (e.g. "/api/posts") since req.path is "/" inside sub-routers
const SCOPE_RESOURCES: { pattern: RegExp; resource: string }[] = [
  { pattern: /\/posts($|\/)/, resource: 'posts' },
  { pattern: /\/media($|\/)/, resource: 'media' },
  { pattern: /\/polls($|\/)/, resource: 'polls' },
  { pattern: /\/categories($|\/)/, resource: 'categories' },
  { pattern: /\/tags($|\/)/, resource: 'tags' },
  { pattern: /\/comments($|\/)/, resource: 'comments' },
  { pattern: /\/settings($|\/)/, resource: 'settings' },
  { pattern: /\/users($|\/)/, resource: 'users' },
];

function inferRequiredScope(method: string, baseUrl: string): string | null {
  for (const { pattern, resource } of SCOPE_RESOURCES) {
    if (pattern.test(baseUrl)) {
      if (method === 'GET') return `${resource}:read`;
      if (method === 'DELETE') return `${resource}:delete`;
      return `${resource}:write`;
    }
  }
  return null;
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  // ── API key authentication ──
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  if (apiKeyHeader) {
    const result = await validateApiKey(apiKeyHeader).catch(() => null);
    if (!result) {
      sendError(res, 'UNAUTHORIZED', 'Invalid or expired API key', 401);
      return;
    }

    // Enforce scope based on the requested resource (use baseUrl which includes the resource name)
    const requiredScope = inferRequiredScope(req.method, req.baseUrl);
    if (requiredScope && !result.scopes.includes(requiredScope)) {
      sendError(res, 'FORBIDDEN', `API key missing required scope: ${requiredScope}`, 403);
      return;
    }

    // Synthesise a JWTPayload-compatible object so existing permission checks keep working
    req.user = {
      sub: result.userId,
      email: '',
      username: '',
      roles: [],
      permissions: result.permissions,
    } as unknown as JWTPayload;
    req.apiKeyScopes = result.scopes;
    next();
    return;
  }

  // ── JWT authentication ──
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    sendError(res, 'UNAUTHORIZED', 'Missing or invalid authorization header', 401);
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyAccessToken(token);
  if (!payload) {
    sendError(res, 'UNAUTHORIZED', 'Invalid or expired token', 401);
    return;
  }

  req.user = payload;
  next();
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Unauthorized', 401);
      return;
    }

    if (!req.user.permissions?.includes(permission)) {
      sendError(res, 'FORBIDDEN', 'Insufficient permissions', 403);
      return;
    }

    next();
  };
}
