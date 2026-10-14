import { useCallback, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faReply, faEnvelope, faEnvelopeOpen, faTrashCan, faCopy, faInbox, faArrowLeft, faCheckDouble,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import {
  Button, Card, EmptyState, Kbd, LoadingBar, PageHeader, Pagination, Tabs, absoluteTime, relativeTime,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useHotkeys } from '../hooks/useHotkeys';
import { useUrlState } from '../hooks/useUrlState';
import { refreshNavBadges } from '../hooks/useNavBadges';
import { ContactSubmission } from '../types';
import { deleteSubmission, fetchSubmissions, markSubmissionRead } from '../services/contact';
import styles from './ContactSubmissions.module.css';

function errorMessage(err: unknown, fallback: string): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

function replyHref(s: ContactSubmission): string {
  const subject = encodeURIComponent(`Re: ${s.subject || 'Your message'}`);
  // Keep mailto URLs well under client length limits.
  const text = s.message.length > 1200 ? `${s.message.slice(0, 1200)}…` : s.message;
  const quoted = text.split('\n').map((l) => `> ${l}`).join('\n');
  const body = encodeURIComponent(`\n\n\nOn ${new Date(s.createdAt).toLocaleString()}, ${s.name} wrote:\n${quoted}`);
  return `mailto:${s.email}?subject=${subject}&body=${body}`;
}

export default function ContactSubmissionsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(PERMISSIONS.CONTACT_MANAGE);

  const [q, setQ] = useUrlState({ view: '', page: '1', id: '' });
  const page = Math.max(1, Number(q.page) || 1);
  const PAGE_SIZE = 25;

  const [items, setItems] = useState<ContactSubmission[]>([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const reqId = useRef(0);

  const openId = q.id ? Number(q.id) : null;
  const open = items.find((s) => s.id === openId) ?? null;

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const result = await fetchSubmissions(page, PAGE_SIZE, q.view === 'unread');
      if (id !== reqId.current) return;
      setItems(result.items);
      setUnread(result.unread);
      setTotal(result.pagination.total);
      setLoaded(true);
    } catch (err) {
      if (id === reqId.current) toast.error(errorMessage(err, 'Failed to load messages'));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [page, q.view]);

  useEffect(() => { load(); }, [load]);

  async function setRead(s: ContactSubmission, isRead: boolean, quiet = false) {
    if (!canManage || s.isRead === isRead) return;
    setItems((prev) => prev.map((x) => (x.id === s.id ? { ...x, isRead } : x)));
    setUnread((u) => Math.max(0, u + (isRead ? -1 : 1)));
    try {
      await markSubmissionRead(s.id, isRead);
      if (!quiet) toast.success(isRead ? 'Marked as read' : 'Marked as unread');
      refreshNavBadges();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update message'));
      load();
    }
  }

  function select(s: ContactSubmission | null) {
    setQ({ id: s ? String(s.id) : '', page: q.page });
    if (s && !s.isRead) setRead(s, true, true);
  }

  async function markAllRead() {
    const targets = items.filter((s) => !s.isRead);
    if (targets.length === 0) return;
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    try {
      await Promise.all(targets.map((s) => markSubmissionRead(s.id, true)));
      toast.success(`Marked ${targets.length} message${targets.length === 1 ? '' : 's'} as read`);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update messages'));
    }
    load();
    refreshNavBadges();
  }

  async function remove(s: ContactSubmission) {
    if (!(await confirm({
      title: 'Delete message?',
      message: `The message from ${s.name} will be deleted permanently.`,
      confirmLabel: 'Delete',
      danger: true,
    }))) return;
    const idx = items.findIndex((x) => x.id === s.id);
    try {
      await deleteSubmission(s.id);
      toast.success('Message deleted');
      // Move the reading pane to the next message, like a mail client.
      const next = items[idx + 1] ?? items[idx - 1] ?? null;
      setQ({ id: next ? String(next.id) : '', page: q.page });
      load();
      refreshNavBadges();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete message'));
    }
  }

  const idx = open ? items.indexOf(open) : -1;
  useHotkeys({
    j: () => { const n = items[idx + 1]; if (n) select(n); },
    k: () => { const p = items[idx - 1]; if (p) select(p); },
    r: () => { if (open) window.location.href = replyHref(open); },
    u: () => { if (open) setRead(open, !open.isRead); },
    '#': () => { if (open && canManage) remove(open); },
    Escape: () => { if (open) select(null); },
  });

  return (
    <AdminLayout>
      <PageHeader
        title="Contact messages"
        subtitle={loaded ? (unread ? `${unread} unread` : 'Inbox zero — everything has been read') : ' '}
        actions={canManage && unread > 0 && (
          <Button icon={faCheckDouble} onClick={markAllRead}>Mark page as read</Button>
        )}
      />

      <Tabs
        tabs={[
          { key: '', label: 'All' },
          { key: 'unread', label: 'Unread', count: unread, highlight: true },
        ]}
        value={q.view}
        onChange={(view) => setQ({ view, id: '' })}
      />

      <Card className={styles.inbox}>
        <LoadingBar active={loading && loaded} />
        <div className={`${styles.panes} ${open ? styles.reading : ''}`}>
          <ul className={styles.list} aria-label="Messages">
            {!loaded && Array.from({ length: 6 }, (_, i) => <li key={i} className={styles.skeleton} />)}
            {items.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={[styles.row, !s.isRead && styles.unread, s.id === openId && styles.active].filter(Boolean).join(' ')}
                  onClick={() => select(s)}
                  aria-current={s.id === openId ? 'true' : undefined}
                >
                  <span className={styles.rowTop}>
                    {!s.isRead && <span className={styles.dot} aria-label="Unread" />}
                    <span className={styles.from}>{s.name}</span>
                    <time className={styles.when} title={absoluteTime(s.createdAt)}>{relativeTime(s.createdAt)}</time>
                  </span>
                  <span className={styles.subject}>{s.subject || '(no subject)'}</span>
                  <span className={styles.snippet}>{s.message}</span>
                </button>
              </li>
            ))}
            {loaded && items.length === 0 && (
              <li>
                <EmptyState
                  icon={faInbox}
                  title={q.view === 'unread' ? 'No unread messages' : 'No messages yet'}
                  description={q.view === 'unread' ? undefined : 'Submissions from your contact form will arrive here.'}
                />
              </li>
            )}
          </ul>

          <section className={styles.pane} aria-label="Message">
            {open ? (
              <>
                <div className={styles.paneBar}>
                  <button type="button" className={styles.back} onClick={() => select(null)}>
                    <FontAwesomeIcon icon={faArrowLeft} /> Inbox
                  </button>
                  <div className={styles.paneActions}>
                    <a className={styles.primaryAct} href={replyHref(open)}>
                      <FontAwesomeIcon icon={faReply} /> Reply
                    </a>
                    <button type="button" className={styles.act} title="Copy email address"
                      onClick={() => navigator.clipboard.writeText(open.email).then(() => toast.success('Email copied'), () => toast.error('Could not copy'))}>
                      <FontAwesomeIcon icon={faCopy} />
                    </button>
                    {canManage && (
                      <button type="button" className={styles.act} title={open.isRead ? 'Mark as unread (U)' : 'Mark as read (U)'} onClick={() => setRead(open, !open.isRead)}>
                        <FontAwesomeIcon icon={open.isRead ? faEnvelope : faEnvelopeOpen} />
                      </button>
                    )}
                    {canManage && (
                      <button type="button" className={`${styles.act} ${styles.danger}`} title="Delete (#)" onClick={() => remove(open)}>
                        <FontAwesomeIcon icon={faTrashCan} />
                      </button>
                    )}
                  </div>
                </div>
                <h2 className={styles.paneSubject}>{open.subject || '(no subject)'}</h2>
                <div className={styles.paneFrom}>
                  <strong>{open.name}</strong> <a href={`mailto:${open.email}`}>&lt;{open.email}&gt;</a>
                  <span className={styles.paneDate}>{absoluteTime(open.createdAt)}</span>
                </div>
                <p className={styles.paneBody}>{open.message}</p>
              </>
            ) : (
              <div className={styles.paneEmpty}>
                <FontAwesomeIcon icon={faEnvelopeOpen} />
                <p>Select a message to read it</p>
                {items.length > 0 && <span><Kbd>J</Kbd> <Kbd>K</Kbd> to move · <Kbd>R</Kbd> reply · <Kbd>U</Kbd> unread</span>}
              </div>
            )}
          </section>
        </div>
      </Card>

      {loaded && total > PAGE_SIZE && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={(p) => setQ({ page: String(p), id: '' })} />
      )}
    </AdminLayout>
  );
}
