import { prisma } from '../config/database';
import { ValidationError, NotFoundError } from '../utils/errors';

export const CELEBRATION_TYPES = ['birthday', 'remembrance'] as const;
export type CelebrationType = (typeof CELEBRATION_TYPES)[number];

interface CelebrationInput {
  name?: string;
  type?: string;
  month?: number;
  day?: number;
  year?: number | null;
  photo?: string | null;
  message?: string | null;
  isActive?: boolean;
}

// Days per month (max), used to validate the day for the chosen month. Uses 29
// for February so leap-day celebrations are allowed.
const MAX_DAY = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function validate(input: CelebrationInput, partial = false) {
  const data: {
    name?: string; type?: string; month?: number; day?: number;
    year?: number | null; photo?: string | null; message?: string | null; isActive?: boolean;
  } = {};

  if (input.name !== undefined || !partial) {
    const name = (input.name ?? '').trim();
    if (!name) throw new ValidationError('Name is required');
    data.name = name;
  }

  if (input.type !== undefined || !partial) {
    if (!CELEBRATION_TYPES.includes(input.type as CelebrationType)) {
      throw new ValidationError(`Type must be one of: ${CELEBRATION_TYPES.join(', ')}`);
    }
    data.type = input.type;
  }

  if (input.month !== undefined || !partial) {
    const month = Number(input.month);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new ValidationError('Month must be between 1 and 12');
    }
    data.month = month;
  }

  if (input.day !== undefined || !partial) {
    const day = Number(input.day);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      throw new ValidationError('Day must be between 1 and 31');
    }
    data.day = day;
  }

  // Cross-check day against the (resolved) month when both are known
  const month = data.month;
  const day = data.day;
  if (month !== undefined && day !== undefined && day > MAX_DAY[month - 1]) {
    throw new ValidationError(`Day ${day} is not valid for the selected month`);
  }

  if (input.year !== undefined) {
    if (input.year === null || input.year === ('' as unknown)) {
      data.year = null;
    } else {
      const year = Number(input.year);
      if (!Number.isInteger(year) || year < 1000 || year > 9999) {
        throw new ValidationError('Year must be a 4-digit year');
      }
      data.year = year;
    }
  }

  if (input.photo !== undefined) data.photo = input.photo?.trim() || null;
  if (input.message !== undefined) data.message = input.message?.trim() || null;
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);

  return data;
}

export async function listCelebrations(page: number, limit: number, search?: string, type?: string) {
  const where = {
    ...(search ? { name: { contains: search } } : {}),
    ...(type && CELEBRATION_TYPES.includes(type as CelebrationType) ? { type } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.celebration.findMany({
      where,
      orderBy: [{ month: 'asc' }, { day: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.celebration.count({ where }),
  ]);

  return { items, total };
}

export async function getCelebrationById(id: number) {
  const celebration = await prisma.celebration.findUnique({ where: { id } });
  if (!celebration) throw new NotFoundError('Celebration not found');
  return celebration;
}

export async function createCelebration(input: CelebrationInput) {
  const data = validate(input, false);
  return prisma.celebration.create({
    data: {
      name: data.name!,
      type: data.type!,
      month: data.month!,
      day: data.day!,
      year: data.year ?? null,
      photo: data.photo ?? null,
      message: data.message ?? null,
      isActive: data.isActive ?? true,
    },
  });
}

export async function updateCelebration(id: number, input: CelebrationInput) {
  await getCelebrationById(id);
  const data = validate(input, true);
  return prisma.celebration.update({ where: { id }, data });
}

export async function deleteCelebration(id: number) {
  await getCelebrationById(id);
  await prisma.celebration.delete({ where: { id } });
}

// Resolve "today" (year/month/day) in the configured site timezone so the right
// day's celebrations surface regardless of server locale.
async function resolveToday(): Promise<{ year: number; month: number; day: number; date: string }> {
  const row = await prisma.setting.findUnique({ where: { key: 'timezone' } });
  const timeZone = row?.value || 'UTC';
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  return { year, month, day, date: `${get('year')}-${get('month')}-${get('day')}` };
}

/** Active celebrations matching today's month/day in the site timezone. */
export async function getTodaysCelebrations() {
  const today = await resolveToday();
  const items = await prisma.celebration.findMany({
    where: { isActive: true, month: today.month, day: today.day },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, type: true, month: true, day: true, year: true, photo: true, message: true },
  });
  return { date: today.date, items };
}

// Cumulative day-of-year totals before each month, on a 366-day (leap) calendar
// so Feb 29 celebrations sort correctly.
const CUM_DAYS = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
function dayOfYear(month: number, day: number): number {
  return CUM_DAYS[month - 1] + day;
}

/**
 * Active celebrations sorted by how soon their next occurrence falls (0 =
 * today), wrapping around the calendar year. Used for the dashboard's
 * "Upcoming Celebrations" pod.
 */
export async function getUpcomingCelebrations(limit = 5) {
  const today = await resolveToday();
  const todayOrdinal = dayOfYear(today.month, today.day);
  const all = await prisma.celebration.findMany({
    where: { isActive: true },
    select: { id: true, name: true, type: true, month: true, day: true, year: true, photo: true, message: true },
  });
  return all
    .map((c) => ({ ...c, daysUntil: (dayOfYear(c.month, c.day) - todayOrdinal + 366) % 366 }))
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name))
    .slice(0, limit);
}
