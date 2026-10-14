import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faPen, faTrashCan, faRotateLeft, faDownload, faShareNodes, faArrowUpRightFromSquare, faLock,
  faLockOpen, faSquarePollVertical, faMagnifyingGlass,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmDialog';
import {
  Button, Card, DensityToggle, EmptyState, LoadingBar, MenuItem, PageHeader, Pagination, RowMenu, SearchInput,
  StatusBadge, TableSkeleton, Tabs, relativeTime, absoluteTime,
} from '../components/ui';
import t from '../components/ui/table.module.css';
import {
  fetchPolls, deletePoll, resetPollVotes, exportPollUrl, fetchPollShares, updatePoll, Poll, PollShare, PollShareClick,
} from '../services/polls';
import { PERMISSIONS } from '@headtilts/shared';
import { useAuth } from '../hooks/useAuth';
import { useDensity } from '../hooks/useDensity';
import { useHotkeys } from '../hooks/useHotkeys';
import { useUrlState } from '../hooks/useUrlState';
import styles from './Polls.module.css';

const STATUS_META: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  open: { label: 'Open', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'warning' },
  draft: { label: 'Draft', tone: 'neutral' },
  closed: { label: 'Closed', tone: 'info' },
};

function errorMessage(err: unknown, fallback: string): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

