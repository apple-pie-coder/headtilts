import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../hooks/useAuth';
import { Post, User } from '../types';
import { deletePost, fetchPosts, updatePost } from '../services/posts';
import { fetchUsers } from '../services/users';
import { fetchSettings } from '../services/settings';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCompress, faGripVertical, faExpand } from '@fortawesome/free-solid-svg-icons';
import { useDensity } from '../hooks/useDensity';
import styles from './Posts.module.css';

const ROLE_KEYS: { key: string; label: string; cls: string }[] = [
  { key: 'front_page_id',          label: 'Front Page',    cls: styles.roleFront   },
  { key: 'posts_page_id',          label: 'Posts Page',    cls: styles.rolePosts   },
  { key: 'contact_page_id',        label: 'Contact',       cls: styles.roleContact },
  { key: 'about_page_id',          label: 'About',         cls: styles.roleAbout   },
  { key: 'privacy_policy_page_id', label: 'Privacy Policy', cls: styles.rolePrivacy },
  { key: 'terms_page_id',          label: 'Terms',         cls: styles.roleTerms   },
];

const TEMPLATE_OPTIONS = [
  { value: '',           label: 'All templates' },
  { value: 'default',   label: 'Default' },
  { value: 'full-width', label: 'Full Width' },
  { value: 'full-bleed', label: 'Full Bleed' },
  { value: 'blank',     label: 'Blank' },
  { value: 'contact',   label: 'Contact' },
];

const TEMPLATE_LABELS: Record<string, string> = {
  'full-width': 'Full Width',
  'full-bleed': 'Full Bleed',
  'contact': 'Contact',
  'blank': 'Blank',
};

const PAGE_SIZE = 10;

const STATUS_TABS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Drafts' },
  { key: 'trash', label: 'Trash' },
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  scheduled: 'Scheduled',
  trash: 'Trash',
};

