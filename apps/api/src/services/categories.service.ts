import { prisma } from '../config/database';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors';
import { slugify } from '@headtilts/shared';

async function assertSlugAvailable(slug: string, excludeId?: number) {
  const existing = await prisma.category.findFirst({
    where: { slug, ...(excludeId !== undefined ? { id: { not: excludeId } } : {}) },
  });

  if (existing) {
    throw new ConflictError('A category with this slug already exists');
  }
}

async function assertNameAvailable(name: string, excludeId?: number) {
  const existing = await prisma.category.findFirst({
    where: { name, ...(excludeId !== undefined ? { id: { not: excludeId } } : {}) },
  });

  if (existing) {
    throw new ConflictError('A category with this name already exists');
  }
}

async function wouldCreateCycle(categoryId: number, candidateParentId: number): Promise<boolean> {
  let currentId: number | null = candidateParentId;

  while (currentId !== null) {
    if (currentId === categoryId) {
      return true;
    }

    const parent: { parentId: number | null } | null = await prisma.category.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });

    currentId = parent?.parentId ?? null;
  }

  return false;
}

export async function listCategories(page: number, limit: number, search?: string) {
  const where = search
    ? {
        OR: [{ name: { contains: search } }, { slug: { contains: search } }],
      }
    : {};

  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      include: { parent: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.category.count({ where }),
  ]);

  return { items: categories, total };
}

export async function getCategoryById(id: number) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { parent: { select: { id: true, name: true } } },
  });

  if (!category) {
    throw new NotFoundError('Category not found');
  }

  return category;
}

interface CreateCategoryInput {
  name: string;
  slug?: string;
  description?: string;
  parentId?: number | null;
  icon?: string;
  showSidebar?: boolean;
}

export async function createCategory(input: CreateCategoryInput) {
  const name = input.name.trim();
  if (!name) {
    throw new ValidationError('Name is required');
  }

  const slug = input.slug?.trim() ? slugify(input.slug) : slugify(name);
  if (!slug) {
    throw new ValidationError('Could not derive a valid slug from the provided name');
  }

  await assertNameAvailable(name);
  await assertSlugAvailable(slug);

  if (input.parentId != null) {
    const parent = await prisma.category.findUnique({ where: { id: input.parentId } });
    if (!parent) {
      throw new ValidationError('Parent category not found');
    }
  }

  return prisma.category.create({
    data: {
      name,
      slug,
      description: input.description || undefined,
      parentId: input.parentId ?? undefined,
      icon: input.icon || undefined,
      showSidebar: input.showSidebar ?? false,
    },
    include: { parent: { select: { id: true, name: true } } },
  });
}

interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  description?: string;
  parentId?: number | null;
  icon?: string;
  showSidebar?: boolean;
}

export async function updateCategory(id: number, input: UpdateCategoryInput) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Category not found');
  }

  const name = input.name !== undefined ? input.name.trim() : undefined;
  if (name !== undefined && !name) {
    throw new ValidationError('Name is required');
  }

  let slug: string | undefined;
  if (input.slug !== undefined || name !== undefined) {
    slug = input.slug?.trim() ? slugify(input.slug) : slugify(name ?? existing.name);
    if (!slug) {
      throw new ValidationError('Could not derive a valid slug');
    }
  }

  if (name !== undefined) {
    await assertNameAvailable(name, id);
  }
  if (slug !== undefined) {
    await assertSlugAvailable(slug, id);
  }

  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) {
      throw new ValidationError('A category cannot be its own parent');
    }

    const parent = await prisma.category.findUnique({ where: { id: input.parentId } });
    if (!parent) {
      throw new ValidationError('Parent category not found');
    }

    if (await wouldCreateCycle(id, input.parentId)) {
      throw new ValidationError('This parent would create a circular category hierarchy');
    }
  }

  return prisma.category.update({
    where: { id },
    data: {
      name,
      slug,
      description: input.description,
      parentId: input.parentId,
      icon: input.icon,
      showSidebar: input.showSidebar,
    },
    include: { parent: { select: { id: true, name: true } } },
  });
}

export async function deleteCategory(id: number) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Category not found');
  }

  await prisma.category.delete({ where: { id } });
}
