import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { ContactSubmission } from '../types';
import { deleteSubmission, fetchSubmissions, markSubmissionRead } from '../services/contact';
import styles from './ContactSubmissions.module.css';

const PAGE_SIZE = 20;

function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback
  );
}

export default function ContactSubmissionsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState<ContactSubmission[]>([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [page, unreadOnly]);

  async function load() {
    setLoading(true);
    try {
      const result = await fetchSubmissions(page, PAGE_SIZE, unreadOnly);
      setItems(result.items);
      setUnread(result.unread);
      setTotal(result.pagination.total);
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to load submissions'));
    } finally {
      setLoading(false);
    }
  }

  async function handleOpen(submission: ContactSubmission) {
    const opening = openId !== submission.id;
    setOpenId(opening ? submission.id : null);
    if (opening && !submission.isRead) {
      try {
        await markSubmissionRead(submission.id, true);
        setItems((prev) => prev.map((s) => (s.id === submission.id ? { ...s, isRead: true } : s)));
        setUnread((u) => Math.max(0, u - 1));
      } catch {
        // non-fatal — leave as unread
      }
    }
  }

  async function handleToggleRead(submission: ContactSubmission) {
    try {
      const updated = await markSubmissionRead(submission.id, !submission.isRead);
      setItems((prev) => prev.map((s) => (s.id === submission.id ? updated : s)));
      setUnread((u) => (updated.isRead ? Math.max(0, u - 1) : u + 1));
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to update submission'));
    }
  }

  async function handleDelete(submission: ContactSubmission) {
    if (!(await confirm({ title: 'Delete Submission', message: `Delete the message from "${submission.name}"? This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) {
      return;
    }
    try {
      await deleteSubmission(submission.id);
      if (openId === submission.id) setOpenId(null);
      await load();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to delete submission'));
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminLayout>
      <div className={styles.header}>
        <h2 className={styles.title}>
          Contact Submissions
          {unread > 0 && <span className={styles.unreadBadge}>{unread} unread</span>}
        </h2>
        <label className={styles.filterToggle}>
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => {
              setPage(1);
              setUnreadOnly(e.target.checked);
            }}
          />
          {' '}Unread only
        </label>
      </div>

      {loading ? (
        <div className={styles.empty}>Loading…</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>No submissions{unreadOnly ? ' (unread)' : ''} yet.</div>
      ) : (
        <div className={styles.list}>
          {items.map((submission) => (
            <div
              key={submission.id}
              className={`${styles.item}${submission.isRead ? '' : ` ${styles.itemUnread}`}`}
            >
              <button type="button" className={styles.itemHeader} onClick={() => handleOpen(submission)}>
                <span className={styles.itemFrom}>
                  {!submission.isRead && <span className={styles.dot} aria-label="Unread" />}
                  <strong>{submission.name}</strong>
                  <span className={styles.itemEmail}>{submission.email}</span>
                </span>
                <span className={styles.itemSubject}>{submission.subject || '(no subject)'}</span>
                <span className={styles.itemDate}>
                  {new Date(submission.createdAt).toLocaleString()}
                </span>
              </button>

              {openId === submission.id && (
                <div className={styles.itemBody}>
                  <p className={styles.message}>{submission.message}</p>
                  <div className={styles.itemActions}>
                    <a href={`mailto:${submission.email}`} className={styles.replyButton}>
                      Reply via email
                    </a>
                    <button type="button" onClick={() => handleToggleRead(submission)}>
                      Mark as {submission.isRead ? 'unread' : 'read'}
                    </button>
                    <button
                      type="button"
                      className={styles.deleteButton}
                      onClick={() => handleDelete(submission)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={styles.pagination}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          Previous
        </button>
        <span>Page {page} of {pages}</span>
        <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>
          Next
        </button>
      </div>
    </AdminLayout>
  );
}
