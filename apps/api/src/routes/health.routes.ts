import { Router, IRouter, Request, Response } from 'express';
import os from 'os';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { prisma } from '../config/database';
import { sendSuccess } from '../utils/response';

const router: IRouter = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const reqStart = Date.now();

    let dbStatus: 'ok' | 'error' = 'ok';
    let dbLatency = 0;
    let dbVersion: string | null = null;
    try {
      const t = Date.now();
      const rows = await prisma.$queryRaw<[{ v: string }]>`SELECT VERSION() AS v`;
      dbLatency  = Date.now() - t;
      dbVersion  = rows[0]?.v ?? null;
    } catch {
      dbStatus = 'error';
    }

    const mem  = process.memoryUsage();
    const load = os.loadavg();

    sendSuccess(res, {
      status:       dbStatus === 'error' ? 'degraded' : 'ok',
      version:      '1.0.0',
      environment:  process.env.NODE_ENV || 'production',
      uptime:       Math.floor(process.uptime()),
      timestamp:    new Date().toISOString(),
      responseTime: Date.now() - reqStart,
      services: {
        api:      { status: 'ok',     latency: Date.now() - reqStart },
        database: { status: dbStatus, latency: dbLatency, version: dbVersion },
      },
      memory: {
        heapUsed:  mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss:       mem.rss,
        external:  mem.external,
      },
      system: {
        loadAvg:     load.map((n) => Math.round(n * 100) / 100),
        totalMem:    os.totalmem(),
        freeMem:     os.freemem(),
        platform:    os.platform(),
        arch:        os.arch(),
        nodeVersion: process.version,
        cpus:        os.cpus().length,
        hostname:    os.hostname(),
      },
    });
  }),
);

export default router;
