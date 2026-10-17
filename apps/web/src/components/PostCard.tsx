import { useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../services/api';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { formatDate, timeAgo } from '../utils/date';
import { postPath } from '../utils/permalink';
import { focusStyle } from '../utils/focus';
import { PostSummary } from '../types';
import { CategoryIcon } from './CategoryIcon';
import { Tape } from './Tape';
import './MediaPlayers.css';

export function authorName(post: PostSummary): string {
  if (!post.author) return '';
  const name = [post.author.firstName, post.author.lastName].filter(Boolean).join(' ');
  return name || post.author.username;
}

const KIND: Record<string, string> = { news: 'News', review: 'Review', qna: 'Q&A' };

/** Imported excerpts often join words with non-breaking spaces, which stops them wrapping. */
export const plain = (s: string) => s.replace(/\u00a0/g, ' ');

/** Story picture, or — when a post has none at all — a branded tile with its section's icon. */
export function StoryImage({ post, className }: { post: PostSummary; className: string }) {
  const review = post.articleType === 'review' ? post.review ?? null : null;
  const src = post.featuredImage || review?.coverImage;
  const cat = post.categories[0]?.category;
  const [broken, setBroken] = useState(false);
  return (
    <span className={`story-media ${className}`}>
      {src && !broken ? (
        <img src={resolveMediaUrl(src)} alt="" loading="lazy" style={post.featuredImage ? focusStyle(post) : undefined} onError={() => setBroken(true)} />
      ) : (
        <span className="story-tile" aria-hidden="true">
          {cat && <CategoryIcon icon={cat.icon} iconSvg={cat.iconSvg} />}
          <span>{cat?.name ?? 'Headtilts'}</span>
        </span>
      )}
      {review?.rating != null && (
        <span className="rating-badge" aria-label={`Rated ${review.rating} out of 10`}>
          {review.rating % 1 ? review.rating.toFixed(1) : review.rating}<small>/10</small>
        </span>
      )}
    </span>
  );
}

function Byline({ post, relative }: { post: PostSummary; relative?: boolean }) {
  const { date_format, timezone } = useSiteSettings();
  const name = authorName(post);
  return (
    <p className="story-byline">
      {name && <span className="story-author">{name}</span>}
      {post.publishedAt && (
        <time dateTime={post.publishedAt} title={formatDate(post.publishedAt, date_format, timezone)}>
          {relative ? timeAgo(post.publishedAt) : formatDate(post.publishedAt, date_format, timezone)}
        </time>
      )}
    </p>
  );
}

/** Grid card used by archives: picture, section tape, headline, standfirst, byline. */
export function PostCard({ post }: { post: PostSummary }) {
  const review = post.articleType === 'review' ? post.review ?? null : null;
  const cat = post.categories[0]?.category;
  const href = postPath(post);
  return (
    <article className="story-card">
      <Link to={href} className="story-card-media" tabIndex={-1} aria-hidden="true">
        <StoryImage post={post} className="story-media--card" />
      </Link>
      <div className="story-card-body">
        <div className="story-labels">
          {cat && <Tape category={cat} />}
          {post.articleType && KIND[post.articleType] && <span className={`story-kind story-kind--${post.articleType}`}>{KIND[post.articleType]}</span>}
        </div>
        <h2 className="story-title"><Link to={href}>{post.title}</Link></h2>
        {review?.artist && <p className="story-review">{review.artist} — <em>{review.subjectTitle}</em></p>}
        {post.excerpt && <p className="story-excerpt">{plain(post.excerpt)}</p>}
        <Byline post={post} />
      </div>
    </article>
  );
}

/** Horizontal row used by the home feed: denser, scannable. */
export function StoryRow({ post }: { post: PostSummary }) {
  const review = post.articleType === 'review' ? post.review ?? null : null;
  const cat = post.categories[0]?.category;
  const href = postPath(post);
  return (
    <article className="story-row">
      <Link to={href} className="story-row-media" tabIndex={-1} aria-hidden="true">
        <StoryImage post={post} className="story-media--row" />
      </Link>
      <div className="story-row-body">
        <div className="story-labels">
          {cat && <Tape category={cat} />}
          {post.articleType && KIND[post.articleType] && <span className={`story-kind story-kind--${post.articleType}`}>{KIND[post.articleType]}</span>}
        </div>
        <h3 className="story-title"><Link to={href}>{post.title}</Link></h3>
        {review?.artist && <p className="story-review">{review.artist} — <em>{review.subjectTitle}</em></p>}
        {post.excerpt && <p className="story-excerpt">{plain(post.excerpt)}</p>}
        <Byline post={post} relative />
      </div>
    </article>
  );
}