function formatDate(value?: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function authorName(post: Post): string {
  if (!post.author) return '—';
  const fullName = [post.author.firstName, post.author.lastName].filter(Boolean).join(' ');
  return fullName || post.author.username;
}

export default function PagesPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [pages, setPages] = useState<Post[]>([]);
  const [authors, setAuthors] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [authorId, setAuthorId] = useState<string | undefined>(undefined);
  const [templateFilter, setTemplateFilter] = useState('');
  const [sortBy, setSortBy] = useState<'publishedAt' | 'updatedAt' | 'title'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(true);
  const [roleMap, setRoleMap] = useState<Record<number, { label: string; cls: string }[]>>({});
  const [density, setDensity] = useDensity('pagesDensity');

  useEffect(() => {
    fetchSettings()
      .then((settings) => {
        const map: Record<number, { label: string; cls: string }[]> = {};
        settings.forEach((s) => {
          const role = ROLE_KEYS.find((r) => r.key === s.key);
          if (role && s.value) {
            const id = Number(s.value);
            if (id > 0) {
              map[id] = [...(map[id] || []), { label: role.label, cls: role.cls }];
            }
          }
        });
        setRoleMap(map);
      })
      .catch(() => {});

    fetchUsers(1, 200, '')
      .then((r) => setAuthors(r.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPages();
  }, [page, search, statusFilter, authorId, templateFilter, sortBy, sortOrder]);

  async function loadPages() {
    setLoading(true);
    try {
      const result = await fetchPosts(page, PAGE_SIZE, {
        search,
        status: statusFilter || undefined,
        authorId,
        template: templateFilter || undefined,
        sortBy,
        sortOrder,
        type: 'page',
      });
      setPages(result.items);
      setTotal(result.pagination.total);
      setStatusCounts(result.statusCounts);
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to load pages'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleTrash(post: Post) {
    try {
      await updatePost(post.id, { status: 'trash' });
      await loadPages();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to move page to trash'
      );
    }
  }

  async function handleRestore(post: Post) {
    try {
      await updatePost(post.id, { status: 'draft' });
      await loadPages();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to restore page'
      );
    }
  }

  async function handleDeletePermanently(post: Post) {
    if (!(await confirm({ title: 'Delete Page', message: `Permanently delete "${post.title}"? This cannot be undone.`, confirmLabel: 'Delete Permanently', danger: true }))) return;
    try {
      await deletePost(post.id);
      await loadPages();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to delete page'
      );
    }
  }

  function dateLabel(post: Post): string {
    if (post.status === 'published') return `Published ${formatDate(post.publishedAt)}`;
    return `Modified ${formatDate(post.updatedAt)}`;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totalCount = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);

  return (
    <AdminLayout>
      <div className={styles.header}>
        <h2 className={styles.title}>Pages</h2>
        {hasPermission(PERMISSIONS.POST_CREATE) && (
          <button className={styles.addButton} onClick={() => navigate('/admin/pages/new')}>
            Add New Page
          </button>
        )}
      </div>

      <div className={styles.tabs}>
        {STATUS_TABS.map((tab) => {
          const count = tab.key ? statusCounts[tab.key] || 0 : totalCount;
          const isActive = statusFilter === tab.key;
          return (
            <button
              key={tab.key || 'all'}
              className={isActive ? styles.tabActive : styles.tab}
              onClick={() => { setPage(1); setStatusFilter(tab.key); }}
            >
              {tab.label} <span className={styles.tabCount}>({count})</span>
            </button>
          );
        })}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={styles.filter}>
            <label>Search</label>
            <input
              type="text"
              placeholder="Search pages..."
              value={search}
              onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            />
          </div>
          <div className={styles.filter}>
            <label>Author</label>
            <select
              value={authorId ?? ''}
              onChange={(e) => { setPage(1); setAuthorId(e.target.value || undefined); }}
            >
              <option value="">All authors</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>{a.username}</option>
              ))}
            </select>
          </div>
          <div className={styles.filter}>
            <label>Template</label>
            <select
              value={templateFilter}
              onChange={(e) => { setPage(1); setTemplateFilter(e.target.value); }}
            >
              {TEMPLATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.filter}>
            <label>Sort</label>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split(':') as [typeof sortBy, typeof sortOrder];
                setPage(1); setSortBy(field); setSortOrder(order);
              }}
            >
              <option value="updatedAt:desc">Modified (newest)</option>
              <option value="updatedAt:asc">Modified (oldest)</option>
              <option value="publishedAt:desc">Published (newest)</option>
              <option value="publishedAt:asc">Published (oldest)</option>
              <option value="title:asc">Title (A → Z)</option>
              <option value="title:desc">Title (Z → A)</option>
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
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles[`density_${density}`]}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Parent</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((pg) => (
              <tr key={pg.id}>
                <td>
                  <button className={styles.titleLink} onClick={() => navigate(`/admin/pages/${pg.id}/edit`)}>
                    {pg.title}
                  </button>
                  {(roleMap[pg.id]?.length > 0 || (pg.template && TEMPLATE_LABELS[pg.template])) && (
                    <div className={styles.pageBadges}>
                      {roleMap[pg.id]?.map(({ label, cls }) => (
                        <span key={label} className={`${styles.roleBadge} ${cls}`}>{label}</span>
                      ))}
                      {pg.template && TEMPLATE_LABELS[pg.template] && (
                        <span className={styles.templateBadge}>{TEMPLATE_LABELS[pg.template]}</span>
                      )}
                    </div>
                  )}
                </td>
                <td>{authorName(pg)}</td>
                <td className={styles.date}>{pg.parent?.title ?? '—'}</td>
                <td className={styles.date}>{dateLabel(pg)}</td>
                <td>
                  <span className={`${styles.statusBadge} ${styles[`status_${pg.status}`] || ''}`}>
                    {STATUS_LABELS[pg.status] || pg.status}
                  </span>
                </td>
                <td className={styles.actions}>
                  {pg.status === 'trash' ? (
                    <>
                      <button onClick={() => handleRestore(pg)}>Restore</button>
                      <button className={styles.deleteButton} onClick={() => handleDeletePermanently(pg)}>
                        Delete Permanently
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => navigate(`/admin/pages/${pg.id}/edit`)}>Edit</button>
                      <button className={styles.deleteButton} onClick={() => handleTrash(pg)}>Trash</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && pages.length === 0 && (
          <div className={styles.empty}>No pages found.</div>
        )}
      </div>

      <div className={styles.pagination}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          Previous
        </button>
        <span>Page {page} of {totalPages}</span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
          Next
        </button>
      </div>
    </AdminLayout>
  );
}
