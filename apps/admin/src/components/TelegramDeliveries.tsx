import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { AxiosError } from 'axios';
import { useToast } from './ToastContext';
import { relativeTime } from './ui';
import { fetchTelegramDeliveries, retryTelegramDelivery, TelegramDelivery } from '../services/telegram';
import styles from './TelegramDeliveries.module.css';

const KIND: Record<TelegramDelivery['kind'], string> = {
  post: 'Post', event: 'Event', poll: 'Poll', live_update: 'Live update', live_end: 'Coverage ended',
};

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'failed', label: 'Failed' },
];

/** Settings → Telegram: the messages sent to the channel, newest first. */
export function TelegramDeliveries() {
  const toast = useToast();
  const [items, setItems] = useState<TelegramDelivery[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<number | null>(null);

  async function load(p = page, s = status) {
    setLoading(true);
    try {
      const data = await fetchTelegramDeliveries(p, 15, s || undefined);
      setItems(data.items);
      setPages(Math.max(1, data.pagination.pages));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(page, status); }, [page, status]);

  async function retry(row: TelegramDelivery) {
    setRetrying(row.id);
    try {
      const next = await retryTelegramDelivery(row.id);
      setItems((prev) => prev.map((r) => (r.id === row.id ? next : r)));
      if (next.status === 'sent') toast.success('Posted to Telegram');
      else toast.error(next.error || 'Telegram didn’t take the message');
    } catch (err) {
      toast.error((err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || 'Couldn’t retry');
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.filters} role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" className={status === f.value ? styles.filterActive : styles.filter}
            aria-pressed={status === f.value} onClick={() => { setStatus(f.value); setPage(1); }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && !items.length ? (
        <p className={styles.empty}>Loading…</p>
      ) : !items.length ? (
        <p className={styles.empty}>{status ? 'Nothing here.' : 'Nothing has been posted yet.'}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((row) => (
            <li key={row.id} className={styles.row}>
              <span className={`${styles.badge} ${styles[row.status]}`}>{row.status === 'sent' ? 'Sent' : row.status === 'failed' ? 'Failed' : 'Sending'}</span>
              <div className={styles.body}>
                <span className={styles.title}>
                  {row.adminUrl ? <Link to={row.adminUrl}>{row.title}</Link> : row.title}
                </span>
                <span className={styles.meta}>
                  {KIND[row.kind]} · {relativeTime(row.sentAt ?? row.createdAt)}
                  {row.attempts > 1 && ` · ${row.attempts} attempts`}
                  {row.status === 'failed' && row.retryAt && ` · trying again ${relativeTime(row.retryAt)}`}
                </span>
                {row.status === 'failed' && row.error && <span className={styles.error}>{row.error}</span>}
              </div>
              <div className={styles.actions}>
                {row.messageUrl && (
                  <a href={row.messageUrl} target="_blank" rel="noreferrer" className={styles.link}>
                    View <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                  </a>
                )}
                {row.status === 'failed' && (
                  <button type="button" className={styles.retry} disabled={retrying === row.id} onClick={() => retry(row)}>
                    {retrying === row.id ? 'Retrying…' : 'Retry'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className={styles.pager}>
          <button type="button" className={styles.filter} disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</button>
          <span className={styles.meta}>Page {page} of {pages}</span>
          <button type="button" className={styles.filter} disabled={page >= pages} onClick={() => setPage(page + 1)}>Older</button>
        </div>
      )}
    </div>
  );
}
