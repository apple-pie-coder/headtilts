import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faUserPen, faArrowLeft, faEye, faCopy, faLockOpen } from '@fortawesome/free-solid-svg-icons';
import type { LockState } from '../hooks/usePostLock';
import type { LockUser } from '../services/postLocks';
import { resolveMediaUrl } from '../services/media';
import { Button } from './ui';
import styles from './PostLockDialog.module.css';

function Avatar({ user }: { user: LockUser }) {
  return (
    <span className={styles.avatar} aria-hidden="true">
      {user.avatar ? <img src={resolveMediaUrl(user.avatar)} alt="" /> : user.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function since(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

interface Props {
  state: LockState;
  noun: string;
  title: string;
  onBack: () => void;
  onPreview?: () => void;
  onTakeOver: () => void;
  onStartEditing: () => void;
  onCopyMine: () => void;
}

/**
 * Shown over the editor when another user holds the edit lock ("Alice is
 * currently editing") or has just taken it over from us.
 */
export function PostLockDialog({ state, noun, title, onBack, onPreview, onTakeOver, onStartEditing, onCopyMine }: Props) {
  const [confirming, setConfirming] = useState(false);
  const open = state.kind === 'locked' || state.kind === 'lost';

  // Make the editor behind the dialog unreachable (no typing, tabbing or clicking).
  useEffect(() => {
    if (!open) return;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    return () => root?.removeAttribute('inert');
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="lock-title" aria-describedby="lock-desc">
        {state.kind === 'locked' && !state.released && (
          <>
            <div className={styles.who}>
              <Avatar user={state.lock.user} />
              <span className={styles.badge}><FontAwesomeIcon icon={faLock} /></span>
            </div>
            <h2 id="lock-title" className={styles.title}>This {noun} is already being edited</h2>
            <p id="lock-desc" className={styles.text}>
              <strong>{state.lock.user.name}</strong> is currently editing “{title || 'Untitled'}” (opened {since(state.lock.since)}).
              They’ve been told you’re waiting, and you’ll see here as soon as they’re done.
            </p>
            {confirming ? (
              <div className={styles.warn} role="note">
                Taking over locks <strong>{state.lock.user.name}</strong> out of the editor. Anything they haven’t saved yet
                (the editor autosaves every few seconds) won’t be kept.
              </div>
            ) : null}
            <div className={styles.actions}>
              <Button variant="ghost" icon={faArrowLeft} onClick={onBack} autoFocus>Go back</Button>
              {onPreview && <Button icon={faEye} onClick={onPreview}>Preview</Button>}
              {confirming
                ? <Button variant="danger" icon={faUserPen} onClick={onTakeOver}>Yes, take over</Button>
                : <Button variant="primary" icon={faUserPen} onClick={() => setConfirming(true)}>Take over</Button>}
            </div>
          </>
        )}

        {state.kind === 'locked' && state.released && (
          <>
            <div className={styles.who}>
              <Avatar user={state.lock.user} />
              <span className={`${styles.badge} ${styles.badgeFree}`}><FontAwesomeIcon icon={faLockOpen} /></span>
            </div>
            <h2 id="lock-title" className={styles.title}>{state.lock.user.name} has finished editing</h2>
            <p id="lock-desc" className={styles.text}>
              The {noun} is free. Start editing to load their latest changes.
            </p>
            <div className={styles.actions}>
              <Button variant="ghost" icon={faArrowLeft} onClick={onBack}>Go back</Button>
              <Button variant="primary" icon={faUserPen} onClick={onStartEditing} autoFocus>Start editing</Button>
            </div>
          </>
        )}

        {state.kind === 'lost' && (
          <>
            <div className={styles.who}>
              <Avatar user={state.by} />
              <span className={styles.badge}><FontAwesomeIcon icon={faLock} /></span>
            </div>
            <h2 id="lock-title" className={styles.title}>{state.by.name} has taken over</h2>
            <p id="lock-desc" className={styles.text}>
              {state.by.name} is now editing “{title || 'Untitled'}”, so this editor has been locked to stop you overwriting each
              other. Changes that weren’t saved yet can be copied before you leave.
            </p>
            <div className={styles.actions}>
              <Button icon={faCopy} onClick={onCopyMine}>Copy my text</Button>
              <Button variant="primary" icon={faArrowLeft} onClick={onBack} autoFocus>Back to {noun}s</Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Small banner for the current editor: "Bob tried to open this post". */
export function LockVisitors({ visitors, noun, onDismiss }: { visitors: (LockUser & { at: number })[]; noun: string; onDismiss: (id: string) => void }) {
  if (visitors.length === 0) return null;
  const names = visitors.map((v) => v.name);
  const label = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return (
    <div className={styles.visitors} role="status">
      <span className={styles.visitorAvatars}>
        {visitors.slice(0, 3).map((v) => <Avatar key={v.id} user={v} />)}
      </span>
      <span className={styles.visitorText}>
        <strong>{label}</strong> {visitors.length === 1 ? 'is' : 'are'} trying to open this {noun}. They can see you’re editing and may take over — save your work.
      </span>
      <button type="button" className={styles.visitorClose} onClick={() => visitors.forEach((v) => onDismiss(v.id))} aria-label="Dismiss">×</button>
    </div>
  );
}
