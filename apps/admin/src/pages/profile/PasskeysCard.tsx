import { FormEvent, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFingerprint, faPen, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/ToastContext';
import { addPasskey, listPasskeys, Passkey, passkeyError, passkeysSupported, removePasskey, renamePasskey } from '../../services/passkeys';
import styles from '../Profile.module.css';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Props {
  /** The user's role requires two-step sign-in. */
  required: boolean;
  /** An authenticator app is set up (so removing every passkey still leaves a second step). */
  appEnabled: boolean;
  onCountChange: (count: number) => void;
}

export function PasskeysCard({ required, appEnabled, onCountChange }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const supported = passkeysSupported();
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [working, setWorking] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    listPasskeys()
      .then(setPasskeys)
      .catch((err) => { setPasskeys([]); toast.error(passkeyError(err, 'Failed to load passkeys') ?? 'Failed to load passkeys'); });
  }, []);

  function update(list: Passkey[]) {
    setPasskeys(list);
    onCountChange(list.length);
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setWorking(true);
    try {
      const passkey = await addPasskey(password, name.trim() || undefined);
      update([...(passkeys ?? []), passkey]);
      setAdding(false);
      setPassword('');
      setName('');
      toast.success('Passkey added. You can now use it to sign in.');
    } catch (err) {
      const message = passkeyError(err, 'Could not add the passkey');
      if (message) toast.error(message);
    } finally {
      setWorking(false);
    }
  }

  async function handleRename(e: FormEvent, passkey: Passkey) {
    e.preventDefault();
    const next = renameValue.trim();
    if (!next || next === passkey.name) { setRenamingId(null); return; }
    setWorking(true);
    try {
      const updated = await renamePasskey(passkey.id, next);
      update((passkeys ?? []).map((p) => (p.id === passkey.id ? updated : p)));
      setRenamingId(null);
    } catch (err) {
      toast.error(passkeyError(err, 'Could not rename the passkey') ?? 'Could not rename the passkey');
    } finally {
      setWorking(false);
    }
  }

  async function handleRemove(passkey: Passkey) {
    const last = (passkeys?.length ?? 0) === 1;
    const lockoutNote = last && required && !appEnabled
      ? ' Your role requires two-step sign-in, so you’ll be asked to set it up again next time you sign in.'
      : '';
    if (!(await confirm({
      title: `Remove “${passkey.name}”?`,
      message: `It will no longer sign you in. The passkey itself stays on the device until you delete it there.${lockoutNote}`,
      confirmLabel: 'Remove passkey',
      danger: true,
    }))) return;
    setWorking(true);
    try {
      await removePasskey(passkey.id);
      update((passkeys ?? []).filter((p) => p.id !== passkey.id));
      toast.success('Passkey removed.');
    } catch (err) {
      toast.error(passkeyError(err, 'Could not remove the passkey') ?? 'Could not remove the passkey');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Passkeys</h3>
      <p className={styles.mfaDesc}>
        Sign in without a password using your fingerprint, face, screen lock or a security key. A passkey also
        counts as your second step when you sign in with a password.
      </p>

      {passkeys === null ? (
        <p className={styles.mfaDesc}>Loading…</p>
      ) : passkeys.length > 0 && (
        <ul className={styles.passkeyList}>
          {passkeys.map((p) => (
            <li key={p.id} className={styles.passkeyItem}>
              <FontAwesomeIcon icon={faFingerprint} className={styles.passkeyIcon} />
              <div className={styles.passkeyBody}>
                {renamingId === p.id ? (
                  <form onSubmit={(e) => handleRename(e, p)} className={styles.passkeyRename}>
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      maxLength={100}
                      autoFocus
                      disabled={working}
                      aria-label="Passkey name"
                      onKeyDown={(e) => { if (e.key === 'Escape') setRenamingId(null); }}
                    />
                    <button type="submit" className={styles.saveBtn} disabled={working || !renameValue.trim()}>Save</button>
                  </form>
                ) : (
                  <span className={styles.passkeyName}>
                    {p.name}
                    {p.backedUp && <span className={styles.passkeyChip} title="Synced across your devices by your password manager or platform">Synced</span>}
                  </span>
                )}
                <span className={styles.passkeyMeta}>
                  Added {formatDate(p.createdAt)} · {p.lastUsedAt ? `Last used ${formatDate(p.lastUsedAt)}` : 'Never used'}
                </span>
              </div>
              {renamingId !== p.id && (
                <div className={styles.passkeyActions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => { setRenamingId(p.id); setRenameValue(p.name); }}
                    disabled={working}
                    title="Rename"
                    aria-label={`Rename ${p.name}`}
                  >
                    <FontAwesomeIcon icon={faPen} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                    onClick={() => handleRemove(p)}
                    disabled={working}
                    title="Remove"
                    aria-label={`Remove ${p.name}`}
                  >
                    <FontAwesomeIcon icon={faTrashCan} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!supported ? (
        <p className={styles.mfaDesc}>This browser can’t create passkeys. Try a recent version of Chrome, Safari, Edge or Firefox.</p>
      ) : adding ? (
        <form onSubmit={handleAdd} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="passkey-password">Confirm your password</label>
            <input
              id="passkey-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={working}
              autoFocus
              autoComplete="current-password"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="passkey-name">Name (optional)</label>
            <input
              id="passkey-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="e.g. Work laptop, YubiKey"
              disabled={working}
            />
          </div>
          <div className={styles.buttonRow}>
            <button type="button" className={styles.dangerBtn} onClick={() => setAdding(false)} disabled={working}>
              Cancel
            </button>
            <button type="submit" className={styles.saveBtn} disabled={working || !password}>
              {working ? 'Waiting for passkey…' : 'Continue'}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className={styles.saveBtn} onClick={() => setAdding(true)} disabled={working || passkeys === null}>
          Add a passkey
        </button>
      )}
    </div>
  );
}
