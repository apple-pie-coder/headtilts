import { prisma } from '../config/database';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors';

const menuInclude = {
  items: {
    orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
  },
};

export async function listMenus() {
  const menus = await prisma.menu.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: { select: { items: true } },
    },
  });
  return menus;
}

export async function getMenuById(id: number) {
  const menu = await prisma.menu.findUnique({ where: { id }, include: menuInclude });
  if (!menu) throw new NotFoundError('Menu not found');
  return menu;
}

interface MenuInput {
  name: string;
  location: string;
  description?: string;
}

export async function createMenu(input: MenuInput) {
  const name = input.name?.trim();
  if (!name) throw new ValidationError('Menu name is required');

  const location = input.location?.trim().toLowerCase().replace(/\s+/g, '-');
  if (!location) throw new ValidationError('Menu location is required');

  const conflict = await prisma.menu.findFirst({
    where: { OR: [{ name }, { location }] },
  });
  if (conflict) throw new ConflictError('A menu with this name or location already exists');

  return prisma.menu.create({
    data: { name, location, description: input.description || undefined },
    include: menuInclude,
  });
}

export async function updateMenu(id: number, input: Partial<MenuInput>) {
  const existing = await prisma.menu.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Menu not found');

  const name = input.name?.trim() ?? existing.name;
  const location = input.location?.trim().toLowerCase().replace(/\s+/g, '-') ?? existing.location;

  if (name !== existing.name || location !== existing.location) {
    const conflict = await prisma.menu.findFirst({
      where: { id: { not: id }, OR: [{ name }, { location }] },
    });
    if (conflict) throw new ConflictError('A menu with this name or location already exists');
  }

  return prisma.menu.update({
    where: { id },
    data: { name, location, description: input.description },
    include: menuInclude,
  });
}

export async function deleteMenu(id: number) {
  const existing = await prisma.menu.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Menu not found');
  await prisma.menu.delete({ where: { id } });
}

export interface MenuItemInput {
  title: string;
  url?: string;
  postId?: number;
  categoryId?: number;
  tagId?: number;
  depth: number;
  position: number;
  isVisible: boolean;
}

export async function setMenuItems(menuId: number, items: MenuItemInput[]) {
  const menu = await prisma.menu.findUnique({ where: { id: menuId } });
  if (!menu) throw new NotFoundError('Menu not found');

  await prisma.$transaction(async (tx) => {
    await tx.menuItem.deleteMany({ where: { menuId } });

    const created: { id: number; depth: number }[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const depth = Math.max(0, Math.min(item.depth ?? 0, 3));

      let parentId: number | null = null;
      if (depth > 0) {
        for (let j = created.length - 1; j >= 0; j--) {
          if (created[j].depth === depth - 1) {
            parentId = created[j].id;
            break;
          }
        }
      }

      const title = (item.title || '').trim();
      if (!title) throw new ValidationError('Every menu item must have a title');

      const created_item = await tx.menuItem.create({
        data: {
          menuId,
          parentId,
          title,
          url: item.url || null,
          postId: item.postId || null,
          categoryId: item.categoryId || null,
          tagId: item.tagId || null,
          position: item.position,
          isVisible: item.isVisible ?? true,
        },
      });

      created.push({ id: created_item.id, depth });
    }
  });

  return getMenuById(menuId);
}
