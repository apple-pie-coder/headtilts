import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../services/api';
import { fetchPosts } from '../services/posts';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { useLayout } from '../context/LayoutContext';
import { formatDate, timeAgo } from '../utils/date';
import { postPath } from '../utils/permalink';
import { applySeo, resetSeo } from '../utils/seo';
import { authorName } from './PostCard';
import { PostSummary } from '../types';

const PAGE_SIZE = 8;

function FeedCard({ post }: { post: PostSummary }) {
  const { date_format, timezone } = useSiteSettings();
  const name = authorName(post);
  const href = postPath(post);

  return (
    <article className="feed-card">
      {/* Category */}
      {post.categories.length > 0 && (
        <div className="feed-card-cats">
          {post.categories.map(({ category }) => (
            <Link key={category.id} to={`/categories/${category.slug}`} className="feed-card-cat">
              {category.name}
            </Link>
          ))}
        </div>
      )}

      {/* Title */}
      <h2 className="feed-card-title">
        <Link to={href}>{post.title}</Link>
      </h2>

      {/* Featured image */}
      <Link to={href} className="feed-card-media" aria-label={post.title}>
        {post.featuredImage ? (
          <img src={resolveMediaUrl(post.featuredImage)} alt={post.title} className="feed-card-image" loading="lazy" />
        ) : (
          <span className="feed-card-image feed-card-image--placeholder" />
        )}
      </Link>

      {/* Excerpt as an Feed caption */}
      {post.excerpt && <p className="feed-card-caption">{post.excerpt}</p>}

      {/* Author: <name> | time — small byline, last */}
      <div className="feed-card-foot">
        <div className="feed-card-byline">
          {name && <span className="feed-card-author">Author: {name}</span>}
          {name && post.publishedAt && <span className="feed-card-sep">|</span>}
          {post.publishedAt && (
            <span className="feed-card-date" title={formatDate(post.publishedAt, date_format, timezone)}>
              {timeAgo(post.publishedAt)}
            </span>
          )}
        </div>

        {/* Read more */}
        <Link to={href} className="feed-card-readmore">Read more</Link>
      </div>
    </article>
  );
}

export function PostFeed() {
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

      <div className="post-feed-grid">
        {posts.map((post) => <FeedCard key={post.id} post={post} />)}
      </div>

      {loading && <div className="loading-msg">Loading…</div>}

      {!loading && posts.length === 0 && <div className="empty-msg">No posts yet.</div>}

      {!loading && hasMore && (
        <button type="button" className="post-feed-load-more" onClick={() => setPage((p) => p + 1)}>
          Load more
        </button>
      )}
    </div>
  );
}
