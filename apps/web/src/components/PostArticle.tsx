import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../services/api';

const API_BASE = (import.meta.env.VITE_API_URL as string) || 'http://localhost:3000/api';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { useLayout } from '../context/LayoutContext';
import { formatDate, formatTime } from '../utils/date';
import { applySeo, resetSeo } from '../utils/seo';
import { resolveShortcodes } from '../utils/shortcodes';
import { RichContent } from './RichContent';
import { Comments } from './Comments';
import { ReadingProgress } from './ReadingProgress';
import { TableOfContents } from './TableOfContents';
import { PostReactions } from './PostReactions';
import { RelatedPosts } from './RelatedPosts';
import { SeriesNav } from './SeriesNav';
import { Author, PostFull } from '../types';
import { readingTime } from '../utils/readingTime';

function displayName(author: Author): string {
  const name = [author.firstName, author.lastName].filter(Boolean).join(' ');
  return name || author.username;
}

export function PostArticle({ post }: { post: PostFull }) {
  const { date_format, time_format, timezone, site_title, site_tagline, site_description, toc_enabled } = useSiteSettings();
  const { setShowSidebar } = useLayout();
  const articleRef = useRef<HTMLElement>(null);

  // Ordered list: primary author first, then co-authors
  const allAuthors: Author[] = useMemo(() => {
    const list: Author[] = [];
    if (post.author) list.push(post.author);
    post.coAuthors?.forEach(({ user }) => {
      if (!list.some((a) => a.id === user.id)) list.push(user);
    });
    return list;
  }, [post.author, post.coAuthors]);

  const readMins = useMemo(() => readingTime(post.content ?? ''), [post.content]);

  const resolvedContent = useMemo(() => resolveShortcodes(post.content ?? '', {
    siteName: site_title,
    siteTagline: site_tagline,
    siteDescription: site_description,
    dateFormat: date_format,
    timezone,
    post: {
      title: post.title,
      authorName: allAuthors.map(displayName).join(', '),
      publishedAt: post.publishedAt,
      excerpt: post.excerpt ?? null,
    },
  }), [post, allAuthors, site_title, site_tagline, site_description, date_format, timezone]);

  useEffect(() => {
    setShowSidebar(Boolean(post.showSidebar));
    return () => setShowSidebar(false);
  }, [post, setShowSidebar]);

  useEffect(() => {
    applySeo({
      title: post.metaTitle || `${post.title} — ${site_title}`,
      description: post.metaDescription || post.excerpt,
      keywords: post.metaKeywords,
      canonicalUrl: post.canonicalUrl,
      ogTitle: post.ogTitle,
      ogDescription: post.ogDescription,
      ogImage: post.ogImage || post.featuredImage || `${API_BASE}/public/posts/${post.slug}/og-image`,
      ogType: 'article',
    });
    return () => resetSeo(site_title);
  }, [post, site_title]);

  return (
    <article className="post-full" ref={articleRef}>
      <ReadingProgress targetRef={articleRef} />

      {post.featuredImage && (
        <img src={resolveMediaUrl(post.featuredImage)} alt={post.title} className="post-featured-img" />
      )}

      <header className="post-header">
        <div className="post-meta">
          {post.categories.map(({ category }) => (
            <Link key={category.id} to={`/categories/${category.slug}`} className="post-cat">
              {category.name}
            </Link>
          ))}
        </div>
        <h1 className="post-title">{post.title}</h1>
        <div className="post-byline">
          {allAuthors.length > 0 && (
            <span className="post-byline-authors">
              {allAuthors.map((author, i) => (
                <span key={author.id} className="post-byline-author-wrap">
                  {i > 0 && <span className="post-byline-comma">{i === allAuthors.length - 1 ? ' & ' : ', '}</span>}
                  <Link to={`/authors/${author.username}`} className="post-byline-author">
                    {author.avatar && (
                      <img
                        src={resolveMediaUrl(author.avatar)}
                        alt={displayName(author)}
                        className="post-byline-avatar"
                      />
                    )}
                    <span>{displayName(author)}</span>
                  </Link>
                </span>
              ))}
            </span>
          )}
          {allAuthors.length > 0 && post.publishedAt && <span className="post-byline-sep">·</span>}
          {post.publishedAt && (
            <span title={formatTime(post.publishedAt, time_format, timezone)}>
              {formatDate(post.publishedAt, date_format, timezone)}
            </span>
          )}
          <span className="post-byline-sep">·</span>
          <span className="post-reading-time">{readMins} min read</span>
        </div>
      </header>

      <SeriesNav slug={post.slug} />
      {(() => {
        // Per-post override wins; fall back to sitewide toc_enabled (default: show)
        const perPost = post.showToc;
        const show = perPost === 'yes' || (perPost !== 'no' && toc_enabled !== 'no');
        return show ? <TableOfContents html={resolvedContent} /> : null;
      })()}
      <RichContent html={resolvedContent} className="post-content" />

      {post.tags.length > 0 && (
        <footer className="post-tags">
          {post.tags.map(({ tag }) => (
            <Link key={tag.id} to={`/tags/${tag.slug}`} className="post-tag">#{tag.name}</Link>
          ))}
        </footer>
      )}

      {allAuthors.length > 0 && (() => {
        const primary = allAuthors[0];
        const coAuthors = allAuthors.slice(1);
        return (
          <aside className="post-author-box">
            <div className="post-author-primary">
              {primary.avatar && (
                <img
                  src={resolveMediaUrl(primary.avatar)}
                  alt={displayName(primary)}
                  className="post-author-avatar"
                />
              )}
              <div className="post-author-info">
                <Link to={`/authors/${primary.username}`} className="post-author-name">
                  {displayName(primary)}
                </Link>
                {primary.bio && <p className="post-author-bio">{primary.bio}</p>}
                <Link to={`/authors/${primary.username}`} className="post-author-link">
                  View all posts →
                </Link>
              </div>
            </div>

            {coAuthors.length > 0 && (
              <div className="post-coauthors-row">
                <span className="post-coauthors-label">Also written with</span>
                {coAuthors.map((author) => (
                  <Link key={author.id} to={`/authors/${author.username}`} className="post-coauthor-chip">
                    {author.avatar && (
                      <img
                        src={resolveMediaUrl(author.avatar)}
                        alt={displayName(author)}
                        className="post-coauthor-avatar"
                      />
                    )}
                    <span>{displayName(author)}</span>
                  </Link>
                ))}
              </div>
            )}
          </aside>
        );
      })()}

      <PostReactions slug={post.slug} />
      <RelatedPosts slug={post.slug} />
      <Comments slug={post.slug} />
    </article>
  );
}
