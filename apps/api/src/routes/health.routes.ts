import { Router, IRouter, Request, Response } from 'express';
import os from 'os';
import { PERMISSIONS } from '@headtilts/shared';
import { authenticate, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { prisma } from '../config/database';
import { sendSuccess } from '../utils/response';
import { uploadDir } from '../middleware/upload';
import { getBackupSettings } from '../services/backup.settings';
import { verifySmtp } from '../services/mail.service';
import { realtimeClientCount } from '../realtime/notifications.gateway';
import {
  getDisk, getEventLoopLag, getHeartbeats, getHistory, getStartedAt, getSwap, getTraffic, measureDbLatency,
} from '../services/healthMonitor';

const router: IRouter = Router();

/**
 * One-word status for the admin footer, open to every signed-in user. Uses only
 * cheap signals: a DB ping, the last hour's 5xx rate and cached disk usage.
 */
router.get(
  '/status',
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const latency = await measureDbLatency();
    if (latency === null) return sendSuccess(res, { status: 'down' });
    const traffic = getTraffic();
    const disk = await cached('disk', 60_000, () => getDisk(uploadDir));
    const degraded =
      latency > 250 ||
      (traffic.requests >= 20 && traffic.errors5xx / traffic.requests > 0.05) ||
      (disk !== null && (!disk.writable || disk.free / disk.total < 0.05));
    sendSuccess(res, { status: degraded ? 'degraded' : 'ok' });
  }),
);

// Everything below exposes hostnames, memory and error details: operators only.
router.use(authenticate, requirePermission(PERMISSIONS.SETTING_READ));

type CheckStatus = 'ok' | 'warn' | 'error' | 'off';

interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  summary: string;
  detail?: string;
  /** Admin route where the problem can be fixed. */
  link?: string;
}

