import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError, ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors';

/**
 * Passkeys (WebAuthn). A passkey that verifies the user (PIN, fingerprint,
 * face) signs them in on its own; any registered passkey can also serve as
 * the second step after a password.
 */

const APP_NAME = process.env.APP_NAME || 'Headtilts CMS';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_PASSKEYS = 10;
const MAX_CREDENTIAL_ID_LENGTH = 512;

type Purpose = 'register' | 'login' | 'mfa';

/**
 * The relying party is the admin's host. WEBAUTHN_RP_ID / WEBAUTHN_ORIGINS
 * override it, e.g. when the admin is reached through more than one hostname.
 */
function relyingParty(): { rpID: string; origins: string[] } {
  const admin = new URL(process.env.ADMIN_URL || 'http://localhost:5173');
  const rpID = process.env.WEBAUTHN_RP_ID || admin.hostname;
  const origins = (process.env.WEBAUTHN_ORIGINS || admin.origin)
    .split(',')
    .map((u) => { try { return new URL(u.trim()).origin; } catch { return ''; } })
    .filter(Boolean);
  if (process.env.NODE_ENV !== 'production' && rpID === 'localhost') {
    origins.push('http://localhost:5173', 'http://localhost:5174');
  }
  return { rpID, origins };
}

// ── Challenges ───────────────────────────────────────────────────────────────

async function storeChallenge(challenge: string, purpose: Purpose, userId: string | null): Promise<string> {
  await prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const row = await prisma.webAuthnChallenge.create({
    data: { challenge, purpose, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
  return row.id;
}

/** Errors on sign-in paths are 401s; on signed-in paths a 400, so the admin doesn't treat them as an expired session. */
function failure(purpose: Purpose, message: string): ApiError {
  return purpose === 'register' ? new ApiError('PASSKEY_FAILED', message, 400) : new UnauthorizedError(message);
}

/** Single use: the row is deleted as it is read, so a captured response can't be replayed. */
async function consumeChallenge(id: unknown, purpose: Purpose, userId: string | null): Promise<string> {
  const expired = failure(purpose, 'The passkey request expired. Please try again.');
  if (typeof id !== 'string' || !id) throw expired;
  const row = await prisma.webAuthnChallenge.findUnique({ where: { id } });
  const { count } = await prisma.webAuthnChallenge.deleteMany({ where: { id } });
  if (!row || count !== 1 || row.purpose !== purpose || row.userId !== userId || row.expiresAt < new Date()) throw expired;
  return row.challenge;
}

// ── Registration ─────────────────────────────────────────────────────────────

function splitTransports(transports: string | null): string[] | undefined {
  return transports ? transports.split(',') : undefined;
}

export async function registrationOptions(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, username: true, firstName: true, lastName: true, passkeys: { select: { credentialId: true, transports: true } } },
  });
  if (!user) throw new NotFoundError('User not found');
  if (user.passkeys.length >= MAX_PASSKEYS) {
    throw new ValidationError(`You can have up to ${MAX_PASSKEYS} passkeys. Remove one before adding another.`);
  }

  const options = await generateRegistrationOptions({
    rpName: APP_NAME,
    rpID: relyingParty().rpID,
    userName: user.email,
    userID: new Uint8Array(Buffer.from(userId, 'utf8')),
    userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username,
    attestationType: 'none',
    // Already-registered authenticators are refused by the browser up front.
    excludeCredentials: user.passkeys.map((p) => ({ id: p.credentialId, transports: splitTransports(p.transports) })),
    // Discoverable, so it can sign in without a username first.
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  return { challengeId: await storeChallenge(options.challenge, 'register', userId), options };
}

export async function registerPasskey(
  userId: string,
  challengeId: unknown,
  response: RegistrationResponseJSON,
  name: string,
) {
  const expectedChallenge = await consumeChallenge(challengeId, 'register', userId);
  const { rpID, origins } = relyingParty();

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch {
    throw failure('register', 'The passkey could not be verified. Please try again.');
  }
  if (!verification.verified) throw failure('register', 'The passkey could not be verified. Please try again.');

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  if (credential.id.length > MAX_CREDENTIAL_ID_LENGTH) throw failure('register', 'This authenticator is not supported.');
  if (await prisma.passkey.count({ where: { userId } }) >= MAX_PASSKEYS) {
    throw new ValidationError(`You can have up to ${MAX_PASSKEYS} passkeys. Remove one before adding another.`);
  }

  try {
    const passkey = await prisma.passkey.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports?.length ? credential.transports.join(',').slice(0, 255) : null,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        name: cleanName(name) || 'Passkey',
      },
      select: PASSKEY_SELECT,
    });
    return passkey;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError('That passkey is already registered.');
    }
    throw error;
  }
}

