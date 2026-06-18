import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { signAccessToken, signRefreshToken, signMfaToken, JWTPayload } from '../utils/jwt';
import { ValidationError, UnauthorizedError, ConflictError, ForbiddenError, ApiError } from '../utils/errors';
import { validateEmail, validatePassword, validateUsername } from '@headtilts/shared';
import { sendMail } from './mail.service';
import * as mfaService from './mfa.service';

async function createUser(
  email: string,
  username: string,
  password: string,
  firstName?: string,
  lastName?: string
) {
  // Validate inputs
  const emailValidation = validateEmail(email);
  if (!emailValidation.valid) {
    throw new ValidationError(emailValidation.error!);
  }

  const usernameValidation = validateUsername(username);
  if (!usernameValidation.valid) {
    throw new ValidationError(usernameValidation.error!);
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    throw new ValidationError(passwordValidation.error!);
  }

  // Check if user exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }],
    },
  });

  if (existingUser) {
    throw new ConflictError('Email or username already exists');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  return prisma.user.create({
    data: {
      email,
      username,
      password: hashedPassword,
      firstName,
      lastName,
    },
  });
}

export async function register(
  email: string,
  username: string,
  password: string,
  firstName?: string,
  lastName?: string
) {
  const user = await createUser(email, username, password, firstName, lastName);

  // Assign default 'subscriber' role
  const subscriberRole = await prisma.role.findUnique({
    where: { name: 'subscriber' },
  });

  if (subscriberRole) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: subscriberRole.id,
      },
    });
  }

  return { id: user.id, email: user.email, username: user.username };
}

// Whether the instance has no users yet and still needs its first
// administrator account created via setupFirstAdmin().
export async function getSetupStatus() {
  const userCount = await prisma.user.count();
  return { needsSetup: userCount === 0 };
}

// Creates the very first user account and grants it the 'super-admin'
// role. Only allowed while the instance has no users at all — this is
// how a freshly-deployed instance gets its initial administrator
// without exposing a privilege-escalation endpoint afterwards.
export async function setupFirstAdmin(
  email: string,
  username: string,
  password: string,
  firstName?: string,
  lastName?: string
) {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    throw new ForbiddenError('Setup has already been completed');
  }

  const user = await createUser(email, username, password, firstName, lastName);

  const superAdminRole = await prisma.role.findUnique({
    where: { name: 'super-admin' },
  });

  if (!superAdminRole) {
    throw new ApiError('INTERNAL_ERROR', 'super-admin role not found — run the database seed first', 500);
  }

  await prisma.userRole.create({
    data: {
      userId: user.id,
      roleId: superAdminRole.id,
    },
  });

  return login(email, password);
}

const USER_WITH_ROLES_INCLUDE = {
  userRoles: {
    include: {
      role: {
        include: { permissions: { include: { permission: true } } },
      },
    },
  },
} as const;

function buildTokensForUser(user: Awaited<ReturnType<typeof prisma.user.findFirst>> & {
  userRoles: { role: { name: string; id: number; permissions: { permission: { id: number; module: string; action: string } }[] } }[];
}) {
  const roles = user!.userRoles.map((ur) => ur.role.name);
  const permissions = user!.userRoles
    .flatMap((ur) => ur.role.permissions)
    .map((rp) => `${rp.permission.module}_${rp.permission.action}`);

  const payload: JWTPayload = { sub: user!.id, email: user!.email, username: user!.username, roles, permissions };
  return { payload, accessToken: signAccessToken(payload), refreshToken: signRefreshToken(payload) };
}

