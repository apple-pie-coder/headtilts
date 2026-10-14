import { prisma } from '../config/database';
import { pushToUser } from '../realtime/notifications.gateway';

/**
 * Edit locks for posts and pages ("Alice is currently editing").
 *
 * An editor holds a lock while the post is open and renews it with a heartbeat.
 * Anyone else who opens the post sees who has it and can wait or take over.
 * Locks live in memory: they only matter while an editor is open, expire on
 * their own, and a restart simply means the next heartbeat re-acquires them.
 */

export const LOCK_TTL_MS = 60_000;

export interface LockUser {
  id: string;
  name: string;
  avatar: string | null;
}

interface Lock {
  postId: number;
  user: LockUser;
  acquiredAt: number;
  lastSeen: number;
  /** People who opened the post while it was locked, to tell when it frees up. */
  waiting: Map<string, LockUser>;
}

export interface LockView {
  postId: number;
  user: LockUser;
  since: string;
}

export type AcquireResult =
  | { status: 'acquired'; lock: LockView }
  | { status: 'locked'; lock: LockView };

const locks = new Map<number, Lock>();
const userCache = new Map<string, { user: LockUser; at: number }>();

function view(lock: Lock): LockView {
  return { postId: lock.postId, user: lock.user, since: new Date(lock.acquiredAt).toISOString() };
}

function activeLock(postId: number): Lock | null {
  const lock = locks.get(postId);
  if (!lock) return null;
  if (Date.now() - lock.lastSeen > LOCK_TTL_MS) {
    locks.delete(postId);
    notifyReleased(lock);
    return null;
  }
  return lock;
}

async function lockUser(userId: string): Promise<LockUser> {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.user;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, firstName: true, lastName: true, avatar: true },
  });
  const user: LockUser = {
    id: userId,
    name: (u && ([u.firstName, u.lastName].filter(Boolean).join(' ') || u.username)) || 'Someone',
    avatar: u?.avatar ?? null,
  };
  userCache.set(userId, { user, at: Date.now() });
  return user;
}

function notifyReleased(lock: Lock) {
  for (const waiter of lock.waiting.values()) {
    pushToUser(waiter.id, 'post-lock:released', { postId: lock.postId, by: lock.user });
  }
}

/**
 * Take (or renew) the lock. When someone else holds it, nothing changes unless
 * `takeover` is set — the holder is told either way, so they know someone is
 * waiting or that they've been taken over.
 */
export async function acquire(postId: number, userId: string, opts: { takeover?: boolean; title?: string; notify?: boolean } = {}): Promise<AcquireResult> {
  const me = await lockUser(userId);
  const current = activeLock(postId);
  const now = Date.now();

  if (!current || current.user.id === userId) {
    const lock: Lock = current ?? { postId, user: me, acquiredAt: now, lastSeen: now, waiting: new Map() };
    lock.lastSeen = now;
    locks.set(postId, lock);
    return { status: 'acquired', lock: view(lock) };
  }

  if (opts.takeover) {
    const previous = current;
    const lock: Lock = { postId, user: me, acquiredAt: now, lastSeen: now, waiting: new Map() };
    // Whoever was waiting is still waiting — now on the new editor.
    for (const [id, u] of previous.waiting) if (id !== userId) lock.waiting.set(id, u);
    lock.waiting.set(previous.user.id, previous.user);
    locks.set(postId, lock);
    pushToUser(previous.user.id, 'post-lock:taken', { postId, title: opts.title, user: me });
    return { status: 'acquired', lock: view(lock) };
  }

  // Someone else is editing: remember the visitor and let the editor know.
  const isNewVisitor = !current.waiting.has(userId);
  current.waiting.set(userId, me);
  if (opts.notify !== false && isNewVisitor) {
    pushToUser(current.user.id, 'post-lock:attempt', { postId, title: opts.title, user: me });
  }
  return { status: 'locked', lock: view(current) };
}

export function release(postId: number, userId: string): boolean {
  const lock = locks.get(postId);
  if (!lock || lock.user.id !== userId) return false;
  locks.delete(postId);
  notifyReleased(lock);
  return true;
}

/** Stop waiting for a post (the visitor went back without taking over). */
export function leaveQueue(postId: number, userId: string): void {
  locks.get(postId)?.waiting.delete(userId);
}

/** The user currently editing, if it isn't `userId`. */
export function heldByOther(postId: number, userId: string): LockView | null {
  const lock = activeLock(postId);
  return lock && lock.user.id !== userId ? view(lock) : null;
}

export function list(postIds: number[]): LockView[] {
  const out: LockView[] = [];
  for (const id of postIds) {
    const lock = activeLock(id);
    if (lock) out.push(view(lock));
  }
  return out;
}
