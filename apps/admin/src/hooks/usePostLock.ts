import { useCallback, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { useSocketEvent } from '../context/NotificationContext';
import {
  acquirePostLock, fetchPostLocks, LockUser, PostLock, releasePostLock, releasePostLockOnUnload,
} from '../services/postLocks';

export type LockState =
  | { kind: 'idle' }
  | { kind: 'acquiring' }
  | { kind: 'mine' }
  /** Someone else is editing. `released` turns true once they've finished. */
  | { kind: 'locked'; lock: PostLock; released: boolean }
  /** We had it, then someone took over. */
  | { kind: 'lost'; by: LockUser }
  /** Locking isn't available (e.g. older API) — editing carries on as before. */
  | { kind: 'unavailable' };

const HEARTBEAT_MS = 20_000;
const POLL_MS = 15_000;

interface Visitor extends LockUser { at: number }

/**
 * WordPress-style post locking for the editor: hold an edit lock while the post
 * is open, show who has it when someone else does, let them take over, and tell
 * the current editor when someone tries to open the post.
 */
export function usePostLock(postId: number | null, opts: { onRegained?: () => void; onVisitor?: (u: LockUser) => void } = {}) {
  const [state, setState] = useState<LockState>({ kind: postId ? 'acquiring' : 'idle' });
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const acquire = useCallback(async (takeover = false) => {
    if (!postId) return;
    try {
      const res = await acquirePostLock(postId, { takeover });
      if (res.status === 'acquired') {
        const regained = stateRef.current.kind === 'locked' || stateRef.current.kind === 'lost';
        setState({ kind: 'mine' });
        if (regained || takeover) optsRef.current.onRegained?.();
      } else {
        setState({ kind: 'locked', lock: res.lock, released: false });
      }
    } catch (err) {
      const status = (err as AxiosError).response?.status;
      // 403 = can't edit this post at all; let the editor's own load/save errors explain.
      setState(status === 403 ? { kind: 'idle' } : { kind: 'unavailable' });
    }
  }, [postId]);

  // Initial acquire, and release when leaving the editor.
  useEffect(() => {
    if (!postId) { setState({ kind: 'idle' }); return; }
    setState({ kind: 'acquiring' });
    setVisitors([]);
    acquire();
    const onPageHide = () => releasePostLockOnUnload(postId);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      // Releasing also takes us out of the "waiting" list if someone else had it.
      releasePostLock(postId).catch(() => {});
    };
  }, [postId, acquire]);

  // Heartbeat while we hold the lock; a heartbeat that finds someone else means we lost it.
  useEffect(() => {
    if (!postId || state.kind !== 'mine') return;
    const t = setInterval(async () => {
      try {
        const res = await acquirePostLock(postId, { heartbeat: true });
        if (res.status === 'locked') setState({ kind: 'lost', by: res.lock.user });
      } catch { /* transient — try again next beat */ }
    }, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [postId, state.kind]);

  // While someone else has it, check now and then whether they've finished
  // (the socket usually tells us first).
  useEffect(() => {
    if (!postId || state.kind !== 'locked' || state.released) return;
    const t = setInterval(async () => {
      try {
        const locks = await fetchPostLocks([postId]);
        const current = locks[0];
        if (!current) setState((s) => (s.kind === 'locked' ? { ...s, released: true } : s));
        else if (stateRef.current.kind === 'locked' && current.user.id !== stateRef.current.lock.user.id) {
          setState({ kind: 'locked', lock: current, released: false });
        }
      } catch { /* ignore */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [postId, state]);

  useSocketEvent<{ postId: number; user: LockUser }>('post-lock:attempt', (p) => {
    if (p.postId !== postId || stateRef.current.kind !== 'mine') return;
    setVisitors((v) => [...v.filter((x) => x.id !== p.user.id), { ...p.user, at: Date.now() }]);
    optsRef.current.onVisitor?.(p.user);
  });

  useSocketEvent<{ postId: number; user: LockUser }>('post-lock:taken', (p) => {
    if (p.postId === postId) setState({ kind: 'lost', by: p.user });
  });

  useSocketEvent<{ postId: number }>('post-lock:released', (p) => {
    if (p.postId === postId) setState((s) => (s.kind === 'locked' ? { ...s, released: true } : s));
  });

  /** Mark the lock as lost from outside, e.g. when a save comes back 423. */
  const markLost = useCallback((by: LockUser) => setState({ kind: 'lost', by }), []);
  const dismissVisitor = useCallback((id: string) => setVisitors((v) => v.filter((x) => x.id !== id)), []);

  return {
    state,
    visitors,
    blocked: state.kind === 'locked' || state.kind === 'lost' || state.kind === 'acquiring',
    takeOver: () => acquire(true),
    startEditing: () => acquire(false),
    markLost,
    dismissVisitor,
  };
}
