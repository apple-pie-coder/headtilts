import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faRotateLeft, faDownload, faCompress, faGripVertical, faExpand } from '@fortawesome/free-solid-svg-icons';
import { useDensity } from '../hooks/useDensity';
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

const STATUS_CLASS: Record<string, string> = {
  open:      styles.statusOpen,
  closed:    styles.statusClosed,
  draft:     styles.statusDraft,
  scheduled: styles.statusScheduled,
};

const LIMIT = 20;

export default function PollsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.POLL_CREATE);
  const canEdit   = hasPermission(PERMISSIONS.POLL_EDIT);
  const canReset  = hasPermission(PERMISSIONS.POLL_RESET);
  const canDelete = hasPermission(PERMISSIONS.POLL_DELETE);

  const [polls, setPolls]               = useState<Poll[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading]           = useState(true);
  const [density, setDensity]           = useDensity('pollsDensity');

  useEffect(() => { load(); }, [page, search, statusFilter]);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchPolls(page, LIMIT, search || undefined, statusFilter || undefined);
      setPolls(data.items);
      setTotal(data.pagination.total);
    } catch {
      toast.error('Failed to load polls');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(poll: Poll) {
    const ok = await confirm({
      title: 'Delete poll',
      message: `Delete "${poll.title}"? This also removes all recorded votes.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePoll(poll.id);
      toast.success('Poll deleted');
      load();
    } catch {
      toast.error('Failed to delete poll');
    }
  }

  async function handleReset(poll: Poll) {
    const ok = await confirm({
      title: 'Reset votes',
      message: `Reset all ${poll._count.votes} vote(s) for "${poll.title}"? This cannot be undone.`,
      confirmLabel: 'Reset',
      danger: true,
    });
    if (!ok) return;
    try {
      await resetPollVotes(poll.id);
      toast.success('Votes reset');
      load();
    } catch {
      toast.error('Failed to reset votes');
    }
  }

  const pages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <AdminLayout>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Polls</h1>
          <p className={styles.subtitle}>{total} poll{total !== 1 ? 's' : ''}</p>
        </div>
        {canCreate && (
          <Link to="/admin/polls/new" className={styles.addButton}>
            <FontAwesomeIcon icon={faPlus} /> New Poll
          </Link>
        )}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filter}>
          <label>Search</label>
          <input
            placeholder="Search polls…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className={styles.filter}>
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div className={styles.filter}>
          <label>Density</label>
          <div className={styles.densitySwitch} role="group" aria-label="List density">
            <button type="button" className={`${styles.densityOption} ${density === 'compact' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('compact')} title="Compact" aria-pressed={density === 'compact'}><FontAwesomeIcon icon={faCompress} /></button>
            <button type="button" className={`${styles.densityOption} ${density === 'condensed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('condensed')} title="Condensed" aria-pressed={density === 'condensed'}><FontAwesomeIcon icon={faGripVertical} /></button>
            <button type="button" className={`${styles.densityOption} ${density === 'relaxed' ? styles.densityOptionActive : ''}`} onClick={() => setDensity('relaxed')} title="Relaxed" aria-pressed={density === 'relaxed'}><FontAwesomeIcon icon={faExpand} /></button>
          </div>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles[`density_${density}`]}>
          <thead>
            <tr>
              <th>Poll</th>
              <th>Status</th>
              <th>Mode</th>
              <th>Votes</th>
              <th>Options</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className={styles.empty}>Loading…</td></tr>
            ) : polls.length === 0 ? (
              <tr><td colSpan={6} className={styles.empty}>No polls found.</td></tr>
            ) : polls.map((poll) => (
              <tr key={poll.id}>
                <td>
                  <Link to={`/admin/polls/${poll.id}/edit`} className={styles.titleLink}>
                    {poll.title}
                  </Link>
                  <div className={styles.question}>{poll.question}</div>
                  <div className={styles.slug}>/polls/{poll.slug}</div>
                </td>
                <td>
                  <span className={`${styles.statusBadge} ${STATUS_CLASS[poll.status] ?? ''}`}>
                    {STATUS_LABELS[poll.status] ?? poll.status}
                  </span>
                </td>
                <td>
                  <span className={styles.modeChip}>
                    {poll.voteMode === 'multiple' ? 'Multi-choice' : 'Single choice'}
                  </span>
                </td>
                <td className={styles.voteCount}>{poll._count.votes}</td>
                <td className={styles.optionCount}>{poll.options.length}</td>
                <td>
                  <div className={styles.actions}>
                    {canEdit && (
                      <Link to={`/admin/polls/${poll.id}/edit`} className={styles.actionBtn} title="Edit poll">
                        <FontAwesomeIcon icon={faEdit} />
                      </Link>
                    )}
                    {canReset && poll._count.votes > 0 && (
                      <button className={styles.actionBtn} title="Reset votes" onClick={() => handleReset(poll)}>
                        <FontAwesomeIcon icon={faRotateLeft} />
                      </button>
                    )}
                    <a href={exportPollUrl(poll.id)} download className={styles.actionBtn} title="Export CSV">
                      <FontAwesomeIcon icon={faDownload} />
                    </a>
                    {canDelete && (
                      <button
                        className={`${styles.actionBtn} ${styles.danger}`}
                        title="Delete poll"
                        onClick={() => handleDelete(poll)}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className={styles.pagination}>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span>Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </AdminLayout>
  );
}
