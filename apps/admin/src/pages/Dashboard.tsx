import { DragEvent, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faGripVertical, faSliders, faRotateLeft, faComments, faCakeCandles,
  faFileLines, faImages, faLayerGroup, faTags, faUsers, faGear, faPenToSquare, faGift, faDove,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useAuth } from '../hooks/useAuth';
import { fetchDashboardStats } from '../services/dashboard';
import { createPost } from '../services/posts';
import { resolveMediaUrl } from '../services/media';
import { DashboardStats } from '../types';
import { PERMISSIONS } from '@headtilts/shared';
import styles from './Dashboard.module.css';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const STATUS_LABEL: Record<string, string> = {
  published: 'Published',
  draft: 'Draft',
  scheduled: 'Scheduled',
  trash: 'Trash',
};

const STATUS_CLASS: Record<string, string> = {
  published: styles.badgePublished,
  draft: styles.badgeDraft,
  scheduled: styles.badgeScheduled,
  trash: styles.badgeTrash,
};

const COMMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  spam: 'Spam',
  trash: 'Trash',
};

const COMMENT_STATUS_CLASS: Record<string, string> = {
  pending: styles.badgeScheduled,
  approved: styles.badgePublished,
  spam: styles.badgeTrash,
  trash: styles.badgeDraft,
};

const MONTH_LABEL = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function celebrationWhen(daysUntil: number, month: number, day: number): string {
  const date = `${MONTH_LABEL[month - 1]} ${day}`;
  if (daysUntil === 0) return `Today · ${date}`;
  if (daysUntil === 1) return `Tomorrow · ${date}`;
  return `In ${daysUntil} days · ${date}`;
}

// ── Dashboard pods (reorderable + show/hide, persisted per user) ──
type PodId =
  | 'stats' | 'glance' | 'recentPosts' | 'quickDraft' | 'recentMedia'
  | 'comments' | 'recentUsers' | 'celebrations' | 'quickLinks';

const DEFAULT_ORDER: PodId[] = [
  'stats', 'glance', 'recentPosts', 'quickDraft', 'recentMedia',
  'comments', 'recentUsers', 'celebrations', 'quickLinks',
];
const POD_LABEL: Record<PodId, string> = {
  stats: 'Overview',
  glance: 'At a Glance',
  recentPosts: 'Recent Posts',
  quickDraft: 'Quick Draft',
  recentMedia: 'Recent Media',
  comments: 'Pending Comments',
  recentUsers: 'Recent Users',
  celebrations: 'Upcoming Celebrations',
  quickLinks: 'Quick Links',
};

function layoutKey(userId?: string): string {
  return `htilts:dashboard:layout:${userId ?? 'anon'}`;
}

interface SavedLayout {
  order: PodId[];
  hidden: PodId[];
}

function readLayout(userId?: string): SavedLayout | null {
  try {
    const raw = localStorage.getItem(layoutKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      order: Array.isArray(parsed.order) ? parsed.order : [],
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
    };
  } catch {
    return null;
  }
}

// Merge the saved layout with the pods this user can currently see: keep the
// saved order for known pods, append any new ones, and drop anything stale.
function reconcileLayout(userId: string | undefined, availableIds: PodId[]): { order: PodId[]; hidden: Set<PodId> } {
  const saved = readLayout(userId);
  const savedOrder = (saved?.order ?? []).filter((id) => availableIds.includes(id));
  const order = [...savedOrder, ...availableIds.filter((id) => !savedOrder.includes(id))];
  const hidden = new Set((saved?.hidden ?? []).filter((id) => availableIds.includes(id)));
  return { order, hidden };
}

