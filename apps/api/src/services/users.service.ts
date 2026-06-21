import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { ValidationError, NotFoundError, ConflictError, ForbiddenError } from '../utils/errors';
import { validateEmail, validateUsername, validatePassword } from '@headtilts/shared';
import * as notifications from './notifications.service';

const userInclude = {
  userRoles: {
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
  },
} as const;

function toUserDTO(user: {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  bio: string | null;
  website: string | null;
  location: string | null;
  twitterUrl: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  instagramUrl: string | null;
  isActive: boolean;
  userRoles: {
    role: {
      id: number;
      name: string;
      permissions: { permission: { id: number; module: string; action: string } }[];
    };
  }[];
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatar,
    bio: user.bio,
    website: user.website,
    location: user.location,
    twitterUrl: user.twitterUrl,
    linkedinUrl: user.linkedinUrl,
    githubUrl: user.githubUrl,
    instagramUrl: user.instagramUrl,
    isActive: user.isActive,
    roles: user.userRoles.map((ur) => ({
      id: ur.role.id,
      name: ur.role.name,
      permissions: ur.role.permissions.map((rp) => ({
        id: rp.permission.id,
        module: rp.permission.module,
        action: rp.permission.action,
      })),
    })),
  };
}

export async function listUsers(page: number, limit: number, search?: string) {
  const where = search
    ? {
        OR: [
          { email: { contains: search } },
          { username: { contains: search } },
          { firstName: { contains: search } },
          { lastName: { contains: search } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: { id: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { items: users.map(toUserDTO), total };
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, include: userInclude });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return toUserDTO(user);
}

interface CreateUserInput {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
  roleIds?: number[];
}

export async function createUser(input: CreateUserInput) {
  const emailValidation = validateEmail(input.email);
  if (!emailValidation.valid) {
    throw new ValidationError(emailValidation.error!);
  }

  const usernameValidation = validateUsername(input.username);
  if (!usernameValidation.valid) {
    throw new ValidationError(usernameValidation.error!);
  }

  const passwordValidation = validatePassword(input.password);
  if (!passwordValidation.valid) {
    throw new ValidationError(passwordValidation.error!);
  }

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.username }] },
  });

  if (existingUser) {
    throw new ConflictError('Email or username already exists');
  }

  const hashedPassword = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      password: hashedPassword,
      firstName: input.firstName,
      lastName: input.lastName,
      userRoles: input.roleIds?.length
        ? { create: input.roleIds.map((roleId) => ({ roleId })) }
        : undefined,
    },
    include: userInclude,
  });

  // Real-time in-app notification to user admins (fire-and-forget).
  notifications
    .notifyNewUser({ id: user.id, username: user.username, email: user.email })
    .catch((error) => console.error('New-user notification failed:', error));

  return toUserDTO(user);
}

interface UpdateUserInput {
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
  isActive?: boolean;
  roleIds?: number[];
}

export async function updateUser(id: string, input: UpdateUserInput, requestingUserId: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('User not found');
  }

  // Prevent privilege escalation: only a super-admin can assign the super-admin role.
  if (input.roleIds !== undefined && input.roleIds.length > 0) {
    const superAdminRole = await prisma.role.findUnique({ where: { name: 'super-admin' } });
    if (superAdminRole && input.roleIds.includes(superAdminRole.id)) {
      const requesterIsSuperAdmin = await prisma.userRole.findFirst({
        where: { userId: requestingUserId, role: { name: 'super-admin' } },
      });
      if (!requesterIsSuperAdmin) {
        throw new ForbiddenError('Only super-admins can assign the super-admin role');
      }
    }
  }

  if (input.email !== undefined || input.username !== undefined) {
    const conflict = await prisma.user.findFirst({
      where: {
        id: { not: id },
        OR: [
          ...(input.email !== undefined ? [{ email: input.email }] : []),
          ...(input.username !== undefined ? [{ username: input.username }] : []),
        ],
      },
    });

    if (conflict) {
      throw new ConflictError('Email or username already exists');
    }
  }

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: {
        email: input.email,
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        avatar: input.avatar,
        isActive: input.isActive,
      },
    });

    if (input.roleIds !== undefined) {
      await tx.userRole.deleteMany({ where: { userId: id } });
      if (input.roleIds.length) {
        await tx.userRole.createMany({
          data: input.roleIds.map((roleId) => ({ userId: id, roleId })),
        });
      }
    }

    return tx.user.findUniqueOrThrow({ where: { id: updated.id }, include: userInclude });
  });

  return toUserDTO(user);
}

interface UpdateMeInput {
  firstName?: string;
  lastName?: string;
  bio?: string;
  avatar?: string | null;
  website?: string | null;
  location?: string | null;
  twitterUrl?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  instagramUrl?: string | null;
  password?: string;
  currentPassword?: string;
}

export async function updateMe(id: string, input: UpdateMeInput) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('User not found');

  if (input.password) {
    if (!input.currentPassword) throw new ValidationError('Current password is required to set a new password');
    const valid = await bcrypt.compare(input.currentPassword, existing.password);
    if (!valid) throw new ValidationError('Current password is incorrect');
    const passwordValidation = validatePassword(input.password);
    if (!passwordValidation.valid) throw new ValidationError(passwordValidation.error!);
  }

  const hashedPassword = input.password ? await bcrypt.hash(input.password, 10) : undefined;

  const user = await prisma.user.update({
    where: { id },
    data: {
      firstName: input.firstName !== undefined ? input.firstName : existing.firstName,
      lastName: input.lastName !== undefined ? input.lastName : existing.lastName,
      bio: input.bio !== undefined ? input.bio : existing.bio,
      avatar: input.avatar !== undefined ? input.avatar : existing.avatar,
      website: input.website !== undefined ? input.website : existing.website,
      location: input.location !== undefined ? input.location : existing.location,
      twitterUrl: input.twitterUrl !== undefined ? input.twitterUrl : existing.twitterUrl,
      linkedinUrl: input.linkedinUrl !== undefined ? input.linkedinUrl : existing.linkedinUrl,
      githubUrl: input.githubUrl !== undefined ? input.githubUrl : existing.githubUrl,
      instagramUrl: input.instagramUrl !== undefined ? input.instagramUrl : existing.instagramUrl,
      ...(hashedPassword ? { password: hashedPassword } : {}),
    },
    include: userInclude,
  });

  return toUserDTO(user);
}

export async function deleteUser(id: string, requestingUserId: string) {
  if (id === requestingUserId) {
    throw new ValidationError('Cannot delete your own account');
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('User not found');
  }

  await prisma.user.delete({ where: { id } });
}
