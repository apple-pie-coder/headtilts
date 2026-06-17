import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { fetchPage } from '../services/posts';
import { PostFull } from '../types';
import { useLayout, templateToVariant } from '../context/LayoutContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { ContactForm } from '../components/ContactForm';
import { applySeo, resetSeo } from '../utils/seo';
import { resolveShortcodes } from '../utils/shortcodes';
import { sanitizeHtml } from '../utils/sanitize';
import { PostsArchive } from './PostsArchive';

export function PageDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PostFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { setVariant, setShowSidebar } = useLayout();
  const { posts_page_slug, site_title, site_tagline, site_description, date_format, timezone } = useSiteSettings();

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetchPage(slug)
      .then((p) => {
        setPage(p);
        setVariant(templateToVariant(p.template));
        setShowSidebar(Boolean(p.showSidebar));
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));

    return () => {
      setVariant('default');
      setShowSidebar(false);
    };
  }, [slug, setVariant, setShowSidebar]);

  const resolvedContent = useMemo(() => {
    if (!page) return '';
    return sanitizeHtml(resolveShortcodes(page.content ?? '', {
      siteName: site_title,
      siteTagline: site_tagline,
      siteDescription: site_description,
      dateFormat: date_format,
      timezone,
      post: { title: page.title, publishedAt: page.publishedAt, excerpt: page.excerpt ?? null },
    }));
  }, [page, site_title, site_tagline, site_description, date_format, timezone]);

  useEffect(() => {
    if (page) {
      applySeo({
        title: page.metaTitle || `${page.title} — ${site_title}`,
        description: page.metaDescription || page.excerpt,
        keywords: page.metaKeywords,
        canonicalUrl: page.canonicalUrl,
        ogTitle: page.ogTitle,
        ogDescription: page.ogDescription,
        ogImage: page.ogImage || page.featuredImage,
      });
    }
    return () => resetSeo(site_title);
  }, [page, site_title]);

  if (loading) return <div className="loading-msg">Loading…</div>;
  if (error || !page) return (
    <div className="error-page">
      <h1>Page Not Found</h1>
      <p>{error || 'This page does not exist.'}</p>
      <Link to="/" className="back-link"><FontAwesomeIcon icon={faArrowLeft} /> Back to home</Link>
    </div>
  );

  // If this page is designated as the "Posts page" (Settings → Reading), show the
  // blog post listing instead of the page's own content — mirrors WordPress behavior.
  if (posts_page_slug && page.slug === posts_page_slug) {
    return <PostsArchive title={page.title} />;
  }

  const template = page.template || 'default';

  return (
    <article className={`post-full page-template-${template}`}>
      <header className="post-header">
        <h1 className="post-title">{page.title}</h1>
      </header>
      <div className="post-content" dangerouslySetInnerHTML={{ __html: resolvedContent }} />
      {template === 'contact' && <ContactForm />}
    </article>
  );
}
