import { prisma } from '../config/database';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { assertCanGrantPermissions, assertCanManageRole } from './authz.service';

const roleInclude = {
  permissions: {
    include: { permission: true },
  },
} as const;

function toRoleDTO(role: {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  mfaRequired: boolean;
  permissions: { permission: { id: number; module: string; action: string; description: string | null } }[];
}) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    mfaRequired: role.mfaRequired,
    permissions: role.permissions.map((rp) => ({
      id: rp.permission.id,
      module: rp.permission.module,
      action: rp.permission.action,
      description: rp.permission.description,
    })),
  };
}

export async function listRoles() {
  const roles = await prisma.role.findMany({
    orderBy: { id: 'asc' },
    include: roleInclude,
  });
  return roles.map(toRoleDTO);
}

export async function getRoleById(id: number) {
  const role = await prisma.role.findUnique({ where: { id }, include: roleInclude });
  if (!role) throw new NotFoundError('Role not found');
  return toRoleDTO(role);
}

export async function createRole(
  input: { name: string; description?: string; permissionIds?: number[]; mfaRequired?: boolean },
  requestingUserId: string,
) {
  if (!input.name?.trim()) throw new ValidationError('Role name is required');
  if (input.permissionIds?.length) await assertCanGrantPermissions(requestingUserId, input.permissionIds);

  const existing = await prisma.role.findUnique({ where: { name: input.name.trim() } });
  if (existing) throw new ConflictError('A role with that name already exists');

  const role = await prisma.role.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      mfaRequired: input.mfaRequired ?? false,
      permissions: input.permissionIds?.length
        ? { create: input.permissionIds.map((permissionId) => ({ permissionId })) }
        : undefined,
    },
    include: roleInclude,
  });

  return toRoleDTO(role);
}

export async function updateRole(
  id: number,
  input: { name?: string; description?: string; permissionIds?: number[]; mfaRequired?: boolean },
  requestingUserId: string,
) {
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Role not found');

  await assertCanManageRole(requestingUserId, id);
  // Role names are used for authorization checks (e.g. "super-admin"), so
  // built-in roles can never be renamed.
  if (existing.isSystem && input.name !== undefined && input.name.trim() !== existing.name) {
    throw new ValidationError('System roles cannot be renamed');
  }
  if (input.permissionIds?.length) await assertCanGrantPermissions(requestingUserId, input.permissionIds);

  if (input.name && input.name.trim() !== existing.name) {
    const conflict = await prisma.role.findUnique({ where: { name: input.name.trim() } });
    if (conflict) throw new ConflictError('A role with that name already exists');
  }

  const role = await prisma.$transaction(async (tx) => {
    const updated = await tx.role.update({
      where: { id },
      data: {
        name: input.name?.trim() ?? existing.name,
        description: input.description !== undefined ? (input.description?.trim() || null) : existing.description,
        mfaRequired: input.mfaRequired !== undefined ? input.mfaRequired : existing.mfaRequired,
      },
    });

    if (input.permissionIds !== undefined) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (input.permissionIds.length) {
        await tx.rolePermission.createMany({
          data: input.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        });
      }
    }

    return tx.role.findUniqueOrThrow({ where: { id: updated.id }, include: roleInclude });
  });

  return toRoleDTO(role);
}

export async function deleteRole(id: number, requestingUserId: string) {
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Role not found');
  if (existing.isSystem) throw new ValidationError('System roles cannot be deleted');
  await assertCanManageRole(requestingUserId, id);

  await prisma.role.delete({ where: { id } });
}

export async function listPermissions() {
  const permissions = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });

  // Group by module
  const grouped: Record<string, { id: number; module: string; action: string; description: string | null }[]> = {};
  for (const p of permissions) {
    if (!grouped[p.module]) grouped[p.module] = [];
    grouped[p.module].push(p);
  }

  return grouped;
}
