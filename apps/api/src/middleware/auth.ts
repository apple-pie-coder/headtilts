import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JWTPayload } from '../utils/jwt';
import { sendError } from '../utils/response';
import { validateApiKey } from '../services/apiKey.service';
import { prisma } from '../config/database';
import { clientIp } from '../utils/clientIp';
import { contentPermission, ContentAction } from '@headtilts/shared';

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

type ScopeAction = 'read' | 'write' | 'delete';
const scopeAction = (method: string): ScopeAction => (method === 'GET' ? 'read' : method === 'DELETE' ? 'delete' : 'write');

function inferRequiredScope(method: string, baseUrl: string): string | null {
  for (const { pattern, resource } of SCOPE_RESOURCES) {
    if (pattern.test(baseUrl)) return `${resource}:${scopeAction(method)}`;
  }
  return null;
}

/**
 * Posts and pages share the /posts routes but have separate API key scopes
 * (posts:* / pages:*). authenticate() only knows the URL, so for /posts it lets
 * through a key holding either; the exact scope is checked here once the item's
 * type is known (requireContentPermission, bulk actions). JWT requests always pass.
 */
export function apiKeyAllowsContent(req: Request, type: string, action: ScopeAction = scopeAction(req.method)): boolean {
  if (req.apiKeyScopes === undefined) return true;
  return req.apiKeyScopes.includes(`${type === 'page' ? 'pages' : 'posts'}:${action}`);
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
          ip: clientIp(req),
        },
      }).catch(() => { /* non-fatal */ });
    });

    // Enforce scope based on the requested resource (use baseUrl which includes the resource name).
    // Deny by default: endpoints with no scope (api-keys, backups, roles, auth, ...)
    // are never reachable with an API key — otherwise a narrowly scoped key could
    // mint a new all-scopes key or download backups.
    const requiredScope = inferRequiredScope(req.method, req.baseUrl);
    if (!requiredScope) {
      sendError(res, 'FORBIDDEN', 'This endpoint cannot be used with an API key', 403);
      return;
    }
    const pageScope = requiredScope.startsWith('posts:') ? requiredScope.replace('posts:', 'pages:') : null;
    if (!result.scopes.includes(requiredScope) && !(pageScope && result.scopes.includes(pageScope))) {
      sendError(res, 'FORBIDDEN', `API key missing required scope: ${pageScope ? `${requiredScope} or ${pageScope}` : requiredScope}`, 403);
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
  // Header only — tokens in query strings leak into logs, history and Referer.
  // (Backup downloads use a dedicated single-use token, see backup.routes.ts.)
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

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

/**
 * The caller's current permissions. API keys use the owner's permissions
 * resolved at authenticate time; JWTs are always checked against the DB (not
 * the token's claims) so permission changes and deactivation apply at once.
 * Cached per request.
 */
export async function loadPermissions(req: Request): Promise<string[]> {
  if (!req.user) return [];
  if (req.apiKeyId !== undefined) return req.user.permissions ?? [];

  const cache = req as unknown as Record<string, unknown>;
  let perms = cache._cachedPermissions as string[] | undefined;
  if (!perms) {
    const row = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        isActive: true,
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
    perms = row?.isActive
      ? row.userRoles
        .flatMap((ur) => ur.role.permissions)
        .map((rp) => `${rp.permission.module}_${rp.permission.action}`)
      : [];
    cache._cachedPermissions = perms;
  }
  return perms;
}

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Unauthorized', 401);
      return;
    }

    try {
      const perms = await loadPermissions(req);
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

/** Passes when the caller holds at least one of these permissions. */
export function requireAnyPermission(...permissions: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      sendError(res, 'UNAUTHORIZED', 'Unauthorized', 401);
      return;
    }
    try {
      const perms = await loadPermissions(req);
      if (!permissions.some((p) => perms.includes(p))) {
        sendError(res, 'FORBIDDEN', 'Insufficient permissions', 403);
        return;
      }
      next();
    } catch {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  };
}

/**
 * Posts and pages share the /posts routes but have separate permissions
 * (posts_* / pages_*). Resolves which applies from the request type
 * (?type= or the body's type) or the stored item named by a route param.
 */
export function requireContentPermission(action: ContentAction, typeFrom: 'query' | 'body' | 'id' | 'postId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let type = 'post';
    try {
      if (typeFrom === 'query') type = req.query.type === 'page' ? 'page' : 'post';
      else if (typeFrom === 'body') type = req.body?.type === 'page' ? 'page' : 'post';
      else {
        const id = Number(req.params[typeFrom]);
        // An unknown id falls through as a post; the handler then answers 404.
        if (Number.isInteger(id)) type = (await prisma.post.findUnique({ where: { id }, select: { type: true } }))?.type ?? 'post';
      }
    } catch {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
      return;
    }
    if (!apiKeyAllowsContent(req, type)) {
      sendError(res, 'FORBIDDEN', `API key missing required scope: ${type === 'page' ? 'pages' : 'posts'}:${scopeAction(req.method)}`, 403);
      return;
    }
    return requirePermission(contentPermission(type, action))(req, res, next);
  };
}
