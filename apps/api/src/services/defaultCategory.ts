import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export const DEFAULT_CATEGORY_SETTING = 'default_category';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * The category posts fall back to when none is chosen ("Uncategorized").
 * Recreated if its row or setting has gone missing, so callers can rely on it.
 */
export async function getDefaultCategoryId(db: Db = prisma): Promise<number> {
  const setting = await db.setting.findUnique({ where: { key: DEFAULT_CATEGORY_SETTING } });
  const id = Number(setting?.value);
  if (id && (await db.category.findUnique({ where: { id }, select: { id: true } }))) return id;

  const category =
    (await db.category.findFirst({ where: { OR: [{ slug: 'uncategorized' }, { name: 'Uncategorized' }] }, select: { id: true } }))
    ?? (await db.category.create({ data: { name: 'Uncategorized', slug: 'uncategorized' }, select: { id: true } }));
  await db.setting.upsert({
    where: { key: DEFAULT_CATEGORY_SETTING },
    update: { value: String(category.id) },
    create: { key: DEFAULT_CATEGORY_SETTING, value: String(category.id), type: 'string' },
  });
  return category.id;
}

/** A post's categories with the default filled in when none is chosen, and dropped once a real one is. */
export function withDefaultCategory(ids: number[], defaultId: number): number[] {
  const chosen = [...new Set(ids)].filter((id) => id !== defaultId);
  return chosen.length ? chosen : [defaultId];
}