function writeLayout(userId: string | undefined, order: PodId[], hidden: Set<PodId>) {
  try {
    localStorage.setItem(layoutKey(userId), JSON.stringify({ order, hidden: Array.from(hidden) }));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  const canCreatePost = hasPermission(PERMISSIONS.POST_CREATE);
  const canViewUsers = hasPermission(PERMISSIONS.USER_READ);
  const canViewMedia = hasPermission(PERMISSIONS.MEDIA_READ);
  const canModerateComments = hasPermission(PERMISSIONS.COMMENT_READ);
  const canViewCelebrations = hasPermission(PERMISSIONS.CELEBRATION_READ);
  const canViewCategories = hasPermission(PERMISSIONS.CATEGORY_READ);
  const canViewTags = hasPermission(PERMISSIONS.TAG_READ);
  const canViewSettings = hasPermission(PERMISSIONS.SETTING_READ);

  // Pods this user is allowed to see, in their default order.
  const availableIds = useMemo<PodId[]>(
    () =>
      DEFAULT_ORDER.filter((id) => {
        if (id === 'quickDraft') return canCreatePost;
        if (id === 'recentMedia') return canViewMedia;
        if (id === 'comments') return canModerateComments;
        if (id === 'recentUsers') return canViewUsers;
        if (id === 'celebrations') return canViewCelebrations;
        return true;
      }),
    [canCreatePost, canViewMedia, canModerateComments, canViewUsers, canViewCelebrations],
  );

  // ── Layout state (lazy-loaded from storage; persisted synchronously on change) ──
  const [order, setOrder] = useState<PodId[]>(() => reconcileLayout(user?.id, availableIds).order);
  const [hidden, setHidden] = useState<Set<PodId>>(() => reconcileLayout(user?.id, availableIds).hidden);
  const [showCustomize, setShowCustomize] = useState(false);
  const [dragId, setDragId] = useState<PodId | null>(null);
  const [overId, setOverId] = useState<PodId | null>(null);
  const didMountRef = useRef(false);
  const customizeRef = useRef<HTMLDivElement>(null);

  // Close the Customize popover on an outside click.
  useEffect(() => {
    if (!showCustomize) return;
    function onDocMouseDown(e: MouseEvent) {
      if (customizeRef.current && !customizeRef.current.contains(e.target as Node)) {
        setShowCustomize(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [showCustomize]);

  useEffect(() => {
    setFetchError(null);
    fetchDashboardStats()
      .then(setStats)
      .catch(() => setFetchError('Could not load dashboard stats. Make sure the API server is running.'))
      .finally(() => setLoading(false));
  }, []);

  // Re-reconcile when the user or their available pods change (e.g. switching
  // accounts or permission changes). The initial mount is handled by lazy init.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const next = reconcileLayout(user?.id, availableIds);
    setOrder(next.order);
    setHidden(next.hidden);
  }, [user?.id, availableIds]);

  async function handleQuickDraft(e: FormEvent) {
    e.preventDefault();
    if (!draftTitle.trim()) return;
    setDraftSaving(true);
    try {
      await createPost({ title: draftTitle.trim(), content: draftContent, status: 'draft' });
      setDraftTitle('');
      setDraftContent('');
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 3000);
      // Refresh stats to show new draft count
      fetchDashboardStats().then(setStats);
    } finally {
      setDraftSaving(false);
    }
  }

  // ── Drag-and-drop reordering (reorder on drop; drag-enter only highlights) ──
  function handleDragEnterPod(id: PodId) {
    if (dragId && dragId !== id) setOverId(id);
  }

  function handleDropOnPod(target: PodId) {
    if (dragId && dragId !== target) {
      const from = order.indexOf(dragId);
      const to = order.indexOf(target);
      if (from !== -1 && to !== -1) {
        const next = order.filter((x) => x !== dragId);
        const targetIdx = next.indexOf(target);
        // Dropping a pod onto another places it just after that pod when moving
        // down the list, or just before it when moving up — the natural feel.
        next.splice(from < to ? targetIdx + 1 : targetIdx, 0, dragId);
        setOrder(next);
        writeLayout(user?.id, next, hidden);
      }
    }
    handleDragEnd();
  }

  function handleHandleDragStart(e: DragEvent<HTMLButtonElement>, id: PodId) {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    const card = (e.currentTarget.closest(`.${styles.pod}`) as HTMLElement | null);
    if (card) e.dataTransfer.setDragImage(card, 24, 24);
  }

  function handleDragEnd() {
    setDragId(null);
    setOverId(null);
  }

  // ── Show/hide ──
  function toggleHidden(id: PodId) {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHidden(next);
    writeLayout(user?.id, order, next);
  }

  function resetLayout() {
    setOrder(availableIds);
    setHidden(new Set());
    writeLayout(user?.id, availableIds, new Set());
  }

  // ── Pod content ──
  function renderPodAction(id: PodId): ReactNode {
    if (id === 'recentPosts' && canCreatePost) {
      return <Link to="/admin/posts/new" className={styles.panelAction}><FontAwesomeIcon icon={faPlus} /> New Post</Link>;
    }
    if (id === 'recentMedia') {
      return <Link to="/admin/media" className={styles.panelAction}>View all</Link>;
    }
    if (id === 'comments') {
      return <Link to="/admin/comments" className={styles.panelAction}>Moderate</Link>;
    }
    if (id === 'recentUsers') {
      return <Link to="/admin/users" className={styles.panelAction}>View all</Link>;
    }
    if (id === 'celebrations') {
      return <Link to="/admin/celebrations" className={styles.panelAction}>Manage</Link>;
    }
    return null;
  }

  function renderPodBody(id: PodId): ReactNode {
    switch (id) {
      case 'stats':
        return (
          <div className={styles.statRow}>
            <Link to="/admin/posts?status=published" className={styles.statCard}>
              <span className={styles.statNumber}>{loading ? '—' : (stats?.posts.published ?? 0)}</span>
              <span className={styles.statLabel}>Published Posts</span>
            </Link>
            <Link to="/admin/posts?status=draft" className={styles.statCard}>
              <span className={styles.statNumber}>{loading ? '—' : (stats?.posts.draft ?? 0)}</span>
              <span className={styles.statLabel}>Drafts</span>
            </Link>
            <Link to="/admin/pages" className={styles.statCard}>
              <span className={styles.statNumber}>{loading ? '—' : (stats?.pages.count ?? 0)}</span>
              <span className={styles.statLabel}>Pages</span>
            </Link>
            {canViewMedia && (
              <Link to="/admin/media" className={styles.statCard}>
                <span className={styles.statNumber}>{loading ? '—' : (stats?.media.count ?? 0)}</span>
                <span className={styles.statLabel}>Media Files</span>
              </Link>
            )}
            {canViewUsers && (
              <Link to="/admin/users" className={styles.statCard}>
                <span className={styles.statNumber}>{loading ? '—' : (stats?.users.count ?? 0)}</span>
                <span className={styles.statLabel}>Users</span>
              </Link>
            )}
          </div>
        );

      case 'glance':
        if (loading) return <p className={styles.loadingText}>Loading…</p>;
        if (!stats) return null;
        return (
          <ul className={styles.glanceList}>
            <li>
              <Link to="/admin/posts?status=published">
                <strong>{stats.posts.published}</strong> Published Post{stats.posts.published !== 1 ? 's' : ''}
              </Link>
            </li>
            <li>
              <Link to="/admin/posts?status=draft">
                <strong>{stats.posts.draft}</strong> Draft{stats.posts.draft !== 1 ? 's' : ''}
              </Link>
            </li>
            <li>
              <Link to="/admin/pages">
                <strong>{stats.pages.count}</strong> Page{stats.pages.count !== 1 ? 's' : ''}
              </Link>
            </li>
            {stats.posts.scheduled > 0 && (
              <li>
                <Link to="/admin/posts?status=scheduled">
                  <strong>{stats.posts.scheduled}</strong> Scheduled
                </Link>
              </li>
            )}
            {canViewMedia && (
              <li>
                <Link to="/admin/media">
                  <strong>{stats.media.count}</strong> Media File{stats.media.count !== 1 ? 's' : ''}
                  {stats.media.totalSize > 0 && (
                    <span className={styles.glanceMeta}> ({formatBytes(stats.media.totalSize)})</span>
                  )}
                </Link>
              </li>
            )}
            <li>
              <Link to="/admin/categories">
                <strong>{stats.categories.count}</strong> Categor{stats.categories.count !== 1 ? 'ies' : 'y'}
              </Link>
            </li>
            <li>
              <Link to="/admin/tags">
                <strong>{stats.tags.count}</strong> Tag{stats.tags.count !== 1 ? 's' : ''}
              </Link>
            </li>
            {canViewUsers && (
              <li>
                <Link to="/admin/users">
                  <strong>{stats.users.active}</strong> Active User{stats.users.active !== 1 ? 's' : ''}
                </Link>
              </li>
            )}
          </ul>
        );

      case 'recentPosts':
        if (loading) return <p className={styles.loadingText}>Loading…</p>;
        if (stats && stats.recentPosts.length > 0) {
          return (
            <ul className={styles.postList}>
              {stats.recentPosts.map((post) => (
                <li key={post.id} className={styles.postRow}>
                  <div className={styles.postInfo}>
                    <Link to={`/admin/posts/${post.id}/edit`} className={styles.postTitle}>
                      {post.title || '(no title)'}
                    </Link>
                    <div className={styles.postMeta}>
                      <span className={`${styles.badge} ${STATUS_CLASS[post.status] ?? ''}`}>
                        {STATUS_LABEL[post.status] ?? post.status}
                      </span>
                      {post.author && (
                        <span className={styles.postAuthor}>
                          by {post.author.firstName ?? post.author.username}
                        </span>
                      )}
                      <span className={styles.postDate}>{timeAgo(post.updatedAt)}</span>
                    </div>
                  </div>
                  <Link to={`/admin/posts/${post.id}/edit`} className={styles.editLink}>
                    Edit
                  </Link>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p className={styles.emptyText}>No posts yet.{' '}
            {canCreatePost && <Link to="/admin/posts/new">Write your first post</Link>}
          </p>
        );

      case 'quickDraft':
        return (
          <>
            {draftSaved && (
              <div className={styles.draftSaved}>Draft saved! <Link to="/admin/posts?status=draft">View drafts</Link></div>
            )}
            <form onSubmit={handleQuickDraft} className={styles.draftForm}>
              <input
                type="text"
                placeholder="Title"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className={styles.draftTitleInput}
                required
              />
              <textarea
                placeholder="What's on your mind?"
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                className={styles.draftBody}
                rows={5}
              />
              <button
                type="submit"
                className={styles.draftButton}
                disabled={draftSaving || !draftTitle.trim()}
              >
                {draftSaving ? 'Saving…' : 'Save Draft'}
              </button>
            </form>
          </>
        );

      case 'recentMedia':
        if (loading) return <p className={styles.loadingText}>Loading…</p>;
        if (stats && stats.recentMedia.length > 0) {
          return (
            <div className={styles.mediaGrid}>
              {stats.recentMedia.map((item) => (
                <Link key={item.id} to="/admin/media" className={styles.mediaTile} title={item.originalName}>
                  <img src={resolveMediaUrl(item.url)} alt={item.originalName} loading="lazy" />
                </Link>
              ))}
            </div>
          );
        }
        return (
          <p className={styles.emptyText}>
            No media yet.{' '}
            <Link to="/admin/media">Upload your first file</Link>
          </p>
        );

      case 'comments':
        if (loading) return <p className={styles.loadingText}>Loading…</p>;
        if (stats && stats.comments.recent.length > 0) {
          return (
            <>
              {stats.comments.pending > 0 && (
                <p className={styles.podSummary}>
                  <strong>{stats.comments.pending}</strong> comment{stats.comments.pending !== 1 ? 's' : ''} awaiting moderation.
                </p>
              )}
              <ul className={styles.postList}>
                {stats.comments.recent.map((c) => (
                  <li key={c.id} className={styles.postRow}>
                    <div className={styles.postInfo}>
                      <Link to="/admin/comments" className={styles.postTitle}>
                        {c.authorName}: {c.content.length > 80 ? `${c.content.slice(0, 80)}…` : c.content}
                      </Link>
                      <div className={styles.postMeta}>
                        <span className={`${styles.badge} ${COMMENT_STATUS_CLASS[c.status] ?? ''}`}>
                          {COMMENT_STATUS_LABEL[c.status] ?? c.status}
                        </span>
                        <span className={styles.postAuthor}>on "{c.post.title}"</span>
                        <span className={styles.postDate}>{timeAgo(c.createdAt)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          );
        }
        return <p className={styles.emptyText}>No comments yet.</p>;

      case 'recentUsers':
        if (loading) return <p className={styles.loadingText}>Loading…</p>;
        if (stats && stats.recentUsers.length > 0) {
          return (
            <ul className={styles.postList}>
              {stats.recentUsers.map((u) => (
                <li key={u.id} className={styles.postRow}>
                  <div className={styles.userAvatar}>
                    {u.avatar
                      ? <img src={resolveMediaUrl(u.avatar)} alt="" />
                      : (u.firstName?.[0] ?? u.username[0]).toUpperCase()}
                  </div>
                  <div className={styles.postInfo}>
                    <Link to="/admin/users" className={styles.postTitle}>
                      {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.username}
                    </Link>
                    <div className={styles.postMeta}>
                      <span className={styles.postAuthor}>{u.email}</span>
                      <span className={styles.postDate}>Joined {timeAgo(u.createdAt)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          );
        }
        return <p className={styles.emptyText}>No users yet.</p>;

      case 'celebrations':
        if (loading) return <p className={styles.loadingText}>Loading…</p>;
        if (stats && stats.upcomingCelebrations.length > 0) {
          return (
            <ul className={styles.postList}>
              {stats.upcomingCelebrations.map((c) => (
                <li key={c.id} className={styles.postRow}>
                  <div className={styles.celebAvatar}>
                    {c.photo
                      ? <img src={resolveMediaUrl(c.photo)} alt="" />
                      : <FontAwesomeIcon icon={c.type === 'birthday' ? faGift : faDove} />}
                  </div>
                  <div className={styles.postInfo}>
                    <Link to="/admin/celebrations" className={styles.postTitle}>{c.name}</Link>
                    <div className={styles.postMeta}>
                      <span className={`${styles.badge} ${c.type === 'birthday' ? styles.badgeBirthday : styles.badgeRemembrance}`}>
                        {c.type === 'birthday' ? 'Birthday' : 'Remembrance'}
                      </span>
                      <span className={styles.postDate}>{celebrationWhen(c.daysUntil, c.month, c.day)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p className={styles.emptyText}>
            No celebrations configured.{' '}
            <Link to="/admin/celebrations">Add one</Link>
          </p>
        );

      case 'quickLinks':
        return (
          <div className={styles.quickLinks}>
            {canCreatePost && (
              <Link to="/admin/posts/new" className={styles.quickLink}>
                <FontAwesomeIcon icon={faPenToSquare} /><span>New Post</span>
              </Link>
            )}
            {canCreatePost && (
              <Link to="/admin/pages/new" className={styles.quickLink}>
                <FontAwesomeIcon icon={faFileLines} /><span>New Page</span>
              </Link>
            )}
            {canViewMedia && (
              <Link to="/admin/media" className={styles.quickLink}>
                <FontAwesomeIcon icon={faImages} /><span>Media</span>
              </Link>
            )}
            {canModerateComments && (
              <Link to="/admin/comments" className={styles.quickLink}>
                <FontAwesomeIcon icon={faComments} /><span>Comments</span>
              </Link>
            )}
            {canViewUsers && (
              <Link to="/admin/users" className={styles.quickLink}>
                <FontAwesomeIcon icon={faUsers} /><span>Users</span>
              </Link>
            )}
            {canViewCelebrations && (
              <Link to="/admin/celebrations" className={styles.quickLink}>
                <FontAwesomeIcon icon={faCakeCandles} /><span>Celebrations</span>
              </Link>
            )}
            {canViewCategories && (
              <Link to="/admin/categories" className={styles.quickLink}>
                <FontAwesomeIcon icon={faLayerGroup} /><span>Categories</span>
              </Link>
            )}
            {canViewTags && (
              <Link to="/admin/tags" className={styles.quickLink}>
                <FontAwesomeIcon icon={faTags} /><span>Tags</span>
              </Link>
            )}
            {canViewSettings && (
              <Link to="/admin/settings" className={styles.quickLink}>
                <FontAwesomeIcon icon={faGear} /><span>Settings</span>
              </Link>
            )}
          </div>
        );

      default:
        return null;
    }
  }

  const visiblePods = order.filter((id) => availableIds.includes(id) && !hidden.has(id));

  return (
    <AdminLayout>
      {fetchError && <div className={styles.fetchError}>{fetchError}</div>}

      {/* Welcome banner + Customize */}
      <div className={styles.welcome}>
        <div className={styles.welcomeText}>
          <h2>Welcome back, {user?.firstName || user?.username}!</h2>
          <p>Here's what's happening with your site today.</p>
        </div>

        <div className={styles.customizeWrap} ref={customizeRef}>
          <button
            type="button"
            className={`${styles.customizeBtn} ${showCustomize ? styles.customizeBtnActive : ''}`}
            onClick={() => setShowCustomize((s) => !s)}
          >
            <FontAwesomeIcon icon={faSliders} /> Customize
          </button>
          {showCustomize && (
            <div className={styles.customizePanel} role="dialog" aria-label="Customize dashboard">
              <div className={styles.customizeHead}>
                <span>Dashboard pods</span>
                <button type="button" className={styles.resetBtn} onClick={resetLayout}>
                  <FontAwesomeIcon icon={faRotateLeft} /> Reset
                </button>
              </div>
              <p className={styles.customizeHint}>Toggle a pod to show or hide it. Drag the grip on any pod to reorder.</p>
              <ul className={styles.customizeList}>
                {order.filter((id) => availableIds.includes(id)).map((id) => (
                  <li key={id}>
                    <label className={styles.switchRow}>
                      <span>{POD_LABEL[id]}</span>
                      <span className={styles.switch}>
                        <input type="checkbox" checked={!hidden.has(id)} onChange={() => toggleHidden(id)} />
                        <span className={styles.slider} />
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Pods */}
      {visiblePods.length === 0 ? (
        <div className={styles.allHidden}>
          All pods are hidden. Open <strong>Customize</strong> to bring some back.
        </div>
      ) : (
        <div className={styles.podGrid}>
          {visiblePods.map((id) => (
            <section
              key={id}
              className={[
                styles.pod,
                id === 'stats' ? styles.podWide : '',
                dragId === id ? styles.podDragging : '',
                overId === id && dragId && dragId !== id ? styles.podOver : '',
              ].filter(Boolean).join(' ')}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => handleDragEnterPod(id)}
              onDrop={(e) => { e.preventDefault(); handleDropOnPod(id); }}
            >
              <div className={styles.podHeader}>
                <button
                  type="button"
                  className={styles.podHandle}
                  title="Drag to reorder"
                  aria-label={`Reorder ${POD_LABEL[id]}`}
                  draggable
                  onDragStart={(e) => handleHandleDragStart(e, id)}
                  onDragEnd={handleDragEnd}
                >
                  <FontAwesomeIcon icon={faGripVertical} />
                </button>
                <h3 className={styles.podTitle}>{POD_LABEL[id]}</h3>
                <div className={styles.podActionSlot}>{renderPodAction(id)}</div>
              </div>
              <div className={styles.podBody}>{renderPodBody(id)}</div>
            </section>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
