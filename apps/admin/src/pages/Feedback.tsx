import { Fragment, useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBug, faLightbulb, faCircleQuestion, faArrowsRotate, faTrashCan, faCommentDots, faChevronDown, faChevronRight,
  faArrowUpRightFromSquare,
} from '@fortawesome/free-solid-svg-icons';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { PERMISSIONS } from '@headtilts/shared';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { useConfirm } from '../components/ConfirmDialog';
import { Card, EmptyState, PageHeader, Pagination, StatusBadge, Tabs, absoluteTime, relativeTime } from '../components/ui';
import t from '../components/ui/table.module.css';
import { useAuth } from '../hooks/useAuth';
import { useUrlState } from '../hooks/useUrlState';
import { refreshNavBadges } from '../hooks/useNavBadges';
import { markSeen } from '../utils/seen';
import { resolveMediaUrl } from '../services/media';
import {
  FeedbackItem, FeedbackStatus, deleteFeedback, fetchFeedback, fetchFeedbackStatus, resyncFeedback,
} from '../services/feedback';
import styles from './Feedback.module.css';

const TYPE_META: Record<string, { label: string; icon: IconDefinition }> = {
  bug: { label: 'Bug', icon: faBug },
  idea: { label: 'Idea', icon: faLightbulb },
  question: { label: 'Question', icon: faCircleQuestion },
};

const personName = (u: FeedbackItem['user']) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username : 'Unknown');

