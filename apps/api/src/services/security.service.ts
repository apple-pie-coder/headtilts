import { prisma } from '../config/database';
import { log } from './logger.service';
import { notifyFailedLogins, notifySecurityAlert } from './notifications.service';

/**
 * Sign-in security alerts: repeated wrong passwords for one sign-in name, and
 * a successful sign-in from a network the account hasn't used recently.
 */

const WINDOW_MS = 15 * 60 * 1000;
const NEW_PLACE_DAYS = 90;   // matches how long the logs keep IP addresses
const failures = new Map<string, number[]>();
const mfaFailures = new Map<string, number[]>();

// Per-account brakes on top of the per-IP authLimiter: a sign-in name stops
// accepting passwords after this many failures in WINDOW_MS, and an account
// stops accepting two-step codes after MFA_LOCK_AFTER wrong ones.
const LOCK_AFTER = 10;
const MFA_LOCK_AFTER = 5;

function recentFailures(map: Map<string, number[]>, key: string, now: number): number[] {
  return (map.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
}

/** Minutes until the oldest failure that keeps the lock in place ages out, or 0 if not locked. */
function lockMinutes(times: number[], limit: number, now: number): number {
  if (times.length < limit) return 0;
  return Math.max(1, Math.ceil((times[times.length - limit] + WINDOW_MS - now) / 60_000));
}

/** A wrong password (or unknown name). Alerts as the count reaches each recipient's threshold. */
export function recordFailedLogin(identifier: unknown, ip: string | null): void {
  if (typeof identifier !== 'string' || !identifier.trim()) return;
  const key = identifier.trim().toLowerCase();
  const now = Date.now();
  const recent = recentFailures(failures, key, now);
  recent.push(now);
  failures.set(key, recent);
  if (failures.size > 5000) {
    for (const [k, times] of failures) if (now - times[times.length - 1] >= WINDOW_MS) failures.delete(k);
  }
  // Thresholds are small numbers; past this it's an attack already reported.
  if (recent.length <= 50) {
    notifyFailedLogins({ identifier: identifier.trim(), attempts: recent.length, ip })
      .catch((error) => console.error('Failed-login alert failed:', error));
  }
}

export function clearFailedLogins(identifier: unknown): void {
  if (typeof identifier === 'string') failures.delete(identifier.trim().toLowerCase());
}

/** Minutes this sign-in name stays locked after too many wrong passwords; 0 when it isn't. */
export function loginLockMinutes(identifier: string): number {
  const now = Date.now();
  return lockMinutes(recentFailures(failures, identifier.trim().toLowerCase(), now), LOCK_AFTER, now);
}

/** A wrong two-step code (authenticator or backup code) for this account. */
export function recordFailedMfa(userId: string): void {
  const now = Date.now();
  const recent = recentFailures(mfaFailures, userId, now);
  recent.push(now);
  mfaFailures.set(userId, recent);
  if (mfaFailures.size > 5000) {
    for (const [k, times] of mfaFailures) if (now - times[times.length - 1] >= WINDOW_MS) mfaFailures.delete(k);
  }
}

export function clearFailedMfa(userId: string): void {
  mfaFailures.delete(userId);
}

/** Minutes this account stays locked out of two-step codes; 0 when it isn't. */
export function mfaLockMinutes(userId: string): number {
  const now = Date.now();
  return lockMinutes(recentFailures(mfaFailures, userId, now), MFA_LOCK_AFTER, now);
}

/** "Chrome on Windows" from a user-agent string; good enough for an alert email. */
export function describeDevice(userAgent?: string | null): string {
  if (!userAgent) return 'Unknown browser';
  const browser = /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\/|Opera/.test(userAgent) ? 'Opera'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari' : 'A browser';
  const os = /iPhone|iPad/.test(userAgent) ? 'iPhone or iPad'
    : /Android/.test(userAgent) ? 'Android'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Mac OS X|Macintosh/.test(userAgent) ? 'Mac'
    : /Linux/.test(userAgent) ? 'Linux' : 'an unknown system';
  return `${browser} on ${os}`;
}

export async function formatNow(): Promise<string> {
  const tz = (await prisma.setting.findUnique({ where: { key: 'timezone' } }).catch(() => null))?.value || 'UTC';
  try {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz, timeZoneName: 'short' }).format(new Date());
  } catch {
    return new Date().toUTCString();
  }
}

/** A completed sign-in (after two-step verification, if the account uses it). */
export async function recordSignIn(userId: string, ip: string | null, userAgent?: string | null): Promise<void> {
  try {
    const since = new Date(Date.now() - NEW_PLACE_DAYS * 86_400_000);
    const [before, samePlace] = await Promise.all([
      prisma.activityLog.findFirst({ where: { action: 'auth.signed_in', actorId: userId }, select: { id: true } }),
      ip ? prisma.activityLog.findFirst({ where: { action: 'auth.signed_in', actorId: userId, ip, timestamp: { gte: since } }, select: { id: true } }) : null,
    ]);
    log({
      site: 'admin', level: 'info', category: 'auth', action: 'auth.signed_in',
      actorId: userId, ip: ip ?? undefined, userAgent: userAgent ?? undefined,
    });
    // The first sign-in only sets the baseline; after that, a new network is worth a heads-up.
    if (before && ip && !samePlace) {
      await notifySecurityAlert({
        userId,
        title: 'New sign-in to your account',
        body: `Your account was just signed in to from a network it hasn't used in the last ${NEW_PLACE_DAYS} days. If this was you, there's nothing to do. If not, change your password now and turn on two-step sign-in.`,
        details: [
          { label: 'When', value: await formatNow() },
          { label: 'Device', value: describeDevice(userAgent) },
          { label: 'IP address', value: ip },
        ],
      });
    }
  } catch (error) {
    console.error('Sign-in check failed:', error);
  }
}

/** Password changed, two-step sign-in switched on or off: tell the account owner. */
export async function accountChanged(
  userId: string,
  what: 'password_reset' | 'password_changed' | 'mfa_on' | 'mfa_off' | 'mfa_reset' | 'passkey_added' | 'passkey_removed',
): Promise<void> {
  const copy = {
    password_reset: { title: 'Your password was reset', body: 'Your password was changed using a reset link, and you were signed out everywhere else. If you didn\'t do this, reset it again now and tell an administrator.' },
    password_changed: { title: 'Your password was changed', body: 'The password for your account was just changed from your profile. If you didn\'t do this, reset it now and tell an administrator.' },
    mfa_on: { title: 'Two-step sign-in is on', body: 'From now on, signing in also needs a code from your authenticator app. Keep your backup codes somewhere safe.' },
    mfa_off: { title: 'Two-step sign-in was turned off', body: 'Your account no longer asks for an authenticator code when signing in. If you didn\'t do this, change your password and turn it back on.' },
    mfa_reset: { title: 'Your two-step sign-in was reset', body: 'An administrator removed your authenticator app, backup codes and passkeys, usually because you were locked out. Set two-step sign-in up again from your profile. If you didn\'t ask for this, tell an administrator.' },
    passkey_added: { title: 'A passkey was added to your account', body: 'A new passkey can now be used to sign in to your account. If you didn\'t add it, remove it from your profile, change your password and tell an administrator.' },
    passkey_removed: { title: 'A passkey was removed from your account', body: 'One of your passkeys can no longer be used to sign in. If you didn\'t do this, change your password and tell an administrator.' },
  }[what];
  await notifySecurityAlert({ userId, ...copy, details: [{ label: 'When', value: await formatNow() }] })
    .catch((error) => console.error('Security alert failed:', error));
}
