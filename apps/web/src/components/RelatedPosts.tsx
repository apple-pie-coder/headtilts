import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchRelatedPosts, RelatedPost } from '../services/posts';
import { resolveMediaUrl } from '../services/api';
import { formatDate } from '../utils/date';
import { useSiteSettings } from '../context/SiteSettingsContext';

export function RelatedPosts({ slug }: { slug: string }) {
  const [posts, setPosts] = useState<RelatedPost[]>([]);
  const { date_format, timezone } = useSiteSettings();

  useEffect(() => {
    fetchRelatedPosts(slug, 4).then(setPosts).catch(() => {});
  }, [slug]);

  if (posts.length === 0) return null;

  return (
    <section className="related-posts">
      <h3 className="related-posts-title">You may also like</h3>
      <div className="related-posts-grid">
        {posts.map((p) => (
          <Link key={p.id} to={`/${p.slug}`} className="related-post-card">
            {p.featuredImage ? (
              <img src={resolveMediaUrl(p.featuredImage)} alt={p.title} className="related-post-img" loading="lazy" />
            ) : (
              <div className="related-post-img-placeholder" />
            )}
            <div className="related-post-body">
              <p className="related-post-title">{p.title}</p>
              {p.publishedAt && (
                <span className="related-post-date">{formatDate(p.publishedAt, date_format, timezone)}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