// ── Authentication ───────────────────────────────────────────────────────────

/** Passwordless sign-in: the browser offers any passkey it holds for this site. */
export async function loginOptions() {
  const options = await generateAuthenticationOptions({
    rpID: relyingParty().rpID,
    userVerification: 'required',
  });
  return { challengeId: await storeChallenge(options.challenge, 'login', null), options };
}

/** Second step after a password: only this user's passkeys are allowed. */
export async function secondFactorOptions(userId: string) {
  const passkeys = await prisma.passkey.findMany({ where: { userId }, select: { credentialId: true, transports: true } });
  if (!passkeys.length) throw new UnauthorizedError('This account has no passkeys');
  const options = await generateAuthenticationOptions({
    rpID: relyingParty().rpID,
    userVerification: 'preferred',
    allowCredentials: passkeys.map((p) => ({ id: p.credentialId, transports: splitTransports(p.transports) })),
  });
  return { challengeId: await storeChallenge(options.challenge, 'mfa', userId), options };
}

/** Verifies an assertion and returns the id of the user it belongs to. */
async function verifyAssertion(
  purpose: Purpose,
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  expectedUserId: string | null,
): Promise<string> {
  const rejected = failure(purpose, 'That passkey was not recognised.');
  if (!response || typeof response.id !== 'string') throw rejected;

  const passkey = await prisma.passkey.findUnique({ where: { credentialId: response.id } });
  if (!passkey || (expectedUserId && passkey.userId !== expectedUserId)) throw rejected;
  // The user handle, when sent, must name the passkey's owner.
  const userHandle: unknown = response.response?.userHandle;
  if (userHandle !== undefined && userHandle !== null && userHandle !== '') {
    if (typeof userHandle !== 'string' || Buffer.from(userHandle, 'base64url').toString('utf8') !== passkey.userId) throw rejected;
  }

  const { rpID, origins } = relyingParty();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
        transports: splitTransports(passkey.transports),
      },
      // Signing in with a passkey alone needs the device to have verified the user.
      requireUserVerification: purpose === 'login',
    });
  } catch {
    throw rejected;
  }
  if (!verification.verified) throw rejected;

  const { newCounter, credentialBackedUp, credentialDeviceType } = verification.authenticationInfo;
  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: newCounter, backedUp: credentialBackedUp, deviceType: credentialDeviceType, lastUsedAt: new Date() },
  });
  return passkey.userId;
}

export async function verifyLogin(challengeId: unknown, response: AuthenticationResponseJSON): Promise<string> {
  const challenge = await consumeChallenge(challengeId, 'login', null);
  return verifyAssertion('login', response, challenge, null);
}

export async function verifySecondFactor(userId: string, challengeId: unknown, response: AuthenticationResponseJSON): Promise<void> {
  const challenge = await consumeChallenge(challengeId, 'mfa', userId);
  await verifyAssertion('mfa', response, challenge, userId);
}

// ── Management ───────────────────────────────────────────────────────────────

const PASSKEY_SELECT = {
  id: true, name: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true,
} as const;

function cleanName(name: unknown): string {
  return typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 100) : '';
}

export function listPasskeys(userId: string) {
  return prisma.passkey.findMany({ where: { userId }, select: PASSKEY_SELECT, orderBy: { createdAt: 'asc' } });
}

export function countPasskeys(userId: string): Promise<number> {
  return prisma.passkey.count({ where: { userId } });
}

export async function renamePasskey(userId: string, id: number, name: unknown) {
  const clean = cleanName(name);
  if (!clean) throw new ValidationError('Name is required');
  const { count } = await prisma.passkey.updateMany({ where: { id, userId }, data: { name: clean } });
  if (!count) throw new NotFoundError('Passkey not found');
  return prisma.passkey.findUniqueOrThrow({ where: { id }, select: PASSKEY_SELECT });
}

export async function deletePasskey(userId: string, id: number): Promise<void> {
  const { count } = await prisma.passkey.deleteMany({ where: { id, userId } });
  if (!count) throw new NotFoundError('Passkey not found');
}
