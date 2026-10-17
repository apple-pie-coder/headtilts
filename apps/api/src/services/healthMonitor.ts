import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { monitorEventLoopDelay } from 'perf_hooks';
import { prisma } from '../config/database';

/**
 * In-process health telemetry. Everything lives in memory and resets when the
 * API restarts, which is fine for a single-instance deployment: the page says
 * "since API start" wherever that matters.
 *
 *  - recordRequest: middleware timing every /api request (status + duration)
 *  - a sampler that, once a minute, appends a point to a 24h ring buffer
 *  - heartbeats so the background jobs can prove they are still ticking
 */

const MINUTE = 60_000;
const HISTORY_MINUTES = 24 * 60;
const RECENT_WINDOW_MS = 60 * MINUTE;
const RECENT_CAP = 20_000;

interface RequestRecord {
  t: number;
  route: string;
  status: number;
  ms: number;
}

export interface HealthSample {
  t: number;              // minute start (epoch ms)
  requests: number;
  errors5xx: number;
  errors4xx: number;
  p95: number | null;     // request duration p95 in that minute (ms)
  dbLatency: number | null;
  eventLoopLag: number;   // p99 event-loop delay (ms)
  heapUsed: number;
  rss: number;
  memUsedPct: number;     // system memory in use (%)
  load1: number;
}

const recent: RequestRecord[] = [];
const history: HealthSample[] = [];
const heartbeats = new Map<string, number>();
const startedAt = Date.now();

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();

function routeKey(req: Request): string {
  // req.route is only set once a router matched; fall back to a bucket so
  // 404 scans don't explode the per-route table with one row per URL.
  const routePath = req.route?.path;
  if (!routePath) return `${req.method} (unmatched)`;
  return `${req.method} ${req.baseUrl}${routePath === '/' ? '' : routePath}`;
}

export function recordRequest(req: Request, res: Response, next: NextFunction): void {
  // Health polling would otherwise dominate the numbers it reports.
  if (req.originalUrl.startsWith('/api/health')) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    recent.push({
      t: Date.now(),
      route: routeKey(req),
      status: res.statusCode,
      ms: Number(process.hrtime.bigint() - start) / 1e6,
    });
    if (recent.length > RECENT_CAP) recent.splice(0, recent.length - RECENT_CAP);
  });
  next();
}

/** Background jobs call this each tick so the health page can tell a stalled job. */
export function heartbeat(job: string): void {
  heartbeats.set(job, Date.now());
}

export function getHeartbeats(): Record<string, number | null> {
  return Object.fromEntries(['publisher', 'backupScheduler'].map((j) => [j, heartbeats.get(j) ?? null]));
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function prune(now: number): void {
  const cutoff = now - RECENT_WINDOW_MS;
  let i = 0;
  while (i < recent.length && recent[i].t < cutoff) i++;
  if (i) recent.splice(0, i);
}

export async function measureDbLatency(): Promise<number | null> {
  try {
    const t = process.hrtime.bigint();
    await prisma.$queryRaw`SELECT 1`;
    return Math.round((Number(process.hrtime.bigint() - t) / 1e6) * 10) / 10;
  } catch {
    return null;
  }
}

async function sample(): Promise<void> {
  const now = Date.now();
  const minuteStart = now - (now % MINUTE) - MINUTE; // the minute that just ended
  prune(now);
  const inMinute = recent.filter((r) => r.t >= minuteStart && r.t < minuteStart + MINUTE);
  const mem = process.memoryUsage();
  history.push({
    t: minuteStart,
    requests: inMinute.length,
    errors5xx: inMinute.filter((r) => r.status >= 500).length,
    errors4xx: inMinute.filter((r) => r.status >= 400 && r.status < 500).length,
    p95: percentile(inMinute.map((r) => r.ms), 95),
    dbLatency: await measureDbLatency(),
    eventLoopLag: Math.round(loopDelay.percentile(99) / 1e5) / 10,
    heapUsed: mem.heapUsed,
    rss: mem.rss,
    memUsedPct: Math.round((1 - os.freemem() / os.totalmem()) * 1000) / 10,
    load1: Math.round(os.loadavg()[0] * 100) / 100,
  });
  loopDelay.reset();
  if (history.length > HISTORY_MINUTES) history.splice(0, history.length - HISTORY_MINUTES);
}

/** Starts the once-a-minute sampler, aligned to the minute boundary. */
export function startHealthSampler(): () => void {
  let interval: NodeJS.Timeout | undefined;
  const align = setTimeout(() => {
    sample().catch(() => {});
    interval = setInterval(() => sample().catch(() => {}), MINUTE);
  }, MINUTE - (Date.now() % MINUTE) + 500);
  return () => {
    clearTimeout(align);
    if (interval) clearInterval(interval);
  };
}

export function getHistory(): HealthSample[] {
  return history;
}

export function getEventLoopLag(): number {
  return Math.round(loopDelay.percentile(99) / 1e5) / 10;
}

export function getStartedAt(): number {
  return startedAt;
}

/** Last-hour request statistics: totals, slowest routes and recent server errors. */
export function getTraffic() {
  const now = Date.now();
  prune(now);
  const durations = recent.map((r) => r.ms);
  const byRoute = new Map<string, number[]>();
  for (const r of recent) {
    const list = byRoute.get(r.route) ?? [];
    list.push(r.ms);
    byRoute.set(r.route, list);
  }
  const routes = [...byRoute.entries()]
    .map(([route, ms]) => ({
      route,
      count: ms.length,
      avg: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length),
      p95: Math.round(percentile(ms, 95) ?? 0),
    }))
    .sort((a, b) => b.p95 - a.p95)
    .slice(0, 8);
  const errors = recent
    .filter((r) => r.status >= 500)
    .slice(-10)
    .reverse()
    .map((r) => ({ t: new Date(r.t).toISOString(), route: r.route, status: r.status, ms: Math.round(r.ms) }));
  return {
    windowMinutes: Math.min(60, Math.ceil((now - startedAt) / MINUTE)),
    requests: recent.length,
    errors5xx: recent.filter((r) => r.status >= 500).length,
    errors4xx: recent.filter((r) => r.status >= 400 && r.status < 500).length,
    p50: Math.round(percentile(durations, 50) ?? 0),
    p95: Math.round(percentile(durations, 95) ?? 0),
    slowestRoutes: routes,
    recentErrors: errors,
  };
}

/** Linux swap usage from /proc/meminfo (null elsewhere). Inside Docker this reports the host. */
export function getSwap(): { total: number; used: number } | null {
  try {
    const info = fs.readFileSync('/proc/meminfo', 'utf8');
    const kb = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+)`, 'm').exec(info)?.[1] ?? 0) * 1024;
    const total = kb('SwapTotal');
    return total ? { total, used: total - kb('SwapFree') } : null;
  } catch {
    return null;
  }
}

/** Free/total bytes on the filesystem holding `dir`, plus whether we can write there. */
export async function getDisk(dir: string): Promise<{ total: number; free: number; writable: boolean } | null> {
  try {
    const s = await fs.promises.statfs(dir);
    let writable = true;
    const probe = path.join(dir, `.health-${process.pid}-${Date.now()}`);
    try {
      await fs.promises.writeFile(probe, 'ok');
      await fs.promises.unlink(probe);
    } catch {
      writable = false;
    }
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize, writable };
  } catch {
    return null;
  }
}
