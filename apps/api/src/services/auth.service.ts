import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { signAccessToken, signRefreshToken, signMfaToken, JWTPayload } from '../utils/jwt';
import { ValidationError, UnauthorizedError, ConflictError, ForbiddenError, ApiError } from '../utils/errors';
import { validateEmail, validatePassword, validateUsername } from '@headtilts/shared';
import { sendBuilt } from './mail.service';
import { passwordReset } from './emailContent';
import * as mfaService from './mfa.service';
import { accountChanged } from './security.service';

// Compared against when the account doesn't exist, so a login attempt takes
// the same time either way and can't be used to discover valid usernames.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

async function createUser(
  email: string,
  username: string,
  password: string,
  firstName?: string,
  lastName?: string,
  db: Prisma.TransactionClient = prisma,
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
  const existingUser = await db.user.findFirst({
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
  return db.user.create({
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
  // Public sign-up is opt-in (Settings → users_can_register = "yes").
  const registration = await prisma.setting.findUnique({ where: { key: 'users_can_register' } });
  if (registration?.value !== 'yes') {
    throw new ForbiddenError('Registration is disabled');
  }

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
  await prisma.$transaction(async (tx) => {
    // Lock the super-admin role row so two simultaneous setup requests are
    // serialised; the user count is then read after the other one committed.
    const roles = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM Role WHERE name = 'super-admin' FOR UPDATE`;
    if (!roles.length) {
      throw new ApiError('INTERNAL_ERROR', 'super-admin role not found — run the database seed first', 500);
    }
    const userCount = await tx.user.count();
    if (userCount > 0) {
      throw new ForbiddenError('Setup has already been completed');
    }

    const user = await createUser(email, username, password, firstName, lastName, tx);
    await tx.userRole.create({ data: { userId: user.id, roleId: roles[0].id } });
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

  // Always run bcrypt, even for unknown users (timing-safe enumeration defence).
  const isPasswordValid = await bcrypt.compare(String(password), user?.password ?? DUMMY_PASSWORD_HASH);
  if (!user || !isPasswordValid || !user.isActive) throw new UnauthorizedError('Invalid credentials');

  if (user.mfaEnabled) {
    return { mfaRequired: true, mfaToken: signMfaToken(user.id) };
  }
  // The user's role requires MFA but they haven't set it up yet: let them
  // enrol now (via the MFA token) instead of locking them out.
  if (await mfaService.isMfaRequiredForUser(user.id)) {
    return { mfaRequired: true, mfaSetupRequired: true, mfaToken: signMfaToken(user.id) };
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

  const valid = await mfaService.verifyAndConsumeTotp(userId, user.mfaSecret, totpCode);
  if (!valid) throw new UnauthorizedError('Invalid authentication code');

  const { plain, hashed } = mfaService.generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: true, mfaBackupCodes: JSON.stringify(hashed) },
  });

  await accountChanged(userId, 'mfa_on');
  return { backupCodes: plain };
}

/**
 * Login-time MFA enrolment for users whose role enforces MFA but who haven't
 * set it up yet. Only usable with the short-lived MFA token from login (i.e.
 * after the password was verified) and only while MFA is not yet enabled.
 */
export async function startMfaEnrollment(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, mfaEnabled: true, isActive: true } });
  if (!user || !user.isActive) throw new UnauthorizedError('User not found');
  if (user.mfaEnabled) throw new ApiError('MFA_ALREADY_ENABLED', 'MFA is already enabled', 409);

  const secret = mfaService.generateSecret();
  const otpauthUrl = mfaService.getOtpAuthUrl(secret, user.email);
  const qrCodeDataUrl = await mfaService.getQrCodeDataUrl(otpauthUrl);
  await prisma.user.update({ where: { id: userId }, data: { mfaSecret: secret, mfaLastUsedStep: null } });
  return { secret, otpauthUrl, qrCodeDataUrl };
}

export async function completeMfaEnrollment(userId: string, code: string) {
  const { backupCodes } = await enableMfa(userId, code);
  const session = await completeMfaLogin(userId);
  return { ...session, backupCodes };
}

export async function disableMfa(userId: string, password: string, code: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true, mfaEnabled: true, mfaSecret: true } });
  if (!user) throw new ApiError('NOT_FOUND', 'User not found', 404);
  if (!user.mfaEnabled) throw new ApiError('MFA_NOT_ENABLED', 'MFA is not enabled', 400);

  const isPasswordValid = await bcrypt.compare(String(password), user.password);
  if (!isPasswordValid) throw new UnauthorizedError('Invalid password');

  // A stolen session + password must not be enough to strip the second factor.
  const codeOk = (user.mfaSecret && await mfaService.verifyAndConsumeTotp(userId, user.mfaSecret, code))
    || await mfaService.consumeBackupCode(userId, code);
  if (!codeOk) throw new UnauthorizedError('Invalid authentication code');

  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null },
  });
  await accountChanged(userId, 'mfa_off');
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

export async function refreshAccessToken(refreshToken: string) {
  if (!refreshToken) throw new UnauthorizedError('Refresh token required');

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const session = await prisma.session.findFirst({
    where: { token: tokenHash, expiresAt: { gt: new Date() } },
    select: { userId: true },
  });

  if (!session) throw new UnauthorizedError('Invalid or expired refresh token');

  const user = await prisma.user.findUnique({
    where: { id: session.userId, isActive: true },
    include: USER_WITH_ROLES_INCLUDE,
  });

  if (!user) throw new UnauthorizedError('User not found or inactive');

  // Rotate: claim the old session atomically — if two requests race with the
  // same refresh token, only one gets new tokens.
  const { count } = await prisma.session.deleteMany({ where: { token: tokenHash } });
  if (count !== 1) throw new UnauthorizedError('Invalid or expired refresh token');
  const { accessToken, refreshToken: newRefreshToken } = buildTokensForUser(user as Parameters<typeof buildTokensForUser>[0]);
  await storeRefreshToken(user.id, newRefreshToken);

  return { accessToken, refreshToken: newRefreshToken, user: formatUserResponse(user) };
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
  // Not awaited: a reply that took longer for real accounts would reveal which
  // addresses have one, and Gmail takes a few seconds to accept a message.
  sendBuilt(user.email, passwordReset({ name: user.firstName || user.username, resetUrl }))
    .catch((error) => console.error('Password reset email failed:', error));
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
  await accountChanged(record.userId, 'password_reset');
}
