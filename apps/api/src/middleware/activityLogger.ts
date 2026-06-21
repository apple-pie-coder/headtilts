import { Request, Response, NextFunction } from 'express';
import { log, inferCategory, inferAction, lookupTitle, extractEntityId } from '../services/logger.service';

const SKIP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SKIP_PATH_PREFIXES = ['/auth', '/public']; // handled explicitly

// Categories that map to a known entity type name
const CATEGORY_ENTITY: Record<string, string> = {
  post: 'Post', page: 'Page', poll: 'Poll', user: 'User',
  category: 'Category', tag: 'Tag', role: 'Role', menu: 'Menu',
  media: 'Media', celebration: 'Celebration',
};

export function activityLogger(req: Request, res: Response, next: NextFunction): void {
  if (SKIP_METHODS.has(req.method)) return next();

  if (SKIP_PATH_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
    return next();
  }

  // Capture path now — Express restores req.url (and therefore req.path) after next()
  // returns, so by the time res.on('finish') fires the prefix is back.
  const capturedPath = req.path;
  const startTime = Date.now();

  res.on('finish', () => {
    const user = (req as any).user;
    if (!user) return;

    const duration = Date.now() - startTime;
    const category = inferCategory(capturedPath);
    const action = inferAction(req.method, capturedPath);
    const entityId = extractEntityId(capturedPath);
    const entityType = CATEGORY_ENTITY[category] ?? null;

    let level: 'info' | 'warn' | 'error' = 'info';
    if (res.statusCode >= 500) level = 'error';
    else if (res.statusCode >= 400) level = 'warn';

    const meta: Record<string, unknown> = {};
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      meta.body = req.body;
    }

    const base = {
      site: 'admin' as const,
      level,
      category,
      action,
      actorId: user.sub,
      actorEmail: user.email,
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress,
      userAgent: req.get('user-agent'),
      path: capturedPath,
      method: req.method,
      statusCode: res.statusCode,
      duration,
      targetType: entityType ?? undefined,
      targetId: entityId ?? undefined,
      meta: Object.keys(meta).length > 0 ? meta : undefined,
    };

    // If we have an entity ID and type, do an async lookup for title + resolved category
    if (entityId && entityType && res.statusCode < 400) {
      lookupTitle(category, entityId).then(({ title, resolvedCategory }) => {
        // resolvedCategory overrides when the DB type differs from the path
        // e.g. DELETE /posts/5 where the record has type='page' → category='page', action='page.delete'
        const finalCategory = resolvedCategory ?? category;
        const finalAction = finalCategory !== category
          ? action.replace(`${category}.`, `${finalCategory}.`)
          : action;
        log({
          ...base,
          category: finalCategory,
          action: finalAction,
          targetType: CATEGORY_ENTITY[finalCategory] ?? entityType,
          targetTitle: title ?? undefined,
        });
      });
    } else {
      log(base);
    }
  });

  next();
}
