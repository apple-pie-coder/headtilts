import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowsRotate, faPlus, faXmark, faComment, faTableColumns, faList, faCircleDot, faCircleCheck,
  faArrowUpRightFromSquare, faTag, faListCheck,
} from '@fortawesome/free-solid-svg-icons';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import { PERMISSIONS } from '@headtilts/shared';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { Button, Card, EmptyState, PageHeader, SearchInput, relativeTime, absoluteTime } from '../components/ui';
import t from '../components/ui/table.module.css';
import { useAuth } from '../hooks/useAuth';
import { useUrlState } from '../hooks/useUrlState';
import { refreshNavBadges } from '../hooks/useNavBadges';
import { markSeen } from '../utils/seen';
import {
  ColumnId, IssueDetail, IssueLabel, IssueSummary, commentOnIssue, createIssue, fetchIssue, fetchIssueLabels,
  fetchIssues, moveIssue, updateIssue,
} from '../services/issues';
import { resolveMediaUrl } from '../services/media';
import styles from './Issues.module.css';

const COLUMNS: { id: ColumnId; name: string }[] = [
  { id: 'todo', name: 'To do' },
  { id: 'in_progress', name: 'In progress' },
  { id: 'review', name: 'In review' },
  { id: 'done', name: 'Done' },
];
const columnName = (id: ColumnId) => COLUMNS.find((c) => c.id === id)?.name ?? id;

function apiMessage(err: unknown, fallback: string) {
  return (err as AxiosError<{ error?: { message?: string } }>).response?.data?.error?.message || fallback;
}
const apiCode = (err: unknown) => (err as AxiosError<{ error?: { code?: string } }>).response?.data?.error?.code;

/** GitHub label colours are arbitrary; pick readable text for each. */
function LabelChip({ label }: { label: IssueLabel }) {
  const hex = /^[0-9a-f]{6}$/i.test(label.color) ? label.color : 'cccccc';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const dark = (r * 299 + g * 587 + b * 114) / 1000 < 150;
  return <span className={styles.label} style={{ background: `#${hex}`, color: dark ? '#fff' : '#1d1d1f' }}>{label.name}</span>;
}

