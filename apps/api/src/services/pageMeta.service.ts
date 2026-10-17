import { prisma } from '../config/database';
import { buildPostPath, getPermalinkStructure, matchPostPath } from '../utils/permalinks';
import { absoluteUrl, siteUrl } from './feed.service';

/**
 * Link previews for the public site. The site is a single-page app, so
 * WhatsApp, X, Facebook, Slack and most search crawlers only ever see the
 * empty index.html. Here the API serves that same index.html with the page's
 * own title, description, image and canonical URL already filled in. The
 * app's client-side SEO (utils/seo.ts) then keeps managing the same tags.
 */

interface PageMeta {
  status: 200 | 404;
  title: string;
  description?: string | null;
  /** Social card title/description when they differ from the page's. */
  ogTitle?: string | null;
  ogDescription?: string | null;
  keywords?: string | null;
  canonical?: string | null;
  image?: string | null;
  type?: 'website' | 'article' | 'profile';
  noindex?: boolean;
  article?: { published: Date | null; modified: Date | null; author: string | null; section: string | null; tags: string[] };
  /** A category or tag feed, offered next to the site feed. */
  feed?: { title: string; href: string };
}

export type PageResult =
  | { redirect: string; status: number }
  | { html: string; status: number };

interface Site { title: string; description: string; favicon: string | null; visible: boolean }

const SHELL_URL = process.env.WEB_SHELL_URL || 'http://web:80/index.html';
let shell: { html: string; etag: string | null; checkedAt: number } | null = null;

/** The web app's built index.html, re-checked every few seconds so a new web deploy shows up at once. */
async function getShell(): Promise<string> {
  if (shell && Date.now() - shell.checkedAt < 5000) return shell.html;
  const res = await fetch(SHELL_URL, {
    headers: shell?.etag ? { 'If-None-Match': shell.etag } : {},
    signal: AbortSignal.timeout(3000),
  });
  if (res.status === 304 && shell) {
    shell.checkedAt = Date.now();
    return shell.html;
  }
  if (!res.ok) throw new Error(`web shell: ${res.status}`);
  shell = { html: await res.text(), etag: res.headers.get('etag'), checkedAt: Date.now() };
  return shell.html;
}

let siteCache: { value: Site; at: number } | null = null;
async function getSite(): Promise<Site> {
  if (siteCache && Date.now() - siteCache.at < 30_000) return siteCache.value;
  const rows = await prisma.setting.findMany({
    where: { key: { in: ['site_title', 'site_description', 'site_favicon', 'search_engine_visibility'] } },
  });
  const s: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const value = { title: s.site_title || 'Headtilts', description: s.site_description || '', favicon: s.site_favicon || null, visible: s.search_engine_visibility !== 'no' };
  siteCache = { value, at: Date.now() };
  return value;
}

