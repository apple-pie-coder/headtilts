import { prisma } from '../config/database';
import { ForbiddenError, ValidationError } from '../utils/errors';

// Guards against privilege escalation through user/role management: holding
// USER_* or ROLE_* permissions must never let someone grant, or take over an
// account holding, more power than they already have.

export const SUPER_ADMIN_ROLE = 'super-admin';

const rolePermissionsInclude = {
  permissions: { include: { permission: { select: { module: true, action: true } } } },
} as const;

type RoleWithPermissions = {
  name: string;
  permissions: { permission: { module: string; action: string } }[];
};

function permissionKeys(roles: RoleWithPermissions[]): string[] {
  return roles.flatMap((r) => r.permissions.map((rp) => `${rp.permission.module}_${rp.permission.action}`));
}

interface Access {
  isSuperAdmin: boolean;
  permissions: Set<string>;
}

async function getUserAccess(userId: string): Promise<Access> {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { include: rolePermissionsInclude } },
  });
  const roles = userRoles.map((ur) => ur.role);
  return {
    isSuperAdmin: roles.some((r) => r.name === SUPER_ADMIN_ROLE),
    permissions: new Set(permissionKeys(roles)),
  };
}

export function parseIdList(value: unknown, field: string): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ValidationError(`${field} must be an array`);
  const ids = value.map(Number);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new ValidationError(`${field} must contain valid ids`);
  return [...new Set(ids)];
}

/** The requester may only assign roles whose permissions they already hold. */
export async function assertCanAssignRoles(requesterId: string, roleIds: number[]): Promise<void> {
  if (!roleIds.length) return;
  const requester = await getUserAccess(requesterId);
  if (requester.isSuperAdmin) return;

  const roles = await prisma.role.findMany({ where: { id: { in: roleIds } }, include: rolePermissionsInclude });
  if (roles.length !== roleIds.length) throw new ValidationError('One or more roles were not found');
  if (roles.some((r) => r.name === SUPER_ADMIN_ROLE)) {
    throw new ForbiddenError('Only super-admins can assign the super-admin role');
  }
  if (permissionKeys(roles).some((p) => !requester.permissions.has(p))) {
    throw new ForbiddenError('You cannot assign a role with permissions you do not have');
  }
}

/** The requester may only put permissions they already hold into a role. */
export async function assertCanGrantPermissions(requesterId: string, permissionIds: number[]): Promise<void> {
  if (!permissionIds.length) return;
  const requester = await getUserAccess(requesterId);
  if (requester.isSuperAdmin) return;

  const perms = await prisma.permission.findMany({
    where: { id: { in: permissionIds } },
    select: { module: true, action: true },
  });
  if (perms.length !== permissionIds.length) throw new ValidationError('One or more permissions were not found');
  if (perms.some((p) => !requester.permissions.has(`${p.module}_${p.action}`))) {
    throw new ForbiddenError('You cannot grant permissions you do not have');
  }
}

/**
 * Editing, deactivating or deleting another account is only allowed when that
 * account holds no permission the requester lacks. Otherwise e.g. an admin could
 * change a super-admin's email, trigger a password reset and take the account.
 */
export async function assertCanManageUser(requesterId: string, targetUserId: string): Promise<void> {
  if (requesterId === targetUserId) return;
  const requester = await getUserAccess(requesterId);
  if (requester.isSuperAdmin) return;

  const target = await getUserAccess(targetUserId);
  if (target.isSuperAdmin) throw new ForbiddenError('Only super-admins can modify a super-admin account');
  if ([...target.permissions].some((p) => !requester.permissions.has(p))) {
    throw new ForbiddenError('You cannot modify a user who has permissions you do not have');
  }
}

/** Only super-admins may change the super-admin role, and nobody may exceed their own power via a role. */
export async function assertCanManageRole(requesterId: string, roleId: number): Promise<void> {
  const requester = await getUserAccess(requesterId);
  if (requester.isSuperAdmin) return;

  const role = await prisma.role.findUnique({ where: { id: roleId }, include: rolePermissionsInclude });
  if (!role) return; // caller reports not-found
  if (role.name === SUPER_ADMIN_ROLE) throw new ForbiddenError('Only super-admins can modify the super-admin role');
  if (permissionKeys([role]).some((p) => !requester.permissions.has(p))) {
    throw new ForbiddenError('You cannot modify a role that has permissions you do not have');
  }
}