export default function FeedbackPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const canDelete = hasPermission(PERMISSIONS.SETTING_EDIT);
  const [q, setQ] = useUrlState({ type: '', state: '', page: '1' });
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<FeedbackStatus | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const page = Math.max(1, Number(q.page) || 1);
  const PER = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchFeedback(page, PER, { type: q.type, state: q.state });
      setItems(res.items);
      setTotal(res.pagination.total);
    } catch {
      toast.error('Couldn’t load feedback');
    } finally {
      setLoading(false);
    }
  }, [page, q.type, q.state, toast]);

  useEffect(() => { load(); }, [load]);
  // Opening the page clears its "new" badge.
  useEffect(() => { markSeen('feedback'); refreshNavBadges(); }, []);
  useEffect(() => { fetchFeedbackStatus().then(setStatus).catch(() => {}); }, []);

  async function resync(item: FeedbackItem) {
    setBusy(item.id);
    try {
      const next = await resyncFeedback(item.id);
      setItems((list) => list.map((i) => (i.id === item.id ? { ...i, ...next } : i)));
      if (next.issueUrl) toast.success(`Created issue #${next.issueNumber}`);
      else toast.error(next.syncError ?? 'GitHub didn’t accept it');
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: FeedbackItem) {
    const ok = await confirm({
      title: 'Delete this feedback?',
      message: item.issueUrl ? 'This removes it from the admin only — the GitHub issue stays open until it’s closed there.' : 'This can’t be undone.',
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    await deleteFeedback(item.id);
    setItems((list) => list.filter((i) => i.id !== item.id));
    setTotal((n) => n - 1);
  }

  return (
    <AdminLayout>
      <PageHeader
        title="Feedback"
        subtitle={status?.configured
          ? `Reports from the Feedback button become issues in ${status.repo}${status.private === false ? ' (public repository)' : ''}.`
          : 'Bugs, ideas and questions sent with the Feedback button on every admin page.'}
      />

      {status && !status.configured && (
        <div className={styles.setup}>
          <FontAwesomeIcon icon={faGithub} className={styles.setupIcon} />
          <div>
            <strong>Connect GitHub to track these as issues</strong>
            <ol>
              <li>Create a <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">fine-grained token</a> with access to only the <code>{status.repo ?? 'headtilts'}</code> repository and the permission <em>Issues: Read and write</em>.</li>
              <li>Add it to the server’s <code>.env</code> as <code>GITHUB_FEEDBACK_TOKEN=…</code></li>
              <li>Restart the API: <code>docker compose up -d api</code>. Saved reports can then be sent with <em>Send to GitHub</em>.</li>
            </ol>
          </div>
        </div>
      )}

      <div className={t.toolbar}>
        <Tabs
          value={q.type}
          onChange={(key) => setQ({ type: key, page: '1' })}
          tabs={[{ key: '', label: 'All' }, { key: 'bug', label: 'Bugs' }, { key: 'idea', label: 'Ideas' }, { key: 'question', label: 'Questions' }]}
        />
        <div className={t.spacer} />
        <select className={styles.select} value={q.state} onChange={(e) => setQ({ state: e.target.value, page: '1' })} aria-label="Issue state">
          <option value="">Open and closed</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <Card>
        {!loading && items.length === 0 ? (
          <EmptyState icon={faCommentDots} title="No feedback yet" description="Use the Feedback button at the bottom right of any admin page to report a bug or suggest an idea." />
        ) : (
          <div className={t.scroll}>
            <table className={t.table}>
              <thead>
                <tr>
                  <th style={{ width: '2rem' }} />
                  <th>Feedback</th>
                  <th>From</th>
                  <th>Sent</th>
                  <th>GitHub</th>
                  <th className={t.actionsCol}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((f) => {
                  const meta = TYPE_META[f.type] ?? TYPE_META.bug;
                  const open = expanded === f.id;
                  return (
                    <Fragment key={f.id}>
                      <tr className={styles.row} onClick={() => setExpanded(open ? null : f.id)}>
                        <td className={t.muted}><FontAwesomeIcon icon={open ? faChevronDown : faChevronRight} /></td>
                        <td>
                          <div className={t.stack}>
                            <span className={t.primary}><span className={`${styles.type} ${styles[`type_${f.type}`]}`}><FontAwesomeIcon icon={meta.icon} /> {meta.label}</span> {f.title}</span>
                            {f.pagePath && <span className={`${t.secondary} ${t.mono}`}>{f.pagePath}</span>}
                          </div>
                        </td>
                        <td className={t.muted}>{personName(f.user)}</td>
                        <td className={`${t.muted} ${t.nowrap}`} title={absoluteTime(f.createdAt)}>{relativeTime(f.createdAt)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          {f.issueUrl ? (
                            <a href={f.issueUrl} target="_blank" rel="noopener noreferrer" className={styles.issue}>
                              <FontAwesomeIcon icon={faGithub} /> #{f.issueNumber}{' '}
                              <StatusBadge tone={f.issueState === 'closed' ? 'success' : 'info'}>{f.issueState === 'closed' ? 'Closed' : 'Open'}</StatusBadge>
                            </a>
                          ) : (
                            <span className={styles.notSent}>
                              <StatusBadge tone={f.syncStatus === 'failed' ? 'danger' : 'neutral'}>{f.syncStatus === 'failed' ? 'Failed' : 'Not sent'}</StatusBadge>
                              {status?.configured && (
                                <button type="button" className={styles.retry} onClick={() => resync(f)} disabled={busy === f.id} title={f.syncError ?? undefined}>
                                  <FontAwesomeIcon icon={faArrowsRotate} spin={busy === f.id} /> Send to GitHub
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                        <td className={t.actionsCol} onClick={(e) => e.stopPropagation()}>
                          {canDelete && (
                            <button type="button" className={styles.iconBtn} onClick={() => remove(f)} aria-label={`Delete “${f.title}”`}>
                              <FontAwesomeIcon icon={faTrashCan} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className={styles.detailRow}>
                          <td />
                          <td colSpan={5}>
                            <div className={styles.detail}>
                              <p className={styles.description}>{f.description}</p>
                              {f.screenshot && (
                                <a href={resolveMediaUrl(f.screenshot)} target="_blank" rel="noopener noreferrer" className={styles.shot}>
                                  <img src={resolveMediaUrl(f.screenshot)} alt="Attached screenshot" />
                                  <span><FontAwesomeIcon icon={faArrowUpRightFromSquare} /> Open full size</span>
                                </a>
                              )}
                              {f.context && (
                                <dl className={styles.context}>
                                  {f.context.browser && <div><dt>Browser</dt><dd>{f.context.browser}</dd></div>}
                                  {f.context.viewport && <div><dt>Window</dt><dd>{f.context.viewport}{f.context.theme ? ` · ${f.context.theme} theme` : ''}</dd></div>}
                                  {f.context.appVersion && <div><dt>Version</dt><dd>{f.context.appVersion}</dd></div>}
                                </dl>
                              )}
                              {f.context?.errors && f.context.errors.length > 0 && <pre className={styles.errors}>{f.context.errors.join('\n')}</pre>}
                              {f.syncError && <p className={styles.syncError}>GitHub: {f.syncError}</p>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {total > PER && <Pagination page={page} pageSize={PER} total={total} onPage={(p) => setQ({ page: String(p) })} />}
    </AdminLayout>
  );
}
