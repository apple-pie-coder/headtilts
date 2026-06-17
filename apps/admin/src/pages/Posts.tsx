import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { PERMISSIONS } from '@headtilts/shared';
import { AdminLayout } from '../components/AdminLayout';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../hooks/useAuth';
import { Category, Post, User } from '../types';
import { deletePost, fetchPosts, updatePost } from '../services/posts';
import { fetchCategories } from '../services/categories';
import { fetchUsers } from '../services/users';
import styles from './Posts.module.css';

const PAGE_SIZE = 10;

const STATUS_TABS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Drafts' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'trash', label: 'Trash' },
];

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  scheduled: 'Scheduled',
  trash: 'Trash',
};

function formatDate(value?: string | null): string {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function authorName(post: Post): string {
  if (!post.author) {
    return '—';
  }
  const fullName = [post.author.firstName, post.author.lastName].filter(Boolean).join(' ');
  return fullName || post.author.username;
}

export default function PostsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [authors, setAuthors] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [authorId, setAuthorId] = useState<string | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [featuredFilter, setFeaturedFilter] = useState<'all' | 'featured' | 'not-featured'>('all');
  const [sortBy, setSortBy] = useState<'publishedAt' | 'updatedAt' | 'title'>('publishedAt');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPosts();
  }, [page, search, statusFilter, authorId, categoryId, featuredFilter, sortBy, sortOrder]);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  async function loadFilterOptions() {
    try {
      const [categoriesResult, usersResult] = await Promise.all([
        fetchCategories(1, 200, ''),
        fetchUsers(1, 200, ''),
      ]);
      setCategories(categoriesResult.items);
      setAuthors(usersResult.items);
    } catch {
      // ignore filter load failures
    }
  }

  async function loadPosts() {
    setLoading(true);
    try {
      const featured = featuredFilter === 'featured' ? true : featuredFilter === 'not-featured' ? false : undefined;
      const result = await fetchPosts(page, PAGE_SIZE, {
        search,
        status: statusFilter || undefined,
        authorId,
        categoryId,
        featured,
        sortBy,
        sortOrder,
        type: 'post',
      });
      setPosts(result.items);
      setTotal(result.pagination.total);
      setStatusCounts(result.statusCounts);
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to load posts'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleTrash(post: Post) {
    try {
      await updatePost(post.id, { status: 'trash' });
      await loadPosts();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to move post to trash'
      );
    }
  }

  async function handleRestore(post: Post) {
    try {
      await updatePost(post.id, { status: 'draft' });
      await loadPosts();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to restore post'
      );
    }
  }

  async function handleDeletePermanently(post: Post) {
    if (!(await confirm({ title: 'Delete Post', message: `Permanently delete "${post.title}"? This cannot be undone.`, confirmLabel: 'Delete Permanently', danger: true }))) {
      return;
    }

    try {
      await deletePost(post.id);
      await loadPosts();
    } catch (err: unknown) {
      toast.error(
        (err as AxiosError<{ error: { message: string } }>).response?.data?.error?.message ||
          'Failed to delete post'
      );
    }
  }

  function dateLabel(post: Post): string {
    if (post.status === 'scheduled') {
      return `Scheduled for ${formatDate(post.scheduledFor)}`;
    }
    if (post.status === 'published') {
      return `Published ${formatDate(post.publishedAt)}`;
    }
    return `Modified ${formatDate(post.updatedAt)}`;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totalCount = Object.values(statusCounts).reduce((sum, n) => sum + n, 0);

  return (
    <AdminLayout>
      <div className={styles.header}>
        <h2 className={styles.title}>Posts</h2>
        {hasPermission(PERMISSIONS.POST_CREATE) && (
          <button className={styles.addButton} onClick={() => navigate('/admin/posts/new')}>
            Add New Post
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
              onClick={() => {
                setPage(1);
                setStatusFilter(tab.key);
              }}
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
              placeholder="Search posts..."
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
          </div>
          <div className={styles.filter}>
            <label>Author</label>
            <select
              value={authorId ?? ''}
              onChange={(e) => {
                setPage(1);
                setAuthorId(e.target.value || undefined);
              }}
            >
              <option value="">All authors</option>
              {authors.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.username}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.filter}>
            <label>Category</label>
            <select
              value={categoryId ?? ''}
              onChange={(e) => {
                setPage(1);
                setCategoryId(e.target.value ? Number(e.target.value) : undefined);
              }}
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.filter}>
            <label>Featured</label>
            <select
              value={featuredFilter}
              onChange={(e) => {
                setPage(1);
                setFeaturedFilter(e.target.value as 'all' | 'featured' | 'not-featured');
              }}
            >
              <option value="all">All posts</option>
              <option value="featured">Featured only</option>
              <option value="not-featured">Not featured</option>
            </select>
          </div>
          <div className={styles.filter}>
            <label>Sort</label>
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split(':') as [typeof sortBy, typeof sortOrder];
                setPage(1);
                setSortBy(field);
                setSortOrder(order);
              }}
            >
              <option value="publishedAt:desc">Published date (newest)</option>
              <option value="publishedAt:asc">Published date (oldest)</option>
              <option value="updatedAt:desc">Modified date (newest)</option>
              <option value="updatedAt:asc">Modified date (oldest)</option>
              <option value="title:asc">Title (A → Z)</option>
              <option value="title:desc">Title (Z → A)</option>
            </select>
          </div>
        </div>
      </div>


      <div className={styles.tableWrapper}>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Featured</th>
              <th>Author</th>
              <th>Categories</th>
              <th>Tags</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id}>
                <td>
                  <button className={styles.titleLink} onClick={() => navigate(`/admin/posts/${post.id}/edit`)}>
                    {post.title}
                  </button>
                </td>
                <td>
                  {post.isFeatured ? <span className={styles.featuredBadge}>Featured</span> : '—'}
                </td>
                <td>{authorName(post)}</td>
                <td>
                  {post.categories.length === 0 && '—'}
                  {post.categories.map(({ category }) => (
                    <span key={category.id} className={styles.chip}>
                      {category.name}
                    </span>
                  ))}
                </td>
                <td>
                  {post.tags.length === 0 && '—'}
                  {post.tags.map(({ tag }) => (
                    <span key={tag.id} className={styles.tagChip}>
                      {tag.name}
                    </span>
                  ))}
                </td>
                <td className={styles.date}>{dateLabel(post)}</td>
                <td>
                  <span className={`${styles.statusBadge} ${styles[`status_${post.status}`] || ''}`}>
                    {STATUS_LABELS[post.status] || post.status}
                  </span>
                </td>
                <td className={styles.actions}>
                  {post.status === 'trash' ? (
                    <>
                      <button onClick={() => handleRestore(post)}>Restore</button>
                      <button className={styles.deleteButton} onClick={() => handleDeletePermanently(post)}>
                        Delete Permanently
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => navigate(`/admin/posts/${post.id}/edit`)}>Edit</button>
                      <button className={styles.deleteButton} onClick={() => handleTrash(post)}>
                        Trash
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && posts.length === 0 && <div className={styles.empty}>No posts found.</div>}
      </div>

      <div className={styles.pagination}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>
          Next
        </button>
      </div>
    </AdminLayout>
  );
}
