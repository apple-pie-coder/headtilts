import { useEffect, useState } from 'react';
import { fetchPosts } from '../services/posts';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { useLayout } from '../context/LayoutContext';
import { applySeo, resetSeo } from '../utils/seo';
import { PostCard } from './PostCard';
import { PostSummary } from '../types';

// Larger than a screenful: the first page also loses the stories shown in the lead rail.
const PAGE_SIZE = 12;

export function PostFeed({ exclude }: { exclude?: Set<number> }) {
  const { setVariant, setShowSidebar } = useLayout();
  const { site_title, site_tagline, site_description } = useSiteSettings();
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // The feed owns the full content width with no sidebar, regardless of how
  // the homepage routed here.
  useEffect(() => {
    setVariant('default');
    setShowSidebar(false);
  }, [setVariant, setShowSidebar]);

  // Homepage SEO: site title + tagline, with the site description.
  useEffect(() => {
    applySeo({
      title: site_tagline ? `${site_title} — ${site_tagline}` : site_title,
      description: site_description,
      ogType: 'website',
    });
    return () => resetSeo(site_title);
  }, [site_title, site_tagline, site_description]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPosts({ page, limit: PAGE_SIZE, featured: false })
      .then((result) => {
        if (cancelled) return;
        setPosts((prev) => (page === 1 ? result.items : [...prev, ...result.items]));
        setTotalPages(result.pagination.pages);
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [page]);

  const hasMore = page < totalPages;

  return (
    <div className="post-feed">
      {error && <div className="alert-error">{error}</div>}

      <h2 className="section-title">Latest stories</h2>
      <div className="post-grid">
        {posts.filter((p) => !exclude?.has(p.id)).map((post) => <PostCard key={post.id} post={post} />)}
      </div>

      {loading && <div className="loading-msg">Loading…</div>}

      {!loading && posts.length === 0 && <p className="empty-state">Nothing published yet — new stories will appear here.</p>}

      {!loading && hasMore && (
        <button type="button" className="load-more" onClick={() => setPage((p) => p + 1)}>
          Load more stories
        </button>
      )}
    </div>
  );
}
