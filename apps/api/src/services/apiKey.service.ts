import crypto from 'crypto';
import { prisma } from '../config/database';

export const AVAILABLE_SCOPES = [
  'posts:read', 'posts:write', 'posts:delete',
  'pages:read', 'pages:write', 'pages:delete',
  'media:read', 'media:write', 'media:delete',
  'polls:read', 'polls:write', 'polls:delete',
  'categories:read', 'categories:write',
  'tags:read', 'tags:write',
  'comments:read', 'comments:write', 'comments:delete',
  'settings:read',
  'users:read',
] as const;

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateKey(): { raw: string; prefix: string; hash: string } {
  const raw = 'htk_' + crypto.randomBytes(32).toString('hex');
  return { raw, prefix: raw.slice(0, 12), hash: hashKey(raw) };
}

export async function createApiKey(
  userId: string,
  name: string,
  scopes: string[],
  expiresAt?: Date | null,
) {
  const { raw, prefix, hash } = generateKey();
  const record = await prisma.apiKey.create({
    data: {
      name,
      prefix,
      keyHash: hash,
      userId,
      scopes: JSON.stringify(scopes),
      expiresAt: expiresAt ?? null,
    },
  });
  return { ...record, rawKey: raw };
}

export async function listApiKeys(userId: string) {
  const rows = await prisma.apiKey.findMany({
    where: { userId, active: true },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({ ...r, scopes: JSON.parse(r.scopes) as string[] }));
}

export async function updateApiKey(
  id: number,
  userId: string,
  data: { name?: string; scopes?: string[]; expiresAt?: Date | null },
) {
  const existing = await prisma.apiKey.findFirst({ where: { id, userId, active: true } });
  if (!existing) throw new Error('Not found');
  return prisma.apiKey.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.scopes !== undefined ? { scopes: JSON.stringify(data.scopes) } : {}),
      ...(data.expiresAt !== undefined ? { expiresAt: data.expiresAt } : {}),
    },
  });
}

export async function revokeApiKey(id: number, userId: string) {
  const existing = await prisma.apiKey.findFirst({ where: { id, userId } });
  if (!existing) throw new Error('Not found');
  return prisma.apiKey.delete({ where: { id } });
}

export async function validateApiKey(raw: string) {
  if (!raw.startsWith('htk_')) return null;
  const hash = hashKey(raw);
  const record = await prisma.apiKey.findFirst({
    where: { keyHash: hash, active: true },
    include: {
      user: {
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  permissions: { include: { permission: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!record) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  // Update lastUsedAt fire-and-forget
  prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  const permissions = record.user.userRoles.flatMap((ur) =>
    ur.role.permissions.map((rp) => `${rp.permission.module}_${rp.permission.action}`),
  );
  const scopes = JSON.parse(record.scopes) as string[];

  return { record, userId: record.userId, permissions, scopes };
}
