import { Router, IRouter, Request, Response } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { PERMISSIONS } from '@headtilts/shared';
import { prisma } from '../config/database';
import { sendSuccess, sendError, sendPaginatedSuccess } from '../utils/response';
import { Prisma } from '@prisma/client';

const router: IRouter = Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission(PERMISSIONS.LOG_READ),
  asyncHandler(async (req: Request, res: Response) => {
    const page    = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit   = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip    = (page - 1) * limit;

    const { search, site, level, category, action, method, actorEmail, ip, from, to } = req.query as Record<string, string>;
    const statusMin = req.query.statusMin ? parseInt(req.query.statusMin as string) : undefined;
    const statusMax = req.query.statusMax ? parseInt(req.query.statusMax as string) : undefined;

    const where: Prisma.ActivityLogWhereInput = {};

    if (site)        where.site     = site;
    if (level)       where.level    = level;
    if (category)    where.category = category;
    if (method)      where.method   = method.toUpperCase();
    if (actorEmail)  where.actorEmail = { contains: actorEmail };
    if (ip)          where.ip         = { contains: ip };

    if (action) where.action = { contains: action };

    if (statusMin != null || statusMax != null) {
      where.statusCode = {};
      if (statusMin != null) where.statusCode.gte = statusMin;
      if (statusMax != null) where.statusCode.lte = statusMax;
    }

    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to)   where.timestamp.lte = new Date(to);
    }

    if (search) {
      where.OR = [
        { action:      { contains: search } },
        { path:        { contains: search } },
        { actorEmail:  { contains: search } },
        { targetTitle: { contains: search } },
        { ip:          { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.activityLog.count({ where }),
      prisma.activityLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    sendPaginatedSuccess(res, items, total, page, limit);
  }),
);

router.delete(
  '/',
  requirePermission(PERMISSIONS.LOG_DELETE),
  asyncHandler(async (req: Request, res: Response) => {
    const { before } = req.query as Record<string, string>;

    const where: Prisma.ActivityLogWhereInput = {};
    if (before) {
      const date = new Date(before);
      if (isNaN(date.getTime())) {
        sendError(res, 'VALIDATION_ERROR', 'Invalid date for `before` parameter', 400);
        return;
      }
      where.timestamp = { lt: date };
    }

    const { count } = await prisma.activityLog.deleteMany({ where });
    sendSuccess(res, { deleted: count });
  }),
);

export default router;
