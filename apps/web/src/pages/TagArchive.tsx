import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { PostCard } from '../components/PostCard';
import { fetchPosts } from '../services/posts';
import { fetchTags } from '../services/taxonomy';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { applySeo, resetSeo } from '../utils/seo';
import { Pagination, PostSummary, Tag } from '../types';

const PAGE_SIZE = 10;

export function TagArchivePage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') || 1);

  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [tag, setTag] = useState<Tag | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { site_title } = useSiteSettings();

  useEffect(() => {
    const name = tag?.name || slug || 'Tag';
    applySeo({
      title: `#${name} — ${site_title}`,
      description: tag?.description || `Browse posts tagged ${name}.`,
      ogType: 'website',
    });
    return () => resetSeo(site_title);
  }, [tag, slug, site_title]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    Promise.all([
      fetchPosts({ page, limit: PAGE_SIZE, tag: slug }),
      fetchTags(),
    ])
      .then(([result, tags]) => {
        setPosts(result.items);
        setPagination(result.pagination);
        setTag(tags.find((t) => t.slug === slug) ?? null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug, page]);

  return (
    <div>
      <div className="page-hero">
        <p className="archive-label">Tag</p>
        <h1 className="page-title">#{tag?.name || slug}</h1>
        {tag?.description && <p className="archive-description">{tag.description}</p>}
        {!loading && pagination && (
          <p className="archive-count">{pagination.total} post{pagination.total !== 1 ? 's' : ''}</p>
        )}
      </div>

      {error && <div className="alert-error">{error}</div>}
      {loading ? (
        <div className="loading-msg">Loading…</div>
      ) : posts.length === 0 ? (
        <div className="empty-msg">No posts with this tag.</div>
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
