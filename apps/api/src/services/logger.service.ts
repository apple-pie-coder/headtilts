import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export interface LogInput {
  site: 'admin' | 'public';
  level?: 'info' | 'warn' | 'error';
  category: string;
  action: string;
  actorId?: string;
  actorEmail?: string;
  targetType?: string;
  targetId?: string | number;
  targetTitle?: string;
  ip?: string;
  userAgent?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  duration?: number;
  meta?: Record<string, unknown>;
}

const SENSITIVE_KEYS = new Set(['password', 'token', 'secret', 'mfaCode', 'mfaSecret', 'mfaBackupCodes', 'refreshToken']);

function sanitizeMeta(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = '[redacted]';
    } else if (typeof v === 'string' && v.length > 300) {
      out[k] = v.slice(0, 300) + '…';
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = sanitizeMeta(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function log(input: LogInput): void {
  const data = {
    site: input.site,
    level: input.level ?? 'info',
    category: input.category,
    action: input.action,
    actorId: input.actorId ?? null,
    actorEmail: input.actorEmail ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId != null ? String(input.targetId) : null,
    targetTitle: input.targetTitle ? input.targetTitle.slice(0, 255) : null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ? input.userAgent.slice(0, 500) : null,
    path: input.path ? input.path.slice(0, 500) : null,
    method: input.method ?? null,
    statusCode: input.statusCode ?? null,
    duration: input.duration ?? null,
    meta: input.meta ? sanitizeMeta(input.meta) as Prisma.InputJsonValue : Prisma.JsonNull,
  };

  // fire-and-forget — never let logging fail the request
  prisma.activityLog.create({ data }).catch(() => undefined);
}

const PATH_CATEGORY: [RegExp, string][] = [
  [/^\/auth/, 'auth'],
  [/^\/posts/, 'post'],
  [/^\/pages/, 'page'],
  [/^\/users/, 'user'],
  [/^\/media/, 'media'],
  [/^\/polls/, 'poll'],
  [/^\/comments/, 'comment'],
  [/^\/categories/, 'category'],
  [/^\/tags/, 'tag'],
  [/^\/roles/, 'role'],
  [/^\/settings/, 'setting'],
  [/^\/backups/, 'backup'],
  [/^\/redirects/, 'redirect'],
  [/^\/menus/, 'menu'],
  [/^\/widgets/, 'widget'],
  [/^\/sitemap/, 'sitemap'],
  [/^\/api-keys/, 'api_key'],
  [/^\/api-analytics/, 'api_analytics'],
  [/^\/celebrations/, 'celebration'],
  [/^\/contact/, 'contact'],
  [/^\/notifications/, 'notification'],
];

export interface LookupResult {
  title: string | null;
  /** Overrides the inferred category when the entity's DB type differs (e.g. post record with type='page') */
  resolvedCategory: string | null;
}

// Async entity lookup. Used after response is sent (fire-and-forget safe).
export async function lookupTitle(category: string, rawId: string): Promise<LookupResult> {
  try {
    const numId = parseInt(rawId, 10);
    switch (category) {
      case 'post':
      case 'page': {
        if (isNaN(numId)) return { title: null, resolvedCategory: null };
        const r = await prisma.post.findUnique({ where: { id: numId }, select: { title: true, type: true } });
        return {
          title: r?.title ?? null,
          // A Post record with type='page' should log as category 'page', not 'post'
          resolvedCategory: r?.type ?? null,
        };
      }
      case 'poll': {
        if (isNaN(numId)) return { title: null, resolvedCategory: null };
        const r = await prisma.poll.findUnique({ where: { id: numId }, select: { title: true } });
        return { title: r?.title ?? null, resolvedCategory: null };
      }
      case 'user': {
        const r = await prisma.user.findUnique({ where: { id: rawId }, select: { email: true, firstName: true, lastName: true } });
        const name = r ? ([r.firstName, r.lastName].filter(Boolean).join(' ') || r.email) : null;
        return { title: name, resolvedCategory: null };
      }
      case 'category': {
        if (isNaN(numId)) return { title: null, resolvedCategory: null };
        const r = await prisma.category.findUnique({ where: { id: numId }, select: { name: true } });
        return { title: r?.name ?? null, resolvedCategory: null };
      }
      case 'tag': {
        if (isNaN(numId)) return { title: null, resolvedCategory: null };
        const r = await prisma.tag.findUnique({ where: { id: numId }, select: { name: true } });
        return { title: r?.name ?? null, resolvedCategory: null };
      }
      case 'role': {
        if (isNaN(numId)) return { title: null, resolvedCategory: null };
        const r = await prisma.role.findUnique({ where: { id: numId }, select: { name: true } });
        return { title: r?.name ?? null, resolvedCategory: null };
      }
      case 'menu': {
        if (isNaN(numId)) return { title: null, resolvedCategory: null };
        const r = await prisma.menu.findUnique({ where: { id: numId }, select: { name: true } });
        return { title: r?.name ?? null, resolvedCategory: null };
      }
      case 'celebration': {
        if (isNaN(numId)) return { title: null, resolvedCategory: null };
        const r = await prisma.celebration.findUnique({ where: { id: numId }, select: { name: true } });
        return { title: r?.name ?? null, resolvedCategory: null };
      }
      case 'media': {
        if (isNaN(numId)) return { title: null, resolvedCategory: null };
        const r = await prisma.media.findUnique({ where: { id: numId }, select: { filename: true } });
        return { title: r?.filename ?? null, resolvedCategory: null };
      }
      default:
        return { title: null, resolvedCategory: null };
    }
  } catch {
    return { title: null, resolvedCategory: null };
  }
}

const NUM_RE  = /^\d+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isEntityId(s: string): boolean {
  return NUM_RE.test(s) || UUID_RE.test(s);
}

// Second-segment keywords that are collection-level actions, not entity IDs
const COLLECTION_ACTIONS = new Set([
  'bulk', 'bulk-delete', 'upload', 'folders', 'me',
  'author-list', 'analytics', 'export', 'resolve',
  'mark-read', 'mark-unread', 'read-all',
  'settings', 'test', 'test-email', 'preferences',
]);

export function extractEntityId(path: string): string | null {
  const parts = path.replace(/^\//, '').split('/');
  const seg = parts[1];
  if (!seg || COLLECTION_ACTIONS.has(seg)) return null;
  if (!isEntityId(seg)) return null; // settings keys, named slugs, etc.
  return seg;
}

export function inferCategory(path: string): string {
  for (const [re, cat] of PATH_CATEGORY) {
    if (re.test(path)) return cat;
  }
  return 'misc';
}

export function inferAction(method: string, path: string): string {
  const cat = inferCategory(path);
  // Drop the resource prefix (e.g. 'posts') — work with remaining segments only
  const segs = path.replace(/^\//, '').split('/').slice(1);

  const verbs: Record<string, string> = {
    POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete',
  };
  const verb = verbs[method] ?? method.toLowerCase();

  if (segs.length === 0) {
    // POST /posts → post.create
    return `${cat}.${verb}`;
  }

  const s0 = segs[0];

  // Collection-level action keyword (e.g. POST /posts/bulk, POST /media/upload)
  if (COLLECTION_ACTIONS.has(s0)) {
    return `${cat}.${s0.replace(/-/g, '_')}`;
  }

  if (isEntityId(s0)) {
    const s1 = segs[1];
    if (!s1) {
      // PUT /posts/5 → post.update, DELETE /posts/5 → post.delete
      return `${cat}.${verb}`;
    }

    // s1 could itself be a resource name with a further ID (e.g. /posts/:postId/revisions/:id/archive)
    if (s1 === 'revisions') {
      const s3 = segs[3]; // archive | restore
      return s3 ? `${cat}.revision_${s3.replace(/-/g, '_')}` : `${cat}.revision_list`;
    }

    // Simple sub-action: POST /posts/5/duplicate, POST /backups/5/restore
    return `${cat}.${s1.replace(/-/g, '_')}`;
  }

  // Non-ID second segment that isn't a collection action (e.g. PUT /settings/site_name)
  // Treat as a keyed entity update/delete — use the HTTP verb
  return `${cat}.${verb}`;
}
