import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { PostCard } from '../components/PostCard';
import { fetchPosts } from '../services/posts';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { applySeo, resetSeo } from '../utils/seo';
import { Pagination, PostSummary } from '../types';

const PAGE_SIZE = 10;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function DateArchivePage() {
  const { year, month, day } = useParams<{ year: string; month?: string; day?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') || 1);

  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { site_title } = useSiteSettings();

  const y = Number(year);
  const m = month ? Number(month) : 0;
  const d = day ? Number(day) : 0;

  let label = String(y);
  if (m) label = `${MONTH_NAMES[m - 1]} ${y}`;
  if (m && d) label = `${MONTH_NAMES[m - 1]} ${d}, ${y}`;

  useEffect(() => {
    applySeo({
      title: `${label} — ${site_title}`,
      description: `Posts published in ${label}.`,
      ogType: 'website',
    });
    return () => resetSeo(site_title);
  }, [label, site_title]);

  useEffect(() => {
    if (!y) return;
    setLoading(true);
    fetchPosts({ page, limit: PAGE_SIZE, year: y, month: m || undefined, day: d || undefined })
      .then((result) => {
        setPosts(result.items);
        setPagination(result.pagination);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [y, m, d, page]);

  return (
    <div>
      <div className="page-hero">
        <p className="archive-label">Archive</p>
        <h1 className="page-title">{label}</h1>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {loading ? (
        <div className="loading-msg">Loading…</div>
      ) : posts.length === 0 ? (
        <div className="empty-msg">No posts published on this date.</div>
      ) : (
        <div className="post-grid">
          {posts.map((post) => <PostCard key={post.id} post={post} />)}
        </div>
      )}

      {pagination && pagination.pages > 1 && (
        <div className="pagination">
          {page > 1 && (
            <button className="page-btn" onClick={() => setSearchParams({ page: String(page - 1) })}><FontAwesomeIcon icon={faArrowLeft} /> Previous</button>
          )}
          <span className="page-info">Page {page} of {pagination.pages}</span>
          {page < pagination.pages && (
            <button className="page-btn" onClick={() => setSearchParams({ page: String(page + 1) })}>Next <FontAwesomeIcon icon={faArrowRight} /></button>
          )}
        </div>
      )}
    </div>
  );
}
