import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faPen, faEye, faCopy, faTrash, faRotateLeft, faStar as faStarSolid, faLink,
  faPenToSquare, faFileLines, faMagnifyingGlass, faTrashCan, faPaperPlane, faFilePen, faImage, faFileImport, faLock,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import {
  ActiveFilter, ActiveFilters, BulkBar, Button, Card, Checkbox, DensityToggle, EmptyState, Field,
  FilterMenu, LoadingBar, MenuItem, PageHeader, Pagination, RowMenu, SearchInput, SortHeader,
  StatusBadge, TableSkeleton, Tabs, absoluteTime, relativeTime, useRowSelection,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useDensity } from '../hooks/useDensity';
import { useHotkeys } from '../hooks/useHotkeys';
import { useUrlState } from '../hooks/useUrlState';
import { Category, Post } from '../types';
import {
  AuthorListItem, bulkPosts, deletePost, duplicatePost, fetchAuthorList, fetchPosts, fetchPreviewLink, updatePost,
} from '../services/posts';
import { fetchCategories } from '../services/categories';
import { fetchPostLocks, PostLock } from '../services/postLocks';
import { fetchSettings } from '../services/settings';
import { resolveMediaUrl } from '../services/media';
import t from '../components/ui/table.module.css';
import styles from './ContentList.module.css';

type ContentType = 'post' | 'page';

const STATUS_META: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  published: { label: 'Published', tone: 'success' },
  draft: { label: 'Draft', tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'warning' },
  trash: { label: 'Trash', tone: 'danger' },
};

const PAGE_ROLE_KEYS: { key: string; label: string }[] = [
  { key: 'front_page_id', label: 'Front page' },
  { key: 'posts_page_id', label: 'Posts page' },
  { key: 'contact_page_id', label: 'Contact' },
  { key: 'about_page_id', label: 'About' },
  { key: 'privacy_policy_page_id', label: 'Privacy policy' },
  { key: 'terms_page_id', label: 'Terms' },
];

const TEMPLATE_LABELS: Record<string, string> = {
  default: 'Default',
  'full-width': 'Full width',
  'full-bleed': 'Full bleed',
  blank: 'Blank',
  contact: 'Contact',
};

const SORT_LABELS: Record<string, string> = {
  'publishedAt:desc': 'Published (newest)',
  'publishedAt:asc': 'Published (oldest)',
  'updatedAt:desc': 'Modified (newest)',
  'updatedAt:asc': 'Modified (oldest)',
  'title:asc': 'Title (A → Z)',
  'title:desc': 'Title (Z → A)',
};

function errorMessage(err: unknown, fallback: string): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

function personName(p?: { firstName?: string | null; lastName?: string | null; username: string } | null): string {
  if (!p) return '—';
  return [p.firstName, p.lastName].filter(Boolean).join(' ') || p.username;
}

function dateInfo(post: Post): { label: string; value?: string | null } {
  if (post.status === 'scheduled') return { label: 'Scheduled', value: post.scheduledFor };
  if (post.status === 'published') return { label: 'Published', value: post.publishedAt };
  return { label: 'Modified', value: post.updatedAt };
}