/** GitHub's rendered HTML, with links opening in a new tab. */
const githubHtml = (html: string) => ({ __html: html.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ') });

export default function IssuesPage() {
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERMISSIONS.SETTING_EDIT);
  const [q, setQ] = useUrlState({ view: 'board', search: '', label: '', issue: '' });
  const [items, setItems] = useState<IssueSummary[]>([]);
  const [repo, setRepo] = useState('');
  const [labels, setLabels] = useState<IssueLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [dragOver, setDragOver] = useState<ColumnId | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const board = await fetchIssues();
      setItems(board.items);
      setRepo(board.repo);
      setNotConfigured(false);
      setLoadError('');
    } catch (err) {
      if (apiCode(err) === 'NOT_CONFIGURED') setNotConfigured(true);
      else setLoadError(apiMessage(err, 'Couldn’t load issues from GitHub'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Opening the page clears its "new" badge.
  useEffect(() => { markSeen('issues'); refreshNavBadges(); }, []);
  useEffect(() => { fetchIssueLabels().then(setLabels).catch(() => {}); }, []);

  const visible = useMemo(() => {
    const s = q.search.trim().toLowerCase();
    return items.filter((i) =>
      (!q.label || i.labels.some((l) => l.name === q.label)) &&
      (!s || i.title.toLowerCase().includes(s) || `#${i.number}` === s || String(i.number) === s));
  }, [items, q.search, q.label]);

  const openNumber = Number(q.issue) || null;
  const setOpen = (n: number | null) => setQ({ issue: n ? String(n) : '' });

  /** Optimistic: the card moves at once and snaps back if GitHub refuses. */
  async function move(number: number, column: ColumnId) {
    const before = items.find((i) => i.number === number);
    if (!before || before.column === column) return;
    setItems((prev) => prev.map((i) => (i.number === number ? { ...i, column, state: column === 'done' ? 'closed' : 'open' } : i)));
    try {
      const updated = await moveIssue(number, column);
      setItems((prev) => prev.map((i) => (i.number === number ? updated : i)));
      toast.success(`#${number} moved to ${columnName(column)}`);
      refreshNavBadges();
    } catch (err) {
      setItems((prev) => prev.map((i) => (i.number === number ? before : i)));
      toast.error(apiMessage(err, 'Couldn’t move the issue'));
    }
  }

  function onDrop(e: DragEvent, column: ColumnId) {
    e.preventDefault();
    setDragOver(null);
    const n = Number(e.dataTransfer.getData('text/plain'));
    if (n) move(n, column);
  }

  const counts = useMemo(() => Object.fromEntries(COLUMNS.map((c) => [c.id, visible.filter((i) => i.column === c.id).length])), [visible]);

  return (
    <AdminLayout>
      <PageHeader
        title="Issues"
        subtitle={repo
          ? <>Tracked on GitHub · <a href={`https://github.com/${repo}/issues`} target="_blank" rel="noopener noreferrer" className={styles.repoLink}><FontAwesomeIcon icon={faGithub} /> {repo}</a></>
          : 'Your GitHub issues as a project board'}
        actions={!notConfigured && (
          <>
            <div className={styles.viewToggle} role="group" aria-label="View">
              <button type="button" aria-pressed={q.view !== 'list'} onClick={() => setQ({ view: 'board' })}><FontAwesomeIcon icon={faTableColumns} /> Board</button>
              <button type="button" aria-pressed={q.view === 'list'} onClick={() => setQ({ view: 'list' })}><FontAwesomeIcon icon={faList} /> List</button>
            </div>
            <Button icon={faArrowsRotate} onClick={() => load()} disabled={loading}>Refresh</Button>
            {canEdit && <Button variant="primary" icon={faPlus} onClick={() => setCreating(true)}>New issue</Button>}
          </>
        )}
      />

      {notConfigured ? (
        <div className={styles.setup}>
          <FontAwesomeIcon icon={faGithub} className={styles.setupIcon} />
          <div>
            <strong>Connect GitHub to track issues here</strong>
            <ol>
              <li>Create a fine-grained token on GitHub with <em>Issues: Read and write</em> for your repository.</li>
              <li>Add <code>GITHUB_FEEDBACK_TOKEN=…</code> and <code>GITHUB_FEEDBACK_REPO=owner/repo</code> to the server’s <code>.env</code>.</li>
              <li>Restart the API container.</li>
            </ol>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <SearchInput value={q.search} onChange={(v) => setQ({ search: v })} placeholder="Search issues or #number…" />
            <select className={styles.select} value={q.label} onChange={(e) => setQ({ label: e.target.value })} aria-label="Filter by label">
              <option value="">All labels</option>
              {labels.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
            </select>
            <span className={styles.hint}>{canEdit && q.view !== 'list' ? 'Drag cards between columns to change their status.' : ''}</span>
          </div>

          {loadError && (
            <div className={styles.error}>
              {loadError} <button type="button" onClick={() => load()}>Try again</button>
            </div>
          )}

          {loading && !items.length ? (
            <div className={styles.board} aria-busy="true">
              {COLUMNS.map((c) => <div key={c.id} className={`${styles.column} ${styles.skeleton}`} />)}
            </div>
          ) : !items.length && !loadError ? (
            <EmptyState icon={faListCheck} title="No issues yet" description="Create one here, or send feedback with the button in the corner."
              action={canEdit ? <Button variant="primary" icon={faPlus} onClick={() => setCreating(true)}>New issue</Button> : undefined} />
          ) : q.view === 'list' ? (
            <Card>
              <div className={t.scroll}>
              <table className={t.table}>
                <thead>
                  <tr><th>Issue</th><th>Status</th><th>Labels</th><th>Comments</th><th>Updated</th></tr>
                </thead>
                <tbody>
                  {visible.map((i) => (
                    <tr key={i.number} className={styles.listRow} onClick={() => setOpen(i.number)}>
                      <td>
                        <button type="button" className={styles.listTitle} onClick={(e) => { e.stopPropagation(); setOpen(i.number); }}>
                          <span className={styles.num}>#{i.number}</span> {i.title}
                        </button>
                      </td>
                      <td><span className={`${styles.status} ${styles[`status_${i.column}`]}`}>{columnName(i.column)}</span></td>
                      <td><span className={styles.labels}>{i.labels.map((l) => <LabelChip key={l.name} label={l} />)}</span></td>
                      <td>{i.comments || '—'}</td>
                      <td title={absoluteTime(i.updatedAt)}>{relativeTime(i.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {!visible.length && <p className={styles.noMatch}>No issues match these filters.</p>}
            </Card>
          ) : (
            <div className={styles.board}>
              {COLUMNS.map((c) => (
                <section
                  key={c.id}
                  className={`${styles.column} ${dragOver === c.id ? styles.columnOver : ''}`}
                  aria-label={c.name}
                  onDragOver={canEdit ? (e) => { e.preventDefault(); setDragOver(c.id); } : undefined}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); }}
                  onDrop={canEdit ? (e) => onDrop(e, c.id) : undefined}
                >
                  <header className={styles.columnHead}>
                    <span className={`${styles.dot} ${styles[`dot_${c.id}`]}`} />
                    {c.name}
                    <span className={styles.count}>{counts[c.id]}</span>
                  </header>
                  <div className={styles.cards}>
                    {visible.filter((i) => i.column === c.id).map((i) => (
                      <article
                        key={i.number}
                        className={styles.card}
                        draggable={canEdit}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(i.number)); e.dataTransfer.effectAllowed = 'move'; }}
                      >
                        <button type="button" className={styles.cardOpen} onClick={() => setOpen(i.number)}>
                          <span className={styles.cardTitle}>{i.title}</span>
                        </button>
                        {i.labels.length > 0 && <div className={styles.labels}>{i.labels.map((l) => <LabelChip key={l.name} label={l} />)}</div>}
                        <div className={styles.cardMeta}>
                          <span className={styles.num}>#{i.number}</span>
                          {i.comments > 0 && <span><FontAwesomeIcon icon={faComment} /> {i.comments}</span>}
                          <span title={absoluteTime(i.updatedAt)}>{relativeTime(i.updatedAt)}</span>
                          {i.assignees[0] && <img className={styles.avatar} src={i.assignees[0].avatarUrl} alt={i.assignees[0].login} title={`Assigned to ${i.assignees[0].login}`} />}
                        </div>
                        {canEdit && (
                          // Keyboard-friendly alternative to dragging.
                          <select className={styles.cardMove} value={i.column} aria-label={`Status of #${i.number}`} onChange={(e) => move(i.number, e.target.value as ColumnId)}>
                            {COLUMNS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        )}
                      </article>
                    ))}
                    {counts[c.id] === 0 && <p className={styles.columnEmpty}>{c.id === 'done' ? 'Closed issues land here.' : 'Nothing here.'}</p>}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {openNumber && (
        <IssueDrawer
          number={openNumber}
          labels={labels}
          canEdit={canEdit}
          onClose={() => setOpen(null)}
          onChanged={(s) => setItems((prev) => prev.map((i) => (i.number === s.number ? s : i)))}
          onMove={move}
        />
      )}
      {creating && (
        <NewIssueModal
          labels={labels}
          onClose={() => setCreating(false)}
          onCreated={(s) => { setItems((prev) => [s, ...prev]); setCreating(false); setOpen(s.number); }}
        />
      )}
    </AdminLayout>
  );
}

function IssueDrawer({ number, labels, canEdit, onClose, onChanged, onMove }: {
  number: number;
  labels: IssueLabel[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: (s: IssueSummary) => void;
  onMove: (n: number, c: ColumnId) => Promise<void>;
}) {
  const toast = useToast();
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(() => {
    fetchIssue(number).then((d) => { setIssue(d); setError(''); }).catch((err) => setError(apiMessage(err, 'Couldn’t load this issue')));
  }, [number]);
  useEffect(() => { setIssue(null); reload(); }, [reload]);
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const apply = (s: IssueSummary) => { onChanged(s); setIssue((d) => (d ? { ...d, ...s } : d)); };

  async function setState(state: 'open' | 'closed', stateReason?: 'completed' | 'not_planned') {
    setBusy(true);
    try {
      apply(await updateIssue(number, { state, stateReason }));
      toast.success(state === 'closed' ? `#${number} closed` : `#${number} reopened`);
      refreshNavBadges();
    } catch (err) {
      toast.error(apiMessage(err, 'Couldn’t update the issue'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleLabel(name: string) {
    if (!issue) return;
    const has = issue.labels.some((l) => l.name === name);
    const next = has ? issue.labels.filter((l) => l.name !== name).map((l) => l.name) : [...issue.labels.map((l) => l.name), name];
    try {
      apply(await updateIssue(number, { labels: next }));
    } catch (err) {
      toast.error(apiMessage(err, 'Couldn’t change labels'));
    }
  }

  async function changeColumn(c: ColumnId) {
    await onMove(number, c);
    reload();
  }

  async function sendComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setBusy(true);
    try {
      const c = await commentOnIssue(number, comment);
      setIssue((d) => (d ? { ...d, thread: [...d.thread, c], comments: d.comments + 1 } : d));
      onChanged({ ...(issue as IssueSummary), comments: (issue?.comments ?? 0) + 1 });
      setComment('');
    } catch (err) {
      toast.error(apiMessage(err, 'Couldn’t post the comment'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="issue-title" tabIndex={-1} ref={panelRef}>
        <header className={styles.drawerHead}>
          <span className={styles.num}>#{number}</span>
          {issue && <a href={issue.url} target="_blank" rel="noopener noreferrer" className={styles.ghLink}><FontAwesomeIcon icon={faGithub} /> Open on GitHub <FontAwesomeIcon icon={faArrowUpRightFromSquare} /></a>}
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close"><FontAwesomeIcon icon={faXmark} /></button>
        </header>

        {error ? <p className={styles.error}>{error}</p> : !issue ? <p className={styles.loadingText}>Loading…</p> : (
          <div className={styles.drawerBody}>
            <h2 id="issue-title" className={styles.issueTitle}>{issue.title}</h2>
            <p className={styles.issueMeta}>
              <span className={`${styles.state} ${issue.state === 'open' ? styles.stateOpen : styles.stateClosed}`}>
                <FontAwesomeIcon icon={issue.state === 'open' ? faCircleDot : faCircleCheck} /> {issue.state === 'open' ? 'Open' : issue.stateReason === 'not_planned' ? 'Closed · not planned' : 'Closed'}
              </span>
              {issue.author && <span>opened by <strong>{issue.author.login}</strong></span>}
              <span title={absoluteTime(issue.createdAt)}>{relativeTime(issue.createdAt)}</span>
            </p>

            <div className={styles.controls}>
              <label className={styles.control}>
                <span>Status</span>
                <select className={styles.select} value={issue.column} onChange={(e) => changeColumn(e.target.value as ColumnId)} disabled={!canEdit || busy}>
                  {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <div className={styles.control}>
                <span>Labels</span>
                <div className={styles.labelPicker}>
                  <span className={styles.labels}>
                    {issue.labels.length ? issue.labels.map((l) => <LabelChip key={l.name} label={l} />) : <em className={styles.none}>None</em>}
                  </span>
                  {canEdit && <button type="button" className={styles.linkBtn} onClick={() => setLabelsOpen((o) => !o)} aria-expanded={labelsOpen}><FontAwesomeIcon icon={faTag} /> Edit</button>}
                  {labelsOpen && (
                    <div className={styles.labelMenu}>
                      {labels.map((l) => (
                        <label key={l.name} className={styles.labelOption}>
                          <input type="checkbox" checked={issue.labels.some((x) => x.name === l.name)} onChange={() => toggleLabel(l.name)} />
                          <LabelChip label={l} />
                          {l.description && <span className={styles.labelDesc}>{l.description}</span>}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {canEdit && (
                <div className={styles.stateActions}>
                  {issue.state === 'open' ? (
                    <>
                      <Button size="sm" icon={faCircleCheck} onClick={() => setState('closed', 'completed')} disabled={busy}>Close as done</Button>
                      <Button size="sm" variant="ghost" onClick={() => setState('closed', 'not_planned')} disabled={busy}>Close as not planned</Button>
                    </>
                  ) : (
                    <Button size="sm" icon={faCircleDot} onClick={() => setState('open')} disabled={busy}>Reopen</Button>
                  )}
                </div>
              )}
            </div>

            <div className={styles.markdown} dangerouslySetInnerHTML={githubHtml(issue.bodyHtml || '<p><em>No description.</em></p>')} />
            {(issue.screenshots ?? []).filter((s) => !issue.bodyHtml.includes(s)).map((s) => (
              <a key={s} href={resolveMediaUrl(s)} target="_blank" rel="noopener noreferrer" className={styles.shot}>
                <img src={resolveMediaUrl(s)} alt="Screenshot attached to this report" loading="lazy" />
                <span>Screenshot from the feedback report · open full size</span>
              </a>
            ))}

            <h3 className={styles.threadTitle}>{issue.thread.length ? `${issue.thread.length} comment${issue.thread.length === 1 ? '' : 's'}` : 'No comments yet'}</h3>
            <ol className={styles.thread}>
              {issue.thread.map((c) => (
                <li key={c.id} className={styles.comment}>
                  <div className={styles.commentHead}>
                    {c.author && <img className={styles.avatar} src={c.author.avatarUrl} alt="" />}
                    <strong>{c.author?.login ?? 'unknown'}</strong>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" title={absoluteTime(c.createdAt)}>{relativeTime(c.createdAt)}</a>
                  </div>
                  <div className={styles.markdown} dangerouslySetInnerHTML={githubHtml(c.bodyHtml)} />
                </li>
              ))}
            </ol>

            {canEdit && (
              <form className={styles.composer} onSubmit={sendComment}>
                <label htmlFor="issue-comment" className={styles.srOnly}>Add a comment</label>
                <textarea id="issue-comment" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment (Markdown works)…" disabled={busy} />
                <div className={styles.composerActions}>
                  <span className={styles.hint}>Posted to GitHub with your admin username.</span>
                  <Button type="submit" variant="primary" disabled={busy || !comment.trim()}>Comment</Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NewIssueModal({ labels, onClose, onCreated }: { labels: IssueLabel[]; onClose: () => void; onCreated: (s: IssueSummary) => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [column, setColumn] = useState<ColumnId>('todo');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const s = await createIssue({ title, body, labels: picked, column });
      toast.success(`Issue #${s.number} created`);
      refreshNavBadges();
      onCreated(s);
    } catch (err) {
      toast.error(apiMessage(err, 'Couldn’t create the issue'));
      setBusy(false);
    }
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="new-issue-title" onSubmit={submit}>
        <header className={styles.drawerHead}>
          <h2 id="new-issue-title" className={styles.modalTitle}>New issue</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close"><FontAwesomeIcon icon={faXmark} /></button>
        </header>
        <div className={styles.modalBody}>
          <label className={styles.field}>
            <span>Title</span>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={256} required placeholder="Short summary of the problem or task" />
          </label>
          <label className={styles.field}>
            <span>Description</span>
            <textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happens, what should happen, steps to reproduce… (Markdown works)" />
          </label>
          <label className={styles.field}>
            <span>Status</span>
            <select className={styles.select} value={column} onChange={(e) => setColumn(e.target.value as ColumnId)}>
              {COLUMNS.filter((c) => c.id !== 'done').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {labels.length > 0 && (
            <fieldset className={styles.field}>
              <legend>Labels</legend>
              <div className={styles.labelGrid}>
                {labels.map((l) => (
                  <label key={l.name} className={styles.labelToggle}>
                    <input type="checkbox" checked={picked.includes(l.name)} onChange={() => setPicked((p) => (p.includes(l.name) ? p.filter((x) => x !== l.name) : [...p, l.name]))} />
                    <LabelChip label={l} />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
        <footer className={styles.modalFoot}>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" icon={faGithub} disabled={busy || !title.trim()}>{busy ? 'Creating…' : 'Create issue'}</Button>
        </footer>
      </form>
    </div>
  );
}
