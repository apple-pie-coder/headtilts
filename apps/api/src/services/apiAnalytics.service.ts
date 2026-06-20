import { prisma } from '../config/database';

function startOf(date: Date, unit: 'day' | 'week' | 'month'): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (unit === 'week') {
    d.setDate(d.getDate() - d.getDay()); // Sunday
  } else if (unit === 'month') {
    d.setDate(1);
  }
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type Granularity = 'day' | 'week' | 'month';

interface DateRange {
  from: Date;
  to: Date;
}

function rangeFromGranularity(granularity: Granularity): DateRange {
  const to = new Date();
  let from: Date;
  if (granularity === 'day') from = daysAgo(30);
  else if (granularity === 'week') from = daysAgo(84); // 12 weeks
  else from = daysAgo(365);
  return { from, to };
}

export async function getOverviewStats() {
  const [total, successCount, errorCount, avgDuration, totalKeys] = await Promise.all([
    prisma.apiKeyUsageLog.count(),
    prisma.apiKeyUsageLog.count({ where: { statusCode: { gte: 200, lt: 400 } } }),
    prisma.apiKeyUsageLog.count({ where: { statusCode: { gte: 400 } } }),
    prisma.apiKeyUsageLog.aggregate({ _avg: { durationMs: true } }),
    prisma.apiKey.count({ where: { active: true } }),
  ]);

  const last24h = await prisma.apiKeyUsageLog.count({
    where: { createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
  });

  return {
    totalCalls: total,
    last24hCalls: last24h,
    successCount,
    errorCount,
    errorRate: total > 0 ? Math.round((errorCount / total) * 100 * 10) / 10 : 0,
    avgDurationMs: Math.round(avgDuration._avg.durationMs ?? 0),
    activeApiKeys: totalKeys,
  };
}

export async function getCallsOverTime(granularity: Granularity = 'day') {
  const { from } = rangeFromGranularity(granularity);

  const rows = await prisma.apiKeyUsageLog.findMany({
    where: { createdAt: { gte: from } },
    select: { createdAt: true, statusCode: true },
    orderBy: { createdAt: 'asc' },
  });

  // Group by bucket
  const buckets = new Map<string, { total: number; errors: number }>();
  for (const row of rows) {
    const d = new Date(row.createdAt);
    const bucket = startOf(d, granularity).toISOString().slice(0, 10);
    const existing = buckets.get(bucket) ?? { total: 0, errors: 0 };
    existing.total += 1;
    if (row.statusCode >= 400) existing.errors += 1;
    buckets.set(bucket, existing);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));
}

export async function getCallsPerKey(limit = 10) {
  const rows = await prisma.apiKeyUsageLog.groupBy({
    by: ['apiKeyId'],
    _count: { id: true },
    _avg: { durationMs: true },
    orderBy: { _count: { id: 'desc' } },
    take: limit,
  });

  const keys = await prisma.apiKey.findMany({
    where: { id: { in: rows.map((r) => r.apiKeyId) } },
    select: { id: true, name: true, prefix: true },
  });
  const keyMap = new Map(keys.map((k) => [k.id, k]));

  return rows.map((r) => ({
    apiKeyId: r.apiKeyId,
    name: keyMap.get(r.apiKeyId)?.name ?? 'Unknown',
    prefix: keyMap.get(r.apiKeyId)?.prefix ?? '',
    calls: r._count.id,
    avgDurationMs: Math.round(r._avg.durationMs ?? 0),
  }));
}

export async function getTopEndpoints(limit = 10) {
  const rows = await prisma.apiKeyUsageLog.groupBy({
    by: ['endpoint', 'method'],
    _count: { id: true },
    _avg: { durationMs: true },
    orderBy: { _count: { id: 'desc' } },
    take: limit,
  });

  return rows.map((r) => ({
    endpoint: r.endpoint,
    method: r.method,
    calls: r._count.id,
    avgDurationMs: Math.round(r._avg.durationMs ?? 0),
  }));
}

export async function getErrorRateByEndpoint() {
  const rows = await prisma.apiKeyUsageLog.groupBy({
    by: ['endpoint'],
    _count: { id: true },
    where: { statusCode: { gte: 400 } },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });
  return rows.map((r) => ({ endpoint: r.endpoint, errorCount: r._count.id }));
}

export async function getPeakHours() {
  // Pull last 30 days and compute hourly distribution client-side
  const rows = await prisma.apiKeyUsageLog.findMany({
    where: { createdAt: { gte: daysAgo(30) } },
    select: { createdAt: true },
  });

  const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, calls: 0 }));
  for (const row of rows) {
    const h = new Date(row.createdAt).getHours();
    hours[h].calls += 1;
  }
  return hours;
}

export async function exportCsv(from: Date, to: Date): Promise<string> {
  const rows = await prisma.apiKeyUsageLog.findMany({
    where: { createdAt: { gte: from, lte: to } },
    include: { apiKey: { select: { name: true, prefix: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10_000,
  });

  const header = 'Date,Key Name,Key Prefix,Method,Endpoint,Status,Duration (ms)\n';
  const lines = rows.map((r) =>
    [
      r.createdAt.toISOString(),
      `"${r.apiKey.name}"`,
      r.apiKey.prefix,
      r.method,
      `"${r.endpoint}"`,
      r.statusCode,
      r.durationMs,
    ].join(','),
  );
  return header + lines.join('\n');
}
