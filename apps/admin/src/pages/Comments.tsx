import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faReply, faCheck, faBan, faTrash, faTrashCan, faRotateLeft, faComments, faMagnifyingGlass,
  faHeart, faEyeSlash, faInbox,
} from '@fortawesome/free-solid-svg-icons';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import {
  ActiveFilter, ActiveFilters, BulkBar, Button, Card, Checkbox, EmptyState, Field, FilterMenu, Kbd,
  LoadingBar, PageHeader, Pagination, SearchInput, StatusBadge, Tabs, absoluteTime, relativeTime,
  useRowSelection,
} from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useHotkeys } from '../hooks/useHotkeys';
import { useUrlState } from '../hooks/useUrlState';
import { refreshNavBadges } from '../hooks/useNavBadges';
import { AdminComment, Post } from '../types';
import { deleteComment, fetchComments, setCommentStatus } from '../services/comments';
import { fetchPosts } from '../services/posts';
import styles from './Comments.module.css';

const STATUS_META: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  spam: { label: 'Spam', tone: 'danger' },
  trash: { label: 'Trash', tone: 'neutral' },
};

const VERB: Record<string, string> = {
  approved: 'Approved',
  pending: 'Unapproved',
  spam: 'Marked as spam:',
  trash: 'Trashed',
};

