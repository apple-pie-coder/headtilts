import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faRotateLeft, faDownload, faSearch } from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmDialog';
import { fetchPolls, deletePoll, resetPollVotes, exportPollUrl, Poll } from '../services/polls';
import { PERMISSIONS } from '@headtilts/shared';
import { useAuth } from '../hooks/useAuth';
import styles from './Polls.module.css';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', open: 'Open', closed: 'Closed', scheduled: 'Scheduled',
};
const STATUS_COLORS: Record<string, string> = {
  draft: 'var(--t3)', open: 'var(--success)', closed: 'var(--danger)', scheduled: 'var(--accent)',
};

export default function PollsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const LIMIT = 20;

  async function load() {
    setLoading(true);
    try {
      const data = await fetchPolls(page, LIMIT, search || undefined, statusFilter || undefined);
      setPolls(data.items);
      setTotal(data.pagination.total);
    } catch { toast.error('Failed to load polls'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [page, search, statusFilter]);

  async function handleDelete(poll: Poll) {
    const ok = await confirm({ title: 'Delete poll', message: `Delete "${poll.title}"? This removes all votes too.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try { await deletePoll(poll.id); toast.success('Poll deleted'); load(); }
    catch { toast.error('Failed to delete poll'); }
  }

  async function handleReset(poll: Poll) {
    const ok = await confirm({ title: 'Reset votes', message: `Reset all ${poll._count.votes} vote(s) for "${poll.title}"?`, confirmLabel: 'Reset', danger: true });
    if (!ok) return;
    try { await resetPollVotes(poll.id); toast.success('Votes reset'); load(); }
    catch { toast.error('Failed to reset votes'); }
  }

  return (
    <AdminLayout>
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Polls</h1>
            <p className={styles.subtitle}>{total} poll{total !== 1 ? 's' : ''}</p>
          </div>
          {hasPermission(PERMISSIONS.POLL_CREATE) && (
            <Link to="/admin/polls/new" className={styles.createBtn}>
              <FontAwesomeIcon icon={faPlus} /> New Poll
            </Link>
          )}
        </div>

        <div className={styles.filters}>
          <div className={styles.searchWrap}>
            <FontAwesomeIcon icon={faSearch} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search polls…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select className={styles.filterSelect} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </div>

        {loading ? (
          <div className={styles.empty}>Loading…</div>
        ) : polls.length === 0 ? (
          <div className={styles.empty}>No polls found.</div>
        ) : (
          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Poll</span><span>Status</span><span>Votes</span><span>Mode</span><span>Actions</span>
            </div>
            {polls.map((poll) => (
              <div key={poll.id} className={styles.row}>
                <div className={styles.pollInfo}>
                  <Link to={`/admin/polls/${poll.id}/edit`} className={styles.pollTitle}>{poll.title}</Link>
                  <span className={styles.pollQuestion}>{poll.question}</span>
                </div>
                <div>
                  <span className={styles.statusBadge} style={{ color: STATUS_COLORS[poll.status] }}>
                    {STATUS_LABELS[poll.status] || poll.status}
                  </span>
                </div>
                <div className={styles.voteCount}>{poll._count.votes}</div>
                <div className={styles.modeTag}>{poll.voteMode === 'multiple' ? 'Multi' : 'Single'}</div>
                <div className={styles.actions}>
                  {hasPermission(PERMISSIONS.POLL_EDIT) && (
                    <Link to={`/admin/polls/${poll.id}/edit`} className={styles.actionBtn} title="Edit">
                      <FontAwesomeIcon icon={faEdit} />
                    </Link>
                  )}
                  {hasPermission(PERMISSIONS.POLL_RESET) && poll._count.votes > 0 && (
                    <button className={styles.actionBtn} title="Reset votes" onClick={() => handleReset(poll)}>
                      <FontAwesomeIcon icon={faRotateLeft} />
                    </button>
                  )}
                  <a href={exportPollUrl(poll.id)} download className={styles.actionBtn} title="Export CSV">
                    <FontAwesomeIcon icon={faDownload} />
                  </a>
                  {hasPermission(PERMISSIONS.POLL_DELETE) && (
                    <button className={`${styles.actionBtn} ${styles.danger}`} title="Delete" onClick={() => handleDelete(poll)}>
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {Math.ceil(total / LIMIT) > 1 && (
          <div className={styles.pagination}>
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className={styles.pageBtn}>← Prev</button>
            <span className={styles.pageInfo}>Page {page} of {Math.ceil(total / LIMIT)}</span>
            <button disabled={page >= Math.ceil(total / LIMIT)} onClick={() => setPage((p) => p + 1)} className={styles.pageBtn}>Next →</button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
