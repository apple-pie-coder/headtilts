import { resolveMediaUrl } from '../services/api';

export interface SeoInput {
  title: string;
  description?: string | null;
  keywords?: string | null;
  canonicalUrl?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  ogType?: 'website' | 'article' | 'profile';
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string | null | undefined) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!content) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string | null | undefined) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!href) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// Tracks whether a page (post/page/archive) currently owns the document SEO.
// While true, the site-wide defaults must not overwrite the page's title/meta —
// this prevents the async site-settings fetch from clobbering a page title on
// refresh (a race between the settings request and the page-content request).
let pageSeoActive = false;

/** Apply document title plus description/keywords/canonical/Open Graph tags. */
export function applySeo(seo: SeoInput) {
  pageSeoActive = true;
  document.title = seo.title;

  const description = seo.description || null;
  const ogImage = seo.ogImage ? resolveMediaUrl(seo.ogImage) : null;

  upsertMeta('name', 'description', description);
  upsertMeta('name', 'keywords', seo.keywords);
  upsertCanonical(seo.canonicalUrl);

  upsertMeta('property', 'og:title', seo.ogTitle || seo.title);
  upsertMeta('property', 'og:description', seo.ogDescription || description);
  upsertMeta('property', 'og:image', ogImage);
  upsertMeta('property', 'og:type', seo.ogType || 'website');
  upsertMeta('property', 'og:url', window.location.href);

  upsertMeta('name', 'twitter:card', ogImage ? 'summary_large_image' : 'summary');
}

/** Apply the site-wide search engine visibility setting as a robots meta tag. */
export function applyRobotsPolicy(visible: boolean) {
  upsertMeta('name', 'robots', visible ? null : 'noindex, nofollow');
}

/**
 * Apply the site-wide title/description as a fallback. No-op while a page owns
 * the SEO, so a late-resolving settings fetch can't overwrite a page's tags.
 */
export function applySiteDefaults({ title, description }: { title: string; description?: string | null }) {
  if (pageSeoActive) return;
  document.title = title;
  upsertMeta('name', 'description', description || null);
  upsertMeta('property', 'og:title', title);
  upsertMeta('property', 'og:description', description || null);
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:url', window.location.href);
}

/** Remove page-specific tags when navigating away. */
export function resetSeo(siteTitle: string) {
  pageSeoActive = false;
  document.title = siteTitle;
  upsertMeta('name', 'description', null);
  upsertMeta('name', 'keywords', null);
  upsertCanonical(null);
  upsertMeta('property', 'og:title', null);
  upsertMeta('property', 'og:description', null);
  upsertMeta('property', 'og:image', null);
  upsertMeta('property', 'og:type', null);
  upsertMeta('property', 'og:url', null);
  upsertMeta('name', 'twitter:card', null);
}