function errorMessage(err: unknown, fallback: string): string {
  return (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message || fallback;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
}

/** Stable pastel hue per author so repeat commenters are recognisable. */
function hue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export default function CommentsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canModerate = hasPermission(PERMISSIONS.COMMENT_MODERATE);

  const [q, setQ] = useUrlState({
    status: '',
    search: '',
    author: '',
    post: '',
    sort: 'createdAt:desc',
    page: '1',
    per: '20',
  });
  const page = Math.max(1, Number(q.page) || 1);
  const perPage = Number(q.per) || 20;
  const [sortBy, sortOrder] = q.sort.split(':') as ['createdAt' | 'updatedAt', 'asc' | 'desc'];

  const [items, setItems] = useState<AdminComment[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState(-1);
  const reqId = useRef(0);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    fetchPosts(1, 100, { type: 'post' }).then((r) => setPosts(r.items)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const result = await fetchComments(page, perPage, {
        status: q.status,
        search: q.search,
        authorId: q.author || undefined,
        postId: q.post ? Number(q.post) : undefined,
        sortBy,
        sortOrder,
      });
      if (id !== reqId.current) return;
      setItems(result.items);
      setStatusCounts(result.statusCounts);
      setTotal(result.pagination.total);
      setLoaded(true);
    } catch (err) {
      if (id === reqId.current) toast.error(errorMessage(err, 'Failed to load comments'));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [page, perPage, q.status, q.search, q.author, q.post, sortBy, sortOrder]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setCursor(-1); }, [q.status, q.search, q.author, q.post, page]);

  const ids = useMemo(() => items.map((c) => c.id), [items]);
  const sel = useRowSelection(ids);

  /* ── Moderation ────────────────────────────────────────── */

  async function moderate(comments: AdminComment[], status: string) {
    if (comments.length === 0) return;
    const prev = comments.map((c) => ({ c, status: c.status }));
    const moved = new Set(comments.map((c) => c.id));

    // Optimistic: items leave a filtered tab immediately, otherwise update in place.
    setItems((list) => (q.status && q.status !== status
      ? list.filter((c) => !moved.has(c.id))
      : list.map((c) => (moved.has(c.id) ? { ...c, status } : c))));
    sel.clear();

    try {
      await Promise.all(comments.map((c) => setCommentStatus(c.id, status)));
      const what = comments.length === 1 ? `comment by ${comments[0].authorName}` : `${comments.length} comments`;
      toast.success(`${VERB[status] ?? 'Updated'} ${what}`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await Promise.all(prev.map(({ c, status: s }) => setCommentStatus(c.id, s)));
            } catch (err) {
              toast.error(errorMessage(err, 'Undo failed'));
            }
            load();
            refreshNavBadges();
          },
        },
      });
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update comment'));
    }
    load();
    refreshNavBadges();
  }

  async function remove(comments: AdminComment[]) {
    const what = comments.length === 1 ? `this comment by ${comments[0].authorName}` : `${comments.length} comments`;
    if (!(await confirm({
      title: 'Delete permanently?',
      message: `Delete ${what}? Replies will also be removed. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      danger: true,
    }))) return;
    setBusy(true);
    try {
      await Promise.all(comments.map((c) => deleteComment(c.id)));
      toast.success(comments.length === 1 ? 'Comment deleted' : `${comments.length} comments deleted`);
      sel.clear();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete comment'));
    } finally {
      setBusy(false);
      load();
      refreshNavBadges();
    }
  }

  /* ── Keyboard moderation: j/k to move, a/u/s/t to act, x to select ── */

  function focusRow(i: number) {
    const next = Math.max(0, Math.min(items.length - 1, i));
    setCursor(next);
    rowRefs.current[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const current = cursor >= 0 ? items[cursor] : undefined;
  useHotkeys({
    j: () => focusRow(cursor + 1),
    k: () => focusRow(cursor - 1),
    x: () => { if (current) sel.toggle(current.id); },
    a: () => { if (canModerate && current && current.status !== 'approved') moderate([current], 'approved'); },
    u: () => { if (canModerate && current && current.status === 'approved') moderate([current], 'pending'); },
    s: () => { if (canModerate && current && current.status !== 'spam') moderate([current], 'spam'); },
    t: () => { if (canModerate && current && current.status !== 'trash') moderate([current], 'trash'); },
  });

  /* ── Filters ───────────────────────────────────────────── */

  const activeFilters: ActiveFilter[] = [];
  if (q.search) activeFilters.push({ key: 'search', label: `“${q.search}”`, onRemove: () => setQ({ search: '' }) });
  if (q.author) activeFilters.push({ key: 'author', label: `Author: ${q.author}`, onRemove: () => setQ({ author: '' }) });
  if (q.post) {
    const p = posts.find((x) => String(x.id) === q.post);
    activeFilters.push({ key: 'post', label: `On: ${p?.title ?? `#${q.post}`}`, onRemove: () => setQ({ post: '' }) });
  }
  const clearFilters = () => setQ({ search: '', author: '', post: '' });

  const allCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const tabs = [
    { key: '', label: 'All', count: allCount },
    { key: 'pending', label: 'Pending', count: statusCounts.pending || 0, highlight: true },
    { key: 'approved', label: 'Approved', count: statusCounts.approved || 0 },
    { key: 'spam', label: 'Spam', count: statusCounts.spam || 0 },
    { key: 'trash', label: 'Trash', count: statusCounts.trash || 0 },
  ];
  const selectedItems = items.filter((c) => sel.selected.has(c.id));
  const pending = statusCounts.pending || 0;

  return (
    <AdminLayout>
      <PageHeader
        title="Comments"
        subtitle={loaded ? (pending ? `${pending} awaiting moderation` : 'All caught up — nothing awaiting moderation') : ' '}
        actions={pending > 0 && q.status !== 'pending' && (
          <Button variant="primary" icon={faInbox} onClick={() => setQ({ status: 'pending' })}>Review pending</Button>
        )}
      />

      <Tabs tabs={tabs} value={q.status} onChange={(status) => { setQ({ status }); sel.clear(); }} />

      <div className={styles.toolbar}>
        <SearchInput value={q.search} onChange={(search) => setQ({ search })} placeholder="Search comments, names, emails" />
        <FilterMenu activeCount={activeFilters.filter((f) => f.key !== 'search').length}>
          <Field label="On post">
            <select value={q.post} onChange={(e) => setQ({ post: e.target.value })}>
              <option value="">Any post</option>
              {posts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>
          <Field label="Author email">
            <input
              type="email"
              defaultValue={q.author}
              placeholder="name@example.com"
              onKeyDown={(e) => { if (e.key === 'Enter') setQ({ author: (e.target as HTMLInputElement).value.trim() }); }}
              onBlur={(e) => setQ({ author: e.target.value.trim() })}
            />
          </Field>
          <Field label="Sort by">
            <select value={q.sort} onChange={(e) => setQ({ sort: e.target.value })}>
              <option value="createdAt:desc">Newest first</option>
              <option value="createdAt:asc">Oldest first</option>
              <option value="updatedAt:desc">Recently updated</option>
            </select>
          </Field>
        </FilterMenu>
        {canModerate && items.length > 0 && (
          <span className={styles.kbdHint}>
            <Kbd>J</Kbd><Kbd>K</Kbd> move · <Kbd>A</Kbd> approve · <Kbd>S</Kbd> spam · <Kbd>T</Kbd> trash
          </span>
        )}
      </div>

      <ActiveFilters filters={activeFilters} onClearAll={clearFilters} />

      <Card>
        <LoadingBar active={loading && loaded} />
        {items.length > 0 && (
          <div className={styles.listHead}>
            <Checkbox label="Select all comments on this page" checked={sel.allSelected} indeterminate={sel.someSelected} onChange={() => sel.toggleAll()} />
            <span>{total} comment{total === 1 ? '' : 's'}</span>
          </div>
        )}

        {!loaded && (
          <div className={styles.skeletons}>
            {Array.from({ length: 5 }, (_, i) => <div key={i} className={styles.skeletonItem} />)}
          </div>
        )}

        <ul className={styles.list}>
          {items.map((c, i) => {
            const isOpen = expanded.has(c.id);
            const long = c.content.length > 280;
            const selected = sel.selected.has(c.id);
            return (
              <li
                key={c.id}
                ref={(el) => { rowRefs.current[i] = el; }}
                className={[
                  styles.item,
                  c.status === 'pending' && styles.itemPending,
                  selected && styles.itemSelected,
                  cursor === i && styles.itemCursor,
                ].filter(Boolean).join(' ')}
                onClick={() => setCursor(i)}
              >
                <div className={styles.check}>
                  <Checkbox label={`Select comment by ${c.authorName}`} checked={selected} onChange={(shift) => sel.toggle(c.id, shift)} />
                </div>
                <span className={styles.avatar} style={{ '--h': hue(c.authorEmail || c.authorName) } as React.CSSProperties} aria-hidden="true">
                  {initials(c.authorName)}
                </span>
                <div className={styles.body}>
                  <div className={styles.head}>
                    <strong className={styles.name}>{c.authorName}</strong>
                    {c.authorEmail && (
                      <button type="button" className={styles.email} title="Show all comments from this email" onClick={(e) => { e.stopPropagation(); setQ({ author: c.authorEmail }); }}>
                        {c.authorEmail}
                      </button>
                    )}
                    <span className={styles.dot}>·</span>
                    <time className={styles.time} dateTime={c.createdAt} title={absoluteTime(c.createdAt)}>{relativeTime(c.createdAt)}</time>
                    <StatusBadge tone={STATUS_META[c.status]?.tone ?? 'neutral'}>{STATUS_META[c.status]?.label ?? c.status}</StatusBadge>
                  </div>
                  <div className={styles.context}>
                    {c.parent && <><FontAwesomeIcon icon={faReply} /> Reply to <strong>{c.parent.authorName}</strong> on </>}
                    {!c.parent && 'On '}
                    <Link to={`/admin/posts/${c.post.id}/edit`} className={styles.postLink}>{c.post.title}</Link>
                    <button type="button" className={styles.filterLink} onClick={(e) => { e.stopPropagation(); setQ({ post: String(c.post.id) }); }}>
                      filter
                    </button>
                    {c._count?.reactions > 0 && (
                      <span className={styles.reactions}><FontAwesomeIcon icon={faHeart} /> {c._count.reactions}</span>
                    )}
                  </div>
                  <p className={`${styles.content} ${long && !isOpen ? styles.clamped : ''}`}>{c.content}</p>
                  {long && (
                    <button
                      type="button"
                      className={styles.more}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpanded((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; });
                      }}
                    >
                      {isOpen ? 'Show less' : 'Show more'}
                    </button>
                  )}
                </div>
                {canModerate && (
                  <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                    {c.status !== 'approved' ? (
                      <button type="button" className={`${styles.act} ${styles.actApprove}`} onClick={() => moderate([c], 'approved')} title="Approve (A)">
                        <FontAwesomeIcon icon={faCheck} /> <span>Approve</span>
                      </button>
                    ) : (
                      <button type="button" className={styles.act} onClick={() => moderate([c], 'pending')} title="Unapprove (U)">
                        <FontAwesomeIcon icon={faEyeSlash} /> <span>Unapprove</span>
                      </button>
                    )}
                    {c.status !== 'spam' && (
                      <button type="button" className={styles.act} onClick={() => moderate([c], 'spam')} title="Mark as spam (S)">
                        <FontAwesomeIcon icon={faBan} /> <span>Spam</span>
                      </button>
                    )}
                    {c.status === 'trash' || c.status === 'spam' ? (
                      <button type="button" className={`${styles.act} ${styles.actDanger}`} onClick={() => remove([c])} title="Delete permanently">
                        <FontAwesomeIcon icon={faTrashCan} /> <span>Delete</span>
                      </button>
                    ) : (
                      <button type="button" className={`${styles.act} ${styles.actDanger}`} onClick={() => moderate([c], 'trash')} title="Move to trash (T)">
                        <FontAwesomeIcon icon={faTrash} /> <span>Trash</span>
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {loaded && items.length === 0 && (
          activeFilters.length > 0 ? (
            <EmptyState
              icon={faMagnifyingGlass}
              title="No comments match your filters"
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : q.status === 'pending' ? (
            <EmptyState icon={faCheck} title="All caught up" description="There are no comments waiting for moderation." />
          ) : (
            <EmptyState
              icon={faComments}
              title={q.status ? `No ${STATUS_META[q.status]?.label.toLowerCase()} comments` : 'No comments yet'}
              description={q.status ? undefined : 'Comments from readers will appear here for moderation.'}
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

      {canModerate && (
        <BulkBar count={sel.selected.size} noun="comment" onClear={sel.clear}>
          {q.status !== 'approved' && <Button size="sm" icon={faCheck} disabled={busy} onClick={() => moderate(selectedItems, 'approved')}>Approve</Button>}
          {q.status === 'approved' && <Button size="sm" icon={faEyeSlash} disabled={busy} onClick={() => moderate(selectedItems, 'pending')}>Unapprove</Button>}
          {q.status !== 'spam' && <Button size="sm" icon={faBan} disabled={busy} onClick={() => moderate(selectedItems, 'spam')}>Spam</Button>}
          {(q.status === 'trash' || q.status === 'spam') ? (
            <>
              <Button size="sm" icon={faRotateLeft} disabled={busy} onClick={() => moderate(selectedItems, 'pending')}>Restore</Button>
              <Button size="sm" variant="danger" icon={faTrashCan} disabled={busy} onClick={() => remove(selectedItems)}>Delete</Button>
            </>
          ) : (
            <Button size="sm" variant="danger" icon={faTrash} disabled={busy} onClick={() => moderate(selectedItems, 'trash')}>Trash</Button>
          )}
        </BulkBar>
      )}
    </AdminLayout>
  );
}
