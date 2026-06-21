import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faRotateLeft, faDownload, faCompress, faGripVertical, faExpand, faShareNodes } from '@fortawesome/free-solid-svg-icons';
import { useDensity } from '../hooks/useDensity';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmDialog';
import { fetchPolls, deletePoll, resetPollVotes, exportPollUrl, fetchPollShares, Poll, PollShare, PollShareClick } from '../services/polls';
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
  const [sharesPoll,   setSharesPoll]   = useState<Poll | null>(null);
  const [shares,       setShares]       = useState<PollShare[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [expandedShare, setExpandedShare] = useState<number | null>(null);

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

  async function handleViewShares(poll: Poll) {
    setSharesPoll(poll);
    setShares([]);
    setSharesLoading(true);
    try {
      const data = await fetchPollShares(poll.id);
      setShares(data);
    } catch {
      toast.error('Failed to load share analytics');
    } finally {
      setSharesLoading(false);
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
            autoFocus
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
                    <button
                      className={styles.actionBtn}
                      title="Share analytics"
                      onClick={() => handleViewShares(poll)}
                    >
                      <FontAwesomeIcon icon={faShareNodes} />
                    </button>
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

      {sharesPoll && (
        <div className={styles.sharesOverlay}>
          <div className={styles.sharesModal}>
            <div className={styles.sharesModalHeader}>
              <div>
                <h2 className={styles.sharesModalTitle}>Share Analytics</h2>
                <p className={styles.sharesModalSub}>"{sharesPoll.title}"</p>
              </div>
              <button className={styles.sharesClose} onClick={() => setSharesPoll(null)}>✕</button>
            </div>

            {sharesLoading ? (
              <p className={styles.sharesEmpty}>Loading…</p>
            ) : shares.length === 0 ? (
              <p className={styles.sharesEmpty}>No shares recorded yet. Share buttons appear on the public poll page.</p>
            ) : (
              <>
                <div className={styles.sharesSummary}>
                  <div className={styles.sharesStat}>
                    <span className={styles.sharesStatValue}>{shares.length}</span>
                    <span className={styles.sharesStatLabel}>Total shares</span>
                  </div>
                  <div className={styles.sharesStat}>
                    <span className={styles.sharesStatValue}>{shares.reduce((s, x) => s + x.clicks, 0)}</span>
                    <span className={styles.sharesStatLabel}>Total clicks</span>
                  </div>
                  <div className={styles.sharesStat}>
                    <span className={styles.sharesStatValue}>
                      {(() => {
                        const counts: Record<string,number> = {};
                        shares.forEach(s => { counts[s.channel] = (counts[s.channel] ?? 0) + 1; });
                        return Object.entries(counts).sort((a,b) => b[1]-a[1])[0]?.[0] ?? '—';
                      })()}
                    </span>
                    <span className={styles.sharesStatLabel}>Top channel</span>
                  </div>
                </div>

                <div className={styles.sharesTableWrap}>
                  <table className={styles.sharesTable}>
                    <thead>
                      <tr>
                        <th>Channel</th>
                        <th>Recipient</th>
                        <th>Note</th>
                        <th>Clicks</th>
                        <th>First click</th>
                        <th>Last click</th>
                        <th>Shared at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shares.map((s) => (
                        <>
                          <tr
                            key={s.id}
                            className={s.clickDetails.length > 0 ? styles.shareRowClickable : undefined}
                            onClick={() => s.clickDetails.length > 0 && setExpandedShare(expandedShare === s.id ? null : s.id)}
                          >
                            <td><span className={`${styles.shareChannel} ${styles[`shareChannel_${s.channel}`]}`}>{s.channel}</span></td>
                            <td>
                              {s.recipientName && <span className={styles.recipientName}>{s.recipientName}</span>}
                              {s.recipientEmail && <span className={styles.recipientEmail}>{s.recipientEmail}</span>}
                              {!s.recipientName && !s.recipientEmail && <span className={styles.anon}>Anonymous</span>}
                            </td>
                            <td className={styles.noteCell}>{s.note || '—'}</td>
                            <td className={styles.clickCell}>
                              {s.clicks}
                              {s.clickDetails.length > 0 && (
                                <span className={styles.expandChevron}>{expandedShare === s.id ? ' ▲' : ' ▼'}</span>
                              )}
                            </td>
                            <td className={styles.dateCell}>{s.firstClickAt ? new Date(s.firstClickAt).toLocaleString() : '—'}</td>
                            <td className={styles.dateCell}>{s.lastClickAt ? new Date(s.lastClickAt).toLocaleString() : '—'}</td>
                            <td className={styles.dateCell}>{new Date(s.createdAt).toLocaleString()}</td>
                          </tr>
                          {expandedShare === s.id && s.clickDetails.map((c: PollShareClick) => (
                            <tr key={`click-${c.id}`} className={styles.clickDetailRow}>
                              <td colSpan={2} className={styles.clickDetailIndent}>
                                <span className={styles.clickDetailLabel}>↳</span>
                                {c.name ? <strong>{c.name}</strong> : <em className={styles.anon}>No name</em>}
                                {c.gender && <span className={styles.clickDetailMeta}> · {c.gender}</span>}
                                {c.age && <span className={styles.clickDetailMeta}> · Age {c.age}</span>}
                              </td>
                              <td colSpan={5} className={styles.dateCell}>{new Date(c.clickedAt).toLocaleString()}</td>
                            </tr>
                          ))}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