/** Plain text from HTML, cut at a word boundary. */
function plain(html: string | null | undefined, max = 200): string | null {
  if (!html) return null;
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\[[^\]]+\]/g, ' ') // shortcodes
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30)).replace(/[\s,.;:–—-]+$/, '')}…`;
}

function personName(u: { firstName: string | null; lastName: string | null; username: string } | null): string | null {
  if (!u) return null;
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username;
}

function decode(segment: string): string {
  try { return decodeURIComponent(segment); } catch { return segment; }
}

async function postMeta(where: { id?: number; slug?: string }, type: 'post' | 'page', site: Site): Promise<PageMeta | null> {
  const post = await prisma.post.findFirst({
    where: { ...where, status: 'published', type },
    select: {
      id: true, slug: true, title: true, excerpt: true, content: true, publishedAt: true, updatedAt: true, featuredImage: true,
      metaTitle: true, metaDescription: true, metaKeywords: true, canonicalUrl: true, ogTitle: true, ogDescription: true, ogImage: true,
      author: { select: { firstName: true, lastName: true, username: true } },
      categories: { select: { category: { select: { name: true } } }, take: 1 },
      tags: { select: { tag: { select: { name: true } } } },
    },
  });
  if (!post) return null;
  const path = type === 'page' ? `/pages/${post.slug}` : buildPostPath(await getPermalinkStructure(), post);
  // Same order as the article page: chosen social image, featured image, then the generated title card.
  const image = post.ogImage || post.featuredImage || (type === 'post' ? `/api/public/posts/${encodeURIComponent(post.slug)}/og-image` : null);
  return {
    status: 200,
    title: post.metaTitle || `${post.title} — ${site.title}`,
    description: post.metaDescription || post.excerpt || plain(post.content),
    // Link previews show the full headline; the SEO title is often shortened.
    ogTitle: post.ogTitle || post.title,
    ogDescription: post.ogDescription,
    keywords: post.metaKeywords,
    canonical: post.canonicalUrl || `${siteUrl()}${path}`,
    image,
    type: type === 'post' ? 'article' : 'website',
    article: type === 'post' ? {
      published: post.publishedAt,
      modified: post.updatedAt,
      author: personName(post.author),
      section: post.categories[0]?.category.name ?? null,
      tags: post.tags.map((t) => t.tag.name),
    } : undefined,
  };
}

function eventWhen(start: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone || 'UTC' }).format(start);
  } catch {
    return start.toUTCString();
  }
}

async function resolve(path: string, search: string): Promise<PageMeta | { redirect: string; status: number }> {
  const site = await getSite();
  const base = siteUrl();
  const parts = path.split('/').filter(Boolean).map(decode);
  const [first, second] = parts;
  const notFound: PageMeta = { status: 404, title: `Page Not Found — ${site.title}`, noindex: true };
  const plainPage = (title: string, description?: string): PageMeta =>
    ({ status: 200, title: `${title} — ${site.title}`, description, canonical: `${base}${path}` });

  if (parts.length === 0 && !/[?&]p=\d/.test(search)) {
    return { status: 200, title: site.title, description: site.description, canonical: `${base}/` };
  }

  if (parts.length === 2) {
    switch (first) {
      case 'posts': return (await postMeta({ slug: second }, 'post', site)) ?? notFound;
      case 'pages': return (await postMeta({ slug: second }, 'page', site)) ?? notFound;
      case 'categories': {
        const cat = await prisma.category.findUnique({ where: { slug: second }, select: { name: true, slug: true, description: true } });
        if (!cat) return notFound;
        return {
          ...plainPage(cat.name, plain(cat.description) || `Browse posts filed under the ${cat.name} category.`),
          feed: { title: `${cat.name} — ${site.title}`, href: `/categories/${encodeURIComponent(cat.slug)}/feed` },
        };
      }
      case 'tags': {
        const tag = await prisma.tag.findUnique({ where: { slug: second }, select: { name: true, slug: true, description: true } });
        if (!tag) return notFound;
        return {
          ...plainPage(`#${tag.name}`, plain(tag.description) || `Browse posts tagged ${tag.name}.`),
          feed: { title: `#${tag.name} — ${site.title}`, href: `/tags/${encodeURIComponent(tag.slug)}/feed` },
        };
      }
      case 'authors': {
        const user = await prisma.user.findFirst({ where: { username: second, isActive: true }, select: { username: true, firstName: true, lastName: true, bio: true, avatar: true } });
        if (!user) return notFound;
        const name = personName(user)!;
        return { ...plainPage(name, plain(user.bio) || `Posts by ${name}`), type: 'profile', image: user.avatar };
      }
      case 'events': {
        const ev = await prisma.event.findFirst({
          where: { slug: second, status: 'published' },
          select: { title: true, excerpt: true, description: true, startAt: true, timezone: true, venueName: true, venueCity: true, type: true, metaTitle: true, metaDescription: true, ogImage: true, bannerImage: true, featuredImage: true },
        });
        if (!ev) return notFound;
        const where = ev.type === 'online' ? 'Online' : [ev.venueName, ev.venueCity].filter(Boolean).join(', ');
        const facts = [eventWhen(ev.startAt, ev.timezone), where].filter(Boolean).join(' · ');
        const about = ev.excerpt || plain(ev.description, 160);
        return {
          ...plainPage(ev.title),
          title: ev.metaTitle || `${ev.title} — ${site.title}`,
          // A description that only repeats the excerpt still gets the date and venue.
          description: (ev.metaDescription && ev.metaDescription !== ev.excerpt ? ev.metaDescription : null) || (about ? `${facts}. ${about}` : facts),
          image: ev.ogImage || ev.bannerImage || ev.featuredImage,
        };
      }
      case 'polls': {
        const poll = await prisma.poll.findUnique({
          where: { slug: second },
          select: { question: true, description: true, status: true, featuredImage: true, options: { select: { text: true }, orderBy: { order: 'asc' } } },
        });
        if (!poll || poll.status === 'draft') return notFound;
        const verb = poll.status === 'closed' ? 'See the results' : 'Cast your vote';
        const choices = poll.options.map((o) => o.text).join(' · ');
        return {
          ...plainPage(poll.question),
          description: plain(poll.description) || plain(`${verb}: ${choices}`),
          image: poll.featuredImage,
        };
      }
    }
  }

  if (parts.length === 1) {
    switch (first) {
      case 'events': return plainPage('Events', 'Browse upcoming and past events.');
      case 'polls': return plainPage('Polls', 'Vote on the latest polls and see what the community thinks.');
      case 'search': return { ...plainPage('Search'), noindex: true };
      case 'status': return plainPage('Status');
    }
  }
  if (first === 'date' && parts.length <= 4 && parts.slice(1).every((p) => /^\d{1,4}$/.test(p))) return plainPage('Archive');
  if (first === 'preview') return { status: 200, title: `Preview — ${site.title}`, noindex: true };

  // Anything else is a post permalink (e.g. /my-post or /2026/10/my-post), an
  // admin-defined redirect, or a real 404.
  const matched = matchPostPath(await getPermalinkStructure(), path + search);
  if (matched) {
    const meta = await postMeta(matched.id ? { id: matched.id } : { slug: matched.slug }, 'post', site);
    if (meta) return meta;
  }
  const redirect = await prisma.redirect.findUnique({ where: { fromPath: path } });
  if (redirect) {
    prisma.redirect.update({ where: { id: redirect.id }, data: { hits: { increment: 1 } } }).catch(() => {});
    return { redirect: redirect.toPath, status: redirect.type === 301 ? 301 : 302 };
  }
  return notFound;
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function headTags(meta: PageMeta, site: Site, url: string): string[] {
  const m = (attr: 'name' | 'property', key: string, value: string | null | undefined) =>
    value ? `<meta ${attr}="${key}" content="${esc(value)}" />` : '';
  const image = absoluteUrl(meta.image);
  const favicon = absoluteUrl(site.favicon);
  const a = meta.article;
  return [
    m('name', 'description', meta.description),
    m('name', 'keywords', meta.keywords),
    meta.noindex || !site.visible ? m('name', 'robots', 'noindex, nofollow') : '',
    meta.canonical ? `<link rel="canonical" href="${esc(meta.canonical)}" />` : '',
    favicon ? `<link rel="icon" href="${esc(favicon)}" />` : '',
    `<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="${esc(`${siteUrl()}/feed`)}" />`,
    meta.feed ? `<link rel="alternate" type="application/rss+xml" title="${esc(meta.feed.title)}" href="${esc(siteUrl() + meta.feed.href)}" data-feed="section" />` : '',
    m('property', 'og:site_name', site.title),
    m('property', 'og:title', meta.ogTitle || meta.title),
    m('property', 'og:description', meta.ogDescription || meta.description),
    m('property', 'og:image', image),
    m('property', 'og:type', meta.type || 'website'),
    m('property', 'og:url', url),
    a?.published ? m('property', 'article:published_time', a.published.toISOString()) : '',
    a?.modified ? m('property', 'article:modified_time', a.modified.toISOString()) : '',
    m('property', 'article:author', a?.author),
    m('property', 'article:section', a?.section),
    ...(a?.tags ?? []).map((t) => m('property', 'article:tag', t)),
    m('name', 'twitter:card', image ? 'summary_large_image' : 'summary'),
  ].filter(Boolean);
}

const cache = new Map<string, { meta: PageMeta | { redirect: string; status: number }; at: number }>();
const CACHE_MS = 30_000;

/** The public page at `path`, with its head filled in, or where it redirects to. */
export async function renderPage(path: string, search: string): Promise<PageResult> {
  const key = path + search;
  let hit = cache.get(key);
  if (!hit || Date.now() - hit.at > CACHE_MS) {
    hit = { meta: await resolve(path, search), at: Date.now() };
    if (cache.size >= 500) cache.delete(cache.keys().next().value as string);
    cache.set(key, hit);
  }
  const meta = hit.meta;
  if ('redirect' in meta) return meta;

  const [html, site] = await Promise.all([getShell(), getSite()]);
  const url = meta.canonical && meta.status === 200 ? meta.canonical : `${siteUrl()}${path}`;
  const tags = headTags(meta, site, url).join('\n    ');
  const out = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(meta.title)}</title>`)
    .replace(/<\/head>/i, `    ${tags}\n  </head>`);
  return { html: out, status: meta.status };
}