/** Memoise slow probes (SMTP handshake, DB size scan) so 10 s polling stays cheap. */
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, fresh = false): Promise<T> {
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const pct = (used: number, total: number) => (total ? Math.round((used / total) * 1000) / 10 : 0);
const HOUR = 3_600_000;

function span(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}
const ago = (ms: number) => `${span(ms)} ago`;

async function databaseInfo() {
  const [version, status, vars, size] = await Promise.all([
    prisma.$queryRaw<[{ v: string }]>`SELECT VERSION() AS v`,
    prisma.$queryRaw<{ Variable_name: string; Value: string }[]>`SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected', 'Uptime', 'Slow_queries')`,
    prisma.$queryRaw<{ Variable_name: string; Value: string }[]>`SHOW GLOBAL VARIABLES WHERE Variable_name = 'max_connections'`,
    prisma.$queryRaw<[{ bytes: number | bigint | null }]>`
      SELECT SUM(data_length + index_length) AS bytes FROM information_schema.tables WHERE table_schema = DATABASE()`,
  ]);
  const st = Object.fromEntries(status.map((r) => [r.Variable_name, Number(r.Value)]));
  return {
    version: version[0]?.v ?? null,
    connections: st.Threads_connected ?? null,
    maxConnections: Number(vars[0]?.Value ?? 0) || null,
    uptime: st.Uptime ?? null,
    slowQueries: st.Slow_queries ?? null,
    sizeBytes: Number(size[0]?.bytes ?? 0),
  };
}

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const reqStart = Date.now();
    const fresh = req.query.fresh === '1';
    const now = Date.now();

    const dbLatency = await measureDbLatency();
    const dbUp = dbLatency !== null;

    const [db, disk, smtp, backupSettings, lastBackup, lastFailedBackup, backupsSize, mediaAgg, overdue, nextScheduled] =
      await Promise.all([
        dbUp ? cached('db', 60_000, databaseInfo, fresh).catch(() => null) : null,
        cached('disk', 60_000, () => getDisk(uploadDir), fresh),
        cached('smtp', 5 * 60_000, () => verifySmtp(), fresh).catch(() => null),
        dbUp ? getBackupSettings().catch(() => null) : null,
        dbUp ? prisma.backup.findFirst({ where: { status: 'ready' }, orderBy: { createdAt: 'desc' } }).catch(() => null) : null,
        dbUp ? prisma.backup.findFirst({ where: { status: 'failed' }, orderBy: { createdAt: 'desc' } }).catch(() => null) : null,
        dbUp ? prisma.backup.aggregate({ where: { status: 'ready' }, _sum: { sizeBytes: true } }).catch(() => null) : null,
        dbUp ? prisma.media.aggregate({ _sum: { size: true } }).catch(() => null) : null,
        // Give the once-a-minute publisher two ticks of slack before calling a post overdue.
        dbUp ? prisma.post.count({ where: { status: 'scheduled', scheduledFor: { lt: new Date(now - 2 * 60_000) } } }).catch(() => 0) : 0,
        dbUp ? prisma.post.findFirst({ where: { status: 'scheduled' }, orderBy: { scheduledFor: 'asc' }, select: { id: true, title: true, scheduledFor: true } }).catch(() => null) : null,
      ]);

    const memUsed = os.totalmem() - os.freemem();
    const swap = getSwap();
    const load = os.loadavg();
    const cpus = os.cpus().length;
    const lag = getEventLoopLag();
    const beats = getHeartbeats();
    const traffic = getTraffic();
    const sockets = realtimeClientCount();

    const checks: Check[] = [];

    checks.push(dbUp
      ? {
          id: 'database', label: 'Database',
          status: dbLatency > 250 || (db && db.maxConnections && db.connections && db.connections / db.maxConnections > 0.8) ? 'warn' : 'ok',
          summary: `Responding in ${dbLatency} ms`,
          detail: db ? `${db.connections ?? '?'} of ${db.maxConnections ?? '?'} connections in use` : undefined,
        }
      : { id: 'database', label: 'Database', status: 'error', summary: 'Not reachable', detail: 'Queries are failing; most of the site is down.' });

    const errRate = traffic.requests ? traffic.errors5xx / traffic.requests : 0;
    checks.push({
      id: 'errors', label: 'Server errors',
      status: traffic.errors5xx === 0 ? 'ok' : errRate > 0.05 ? 'error' : 'warn',
      summary: traffic.errors5xx === 0 ? 'No 5xx responses' : `${traffic.errors5xx} in the last ${traffic.windowMinutes} min`,
      detail: traffic.requests ? `${traffic.requests.toLocaleString()} requests · ${(errRate * 100).toFixed(1)}% failed` : 'No traffic recorded yet',
      link: traffic.errors5xx ? '/admin/logs' : undefined,
    });

    if (disk) {
      const used = pct(disk.total - disk.free, disk.total);
      checks.push({
        id: 'disk', label: 'Disk space',
        status: !disk.writable ? 'error' : used >= 95 ? 'error' : used >= 85 ? 'warn' : 'ok',
        summary: disk.writable ? `${used}% used` : 'Uploads folder is not writable',
        detail: `${(disk.free / 1e9).toFixed(1)} GB free of ${(disk.total / 1e9).toFixed(0)} GB`,
        link: used >= 85 ? '/admin/media' : undefined,
      });
    }

    const memPct = pct(memUsed, os.totalmem());
    const swapPct = swap ? pct(swap.used, swap.total) : 0;
    checks.push({
      id: 'memory', label: 'Memory',
      status: memPct >= 95 || swapPct >= 90 ? 'error' : memPct >= 85 || swapPct >= 60 ? 'warn' : 'ok',
      summary: `${memPct}% RAM used`,
      detail: swap ? `Swap ${swapPct}% used${swapPct >= 60 ? ' — the host is short on memory' : ''}` : undefined,
    });

    checks.push({
      id: 'cpu', label: 'CPU load',
      status: load[0] > cpus * 1.5 ? 'error' : load[0] > cpus ? 'warn' : 'ok',
      summary: `Load ${load[0].toFixed(2)} on ${cpus} cores`,
      detail: lag > 100 ? `Event loop delayed ${lag} ms` : `Event loop delay ${lag} ms`,
    });

    if (!backupSettings) {
      checks.push({ id: 'backups', label: 'Backups', status: 'off', summary: 'Unknown', link: '/admin/backups' });
    } else {
      const age = lastBackup ? now - lastBackup.createdAt.getTime() : null;
      const due = backupSettings.schedule === 'daily' ? 26 * HOUR : backupSettings.schedule === 'weekly' ? 8 * 24 * HOUR : null;
      const failedSince = lastFailedBackup && (!lastBackup || lastFailedBackup.createdAt > lastBackup.createdAt);
      checks.push({
        id: 'backups', label: 'Backups',
        status: failedSince ? 'error' : !lastBackup ? 'warn' : due && age! > due ? 'warn' : backupSettings.schedule === 'disabled' ? 'off' : 'ok',
        summary: failedSince ? 'Last backup failed' : lastBackup ? `Last backup ${ago(age!)}` : 'No backups yet',
        detail: backupSettings.schedule === 'disabled'
          ? 'Automatic backups are off'
          : `Automatic ${backupSettings.schedule} at ${backupSettings.scheduleTime}`,
        link: '/admin/backups',
      });
    }

    const publisherBeat = beats.publisher;
    checks.push({
      id: 'scheduler', label: 'Scheduled publishing',
      status: overdue > 0 || !publisherBeat || now - publisherBeat > 3 * 60_000 ? 'warn' : 'ok',
      summary: overdue > 0 ? `${overdue} post${overdue === 1 ? '' : 's'} overdue` : nextScheduled?.scheduledFor ? `Next post in ${span(Math.max(0, nextScheduled.scheduledFor.getTime() - now))}` : 'Nothing scheduled',
      detail: publisherBeat ? `Publisher last ran ${ago(now - publisherBeat)}` : 'Publisher has not run yet',
      link: overdue > 0 || nextScheduled ? '/admin/posts?status=scheduled' : undefined,
    });

    checks.push(smtp
      ? { id: 'email', label: 'Email', status: smtp.ok ? 'ok' : 'error', summary: smtp.ok ? 'SMTP accepting connections' : 'SMTP connection failed', detail: smtp.ok ? smtp.host : `${smtp.host} — ${smtp.error}`, link: smtp.ok ? undefined : '/admin/settings' }
      : { id: 'email', label: 'Email', status: 'off', summary: 'Not configured', detail: 'Password resets and notifications won’t be emailed', link: '/admin/settings' });

    checks.push({
      id: 'realtime', label: 'Live notifications',
      status: sockets === null ? 'error' : 'ok',
      summary: sockets === null ? 'Socket server not running' : `${sockets} open connection${sockets === 1 ? '' : 's'}`,
    });

    const worst = checks.some((c) => c.id === 'database' && c.status === 'error') ? 'down'
      : checks.some((c) => c.status === 'error' || c.status === 'warn') ? 'degraded' : 'ok';
    const mem = process.memoryUsage();

    sendSuccess(res, {
      status: worst,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'production',
      uptime: Math.floor(process.uptime()),
      startedAt: new Date(getStartedAt()).toISOString(),
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - reqStart,
      checks,
      services: {
        api: { status: 'ok', latency: Date.now() - reqStart },
        database: { status: dbUp ? 'ok' : 'error', latency: dbLatency ?? 0, version: db?.version ?? null },
      },
      database: db,
      traffic,
      heartbeats: beats,
      history: getHistory(),
      storage: {
        disk,
        uploadsBytes: Number(mediaAgg?._sum.size ?? 0),
        backupsBytes: Number(backupsSize?._sum.sizeBytes ?? 0),
        databaseBytes: db?.sizeBytes ?? null,
      },
      memory: { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss, external: mem.external },
      system: {
        loadAvg: load.map((n) => Math.round(n * 100) / 100),
        totalMem: os.totalmem(),
        freeMem: os.freemem(),
        swap,
        eventLoopLag: lag,
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        cpus,
        hostname: os.hostname(),
        osUptime: Math.floor(os.uptime()),
      },
    });
  }),
);

export default router;