async function storeRefreshToken(userId: string, refreshToken: string) {
  await prisma.session.create({
    data: {
      userId,
      token: crypto.createHash('sha256').update(refreshToken).digest('hex'),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}

function formatUserResponse(user: {
  id: string; email: string; username: string; firstName: string | null; lastName: string | null;
  avatar: string | null; isActive: boolean;
  userRoles: { role: { id: number; name: string; permissions: { permission: { id: number; module: string; action: string } }[] } }[];
}) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatar,
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

export async function login(identifier: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { username: identifier }] },
    include: USER_WITH_ROLES_INCLUDE,
  });

  if (!user || !user.isActive) throw new UnauthorizedError('Invalid credentials');

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) throw new UnauthorizedError('Invalid credentials');

  const mfaEnforced = await mfaService.isMfaRequiredForUser(user.id);

  if (user.mfaEnabled || mfaEnforced) {
    const mfaToken = signMfaToken(user.id);
    return { mfaRequired: true, mfaToken };
  }

  const { accessToken, refreshToken } = buildTokensForUser(user as Parameters<typeof buildTokensForUser>[0]);
  await storeRefreshToken(user.id, refreshToken);

  return { accessToken, refreshToken, user: formatUserResponse(user) };
}

export async function completeMfaLogin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: USER_WITH_ROLES_INCLUDE });
  if (!user || !user.isActive) throw new UnauthorizedError('User not found');

  const { accessToken, refreshToken } = buildTokensForUser(user as Parameters<typeof buildTokensForUser>[0]);
  await storeRefreshToken(user.id, refreshToken);

  return { accessToken, refreshToken, user: formatUserResponse(user) };
}

export async function setupMfa(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, mfaEnabled: true } });
  if (!user) throw new ApiError('NOT_FOUND', 'User not found', 404);
  if (user.mfaEnabled) throw new ApiError('MFA_ALREADY_ENABLED', 'MFA is already enabled', 409);

  const secret = mfaService.generateSecret();
  const otpauthUrl = mfaService.getOtpAuthUrl(secret, user.email);
  const qrCodeDataUrl = await mfaService.getQrCodeDataUrl(otpauthUrl);

  await prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret } });

  return { secret, otpauthUrl, qrCodeDataUrl };
}

export async function enableMfa(userId: string, totpCode: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaSecret: true, mfaEnabled: true } });
  if (!user) throw new ApiError('NOT_FOUND', 'User not found', 404);
  if (user.mfaEnabled) throw new ApiError('MFA_ALREADY_ENABLED', 'MFA is already enabled', 409);
  if (!user.mfaSecret) throw new ApiError('MFA_NOT_SETUP', 'Call /auth/mfa/setup first', 400);

  const valid = mfaService.verifyTotp(user.mfaSecret, totpCode);
  if (!valid) throw new UnauthorizedError('Invalid authentication code');

  const { plain, hashed } = mfaService.generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: true, mfaBackupCodes: JSON.stringify(hashed) },
  });

  return { backupCodes: plain };
}

export async function disableMfa(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true, mfaEnabled: true } });
  if (!user) throw new ApiError('NOT_FOUND', 'User not found', 404);
  if (!user.mfaEnabled) throw new ApiError('MFA_NOT_ENABLED', 'MFA is not enabled', 400);

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) throw new UnauthorizedError('Invalid password');

  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null },
  });
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
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
    },
  });

  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatar,
    bio: user.bio,
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

export async function logout(refreshToken: string): Promise<void> {
  if (!refreshToken) return;
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await prisma.session.deleteMany({ where: { token: tokenHash } });
}

// ===================== Password reset =====================

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildResetUrl(token: string): string {
  let base = (process.env.ADMIN_URL || 'http://localhost:5173').replace(/\/$/, '');
  if (!base.endsWith('/admin')) base += '/admin';
  return `${base}/reset-password?token=${token}`;
}

/**
 * Start a password reset. Always resolves without revealing whether the
 * email exists. When SMTP is unconfigured the link is logged server-side.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return;

  // Invalidate previous tokens for this user
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

  const token = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  const resetUrl = buildResetUrl(token);
  await sendMail({
    to: user.email,
    subject: 'Reset your password',
    text: `Hello ${user.firstName || user.username},\n\nA password reset was requested for your account. Open the link below to choose a new password. The link expires in 1 hour.\n\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (!token) {
    throw new ValidationError('Reset token is required');
  }

  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    throw new ValidationError(passwordValidation.error!);
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new UnauthorizedError('This reset link is invalid or has expired');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { password: hashedPassword } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Revoke existing sessions so a compromised account is fully locked out
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);
}