export default function ContentList({ type }: { type: ContentType }) {
  const isPost = type === 'post';
  const noun = isPost ? 'post' : 'page';
  const Noun = isPost ? 'Post' : 'Page';
  const base = isPost ? '/admin/posts' : '/admin/pages';

  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.POST_CREATE);
  const canEdit = hasPermission(PERMISSIONS.POST_EDIT);
  const canPublish = hasPermission(PERMISSIONS.POST_PUBLISH);
  const canDelete = hasPermission(PERMISSIONS.POST_DELETE);

  const [q, setQ, resetQ] = useUrlState({
    status: '',
    search: '',
    author: '',
    category: '',
    template: '',
    featured: '',
    sort: isPost ? 'publishedAt:desc' : 'updatedAt:desc',
    page: '1',
    per: '20',
  });
  const page = Math.max(1, Number(q.page) || 1);
  const perPage = Number(q.per) || 20;
  const [sortBy, sortOrder] = q.sort.split(':') as ['publishedAt' | 'updatedAt' | 'title', 'asc' | 'desc'];

  const [items, setItems] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [authors, setAuthors] = useState<AuthorListItem[]>([]);
  const [roleMap, setRoleMap] = useState<Record<number, string[]>>({});
  const [density, setDensity] = useDensity(isPost ? 'postsDensity' : 'pagesDensity');
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const result = await fetchPosts(page, perPage, {
        type,
        search: q.search || undefined,
        status: q.status || undefined,
        authorId: q.author || undefined,
        categoryId: q.category ? Number(q.category) : undefined,
        template: q.template || undefined,
        featured: q.featured === 'yes' ? true : q.featured === 'no' ? false : undefined,
        sortBy,
        sortOrder,
      });
      if (id !== reqId.current) return; // a newer request superseded this one
      setItems(result.items);
      setTotal(result.pagination.total);
      setStatusCounts(result.statusCounts);
      setLoaded(true);
    } catch (err) {
      if (id === reqId.current) toast.error(errorMessage(err, `Failed to load ${noun}s`));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [type, page, perPage, q.search, q.status, q.author, q.category, q.template, q.featured, sortBy, sortOrder]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetchAuthorList().then(setAuthors).catch(() => {});
    if (isPost) {
      fetchCategories(1, 200, '').then((r) => setCategories(r.items)).catch(() => {});
    } else {
      fetchSettings()
        .then((settings) => {
          const map: Record<number, string[]> = {};
          for (const s of settings) {
            const role = PAGE_ROLE_KEYS.find((r) => r.key === s.key);
            const pid = Number(s.value);
            if (role && pid > 0) map[pid] = [...(map[pid] || []), role.label];
          }
          setRoleMap(map);
        })
        .catch(() => {});
    }
  }, [isPost]);

  const ids = useMemo(() => items.map((p) => p.id), [items]);
  const sel = useRowSelection(ids);

  // Who is editing what right now ("Alice is editing"), refreshed periodically.
  const [locks, setLocks] = useState<Map<number, PostLock>>(new Map());
  const idsKey = ids.join(',');
  useEffect(() => {
    if (!ids.length) { setLocks(new Map()); return; }
    let alive = true;
    const refresh = () => fetchPostLocks(ids)
      .then((list) => { if (alive) setLocks(new Map(list.map((l) => [l.postId, l]))); })
      .catch(() => {});
    refresh();
    const t = setInterval(refresh, 20_000);
    return () => { alive = false; clearInterval(t); };
  }, [idsKey]);

  useHotkeys({ n: () => { if (canCreate) navigate(`${base}/new`); } });

  /* ── Actions ───────────────────────────────────────────── */

  /**
   * Put posts back to the statuses they had before an action. Done per post
   * (not via bulk "publish") so the original publish date is preserved.
   */
  async function restoreStatuses(posts: Post[]) {
    try {
      await Promise.all(posts.map((p) => updatePost(p.id, {
        status: p.status,
        ...(p.status === 'scheduled' ? { scheduledFor: p.scheduledFor } : {}),
      })));
      toast.info(`Restored ${posts.length} ${noun}${posts.length === 1 ? '' : 's'}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Undo failed'));
    }
    load();
  }

  async function moveToTrash(posts: Post[]) {
    const removed = new Set(posts.map((p) => p.id));
    setItems((prev) => prev.filter((p) => !removed.has(p.id))); // optimistic
    sel.clear();
    try {
      await bulkPosts(Array.from(removed), 'trash');
      const what = posts.length === 1 ? `"${posts[0].title}"` : `${posts.length} ${noun}s`;
      toast.success(`Moved ${what} to trash`, { action: { label: 'Undo', onClick: () => restoreStatuses(posts) } });
    } catch (err) {
      toast.error(errorMessage(err, `Failed to move ${noun} to trash`));
    }
    load();
  }

  async function changeStatus(posts: Post[], status: 'published' | 'draft') {
    setBusy(true);
    try {
      await bulkPosts(posts.map((p) => p.id), status === 'published' ? 'publish' : 'draft');
      const verb = status === 'published' ? 'Published' : 'Moved to drafts:';
      const what = posts.length === 1 ? `"${posts[0].title}"` : `${posts.length} ${noun}s`;
      toast.success(`${verb} ${what}`, { action: { label: 'Undo', onClick: () => restoreStatuses(posts) } });
      sel.clear();
    } catch (err) {
      toast.error(errorMessage(err, `Failed to update ${noun}s`));
    } finally {
      setBusy(false);
      load();
    }
  }

  async function restoreFromTrash(posts: Post[]) {
    setBusy(true);
    try {
      await bulkPosts(posts.map((p) => p.id), 'draft');
      toast.success(posts.length === 1 ? `Restored "${posts[0].title}" as a draft` : `Restored ${posts.length} ${noun}s as drafts`);
      sel.clear();
    } catch (err) {
      toast.error(errorMessage(err, `Failed to restore ${noun}s`));
    } finally {
      setBusy(false);
      load();
    }
  }

  async function deleteForever(posts: Post[]) {
    const what = posts.length === 1 ? `"${posts[0].title}"` : `${posts.length} ${noun}s`;
    if (!(await confirm({
      title: `Delete ${posts.length === 1 ? Noun.toLowerCase() : `${noun}s`} permanently?`,
      message: `${what} will be deleted forever. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      danger: true,
    }))) return;
    setBusy(true);
    try {
      if (posts.length === 1) await deletePost(posts[0].id);
      else await bulkPosts(posts.map((p) => p.id), 'delete');
      toast.success(`Deleted ${what}`);
      sel.clear();
    } catch (err) {
      toast.error(errorMessage(err, `Failed to delete ${noun}s`));
    } finally {
      setBusy(false);
      load();
    }
  }

  async function emptyTrash() {
    const count = statusCounts.trash || 0;
    if (!count) return;
    if (!(await confirm({
      title: 'Empty trash?',
      message: `All ${count} ${noun}${count === 1 ? '' : 's'} in the trash will be deleted forever.`,
      confirmLabel: 'Empty trash',
      danger: true,
    }))) return;
    setBusy(true);
    try {
      // The API caps page size at 100, so delete the first page until none are left.
      for (let guard = 0; guard < 1000; guard++) {
        const batch = await fetchPosts(1, 100, { type, status: 'trash' });
        if (batch.items.length === 0) break;
        await bulkPosts(batch.items.map((p) => p.id), 'delete');
      }
      toast.success('Trash emptied');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to empty trash'));
    } finally {
      setBusy(false);
      load();
    }
  }

  async function duplicate(post: Post) {
    try {
      const copy = await duplicatePost(post.id);
      toast.success(`Duplicated as "${copy.title}"`, {
        action: { label: 'Edit copy', onClick: () => navigate(`${base}/${copy.id}/edit`) },
      });
      load();
    } catch (err) {
      toast.error(errorMessage(err, `Failed to duplicate ${noun}`));
    }
  }

  async function toggleFeatured(post: Post) {
    const next = !post.isFeatured;
    setItems((prev) => prev.map((p) => (p.id === post.id ? { ...p, isFeatured: next } : p)));
    try {
      await updatePost(post.id, { isFeatured: next });
    } catch (err) {
      setItems((prev) => prev.map((p) => (p.id === post.id ? { ...p, isFeatured: !next } : p)));
      toast.error(errorMessage(err, 'Failed to update featured flag'));
    }
  }

  async function view(post: Post) {
    if (post.status === 'published' && post.publicUrl) {
      window.open(post.publicUrl, '_blank', 'noopener');
      return;
    }
    // Drafts need a signed preview link; open the tab first so popup blockers allow it.
    const w = window.open('about:blank', '_blank');
    try {
      const { url } = await fetchPreviewLink(post.id);
      if (w) w.location.href = url;
    } catch (err) {
      w?.close();
      toast.error(errorMessage(err, 'Failed to create a preview link'));
    }
  }

  async function copyLink(post: Post) {
    try {
      await navigator.clipboard.writeText(new URL(post.publicUrl || '/', window.location.origin).href);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  }

  function rowMenu(post: Post): MenuItem[] {
    if (post.status === 'trash') {
      return [
        { label: 'Restore as draft', icon: faRotateLeft, onClick: () => restoreFromTrash([post]), hidden: !canEdit },
        { label: 'Delete permanently', icon: faTrashCan, onClick: () => deleteForever([post]), danger: true, hidden: !canDelete, divider: true },
      ];
    }
    return [
      { label: 'Edit', icon: faPen, onClick: () => navigate(`${base}/${post.id}/edit`), hidden: !canEdit },
      { label: post.status === 'published' ? 'View on site' : 'Preview', icon: faEye, onClick: () => view(post) },
      { label: 'Copy link', icon: faLink, onClick: () => copyLink(post), hidden: post.status !== 'published' },
      { label: 'Duplicate', icon: faCopy, onClick: () => duplicate(post), hidden: !canCreate },
      { label: 'Publish now', icon: faPaperPlane, onClick: () => changeStatus([post], 'published'), hidden: !canPublish || post.status === 'published', divider: true },
      { label: 'Revert to draft', icon: faFilePen, onClick: () => changeStatus([post], 'draft'), hidden: !canEdit || post.status === 'draft', divider: !canPublish || post.status === 'published' },
      { label: 'Move to trash', icon: faTrash, onClick: () => moveToTrash([post]), danger: true, hidden: !canEdit, divider: true },
    ];
  }

  /* ── Filters ───────────────────────────────────────────── */

  const activeFilters: ActiveFilter[] = [];
  if (q.search) activeFilters.push({ key: 'search', label: `“${q.search}”`, onRemove: () => setQ({ search: '' }) });
  if (q.author) {
    const a = authors.find((x) => x.id === q.author);
    activeFilters.push({ key: 'author', label: `Author: ${a ? personName(a) : '…'}`, onRemove: () => setQ({ author: '' }) });
  }
  if (q.category) {
    const c = categories.find((x) => String(x.id) === q.category);
    activeFilters.push({ key: 'category', label: `Category: ${c?.name ?? '…'}`, onRemove: () => setQ({ category: '' }) });
  }
  if (q.template) activeFilters.push({ key: 'template', label: `Template: ${TEMPLATE_LABELS[q.template] ?? q.template}`, onRemove: () => setQ({ template: '' }) });
  if (q.featured) activeFilters.push({ key: 'featured', label: q.featured === 'yes' ? 'Featured only' : 'Not featured', onRemove: () => setQ({ featured: '' }) });
  const panelFilterCount = activeFilters.filter((f) => f.key !== 'search').length;

  function clearFilters() {
    setQ({ search: '', author: '', category: '', template: '', featured: '' });
  }

  // The API's unfiltered list includes trashed items, so "All" counts them too.
  const allCount = Object.values(statusCounts).reduce((n, v) => n + v, 0);
  const tabs = [
    { key: '', label: 'All', count: allCount },
    { key: 'published', label: 'Published', count: statusCounts.published || 0 },
    { key: 'draft', label: 'Drafts', count: statusCounts.draft || 0 },
    ...(isPost || statusCounts.scheduled ? [{ key: 'scheduled', label: 'Scheduled', count: statusCounts.scheduled || 0 }] : []),
    { key: 'trash', label: 'Trash', count: statusCounts.trash || 0 },
  ];

  const selectedPosts = items.filter((p) => sel.selected.has(p.id));
  const inTrash = q.status === 'trash';
  const hasFilters = activeFilters.length > 0;
  const colCount = isPost ? 8 : 7;

  const subtitle = loaded
    ? [
        `${allCount - (statusCounts.trash || 0)} ${noun}${allCount - (statusCounts.trash || 0) === 1 ? '' : 's'}`,
        statusCounts.draft ? `${statusCounts.draft} draft${statusCounts.draft === 1 ? '' : 's'}` : '',
        statusCounts.scheduled ? `${statusCounts.scheduled} scheduled` : '',
      ].filter(Boolean).join(' · ')
    : ' ';

  return (
    <AdminLayout>
      <PageHeader
        title={isPost ? 'Posts' : 'Pages'}
        subtitle={subtitle}
        actions={
          <>
            {inTrash && canDelete && (statusCounts.trash || 0) > 0 && (
              <Button variant="danger" icon={faTrashCan} onClick={emptyTrash} disabled={busy}>Empty trash</Button>
            )}
            {canCreate && isPost && (
              <Button icon={faFileImport} onClick={() => navigate('/admin/posts/import')} title="Create many posts from a Word document">
                Import
              </Button>
            )}
            {canCreate && (
              <Button variant="primary" icon={faPlus} kbd="N" onClick={() => navigate(`${base}/new`)}>
                New {noun}
              </Button>
            )}
          </>
        }
      />

      <Tabs tabs={tabs} value={q.status} onChange={(status) => { setQ({ status }); sel.clear(); }} />

      <div className={t.toolbar}>
        <SearchInput value={q.search} onChange={(search) => setQ({ search })} placeholder={`Search ${noun}s`} />
        <FilterMenu activeCount={panelFilterCount}>
          <Field label="Author">
            <select value={q.author} onChange={(e) => setQ({ author: e.target.value })}>
              <option value="">Anyone</option>
              {authors.map((a) => <option key={a.id} value={a.id}>{personName(a)}</option>)}
            </select>
          </Field>
          {isPost && (
            <Field label="Category">
              <select value={q.category} onChange={(e) => setQ({ category: e.target.value })}>
                <option value="">Any category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          {isPost && (
            <Field label="Featured">
              <select value={q.featured} onChange={(e) => setQ({ featured: e.target.value })}>
                <option value="">All {noun}s</option>
                <option value="yes">Featured only</option>
                <option value="no">Not featured</option>
              </select>
            </Field>
          )}
          {!isPost && (
            <Field label="Template">
              <select value={q.template} onChange={(e) => setQ({ template: e.target.value })}>
                <option value="">Any template</option>
                {Object.entries(TEMPLATE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          )}
          <Field label="Sort by">
            <select value={q.sort} onChange={(e) => setQ({ sort: e.target.value })}>
              {Object.entries(SORT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </FilterMenu>
        <div className={t.spacer} />
        <DensityToggle value={density} onChange={setDensity} />
      </div>

      <ActiveFilters filters={activeFilters} onClearAll={clearFilters} />

      <Card>
        <LoadingBar active={loading && loaded} />
        <div className={t.scroll}>
          <table className={`${t.table} ${t[`d_${density}`]} ${styles[density] ?? ''}`}>
            <thead>
              <tr>
                <th className={t.checkCol}>
                  <Checkbox
                    label={`Select all ${noun}s on this page`}
                    checked={sel.allSelected}
                    indeterminate={sel.someSelected}
                    onChange={() => sel.toggleAll()}
                  />
                </th>
                <SortHeader label="Title" field="title" sortBy={sortBy} sortOrder={sortOrder} onSort={(f, o) => setQ({ sort: `${f}:${o}` })} />
                <th className={t.hideSm}>Author</th>
                <th className={t.hideMd}>{isPost ? 'Categories' : 'Parent'}</th>
                <SortHeader
                  label="Date"
                  field={isPost ? 'publishedAt' : 'updatedAt'}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  firstOrder="desc"
                  onSort={(f, o) => setQ({ sort: `${f}:${o}` })}
                />
                <th>Status</th>
                {isPost && <th className={t.center} title="Featured">★</th>}
                <th className={t.actionsCol}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {!loaded && <TableSkeleton rows={8} cols={colCount} />}
              {items.map((post) => {
                const d = dateInfo(post);
                const selected = sel.selected.has(post.id);
                const roles = roleMap[post.id] || [];
                return (
                  <tr key={post.id} className={selected ? t.rowSelected : undefined}>
                    <td className={t.checkCol}>
                      <Checkbox label={`Select ${post.title}`} checked={selected} onChange={(shift) => sel.toggle(post.id, shift)} />
                    </td>
                    <td className={styles.titleCell}>
                      <div className={t.primaryWrap}>
                        {density !== 'compact' && (
                          <span className={styles.thumb}>
                            {post.featuredImage
                              ? <img src={resolveMediaUrl(post.featuredImage)} alt="" loading="lazy" />
                              : <FontAwesomeIcon icon={faImage} />}
                          </span>
                        )}
                        <div className={t.stack}>
                          {post.status === 'trash' || !canEdit ? (
                            <span className={t.primary}>{post.title || '(untitled)'}</span>
                          ) : (
                            <Link to={`${base}/${post.id}/edit`} className={t.primary}>{post.title || '(untitled)'}</Link>
                          )}
                          {locks.get(post.id) && (
                            <span className={styles.lockTag} title={`Opened ${new Date(locks.get(post.id)!.since).toLocaleTimeString()}`}>
                              <FontAwesomeIcon icon={faLock} /> {locks.get(post.id)!.user.name} is editing
                            </span>
                          )}
                          <span className={t.secondary}>
                            <span className={styles.slug}>/{post.slug}</span>
                            {roles.map((r) => <span key={r} className={styles.roleTag}>{r}</span>)}
                            {post.template && post.template !== 'default' && TEMPLATE_LABELS[post.template] && (
                              <span className={styles.tplTag}>{TEMPLATE_LABELS[post.template]}</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className={`${t.muted} ${t.hideSm}`}>{personName(post.author)}</td>
                    <td className={t.hideMd}>
                      {isPost ? (
                        post.categories.length === 0 ? <span className={t.faint}>—</span> : (
                          <span className={t.chips}>
                            {post.categories.slice(0, 2).map(({ category }) => (
                              <button
                                key={category.id}
                                type="button"
                                className={t.chip}
                                title={`Filter by ${category.name}`}
                                onClick={() => setQ({ category: String(category.id) })}
                              >
                                {category.name}
                              </button>
                            ))}
                            {post.categories.length > 2 && (
                              <span className={t.more} title={post.categories.slice(2).map((c) => c.category.name).join(', ')}>
                                +{post.categories.length - 2}
                              </span>
                            )}
                          </span>
                        )
                      ) : (
                        <span className={t.muted}>{post.parent?.title ?? '—'}</span>
                      )}
                    </td>
                    <td className={styles.dateCell} title={absoluteTime(d.value)}>
                      <span className={styles.dateLabel}>{d.label}</span>
                      <span>{relativeTime(d.value)}</span>
                    </td>
                    <td>
                      <StatusBadge tone={STATUS_META[post.status]?.tone ?? 'neutral'}>
                        {STATUS_META[post.status]?.label ?? post.status}
                      </StatusBadge>
                    </td>
                    {isPost && (
                      <td className={t.center}>
                        <button
                          type="button"
                          className={`${styles.star} ${post.isFeatured ? styles.starOn : ''}`}
                          onClick={() => toggleFeatured(post)}
                          disabled={!canEdit || post.status === 'trash'}
                          aria-pressed={!!post.isFeatured}
                          aria-label={post.isFeatured ? 'Remove from featured' : 'Mark as featured'}
                          title={post.isFeatured ? 'Featured — click to unfeature' : 'Mark as featured'}
                        >
                          <FontAwesomeIcon icon={faStarSolid} />
                        </button>
                      </td>
                    )}
                    <td className={t.actionsCol}>
                      <div className={t.rowActions}>
                        {post.status !== 'trash' && canEdit && (
                          <Link to={`${base}/${post.id}/edit`} className={t.quickAction} title="Edit" aria-label={`Edit ${post.title}`}>
                            <FontAwesomeIcon icon={faPen} />
                          </Link>
                        )}
                        <RowMenu items={rowMenu(post)} label={`Actions for ${post.title}`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {loaded && items.length === 0 && (
          inTrash && !hasFilters ? (
            <EmptyState icon={faTrashCan} title="Trash is empty" description={`Trashed ${noun}s show up here so you can restore them.`} />
          ) : hasFilters ? (
            <EmptyState
              icon={faMagnifyingGlass}
              title={`No ${noun}s match your filters`}
              description="Try a different search term or remove some filters."
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : q.status ? (
            <EmptyState
              icon={isPost ? faPenToSquare : faFileLines}
              title={`No ${STATUS_META[q.status]?.label.toLowerCase() ?? ''} ${noun}s`}
              action={<Button onClick={() => resetQ()}>Show all {noun}s</Button>}
            />
          ) : (
            <EmptyState
              icon={isPost ? faPenToSquare : faFileLines}
              title={`No ${noun}s yet`}
              description={isPost ? 'Write your first post, or import several at once from a Word document.' : 'Create pages like About or Contact for your site.'}
              action={canCreate && (
                <>
                  <Button variant="primary" icon={faPlus} onClick={() => navigate(`${base}/new`)}>New {noun}</Button>
                  {isPost && <Button icon={faFileImport} onClick={() => navigate('/admin/posts/import')}>Import from Word</Button>}
                </>
              )}
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

      <BulkBar count={sel.selected.size} noun={noun} onClear={sel.clear}>
        {inTrash ? (
          <>
            {canEdit && <Button size="sm" icon={faRotateLeft} disabled={busy} onClick={() => restoreFromTrash(selectedPosts)}>Restore</Button>}
            {canDelete && <Button size="sm" variant="danger" icon={faTrashCan} disabled={busy} onClick={() => deleteForever(selectedPosts)}>Delete permanently</Button>}
          </>
        ) : (
          <>
            {canPublish && <Button size="sm" icon={faPaperPlane} disabled={busy} onClick={() => changeStatus(selectedPosts, 'published')}>Publish</Button>}
            {canEdit && <Button size="sm" icon={faFilePen} disabled={busy} onClick={() => changeStatus(selectedPosts, 'draft')}>Set to draft</Button>}
            {canEdit && <Button size="sm" variant="danger" icon={faTrash} disabled={busy} onClick={() => moveToTrash(selectedPosts)}>Trash</Button>}
          </>
        )}
      </BulkBar>
    </AdminLayout>
  );
}