export default function PollsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.POLL_CREATE);
  const canEdit = hasPermission(PERMISSIONS.POLL_EDIT);
  const canReset = hasPermission(PERMISSIONS.POLL_RESET);
  const canDelete = hasPermission(PERMISSIONS.POLL_DELETE);

  const [q, setQ] = useUrlState({ status: '', search: '', page: '1', per: '20' });
  const page = Math.max(1, Number(q.page) || 1);
  const perPage = Number(q.per) || 20;

  const [polls, setPolls] = useState<Poll[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [density, setDensity] = useDensity('pollsDensity');
  const [sharesPoll, setSharesPoll] = useState<Poll | null>(null);
  const [shares, setShares] = useState<PollShare[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [expandedShare, setExpandedShare] = useState<number | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const data = await fetchPolls(page, perPage, q.search || undefined, q.status || undefined);
      if (id !== reqId.current) return;
      setPolls(data.items);
      setTotal(data.pagination.total);
      setLoaded(true);
    } catch (err) {
      if (id === reqId.current) toast.error(errorMessage(err, 'Failed to load polls'));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [page, perPage, q.search, q.status]);

  useEffect(() => { load(); }, [load]);

  useHotkeys({
    n: () => { if (canCreate) navigate('/admin/polls/new'); },
    Escape: () => { if (sharesPoll) setSharesPoll(null); },
  });

  async function handleDelete(poll: Poll) {
    if (!(await confirm({
      title: `Delete “${poll.title}”?`,
      message: `${poll._count.votes ? `All ${poll._count.votes} recorded vote${poll._count.votes === 1 ? '' : 's'} will be lost. ` : ''}This cannot be undone.`,
      confirmLabel: 'Delete poll',
      danger: true,
    }))) return;
    try {
      await deletePoll(poll.id);
      toast.success('Poll deleted');
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete poll'));
    }
  }

  async function handleReset(poll: Poll) {
    if (!(await confirm({
      title: 'Reset all votes?',
      message: `All ${poll._count.votes} vote${poll._count.votes === 1 ? '' : 's'} for “${poll.title}” will be cleared. This cannot be undone.`,
      confirmLabel: 'Reset votes',
      danger: true,
    }))) return;
    try {
      await resetPollVotes(poll.id);
      toast.success('Votes reset');
      load();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to reset votes'));
    }
  }

  async function setStatus(poll: Poll, status: string) {
    const prev = poll.status;
    setPolls((list) => list.map((p) => (p.id === poll.id ? { ...p, status } : p)));
    try {
      await updatePoll(poll.id, { status });
      toast.success(status === 'closed' ? `Closed “${poll.title}” to new votes` : `Reopened “${poll.title}”`, {
        action: { label: 'Undo', onClick: () => updatePoll(poll.id, { status: prev }).then(load).catch((e) => toast.error(errorMessage(e, 'Undo failed'))) },
      });
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update poll'));
    }
    load();
  }

  async function handleViewShares(poll: Poll) {
    setSharesPoll(poll);
    setShares([]);
    setExpandedShare(null);
    setSharesLoading(true);
    try {
      setShares(await fetchPollShares(poll.id));
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load share analytics'));
    } finally {
      setSharesLoading(false);
    }
  }

  function menu(poll: Poll): MenuItem[] {
    return [
      { label: 'Edit', icon: faPen, onClick: () => navigate(`/admin/polls/${poll.id}/edit`), hidden: !canEdit },
      { label: 'View on site', icon: faArrowUpRightFromSquare, onClick: () => window.open(`/polls/${poll.slug}`, '_blank', 'noopener'), hidden: poll.status === 'draft' },
      { label: 'Share analytics', icon: faShareNodes, onClick: () => handleViewShares(poll) },
      { label: 'Export votes (CSV)', icon: faDownload, onClick: () => { window.location.href = exportPollUrl(poll.id); }, hidden: poll._count.votes === 0 },
      { label: 'Close voting', icon: faLock, onClick: () => setStatus(poll, 'closed'), hidden: !canEdit || poll.status !== 'open', divider: true },
      { label: 'Reopen voting', icon: faLockOpen, onClick: () => setStatus(poll, 'open'), hidden: !canEdit || poll.status !== 'closed', divider: true },
      { label: 'Reset votes', icon: faRotateLeft, onClick: () => handleReset(poll), danger: true, hidden: !canReset || poll._count.votes === 0, divider: true },
      { label: 'Delete', icon: faTrashCan, onClick: () => handleDelete(poll), danger: true, hidden: !canDelete },
    ];
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Polls"
        subtitle={loaded ? `${total} poll${total === 1 ? '' : 's'}` : ' '}
        actions={canCreate && <Button variant="primary" icon={faPlus} kbd="N" onClick={() => navigate('/admin/polls/new')}>New poll</Button>}
      />

      <Tabs
        tabs={[
          { key: '', label: 'All' },
          ...Object.entries(STATUS_META).map(([key, m]) => ({ key, label: m.label })),
        ]}
        value={q.status}
        onChange={(status) => setQ({ status })}
      />

      <div className={t.toolbar}>
        <SearchInput value={q.search} onChange={(search) => setQ({ search })} placeholder="Search polls" />
        <div className={t.spacer} />
        <DensityToggle value={density} onChange={setDensity} />
      </div>

      <Card>
        <LoadingBar active={loading && loaded} />
        <div className={t.scroll}>
          <table className={`${t.table} ${t[`d_${density}`]}`}>
            <thead>
              <tr>
                <th>Poll</th>
                <th>Status</th>
                <th className={t.hideMd}>Leading answer</th>
                <th className={t.num}>Votes</th>
                <th className={t.actionsCol}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {!loaded && <TableSkeleton rows={5} cols={5} />}
              {polls.map((poll) => {
                const votes = poll._count.votes;
                const optionVotes = poll.options.reduce((n, o) => n + (o._count?.votes ?? 0), 0);
                const leader = [...poll.options].sort((a, b) => (b._count?.votes ?? 0) - (a._count?.votes ?? 0))[0];
                const pct = leader && optionVotes ? Math.round(((leader._count?.votes ?? 0) / optionVotes) * 100) : 0;
                const window_ = poll.status === 'scheduled' && poll.startsAt
                  ? `Opens ${relativeTime(poll.startsAt)}`
                  : poll.status === 'open' && poll.endsAt
                    ? `Closes ${relativeTime(poll.endsAt)}`
                    : '';
                return (
                  <tr key={poll.id}>
                    <td className={t.primaryCell}>
                      <div className={t.stack}>
                        {canEdit
                          ? <Link to={`/admin/polls/${poll.id}/edit`} className={t.primary}>{poll.title}</Link>
                          : <span className={t.primary}>{poll.title}</span>}
                        <span className={t.secondary}>
                          <span className={t.clamp2}>{poll.question}</span>
                        </span>
                        <span className={t.secondary}>
                          <span className={t.chip}>{poll.voteMode === 'multiple' ? 'Multiple choice' : 'Single choice'}</span>
                          <span>{poll.options.length} options</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className={t.stack}>
                        <StatusBadge tone={STATUS_META[poll.status]?.tone ?? 'neutral'}>{STATUS_META[poll.status]?.label ?? poll.status}</StatusBadge>
                        {window_ && <span className={t.secondary} title={absoluteTime(poll.status === 'scheduled' ? poll.startsAt : poll.endsAt)}>{window_}</span>}
                      </div>
                    </td>
                    <td className={t.hideMd}>
                      {optionVotes > 0 && leader ? (
                        <div className={styles.leader} title={`${leader._count?.votes ?? 0} of ${optionVotes} votes`}>
                          <span className={styles.leaderText}>{leader.text}</span>
                          <span className={styles.leaderBar}><span style={{ width: `${pct}%` }} /></span>
                          <span className={styles.leaderPct}>{pct}%</span>
                        </div>
                      ) : <span className={t.faint}>No votes yet</span>}
                    </td>
                    <td className={t.num}>{votes.toLocaleString()}</td>
                    <td className={t.actionsCol}>
                      <div className={t.rowActions}>
                        {canEdit && (
                          <Link to={`/admin/polls/${poll.id}/edit`} className={t.quickAction} title="Edit" aria-label={`Edit ${poll.title}`}>
                            <FontAwesomeIcon icon={faPen} />
                          </Link>
                        )}
                        <RowMenu items={menu(poll)} label={`Actions for ${poll.title}`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {loaded && polls.length === 0 && (
          q.search ? (
            <EmptyState icon={faMagnifyingGlass} title={`No polls match “${q.search}”`} action={<Button onClick={() => setQ({ search: '' })}>Clear search</Button>} />
          ) : (
            <EmptyState
              icon={faSquarePollVertical}
              title={q.status ? `No ${STATUS_META[q.status]?.label.toLowerCase()} polls` : 'No polls yet'}
              description={q.status ? undefined : 'Ask your readers a question and see the results live.'}
              action={canCreate && !q.status && <Button variant="primary" icon={faPlus} onClick={() => navigate('/admin/polls/new')}>New poll</Button>}
            />
          )
        )}
      </Card>

      {loaded && total > 0 && (
        <Pagination
          page={page}
          pageSize={perPage}
          total={total}
          onPage={(p) => setQ({ page: String(p) })}
          onPageSize={(n) => setQ({ per: String(n) })}
        />
      )}

      {sharesPoll && (
        <div className={styles.sharesOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setSharesPoll(null); }}>
          <div className={styles.sharesModal} role="dialog" aria-modal="true" aria-label="Share analytics">
            <div className={styles.sharesModalHeader}>
              <div>
                <h2 className={styles.sharesModalTitle}>Share Analytics</h2>
                <p className={styles.sharesModalSub}>"{sharesPoll.title}"</p>
              </div>
              <button className={styles.sharesClose} onClick={() => setSharesPoll(null)} aria-label="Close">✕</button>
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
                        <Fragment key={s.id}>
                          <tr
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
                        </Fragment>
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
