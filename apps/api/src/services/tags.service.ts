import { prisma } from '../config/database';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors';
import { slugify } from '@headtilts/shared';

async function assertSlugAvailable(slug: string, excludeId?: number) {
  const existing = await prisma.tag.findFirst({
    where: { slug, ...(excludeId !== undefined ? { id: { not: excludeId } } : {}) },
  });

  if (existing) {
    throw new ConflictError('A tag with this slug already exists');
  }
}

async function assertNameAvailable(name: string, excludeId?: number) {
  const existing = await prisma.tag.findFirst({
    where: { name, ...(excludeId !== undefined ? { id: { not: excludeId } } : {}) },
  });

  if (existing) {
    throw new ConflictError('A tag with this name already exists');
  }
}

export async function listTags(page: number, limit: number, search?: string) {
  const where = search
    ? {
        OR: [{ name: { contains: search } }, { slug: { contains: search } }],
      }
    : {};

  const [tags, total] = await Promise.all([
    prisma.tag.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.tag.count({ where }),
  ]);

  return { items: tags, total };
}

export async function getTagById(id: number) {
  const tag = await prisma.tag.findUnique({ where: { id } });

  if (!tag) {
    throw new NotFoundError('Tag not found');
  }

  return tag;
}

interface CreateTagInput {
  name: string;
  slug?: string;
  description?: string;
}

export async function createTag(input: CreateTagInput) {
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

  return prisma.tag.create({
    data: {
      name,
      slug,
      description: input.description || undefined,
    },
  });
}

interface UpdateTagInput {
  name?: string;
  slug?: string;
  description?: string;
}

export async function updateTag(id: number, input: UpdateTagInput) {
  const existing = await prisma.tag.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Tag not found');
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

  return prisma.tag.update({
    where: { id },
    data: { name, slug, description: input.description },
  });
}

export async function deleteTag(id: number) {
  const existing = await prisma.tag.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Tag not found');
  }

  await prisma.tag.delete({ where: { id } });
}
