import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faReply } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../hooks/useAuth';
import { AdminComment } from '../types';
import { deleteComment, fetchComments, setCommentStatus } from '../services/comments';
import styles from './Comments.module.css';

const PAGE_SIZE = 20;

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'spam', label: 'Spam' },
  { value: 'trash', label: 'Trash' },
];

function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback
  );
}

export default function CommentsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canModerate = hasPermission(PERMISSIONS.COMMENT_MODERATE);

  const [items, setItems] = useState<AdminComment[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [page, status, search]);

  async function load() {
    setLoading(true);
    try {
      const result = await fetchComments(page, PAGE_SIZE, { status, search });
      setItems(result.items);
      setStatusCounts(result.statusCounts);
      setTotal(result.pagination.total);
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to load comments'));
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(comment: AdminComment, newStatus: string) {
    try {
      await setCommentStatus(comment.id, newStatus);
      await load();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to update comment'));
    }
  }

  async function handleDelete(comment: AdminComment) {
    if (!(await confirm({ title: 'Delete Comment', message: `Permanently delete this comment by "${comment.authorName}"? Replies to it will also be removed.`, confirmLabel: 'Delete Permanently', danger: true }))) {
      return;
    }
    try {
      await deleteComment(comment.id);
      await load();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to delete comment'));
    }
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  return (
    <AdminLayout>
      <div className={styles.header}>
        <h2 className={styles.title}>Comments</h2>
        <div className={styles.search}>
          <input
            type="text"
            placeholder="Search comments..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>
      </div>

      <div className={styles.tabs}>
        {STATUS_TABS.map((tab) => {
          const count = tab.value === '' ? allCount : statusCounts[tab.value] || 0;
          return (
            <button
              key={tab.value}
              type="button"
              className={status === tab.value ? styles.tabActive : styles.tab}
              onClick={() => {
                setPage(1);
                setStatus(tab.value);
              }}
            >
              {tab.label}
              <span className={styles.tabCount}>{count}</span>
            </button>
          );
        })}
      </div>


      {loading ? (
        <div className={styles.empty}>Loading…</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>No comments found.</div>
      ) : (
        <div className={styles.list}>
          {items.map((comment) => (
            <div key={comment.id} className={styles.item}>
              <div className={styles.itemTop}>
                <div className={styles.itemAuthor}>
                  <strong>{comment.authorName}</strong>
                  {comment.authorEmail && <span className={styles.itemEmail}>{comment.authorEmail}</span>}
                </div>
                <span className={`${styles.statusBadge} ${styles[`status_${comment.status}`] || ''}`}>
                  {comment.status}
                </span>
              </div>

              <p className={styles.itemContent}>{comment.content}</p>

              <div className={styles.itemMeta}>
                <span>On: <em>{comment.post.title}</em></span>
                {comment.parent && <span><FontAwesomeIcon icon={faReply} /> reply to {comment.parent.authorName}</span>}
                {comment._count.reactions > 0 && <span>{comment._count.reactions} reactions</span>}
                <span>{new Date(comment.createdAt).toLocaleString()}</span>
              </div>

              {canModerate && (
                <div className={styles.itemActions}>
                  {comment.status !== 'approved' && (
                    <button type="button" className={styles.approveButton} onClick={() => changeStatus(comment, 'approved')}>
                      Approve
                    </button>
                  )}
                  {comment.status === 'approved' && (
                    <button type="button" onClick={() => changeStatus(comment, 'pending')}>
                      Unapprove
                    </button>
                  )}
                  {comment.status !== 'spam' && (
                    <button type="button" onClick={() => changeStatus(comment, 'spam')}>
                      Spam
                    </button>
                  )}
                  {comment.status !== 'trash' ? (
                    <button type="button" onClick={() => changeStatus(comment, 'trash')}>
                      Trash
                    </button>
                  ) : (
                    <button type="button" className={styles.deleteButton} onClick={() => handleDelete(comment)}>
                      Delete Permanently
                    </button>
                  )}
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
