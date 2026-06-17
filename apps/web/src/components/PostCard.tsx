import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../services/api';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { formatDate } from '../utils/date';
import { postPath } from '../utils/permalink';
import { PostSummary } from '../types';

export function authorName(post: PostSummary): string {
  if (!post.author) return '';
  const name = [post.author.firstName, post.author.lastName].filter(Boolean).join(' ');
  return name || post.author.username;
}

export function PostCard({ post }: { post: PostSummary }) {
  const { date_format, timezone } = useSiteSettings();

  return (
    <article className="post-card">
      {post.featuredImage && (
        <Link to={postPath(post)} className="post-card-image-wrap">
          <img src={resolveMediaUrl(post.featuredImage)} alt={post.title} className="post-card-image" />
        </Link>
      )}
      <div className="post-card-body">
        <div className="post-card-meta">
          {post.categories.map(({ category }) => (
            <Link key={category.id} to={`/categories/${category.slug}`} className="post-cat">
              {category.name}
            </Link>
          ))}
        </div>
        <h2 className="post-card-title">
          <Link to={postPath(post)}>{post.title}</Link>
        </h2>
        {post.excerpt && <p className="post-card-excerpt">{post.excerpt}</p>}
        <div className="post-card-footer">
          {post.author && <span className="post-author">{authorName(post)}</span>}
          <span className="post-date">{formatDate(post.publishedAt, date_format, timezone)}</span>
        </div>
      </div>
    </article>
  );
}
