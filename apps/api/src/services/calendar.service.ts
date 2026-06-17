import { prisma } from '../config/database';

export interface CalendarMonth {
  year: number;
  month: number; // 1-12
  weekStartsOn: number; // 0 = Sunday … 6 = Saturday
  days: Record<number, number>; // day-of-month -> published post count
  prev: { year: number; month: number } | null; // null when no older posts exist
  next: { year: number; month: number } | null; // null when no newer posts exist
}

async function getWeekStartsOn(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: 'week_starts_on' } });
  const n = Number(row?.value);
  return Number.isInteger(n) && n >= 0 && n <= 6 ? n : 0;
}

/**
 * Build calendar data for a single month: which days have published posts,
 * the configured week-start day, and whether adjacent months hold any posts
 * (so the UI can disable dead-end navigation). Day bucketing is done in UTC,
 * matching the date-archive filter so a clicked day shows exactly its count.
 */
export async function getCalendarMonth(year: number, month: number): Promise<CalendarMonth> {
  const weekStartsOn = await getWeekStartsOn();

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1)); // exclusive — first of next month

  const posts = await prisma.post.findMany({
    where: { status: 'published', type: 'post', publishedAt: { gte: start, lt: end } },
    select: { publishedAt: true },
  });

  const days: Record<number, number> = {};
  for (const post of posts) {
    if (!post.publishedAt) continue;
    const day = post.publishedAt.getUTCDate();
    days[day] = (days[day] || 0) + 1;
  }

  // Adjacent months that actually contain posts (for prev/next arrows)
  const [older, newer] = await Promise.all([
    prisma.post.findFirst({
      where: { status: 'published', type: 'post', publishedAt: { lt: start } },
      orderBy: { publishedAt: 'desc' },
      select: { publishedAt: true },
    }),
    prisma.post.findFirst({
      where: { status: 'published', type: 'post', publishedAt: { gte: end } },
      orderBy: { publishedAt: 'asc' },
      select: { publishedAt: true },
    }),
  ]);

  return {
    year,
    month,
    weekStartsOn,
    days,
    prev: older?.publishedAt
      ? { year: older.publishedAt.getUTCFullYear(), month: older.publishedAt.getUTCMonth() + 1 }
      : null,
    next: newer?.publishedAt
      ? { year: newer.publishedAt.getUTCFullYear(), month: newer.publishedAt.getUTCMonth() + 1 }
      : null,
  };
}
