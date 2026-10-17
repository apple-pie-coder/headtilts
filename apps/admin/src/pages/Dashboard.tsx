import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faSliders, faRotateLeft, faComments, faEnvelope, faPenToSquare, faClock, faCircleCheck,
  faFileImport, faArrowRight, faChevronUp, faChevronDown, faCheck, faBan, faGift, faDove,
  faImages, faUserPlus, faCalendarDay, faArrowsRotate, faTriangleExclamation, faEye,
  faListCheck, faCommentDots, faBug, faLightbulb, faCircleQuestion,
} from '@fortawesome/free-solid-svg-icons';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { PERMISSIONS } from '@headtilts/shared';
import { AdminLayout } from '../components/AdminLayout';
import { useToast } from '../components/ToastContext';
import { Button, IconButton, PageHeader, Popover, Switch, absoluteTime, relativeTime, uiStyles } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { REFRESH_EVENT, refreshNavBadges, useNavBadges } from '../hooks/useNavBadges';
import { fetchDashboardStats } from '../services/dashboard';
import { createPost, fetchPosts } from '../services/posts';
import { fetchComments, setCommentStatus } from '../services/comments';
import { resolveMediaUrl } from '../services/media';
import { FeedbackItem, fetchFeedback } from '../services/feedback';
import { ColumnId, IssueSummaryInfo, fetchIssueSummary } from '../services/issues';
import { lastSeen, newCounts } from '../utils/seen';
import { AdminComment, DashboardStats, Post } from '../types';
import styles from './Dashboard.module.css';

/* ── Helpers ───────────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function personName(a?: { firstName?: string | null; lastName?: string | null; username: string } | null): string {
  if (!a) return '';
  return [a.firstName, a.lastName].filter(Boolean).join(' ') || a.username;
}

const COLUMN_LABEL: Record<ColumnId, string> = { todo: 'To do', in_progress: 'In progress', review: 'In review', done: 'Done' };
const FEEDBACK_ICON: Record<string, IconDefinition> = { bug: faBug, idea: faLightbulb, question: faCircleQuestion };

const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ── Layout: which panels show, and in what order (per user) ── */

type PodId = 'glance' | 'drafts' | 'published' | 'recentMedia' | 'quickDraft' | 'comments' | 'tracker' | 'comingUp' | 'recentUsers';
type Column = 'main' | 'side';

const PODS: { id: PodId; label: string; column: Column | 'top' }[] = [
  { id: 'glance', label: 'Site summary', column: 'top' },
  { id: 'drafts', label: 'Continue writing', column: 'main' },
  { id: 'published', label: 'Latest published', column: 'main' },
  { id: 'recentMedia', label: 'Recent media', column: 'main' },
  { id: 'quickDraft', label: 'Quick draft', column: 'side' },
  { id: 'comments', label: 'Comments to review', column: 'side' },
  { id: 'tracker', label: 'Issues & feedback', column: 'side' },
  { id: 'comingUp', label: 'Coming up', column: 'side' },
  { id: 'recentUsers', label: 'New members', column: 'side' },
];
const POD = Object.fromEntries(PODS.map((p) => [p.id, p])) as Record<PodId, (typeof PODS)[number]>;
const DEFAULT_ORDER = PODS.map((p) => p.id);

interface Layout { order: PodId[]; hidden: Set<PodId> }

const layoutKey = (userId?: string) => `htilts:dashboard:v2:${userId ?? 'anon'}`;

/** Saved layout merged with the panels this user may see: unknown ids dropped, new ones appended. */
function loadLayout(userId: string | undefined, available: PodId[]): Layout {
  let saved: { order?: unknown; hidden?: unknown } = {};
  try { saved = JSON.parse(localStorage.getItem(layoutKey(userId)) || '{}'); } catch { /* ignore */ }
  const savedOrder = (Array.isArray(saved.order) ? saved.order : []).filter((id): id is PodId => available.includes(id));
  return {
    order: [...savedOrder, ...available.filter((id) => !savedOrder.includes(id))],
    hidden: new Set((Array.isArray(saved.hidden) ? saved.hidden : []).filter((id): id is PodId => available.includes(id))),
  };
}

