import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDesktop, faMobileScreen, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { EmailPreview, fetchEmailPreviews, sendEmailPreview } from '../services/settings';
import { useToast } from './ToastContext';
import styles from './EmailPreviews.module.css';

const GROUPS: EmailPreview['group'][] = ['Readers', 'Your team', 'Notifications'];

/**
 * Settings → Email: every email the site sends, rendered with sample data by
 * the same code that sends the real ones. Shown in a sandboxed frame (no
 * scripts); links open in a new tab.
 */
export function EmailPreviews() {
  const toast = useToast();
  const [previews, setPreviews] = useState<EmailPreview[] | null>(null);
  const [error, setError] = useState('');
  const [currentId, setCurrentId] = useState('');
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchEmailPreviews()
      .then((list) => { setPreviews(list); setCurrentId(list[0]?.id ?? ''); })
      .catch(() => setError('Couldn’t load the email previews.'));
  }, []);

  const current = previews?.find((p) => p.id === currentId) ?? null;
  const srcDoc = useMemo(() => current?.html.replace('<head>', '<head><base target="_blank">') ?? '', [current]);

  async function send() {
    if (!current) return;
    setSending(true);
    try {
      const { to } = await sendEmailPreview(current.id);
      toast.success(`Sent “${current.name}” to ${to}`);
    } catch (e) {
      const message = (e as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      toast.error(message || 'Sending failed. Check the settings above and try “Send test email”.');
    } finally {
      setSending(false);
    }
  }

  if (error) return <p className={styles.error}>{error}</p>;
  if (!previews) return <p className={styles.loading}>Loading previews…</p>;

  return (
    <div className={styles.layout}>
      <nav className={styles.list} aria-label="Emails">
        {GROUPS.map((group) => (
          <div key={group} className={styles.group}>
            <span className={styles.groupLabel}>{group}</span>
            {previews.filter((p) => p.group === group).map((p) => (
              <button
                key={p.id}
                type="button"
                className={p.id === currentId ? styles.itemActive : styles.item}
                aria-current={p.id === currentId ? 'true' : undefined}
                onClick={() => setCurrentId(p.id)}
              >
                <span className={styles.itemName}>{p.name}</span>
                <span className={styles.itemTo}>{p.to}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      {current && (
        <div className={styles.viewer}>
          <div className={styles.meta}>
            <p className={styles.subject}>{current.subject}</p>
            <p className={styles.when}><strong>Sent when:</strong> {current.when}</p>
          </div>
          <div className={styles.toolbar}>
            <div className={styles.segmented} role="radiogroup" aria-label="Preview size">
              <button type="button" role="radio" aria-checked={device === 'desktop'} className={device === 'desktop' ? styles.segOn : styles.seg} onClick={() => setDevice('desktop')}>
                <FontAwesomeIcon icon={faDesktop} /> Desktop
              </button>
              <button type="button" role="radio" aria-checked={device === 'phone'} className={device === 'phone' ? styles.segOn : styles.seg} onClick={() => setDevice('phone')}>
                <FontAwesomeIcon icon={faMobileScreen} /> Phone
              </button>
            </div>
            <button type="button" className={styles.send} onClick={send} disabled={sending} title="Sends this sample to your own email address">
              <FontAwesomeIcon icon={faPaperPlane} /> {sending ? 'Sending…' : 'Send me this'}
            </button>
          </div>
          <div className={styles.stage}>
            <iframe
              key={current.id}
              title={`Preview: ${current.name}`}
              className={device === 'phone' ? styles.framePhone : styles.frame}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              srcDoc={srcDoc}
            />
          </div>
        </div>
      )}
    </div>
  );
}
