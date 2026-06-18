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
import postsStyles from './Posts.module.css';
import styles from './Comments.module.css';

const PAGE_SIZE = 20;

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'spam', label: 'Spam' },
  { value: 'trash', label: 'Trash' },
];

const STATUS_LABELS: Record<string, string> = {
  approved: 'Approved',
  pending: 'Pending',
  spam: 'Spam',
  trash: 'Trash',
};

function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback
  );
}

function truncate(text: string, maxLen: number = 100): string {
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
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
      <div className={postsStyles.header}>
        <h2 className={postsStyles.title}>Comments</h2>
      </div>

      <div className={postsStyles.tabs}>
        {STATUS_TABS.map((tab) => {
          const count = tab.value === '' ? allCount : statusCounts[tab.value] || 0;
          return (
            <button
              key={tab.value}
              type="button"
              className={status === tab.value ? postsStyles.tabActive : postsStyles.tab}
              onClick={() => { setPage(1); setStatus(tab.value); }}
            >
              {tab.label} <span className={postsStyles.tabCount}>({count})</span>
            </button>
          );
        })}
      </div>

      <div className={postsStyles.toolbar}>
        <div className={postsStyles.filters}>
          <div className={postsStyles.filter}>
            <label>Search</label>
            <input
              type="text"
              placeholder="Search comments, authors, emails..."
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            />
          </div>
        </div>
      </div>

      <div className={postsStyles.tableWrapper}>
        <table>
          <thead>
            <tr>
              <th>Author</th>
              <th>Content</th>
              <th>On</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((comment) => (
              <tr key={comment.id}>
                <td>
                  <div>
                    <strong>{comment.authorName}</strong>
                    {comment.authorEmail && (
                      <div className={styles.itemEmail}>{comment.authorEmail}</div>
                    )}
                  </div>
                </td>
                <td>
                  <div>{truncate(comment.content)}</div>
                  {comment.parent && (
                    <div className={styles.itemMeta}>
                      <FontAwesomeIcon icon={faReply} /> reply to {comment.parent.authorName}
                    </div>
                  )}
                </td>
                <td className={styles.date}>{comment.post.title}</td>
                <td className={styles.date}>{new Date(comment.createdAt).toLocaleString()}</td>
                <td>
                  <span className={`${postsStyles.statusBadge} ${styles[`status_${comment.status}`] || ''}`}>
                    {STATUS_LABELS[comment.status] || comment.status}
                  </span>
                </td>
                <td className={postsStyles.actions}>
                  {canModerate ? (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {comment.status !== 'approved' && (
                        <button className={styles.approveButton} onClick={() => changeStatus(comment, 'approved')}>
                          Approve
                        </button>
                      )}
                      {comment.status === 'approved' && (
                        <button onClick={() => changeStatus(comment, 'pending')}>
                          Unapprove
                        </button>
                      )}
                      {comment.status !== 'spam' && (
                        <button onClick={() => changeStatus(comment, 'spam')}>
                          Spam
                        </button>
                      )}
                      {comment.status !== 'trash' ? (
                        <button onClick={() => changeStatus(comment, 'trash')}>
                          Trash
                        </button>
                      ) : (
                        <button className={styles.deleteButton} onClick={() => handleDelete(comment)}>
                          Delete
                        </button>
                      )}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && items.length === 0 && (
          <div className={postsStyles.empty}>No comments found.</div>
        )}
      </div>

      <div className={postsStyles.pagination}>
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
