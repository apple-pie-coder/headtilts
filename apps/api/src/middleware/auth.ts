import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JWTPayload } from '../utils/jwt';
import { sendError } from '../utils/response';
import { validateApiKey } from '../services/apiKey.service';
import { prisma } from '../config/database';

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      apiKeyScopes?: string[];
      apiKeyId?: number;
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

    // Register usage log NOW — before scope check — so every valid-key request
    // (including 403 scope rejections) is recorded with its actual status code.
    const startTime = Date.now();
    const capturedBaseUrl = req.baseUrl;
    const capturedMethod  = req.method;
    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      // req.route.path is the matched route pattern (e.g. "/:id"); fall back to baseUrl.
      const routePath = (req.route?.path && req.route.path !== '/') ? req.route.path : '';
      const endpoint = `${capturedMethod} ${capturedBaseUrl}${routePath}`;
      prisma.apiKeyUsageLog.create({
        data: {
          apiKeyId: result.id,
          method: capturedMethod,
          endpoint,
          statusCode: res.statusCode,
          durationMs,
          ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
            ?? req.socket.remoteAddress
            ?? null,
        },
      }).catch(() => { /* non-fatal */ });
    });

    // Enforce scope based on the requested resource (use baseUrl which includes the resource name)
    const requiredScope = inferRequiredScope(req.method, req.baseUrl);
    if (requiredScope && !result.scopes.includes(requiredScope)) {
      sendError(res, 'FORBIDDEN', `API key missing required scope: ${requiredScope}`, 403);
      return; // res.on('finish') still fires and records the 403
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
    req.apiKeyId = result.id;

    next();
    return;
  }

  // ── JWT authentication ──
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  // Also accept token via query param for browser-initiated downloads (anchor tags can't set headers)
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
  const token = bearerToken ?? queryToken;

  if (!token) {
    sendError(res, 'UNAUTHORIZED', 'Missing or invalid authorization header', 401);
    return;
  }
  const payload = verifyAccessToken(token);
  if (!payload) {
    sendError(res, 'UNAUTHORIZED', 'Invalid or expired token', 401);
    return;
  }

  req.user = payload;
  next();
}

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Unauthorized', 401);
      return;
    }

    // API key auth: use scope-based permissions already resolved at authenticate time
    if (req.apiKeyId !== undefined) {
      if (!req.user.permissions?.includes(permission)) {
        sendError(res, 'FORBIDDEN', 'Insufficient permissions', 403);
        return;
      }
      next();
      return;
    }

    // JWT auth: always check the DB so permission changes take effect immediately
    try {
      // Cache per request — multiple requirePermission calls on the same route share one DB query
      let perms: string[] | undefined = (req as unknown as Record<string, unknown>)._cachedPermissions as string[] | undefined;
      if (!perms) {
        const row = await prisma.user.findUnique({
          where: { id: req.user.sub },
          select: {
            userRoles: {
              select: {
                role: {
                  select: {
                    permissions: {
                      select: { permission: { select: { module: true, action: true } } },
                    },
                  },
                },
              },
            },
          },
        });
        perms = row?.userRoles
          .flatMap((ur) => ur.role.permissions)
          .map((rp) => `${rp.permission.module}_${rp.permission.action}`) ?? [];
        (req as unknown as Record<string, unknown>)._cachedPermissions = perms;
      }

      if (!perms.includes(permission)) {
        sendError(res, 'FORBIDDEN', 'Insufficient permissions', 403);
        return;
      }
      next();
    } catch {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  };
}
