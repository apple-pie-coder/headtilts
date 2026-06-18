import { prisma } from '../config/database';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';

export async function getAll() {
  return prisma.redirect.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function create(fromPath: string, toPath: string, type: number) {
  if (!fromPath.startsWith('/')) throw new ValidationError('fromPath must start with /');
  if (!toPath) throw new ValidationError('toPath is required');
  const existing = await prisma.redirect.findUnique({ where: { fromPath } });
  if (existing) throw new ConflictError('A redirect from this path already exists');
  return prisma.redirect.create({ data: { fromPath, toPath, type } });
}

export async function update(id: number, data: { fromPath?: string; toPath?: string; type?: number }) {
  const existing = await prisma.redirect.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Redirect not found');
  return prisma.redirect.update({ where: { id }, data });
}

export async function remove(id: number) {
  const existing = await prisma.redirect.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Redirect not found');
  await prisma.redirect.delete({ where: { id } });
}

export async function resolve(fromPath: string) {
  const redirect = await prisma.redirect.findUnique({ where: { fromPath } });
  if (redirect) {
    prisma.redirect.update({ where: { id: redirect.id }, data: { hits: { increment: 1 } } }).catch(() => {});
  }
  return redirect;
}