function saveLayout(userId: string | undefined, layout: Layout) {
  try {
    localStorage.setItem(layoutKey(userId), JSON.stringify({ order: layout.order, hidden: Array.from(layout.hidden) }));
  } catch { /* storage unavailable — non-fatal */ }
}

/* ── Small building blocks ─────────────────────────────────── */

function Pod({ title, icon, action, children }: { title: string; icon: IconDefinition; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.pod}>
      <header className={styles.podHeader}>
        <h2 className={styles.podTitle}><FontAwesomeIcon icon={icon} className={styles.podIcon} />{title}</h2>
        {action && <div className={styles.podAction}>{action}</div>}
      </header>
      {children}
    </section>
  );
}

/** Compact empty message sized for a dashboard panel. */
function PodEmpty({ icon, title, description, action }: { icon: IconDefinition; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}><FontAwesomeIcon icon={icon} /></span>
      <span className={styles.emptyText}>
        <strong>{title}</strong>
        {description && <span>{description}</span>}
        {action}
      </span>
    </div>
  );
}

function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.skelRow}>
          <span className={uiStyles.skeleton} style={{ width: `${60 + ((i * 17) % 30)}%` }} />
          <span className={uiStyles.skeleton} style={{ width: `${30 + ((i * 11) % 20)}%`, height: '0.55rem' }} />
        </div>
      ))}
    </div>
  );
}

interface AttentionItem { key: string; icon: IconDefinition; tone: 'warning' | 'info' | 'accent' | 'neutral'; title: string; detail?: string; to: string; cta: string }

