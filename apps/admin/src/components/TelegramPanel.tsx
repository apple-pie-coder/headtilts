import { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare, faCheck, faTriangleExclamation, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { AxiosError } from 'axios';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialog';
import { relativeTime } from './ui';
import { resolveMediaUrl } from '../services/media';
import { fetchTelegramStatus, postToTelegram, TelegramItemKind, TelegramItemStatus } from '../services/telegram';
import styles from './TelegramPanel.module.css';

export type TelegramChoice = 'default' | 'yes' | 'no';

export const toTelegramChoice = (v: string | null | undefined): TelegramChoice => (v === 'yes' || v === 'no' ? v : 'default');
export const fromTelegramChoice = (v: TelegramChoice): string | null => (v === 'default' ? null : v);

const NOUN: Record<TelegramItemKind, string> = { post: 'post', event: 'event', poll: 'poll' };
const WHEN: Record<TelegramItemKind, string> = { post: 'published', event: 'published', poll: 'opened' };

/**
 * The Telegram box in the post, event and poll editors: whether this item goes
 * to the channel, what happened when it did, a preview, and Post now.
 * `refreshKey` changes after each save so the status and preview catch up.
 */
export function TelegramPanel({ kind, id, value, onChange, liveUpdates, refreshKey, disabled }: {
  kind: TelegramItemKind;
  id?: number;
  value: TelegramChoice;
  onChange: (v: TelegramChoice) => void;
  /** Live blogs only: whether updates follow as replies. */
  liveUpdates?: { value: boolean; onChange: (v: boolean) => void };
  refreshKey?: unknown;
  disabled?: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<TelegramItemStatus | null>(null);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!id) { setStatus(null); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let checks = 0;
    const load = () => fetchTelegramStatus(kind, id).then((s) => {
      if (cancelled) return;
      setStatus(s);
      // Sending runs in the background after a save: look again shortly while it's on its way.
      const onItsWay = s.delivery?.status === 'pending'
        || (!s.delivery && s.live && s.allowed && s.configured && s.enabled);
      if (onItsWay && ++checks < 5) timer = setTimeout(load, 3000);
    }).catch(() => {});
    load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [kind, id, refreshKey]);

  async function post(again: boolean) {
    if (!id) return;
    if (again && !(await confirm({
      title: 'Post to Telegram again?',
      message: `This ${NOUN[kind]} is already in the channel. Posting again adds a second message; the first one stays.`,
      confirmLabel: 'Post again',
    }))) return;
    setSending(true);
    try {
      const next = await postToTelegram(kind, id, again);
      setStatus(next);
      if (next.delivery?.status === 'sent') toast.success('Posted to Telegram');
      else toast.error(next.delivery?.error || 'Telegram didn’t take the message');
    } catch (err) {
      toast.error((err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || 'Couldn’t post to Telegram');
    } finally {
      setSending(false);
    }
  }

  const delivery = status?.delivery;
  const notReady = status && (!status.configured || !status.enabled);

  return (
    <div className={styles.panel}>
      {notReady && (
        <p className={styles.notice}>
          {!status.configured ? 'Telegram isn’t set up yet. ' : 'Telegram posting is turned off. '}
          <Link to="/admin/settings?tab=telegram">Settings → Telegram</Link>
        </p>
      )}

      <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value as TelegramChoice)} disabled={disabled} aria-label="Post to Telegram">
        <option value="default">Use site setting</option>
        <option value="yes">Always post</option>
        <option value="no">Don’t post</option>
      </select>
      <p className={styles.hint}>
        {value === 'no'
          ? `Won’t be posted to the channel.`
          : value === 'yes'
            ? `Posted to the channel when first ${WHEN[kind]}.`
            : status && !status.allowed && status.reason
              ? `${status.reason} in Settings → Telegram.`
              : `Posted to the channel when first ${WHEN[kind]}, if Settings → Telegram has this type on.`}
      </p>

      {liveUpdates && (
        <label className={styles.check}>
          <input type="checkbox" checked={liveUpdates.value} onChange={(e) => liveUpdates.onChange(e.target.checked)} disabled={disabled} />
          <span>
            Send live updates as replies
            {status?.liveUpdates && (status.liveUpdates.sent > 0 || status.liveUpdates.failed > 0) && (
              <span className={styles.muted}>
                {' '}· {status.liveUpdates.sent} sent{status.liveUpdates.failed ? `, ${status.liveUpdates.failed} failed` : ''}
              </span>
            )}
            {status?.liveUpdates && !status.liveUpdates.enabled && <span className={styles.muted}> · off in Settings</span>}
          </span>
        </label>
      )}

      {!id ? (
        <p className={styles.muted}>Save to see the preview.</p>
      ) : status && (
        <>
          {delivery?.status === 'sent' ? (
            <p className={styles.sent}>
              <FontAwesomeIcon icon={faCheck} /> Posted {relativeTime(delivery.sentAt)}
              {delivery.messageUrl && (
                <> · <a href={delivery.messageUrl} target="_blank" rel="noreferrer">View message <FontAwesomeIcon icon={faArrowUpRightFromSquare} /></a></>
              )}
            </p>
          ) : delivery?.status === 'failed' ? (
            <p className={styles.failed}>
              <FontAwesomeIcon icon={faTriangleExclamation} /> Not posted: {delivery.error}
              {delivery.retryAt && <span className={styles.muted}> Trying again {relativeTime(delivery.retryAt)}.</span>}
            </p>
          ) : delivery?.status === 'pending' ? (
            <p className={styles.muted}>Posting…</p>
          ) : (
            <p className={styles.muted}>Not in the channel yet.</p>
          )}

          <div className={styles.actions}>
            {status.configured && status.enabled && status.live && (
              <button type="button" className={styles.button} disabled={sending || disabled || delivery?.status === 'pending'}
                onClick={() => post(delivery?.status === 'sent')}>
                <FontAwesomeIcon icon={faPaperPlane} />
                {sending ? 'Posting…' : delivery?.status === 'sent' ? 'Post again' : delivery?.status === 'failed' ? 'Try again' : 'Post now'}
              </button>
            )}
            <button type="button" className={styles.linkButton} onClick={() => setShowPreview((v) => !v)} aria-expanded={showPreview}>
              {showPreview ? 'Hide preview' : 'Preview'}
            </button>
          </div>

          {showPreview && (
            <div className={styles.preview} aria-label="Telegram message preview">
              <div className={styles.bubble}>
                {status.preview.image && <img className={styles.image} src={resolveMediaUrl(status.preview.image)} alt="" />}
                <div className={styles.text}>{renderTelegramHtml(status.preview.html)}</div>
              </div>
              {status.preview.buttons.map((row, i) => (
                <div key={i} className={styles.buttonRow}>
                  {row.map((b) => <span key={b.url + b.text} className={styles.tgButton}>{b.text}</span>)}
                </div>
              ))}
              <p className={styles.muted}>As last saved{!status.live ? `; it goes out once ${WHEN[kind]}` : ''}.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const TAGS = new Set(['b', 'i', 'u', 's', 'code', 'pre', 'blockquote', 'a']);
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"' };

/**
 * The server's Telegram HTML as React elements. It only ever holds Telegram's
 * few formatting tags around escaped text; anything else is shown as text.
 */
function renderTelegramHtml(html: string): ReactNode[] {
  const root: { tag: string; href?: string; children: ReactNode[] } = { tag: '', children: [] };
  const stack = [root];
  let key = 0;
  const re = /<(\/?)([a-z]+)(?:\s+href="([^"]*)")?>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [whole, closing, tag, href, text] = m;
    const top = stack[stack.length - 1];
    if (text !== undefined || !tag || !TAGS.has(tag)) {
      top.children.push((text ?? whole).replace(/&(amp|lt|gt|quot);/g, (_e, n: string) => ENTITIES[n]));
    } else if (closing) {
      if (top.tag === tag && stack.length > 1) {
        stack.pop();
        const node = top;
        const k = key++;
        const el = node.tag === 'a'
          ? <a key={k} href={node.href} target="_blank" rel="noreferrer">{node.children}</a>
          : node.tag === 'blockquote' ? <blockquote key={k}>{node.children}</blockquote>
          : node.tag === 'pre' ? <pre key={k}>{node.children}</pre>
          : node.tag === 'code' ? <code key={k}>{node.children}</code>
          : node.tag === 'b' ? <strong key={k}>{node.children}</strong>
          : node.tag === 'i' ? <em key={k}>{node.children}</em>
          : node.tag === 'u' ? <u key={k}>{node.children}</u>
          : <s key={k}>{node.children}</s>;
        stack[stack.length - 1].children.push(el);
      }
    } else {
      const safeHref = href && /^https?:\/\//i.test(href) ? href.replace(/&amp;/g, '&').replace(/&quot;/g, '"') : undefined;
      stack.push({ tag, href: safeHref, children: [] });
    }
  }
  // Unclosed tags (never expected from the server): keep their text.
  while (stack.length > 1) {
    const node = stack.pop()!;
    stack[stack.length - 1].children.push(...node.children);
  }
  return root.children;
}
