import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { PostCard } from '../components/PostCard';
import { SearchForm } from '../components/SearchForm';
import { fetchPosts } from '../services/posts';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { applySeo, resetSeo } from '../utils/seo';
import { PostSummary, Pagination } from '../types';

interface Props {
  title?: string;
}

export function PostsArchive({ title = 'Latest' }: Props) {
  const { posts_per_page, site_title, site_description } = useSiteSettings();
  const postsPerPage = Math.max(1, Math.min(50, Number(posts_per_page) || 10));

  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') || 1);
  const search = searchParams.get('search') || '';

  useEffect(() => {
    applySeo({
      title: search ? `Search: “${search}” — ${site_title}` : `${title} — ${site_title}`,
      description: search ? `Search results for “${search}”.` : site_description,
      ogType: 'website',
    });
    return () => resetSeo(site_title);
  }, [search, title, site_title, site_description]);

  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchPosts({ page, limit: postsPerPage, search: search || undefined })
      .then((result) => {
        setPosts(result.items);
        setPagination(result.pagination);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [page, search, postsPerPage]);

  return (
    <div>
      <div className="page-hero">
        <h1 className="page-title">{search ? `Search: "${search}"` : title}</h1>
        <SearchForm />
      </div>

      {error && <div className="alert-error">{error}</div>}

      {loading ? (
        <div className="loading-msg">Loading…</div>
      ) : posts.length === 0 ? (
        <div className="empty-msg">No posts found.</div>
      ) : (
        <div className="post-grid">
          {posts.map((post) => <PostCard key={post.id} post={post} />)}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="pagination">
          {page > 1 && (
            <button
              className="page-btn"
              onClick={() => setSearchParams({ page: String(page - 1), ...(search ? { search } : {}) })}
            >
              <FontAwesomeIcon icon={faArrowLeft} /> Previous
            </button>
          )}
          <span className="page-info">Page {page} of {pagination.pages}</span>
          {page < pagination.pages && (
            <button
              className="page-btn"
              onClick={() => setSearchParams({ page: String(page + 1), ...(search ? { search } : {}) })}
            >
              Next <FontAwesomeIcon icon={faArrowRight} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