/* ── Page ──────────────────────────────────────────────────── */

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const badges = useNavBadges(hasPermission);

  const canCreatePost = hasPermission(PERMISSIONS.POST_CREATE);
  const canViewUsers = hasPermission(PERMISSIONS.USER_READ);
  const canViewMedia = hasPermission(PERMISSIONS.MEDIA_READ);
  const canModerate = hasPermission(PERMISSIONS.COMMENT_READ);
  const canContact = hasPermission(PERMISSIONS.CONTACT_READ);
  const canViewCelebrations = hasPermission(PERMISSIONS.CELEBRATION_READ);
  const canTrack = hasPermission(PERMISSIONS.SETTING_READ);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [drafts, setDrafts] = useState<Post[] | null>(null);
  const [published, setPublished] = useState<Post[] | null>(null);
  const [scheduled, setScheduled] = useState<Post[] | null>(null);
  const [pending, setPending] = useState<AdminComment[] | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[] | null>(null);
  const [issues, setIssues] = useState<IssueSummaryInfo | 'error' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Issues & feedback: kept fresh while the dashboard is open.
  const loadTracker = useCallback(() => {
    if (!canTrack) return;
    // GitHub can be slow; don't hold the rest of the dashboard for it.
    fetchFeedback(1, 20).then((r) => setFeedback(r.items)).catch(() => setFeedback((f) => f ?? []));
    fetchIssueSummary().then(setIssues).catch(() => setIssues((i) => (i && i !== 'error' ? i : 'error')));
  }, [canTrack]);

  useEffect(() => {
    if (!canTrack) return;
    const id = setInterval(loadTracker, 30_000);
    window.addEventListener('focus', loadTracker);
    window.addEventListener(REFRESH_EVENT, loadTracker);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', loadTracker);
      window.removeEventListener(REFRESH_EVENT, loadTracker);
    };
  }, [canTrack, loadTracker]);

  const load = useCallback(async () => {
    setError(null);
    loadTracker();
    const [s, d, p, sc, c] = await Promise.allSettled([
      fetchDashboardStats(),
      fetchPosts(1, 5, { status: 'draft', sortBy: 'updatedAt', sortOrder: 'desc' }),
      fetchPosts(1, 5, { status: 'published', sortBy: 'publishedAt', sortOrder: 'desc' }),
      fetchPosts(1, 20, { status: 'scheduled' }),
      canModerate ? fetchComments(1, 5, { status: 'pending', sortBy: 'createdAt', sortOrder: 'desc' }) : Promise.resolve(null),
    ]);
    if (s.status === 'fulfilled') setStats(s.value);
    else setError('Couldn’t load the dashboard. Check that the API is running, then try again.');
    setDrafts(d.status === 'fulfilled' ? d.value.items : []);
    setPublished(p.status === 'fulfilled' ? p.value.items : []);
    setScheduled(sc.status === 'fulfilled'
      ? [...sc.value.items].sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''))
      : []);
    setPending(c.status === 'fulfilled' && c.value ? c.value.items : []);
    setLoading(false);
  }, [canModerate, loadTracker]);

  useEffect(() => { load(); }, [load]);

  /* ── Layout ── */

  const available = useMemo(() => DEFAULT_ORDER.filter((id) => {
    if (id === 'quickDraft') return canCreatePost;
    if (id === 'recentMedia') return canViewMedia;
    if (id === 'comments') return canModerate;
    if (id === 'recentUsers') return canViewUsers;
    if (id === 'tracker') return canTrack;
    return true;
  }), [canCreatePost, canViewMedia, canModerate, canViewUsers, canTrack]);

  const [layout, setLayout] = useState<Layout>(() => loadLayout(user?.id, available));
  useEffect(() => { setLayout(loadLayout(user?.id, available)); }, [user?.id, available]);

  function updateLayout(next: Layout) {
    setLayout(next);
    saveLayout(user?.id, next);
  }

  function toggle(id: PodId) {
    const hidden = new Set(layout.hidden);
    if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    updateLayout({ ...layout, hidden });
  }

  /** Move a panel up or down among the panels of its own column. */
  function move(id: PodId, dir: -1 | 1) {
    const col = POD[id].column;
    const same = layout.order.filter((x) => POD[x].column === col);
    const i = same.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= same.length) return;
    [same[i], same[j]] = [same[j], same[i]];
    let k = 0;
    updateLayout({ ...layout, order: layout.order.map((x) => (POD[x].column === col ? same[k++] : x)) });
  }

  const shown = (col: Column | 'top') => layout.order.filter((id) => POD[id].column === col && !layout.hidden.has(id));

  /* ── Quick draft ── */

  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [draftSaving, setDraftSaving] = useState(false);

  async function saveDraft(e: FormEvent) {
    e.preventDefault();
    if (!draftTitle.trim()) return;
    setDraftSaving(true);
    try {
      const post = await createPost({ title: draftTitle.trim(), content: draftBody, status: 'draft' });
      setDraftTitle('');
      setDraftBody('');
      toast.success('Draft saved', { action: { label: 'Open', onClick: () => navigate(`/admin/posts/${post.id}/edit`) } });
      load();
    } catch {
      toast.error('Couldn’t save the draft. Please try again.');
    } finally {
      setDraftSaving(false);
    }
  }

  /* ── Comment moderation ── */

  async function moderate(comment: AdminComment, status: 'approved' | 'spam') {
    setPending((list) => (list ?? []).filter((c) => c.id !== comment.id));
    setStats((s) => (s ? { ...s, comments: { ...s.comments, pending: Math.max(0, s.comments.pending - 1) } } : s));
    try {
      await setCommentStatus(comment.id, status);
      refreshNavBadges();
      toast.success(status === 'approved' ? 'Comment approved' : 'Marked as spam', {
        action: {
          label: 'Undo',
          onClick: async () => {
            try { await setCommentStatus(comment.id, 'pending'); } finally { refreshNavBadges(); load(); }
          },
        },
      });
    } catch {
      toast.error('Couldn’t update the comment.');
      load();
    }
  }

  /* ── What needs attention ── */

  const pendingCount = stats?.comments.pending ?? badges.comments ?? 0;
  const unread = badges.contact ?? 0;
  const draftCount = stats?.posts.draft ?? 0;
  const scheduledCount = stats?.posts.scheduled ?? 0;
  const nextScheduled = scheduled?.[0]?.scheduledFor;

  const attention: AttentionItem[] = [];
  if (canModerate && pendingCount > 0) {
    attention.push({ key: 'comments', icon: faComments, tone: 'warning', title: `${plural(pendingCount, 'comment')} to review`, to: '/admin/comments?status=pending', cta: 'Review' });
  }
  if (canContact && unread > 0) {
    attention.push({ key: 'contact', icon: faEnvelope, tone: 'info', title: plural(unread, 'unread message'), to: '/admin/contact', cta: 'Open inbox' });
  }
  // New since this browser last opened the Feedback / Issues pages.
  // New since you last looked — not counting your own reports.
  const { feedback: newFeedback, issues: newIssues } = newCounts(user?.id, feedback, issues && issues !== 'error' && issues.configured ? issues : null);
  if (canTrack && newFeedback > 0) {
    attention.push({ key: 'feedback', icon: faCommentDots, tone: 'info', title: `${plural(newFeedback, 'new feedback report')}`, detail: (() => { const f = feedback?.find((x) => x.user?.id !== user?.id); return f ? `Latest: ${f.title}` : undefined; })(), to: '/admin/feedback', cta: 'Read' });
  }
  if (canTrack && newIssues > 0) {
    attention.push({ key: 'issues', icon: faListCheck, tone: 'warning', title: plural(newIssues, 'new issue'), detail: 'Opened since you last checked the board', to: '/admin/issues', cta: 'Open board' });
  }
  if (draftCount > 0) {
    attention.push({ key: 'drafts', icon: faPenToSquare, tone: 'neutral', title: `${plural(draftCount, 'draft')} in progress`, detail: drafts?.[0] ? `Last edited ${relativeTime(drafts[0].updatedAt)}` : undefined, to: '/admin/posts?status=draft', cta: 'Continue' });
  }
  if (scheduledCount > 0) {
    attention.push({ key: 'scheduled', icon: faClock, tone: 'accent', title: `${plural(scheduledCount, 'post')} scheduled`, detail: nextScheduled ? `Next ${relativeTime(nextScheduled)}` : undefined, to: '/admin/posts?status=scheduled', cta: 'View' });
  }

  /* ── Coming up: scheduled posts and celebrations, soonest first ── */

  const comingUp = useMemo(() => {
    const items: { key: string; when: number; node: ReactNode }[] = [];
    for (const p of scheduled ?? []) {
      if (!p.scheduledFor) continue;
      items.push({
        key: `p${p.id}`,
        when: new Date(p.scheduledFor).getTime(),
        node: (
          <>
            <span className={`${styles.rowIcon} ${styles.tone_accent}`}><FontAwesomeIcon icon={faClock} /></span>
            <div className={styles.rowMain}>
              <Link to={`/admin/posts/${p.id}/edit`} className={styles.rowTitle}>{p.title || '(no title)'}</Link>
              <span className={styles.rowMeta} title={absoluteTime(p.scheduledFor)}>Publishes {relativeTime(p.scheduledFor)}</span>
            </div>
          </>
        ),
      });
    }
    if (canViewCelebrations) {
      for (const c of stats?.upcomingCelebrations ?? []) {
        const birthday = c.type === 'birthday';
        const label = c.daysUntil === 0 ? 'Today' : c.daysUntil === 1 ? 'Tomorrow' : `In ${c.daysUntil} days`;
        items.push({
          key: `c${c.id}`,
          when: Date.now() + c.daysUntil * 86_400_000,
          node: (
            <>
              <span className={`${styles.rowIcon} ${birthday ? styles.tone_warning : styles.tone_neutral}`}>
                {c.photo ? <img src={resolveMediaUrl(c.photo)} alt="" /> : <FontAwesomeIcon icon={birthday ? faGift : faDove} />}
              </span>
              <div className={styles.rowMain}>
                <Link to="/admin/celebrations" className={styles.rowTitle}>{c.name}</Link>
                <span className={styles.rowMeta}>{birthday ? 'Birthday' : 'Remembrance'} · {label}, {MONTH_LABEL[c.month - 1]} {c.day}</span>
              </div>
            </>
          ),
        });
      }
    }
    return items.sort((a, b) => a.when - b.when).slice(0, 6);
  }, [scheduled, stats, canViewCelebrations]);

  /* ── Panels ── */

  function renderPod(id: PodId): ReactNode {
    switch (id) {
      case 'glance': {
        const tiles: { label: string; value: ReactNode; to: string; show?: boolean }[] = [
          { label: 'Published posts', value: stats?.posts.published, to: '/admin/posts?status=published' },
          { label: 'Pages', value: stats?.pages.count, to: '/admin/pages' },
          { label: 'Media files', value: stats?.media.count, to: '/admin/media', show: canViewMedia },
          { label: 'Categories', value: stats?.categories.count, to: '/admin/categories' },
          { label: 'Tags', value: stats?.tags.count, to: '/admin/tags' },
          { label: 'Users', value: stats?.users.count, to: '/admin/users', show: canViewUsers },
        ];
        return (
          <section className={styles.glance} aria-label="Site summary">
            {tiles.filter((t) => t.show !== false).map((t) => (
              <Link key={t.label} to={t.to} className={styles.glanceTile}>
                <span className={styles.glanceValue}>{loading ? '–' : (t.value ?? 0)}</span>
                <span className={styles.glanceLabel}>
                  {t.label}
                  {t.label === 'Media files' && !!stats?.media.totalSize && <span className={styles.glanceSub}> · {formatBytes(stats.media.totalSize)}</span>}
                </span>
              </Link>
            ))}
          </section>
        );
      }

      case 'drafts':
        return (
          <Pod title="Continue writing" icon={faPenToSquare} action={draftCount > 5 && <Link to="/admin/posts?status=draft">All {draftCount} drafts</Link>}>
            {drafts === null ? <SkeletonRows /> : drafts.length === 0 ? (
              <PodEmpty icon={faPenToSquare} title="No drafts in progress" description="Posts you save as drafts show up here so you can pick up where you left off."
                action={canCreatePost && <Link to="/admin/posts/new" className={styles.textLink}>Start a new post</Link>} />
            ) : (
              <ul className={styles.list}>
                {drafts.map((p) => (
                  <li key={p.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <Link to={`/admin/posts/${p.id}/edit`} className={styles.rowTitle}>{p.title || '(no title)'}</Link>
                      <span className={styles.rowMeta} title={absoluteTime(p.updatedAt)}>
                        Edited {relativeTime(p.updatedAt)}{p.author && ` · ${personName(p.author)}`}
                      </span>
                    </div>
                    <Link to={`/admin/posts/${p.id}/edit`} className={styles.rowButton}>Edit</Link>
                  </li>
                ))}
              </ul>
            )}
          </Pod>
        );

      case 'published':
        return (
          <Pod title="Latest published" icon={faEye} action={<Link to="/admin/posts?status=published">All posts</Link>}>
            {published === null ? <SkeletonRows rows={5} /> : published.length === 0 ? (
              <PodEmpty icon={faEye} title="Nothing published yet" description="Your newest live posts will appear here." />
            ) : (
              <ul className={styles.list}>
                {published.map((p) => (
                  <li key={p.id} className={styles.row}>
                    <div className={styles.rowMain}>
                      <Link to={`/admin/posts/${p.id}/edit`} className={styles.rowTitle}>{p.title || '(no title)'}</Link>
                      <span className={styles.rowMeta} title={absoluteTime(p.publishedAt)}>
                        {relativeTime(p.publishedAt)}{p.author && ` · ${personName(p.author)}`}
                      </span>
                    </div>
                    {p.publicUrl && (
                      <a href={p.publicUrl} target="_blank" rel="noopener noreferrer" className={styles.rowButton}>View</a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Pod>
        );

      case 'recentMedia':
        return (
          <Pod title="Recent media" icon={faImages} action={<Link to="/admin/media">Open library</Link>}>
            {loading ? <SkeletonRows rows={2} /> : !stats?.recentMedia.length ? (
              <PodEmpty icon={faImages} title="No media yet" action={<Link to="/admin/media" className={styles.textLink}>Upload files</Link>} />
            ) : (
              <div className={styles.mediaGrid}>
                {stats.recentMedia.map((m) => (
                  <Link key={m.id} to="/admin/media" className={styles.mediaTile} title={m.originalName}>
                    <img src={resolveMediaUrl(m.url)} alt={m.originalName} loading="lazy" />
                  </Link>
                ))}
              </div>
            )}
          </Pod>
        );

      case 'quickDraft':
        return (
          <Pod title="Quick draft" icon={faPlus}>
            <form onSubmit={saveDraft} className={styles.draftForm}>
              <label className={styles.srOnly} htmlFor="qd-title">Title</label>
              <input id="qd-title" type="text" placeholder="Title" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} className={styles.input} />
              <label className={styles.srOnly} htmlFor="qd-body">Notes</label>
              <textarea id="qd-body" placeholder="Jot down an idea…" value={draftBody} onChange={(e) => setDraftBody(e.target.value)} className={styles.input} rows={4} />
              <div className={styles.draftFooter}>
                <span className={styles.hint}>Saved as a draft — finish it in the editor.</span>
                <Button type="submit" variant="primary" size="sm" disabled={draftSaving || !draftTitle.trim()}>
                  {draftSaving ? 'Saving…' : 'Save draft'}
                </Button>
              </div>
            </form>
          </Pod>
        );

      case 'comments':
        return (
          <Pod title="Comments to review" icon={faComments} action={<Link to="/admin/comments?status=pending">Open queue</Link>}>
            {pending === null ? <SkeletonRows /> : pending.length === 0 ? (
              <PodEmpty icon={faCircleCheck} title="No comments waiting" description="New comments that need approval will appear here." />
            ) : (
              <ul className={styles.list}>
                {pending.map((c) => (
                  <li key={c.id} className={styles.comment}>
                    <p className={styles.commentText}><strong>{c.authorName}</strong> {c.content}</p>
                    <div className={styles.commentFoot}>
                      <span className={styles.rowMeta}>on <Link to={`/admin/posts/${c.post.id}/edit`}>{c.post.title}</Link> · {relativeTime(c.createdAt)}</span>
                      <span className={styles.commentActions}>
                        <button type="button" className={`${styles.chip} ${styles.chipApprove}`} onClick={() => moderate(c, 'approved')}>
                          <FontAwesomeIcon icon={faCheck} /> Approve
                        </button>
                        <button type="button" className={styles.chip} onClick={() => moderate(c, 'spam')}>
                          <FontAwesomeIcon icon={faBan} /> Spam
                        </button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Pod>
        );

      case 'tracker': {
        const since = lastSeen('feedback');
        return (
          <Pod title="Issues & feedback" icon={faListCheck} action={<Link to="/admin/issues">Open board</Link>}>
            {issues === null ? <SkeletonRows rows={2} /> : issues === 'error' ? (
              <p className={styles.trackerNote}><FontAwesomeIcon icon={faTriangleExclamation} /> Couldn’t reach GitHub just now.</p>
            ) : !issues.configured ? (
              <p className={styles.trackerNote}><FontAwesomeIcon icon={faGithub} /> <Link to="/admin/issues">Connect GitHub</Link> to track issues here.</p>
            ) : (
              <>
                <div className={styles.trackerStats} aria-label="Issues by status">
                  {(Object.keys(COLUMN_LABEL) as ColumnId[]).map((c) => (
                    <Link key={c} to="/admin/issues" className={styles.trackerStat}>
                      <span className={`${styles.trackerDot} ${styles[`dot_${c}`]}`} />
                      <span className={styles.trackerValue}>{issues.counts[c] ?? 0}</span>
                      <span className={styles.trackerLabel}>{c === 'done' ? 'Done lately' : COLUMN_LABEL[c]}</span>
                    </Link>
                  ))}
                </div>
                {issues.recent.length > 0 ? (
                  <ul className={styles.list}>
                    {issues.recent.map((i) => (
                      <li key={i.number} className={styles.row}>
                        <div className={styles.rowMain}>
                          <Link to={`/admin/issues?issue=${i.number}`} className={styles.rowTitle}>
                            <span className={styles.issueNum}>#{i.number}</span> {i.title}
                          </Link>
                          <span className={styles.rowMeta} title={absoluteTime(i.updatedAt)}>{COLUMN_LABEL[i.column]} · updated {relativeTime(i.updatedAt)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.trackerNote}><FontAwesomeIcon icon={faCircleCheck} /> No open issues.</p>
                )}
              </>
            )}

            <div className={styles.trackerSub}>
              <span>Latest feedback</span>
              <Link to="/admin/feedback">All feedback</Link>
            </div>
            {feedback === null ? <SkeletonRows rows={2} /> : feedback.length === 0 ? (
              <p className={styles.trackerNote}>No feedback yet — reports from the <strong>Feedback</strong> button land here.</p>
            ) : (
              <ul className={styles.list}>
                {feedback.slice(0, 3).map((f) => {
                  const isNew = new Date(f.createdAt).getTime() > since && f.user?.id !== user?.id;
                  return (
                    <li key={f.id} className={styles.row}>
                      <span className={`${styles.feedbackIcon} ${styles[`fb_${f.type}`]}`} aria-label={f.type}><FontAwesomeIcon icon={FEEDBACK_ICON[f.type] ?? faCommentDots} /></span>
                      <div className={styles.rowMain}>
                        <Link to="/admin/feedback" className={styles.rowTitle}>{f.title}</Link>
                        <span className={styles.rowMeta}>
                          {f.user ? personName(f.user) : 'Someone'} · {relativeTime(f.createdAt)}
                          {f.issueNumber ? <> · <Link to={`/admin/issues?issue=${f.issueNumber}`}>#{f.issueNumber}</Link>{f.issueState === 'closed' ? ' (closed)' : ''}</> : null}
                        </span>
                      </div>
                      {isNew && <span className={styles.newBadge}>New</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Pod>
        );
      }

      case 'comingUp':
        return (
          <Pod title="Coming up" icon={faCalendarDay} action={canViewCelebrations && <Link to="/admin/celebrations">Celebrations</Link>}>
            {loading ? <SkeletonRows /> : comingUp.length === 0 ? (
              <PodEmpty icon={faCalendarDay} title="Nothing scheduled"
                description={<>Schedule a post from the editor{canViewCelebrations ? ' or add a celebration' : ''} and it will show up here.</>} />
            ) : (
              <ul className={styles.list}>
                {comingUp.map((item) => <li key={item.key} className={styles.row}>{item.node}</li>)}
              </ul>
            )}
          </Pod>
        );

      case 'recentUsers':
        return (
          <Pod title="New members" icon={faUserPlus} action={<Link to="/admin/users">All users</Link>}>
            {loading ? <SkeletonRows /> : !stats?.recentUsers.length ? (
              <PodEmpty icon={faUserPlus} title="No users yet" />
            ) : (
              <ul className={styles.list}>
                {stats.recentUsers.map((u) => (
                  <li key={u.id} className={styles.row}>
                    <span className={styles.avatar}>
                      {u.avatar ? <img src={resolveMediaUrl(u.avatar)} alt="" /> : (u.firstName?.[0] ?? u.username[0]).toUpperCase()}
                    </span>
                    <div className={styles.rowMain}>
                      <span className={styles.rowTitle}>{personName(u)}</span>
                      <span className={styles.rowMeta}>Joined {relativeTime(u.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Pod>
        );

      default:
        return null;
    }
  }

  const main = shown('main');
  const side = shown('side');

  return (
    <AdminLayout>
      <PageHeader
        title={`${greeting()}, ${user?.firstName || user?.username || 'there'}`}
        subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={
          <>
            <Popover align="right" width={300} trigger={({ open, toggle: t }) => (
              <Button variant="ghost" icon={faSliders} onClick={t} aria-expanded={open}>Customize</Button>
            )}>
              <div className={styles.customize} role="group" aria-label="Customize dashboard">
                <div className={styles.customizeHead}>
                  <strong>Dashboard panels</strong>
                  <button type="button" className={styles.linkButton} onClick={() => updateLayout({ order: available, hidden: new Set() })}>
                    <FontAwesomeIcon icon={faRotateLeft} /> Reset
                  </button>
                </div>
                {(['top', 'main', 'side'] as const).map((col) => {
                  const ids = layout.order.filter((id) => POD[id].column === col);
                  if (!ids.length) return null;
                  return (
                    <div key={col} className={styles.customizeGroup}>
                      <span className={styles.customizeGroupLabel}>{col === 'top' ? 'Top' : col === 'main' ? 'Left column' : 'Right column'}</span>
                      {ids.map((id) => (
                        <div key={id} className={styles.customizeRow}>
                          <span className={layout.hidden.has(id) ? styles.customizeOff : undefined}>{POD[id].label}</span>
                          <span className={styles.customizeControls}>
                            {col !== 'top' && (
                              <>
                                <IconButton icon={faChevronUp} label={`Move ${POD[id].label} up`} onClick={() => move(id, -1)} />
                                <IconButton icon={faChevronDown} label={`Move ${POD[id].label} down`} onClick={() => move(id, 1)} />
                              </>
                            )}
                            <Switch checked={!layout.hidden.has(id)} onChange={() => toggle(id)} label={`Show ${POD[id].label}`} />
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </Popover>
            {canCreatePost && (
              <Button variant="secondary" icon={faFileImport} className={styles.hideOnPhone} onClick={() => navigate('/admin/posts/import')}>Import from Word</Button>
            )}
            {canCreatePost && (
              <Button variant="primary" icon={faPlus} onClick={() => navigate('/admin/posts/new')}>New post</Button>
            )}
          </>
        }
      />

      {error && (
        <div className={styles.error} role="alert">
          <FontAwesomeIcon icon={faTriangleExclamation} />
          <span>{error}</span>
          <Button size="sm" icon={faArrowsRotate} onClick={() => { setLoading(true); load(); }}>Retry</Button>
        </div>
      )}

      {/* What needs doing */}
      <section aria-label="Needs your attention" className={styles.attention}>
        {loading ? (
          <div className={`${styles.attentionCard} ${styles.attentionLoading}`} aria-hidden="true"><SkeletonRows rows={1} /></div>
        ) : attention.length === 0 ? (
          <div className={`${styles.attentionCard} ${styles.caughtUp}`}>
            <span className={`${styles.attentionIcon} ${styles.tone_success}`}><FontAwesomeIcon icon={faCircleCheck} /></span>
            <span className={styles.attentionText}>
              <strong>You’re all caught up</strong>
              <span>No comments to review, messages to read or drafts waiting.</span>
            </span>
          </div>
        ) : attention.map((a) => (
          <Link key={a.key} to={a.to} className={styles.attentionCard}>
            <span className={`${styles.attentionIcon} ${styles[`tone_${a.tone}`]}`}><FontAwesomeIcon icon={a.icon} /></span>
            <span className={styles.attentionText}>
              <strong>{a.title}</strong>
              {a.detail && <span>{a.detail}</span>}
            </span>
            <span className={styles.attentionCta}>{a.cta} <FontAwesomeIcon icon={faArrowRight} /></span>
          </Link>
        ))}
      </section>

      {shown('top').map((id) => <div key={id}>{renderPod(id)}</div>)}

      {main.length + side.length === 0 ? (
        <p className={styles.allHidden}>All panels are hidden. Use <strong>Customize</strong> to bring some back.</p>
      ) : (
        <div className={`${styles.columns} ${!main.length || !side.length ? styles.columnsSingle : ''}`}>
          {main.length > 0 && <div className={styles.column}>{main.map((id) => <div key={id}>{renderPod(id)}</div>)}</div>}
          {side.length > 0 && <div className={styles.column}>{side.map((id) => <div key={id}>{renderPod(id)}</div>)}</div>}
        </div>
      )}
    </AdminLayout>
  );
}
