import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../services/api';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { useLayout } from '../context/LayoutContext';
import { formatDate, formatTime } from '../utils/date';
import { applySeo, resetSeo } from '../utils/seo';
import { resolveShortcodes } from '../utils/shortcodes';
import { sanitizeHtml } from '../utils/sanitize';
import { Comments } from './Comments';
import { Author, PostFull } from '../types';

function displayName(author: Author): string {
  const name = [author.firstName, author.lastName].filter(Boolean).join(' ');
  return name || author.username;
}

export function PostArticle({ post }: { post: PostFull }) {
  const { date_format, time_format, timezone, site_title, site_tagline, site_description } = useSiteSettings();
  const { setShowSidebar } = useLayout();

  // Ordered list: primary author first, then co-authors
  const allAuthors: Author[] = useMemo(() => {
    const list: Author[] = [];
    if (post.author) list.push(post.author);
    post.coAuthors?.forEach(({ user }) => {
      if (!list.some((a) => a.id === user.id)) list.push(user);
    });
    return list;
  }, [post.author, post.coAuthors]);

  const resolvedContent = useMemo(() => sanitizeHtml(resolveShortcodes(post.content ?? '', {
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
  })), [post, allAuthors, site_title, site_tagline, site_description, date_format, timezone]);

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
      ogImage: post.ogImage || post.featuredImage,
      ogType: 'article',
    });
    return () => resetSeo(site_title);
  }, [post, site_title]);

  return (
    <article className="post-full">

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
        </div>
      </header>

      <div
        className="post-content"
        dangerouslySetInnerHTML={{ __html: resolvedContent }}
      />

      {post.tags.length > 0 && (
        <footer className="post-tags">
          {post.tags.map(({ tag }) => (
            <Link key={tag.id} to={`/tags/${tag.slug}`} className="post-tag">#{tag.name}</Link>
          ))}
        </footer>
      )}

      {allAuthors.length > 0 && (
        <div className="post-author-cards">
          {allAuthors.map((author, i) => (
            <aside key={author.id} className="post-author-box">
              {author.avatar && (
                <Link to={`/authors/${author.username}`}>
                  <img
                    src={resolveMediaUrl(author.avatar)}
                    alt={displayName(author)}
                    className="post-author-avatar"
                  />
                </Link>
              )}
              <div className="post-author-info">
                <Link to={`/authors/${author.username}`} className="post-author-name">
                  {displayName(author)}
                  {i === 0 && allAuthors.length > 1 && (
                    <span className="post-author-role"> · Primary Author</span>
                  )}
                  {i > 0 && <span className="post-author-role"> · Co-Author</span>}
                </Link>
                {author.bio && <p className="post-author-bio">{author.bio}</p>}
                <Link to={`/authors/${author.username}`} className="post-author-link">
                  View all posts →
                </Link>
              </div>
            </aside>
          ))}
        </div>
      )}

      <Comments slug={post.slug} />
    </article>
  );
}
