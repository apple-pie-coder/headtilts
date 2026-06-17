import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPosts } from '../services/posts';
import { resolveMediaUrl } from '../services/api';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { formatDate } from '../utils/date';
import { authorName } from './PostCard';
import { PostSummary } from '../types';
import { postPath } from '../utils/permalink';

function HeroSlide({ post, variant }: { post: PostSummary; variant: 'big' | 'small' }) {
  const { date_format, timezone } = useSiteSettings();
  const TitleTag = variant === 'big' ? 'h1' : 'h3';
  return (
    <Link to={postPath(post)} className={`fph-slide fph-slide--${variant}`}>
      {post.featuredImage ? (
        <img src={resolveMediaUrl(post.featuredImage)} alt="" className="fph-slide-image" />
      ) : (
        <span className="fph-slide-image fph-slide-image--placeholder" />
      )}
      <div className="fph-slide-overlay" />
      <div className="fph-slide-content">
        {post.categories[0] && (
          <span className="fph-slide-cat">{post.categories[0].category.name}</span>
        )}
        <TitleTag className="fph-slide-title">{post.title}</TitleTag>
        {variant === 'big' && post.excerpt && <p className="fph-slide-excerpt">{post.excerpt}</p>}
        <div className="fph-slide-meta">
          {post.publishedAt && <span>{formatDate(post.publishedAt, date_format, timezone)}</span>}
          {variant === 'big' && post.author && <span> · {authorName(post)}</span>}
        </div>
      </div>
    </Link>
  );
}

export function FrontPageHero() {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);

  // Featured posts (curated in Admin → Posts → Featured), newest first, capped at 5:
  // the first is shown large, the rest as a 4-up row below.
  useEffect(() => {
    let cancelled = false;
    fetchPosts({ featured: true, limit: 5 })
      .then((res) => { if (!cancelled) setPosts(res.items); })
      .catch(() => { if (!cancelled) setPosts([]); });
    return () => { cancelled = true; };
  }, []);

  if (!posts || posts.length === 0) return null;

  const [big, ...rest] = posts;
  const small = rest.slice(0, 4);

  return (
    <section className="fph-hero">
      <HeroSlide post={big} variant="big" />
      {small.length > 0 && (
        <div className="fph-small-grid">
          {small.map((post) => <HeroSlide key={post.id} post={post} variant="small" />)}
        </div>
      )}
    </section>
  );
}
