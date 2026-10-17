import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { buildPostPath, getPermalinkStructure } from '../utils/permalinks';
import { imageFromContent } from '../utils/cardImage';

export function siteUrl(): string {
  return (process.env.SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Site-relative media paths ("/uploads/…") made absolute, for feeds and link previews. */
export function absoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${siteUrl()}${url.startsWith('/') ? '' : '/'}${url}`;
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' };

export type FeedScope = { category?: string; tag?: string };

/**
 * RSS 2.0 feed of the latest published posts: the whole site, or one category
 * or tag. Returns null when the category or tag doesn't exist.
 */
export async function buildFeed(scope: FeedScope = {}): Promise<string | null> {
  const settingRows = await prisma.setting.findMany({
    where: { key: { in: ['site_title', 'site_description', 'posts_per_rss', 'rss_content'] } },
  });
  const settings: Record<string, string> = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));
  const siteTitle = settings.site_title || 'Headtilts';
  const base = siteUrl();

  let where: Prisma.PostWhereInput = { status: 'published', type: 'post' };
  let title = siteTitle;
  let description = settings.site_description || '';
  let link = base;
  let self = `${base}/feed`;
  if (scope.category) {
    const cat = await prisma.category.findUnique({ where: { slug: scope.category }, select: { id: true, name: true, slug: true, description: true } });
    if (!cat) return null;
    where = { ...where, categories: { some: { categoryId: cat.id } } };
    title = `${cat.name} — ${siteTitle}`;
    description = cat.description || `The latest ${cat.name} posts from ${siteTitle}.`;
    link = `${base}/categories/${cat.slug}`;
    self = `${link}/feed`;
  } else if (scope.tag) {
    const tag = await prisma.tag.findUnique({ where: { slug: scope.tag }, select: { id: true, name: true, slug: true, description: true } });
    if (!tag) return null;
    where = { ...where, tags: { some: { tagId: tag.id } } };
    title = `#${tag.name} — ${siteTitle}`;
    description = tag.description || `Posts tagged ${tag.name} on ${siteTitle}.`;
    link = `${base}/tags/${tag.slug}`;
    self = `${link}/feed`;
  }

  const limit = Math.max(1, Math.min(50, Number(settings.posts_per_rss) || 10));
  const useFullContent = settings.rss_content === 'full';
  const structure = await getPermalinkStructure();

  const posts = await prisma.post.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: {
      id: true, title: true, slug: true, excerpt: true, content: true, publishedAt: true, featuredImage: true, videoUrl: true,
      author: { select: { username: true, firstName: true, lastName: true } },
      categories: { select: { category: { select: { name: true } } } },
    },
  });

  const items = posts.map((post) => {
    const url = `${base}${buildPostPath(structure, post)}`;
    // Feed readers open items away from the site, so relative links and images must be absolute.
    const html = post.content.replace(/(\s(?:src|href)=")\/(?!\/)/g, `$1${base}/`);
    const body = useFullContent
      ? `<![CDATA[${html.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
      : xmlEscape(post.excerpt || '');
    const authorName = post.author
      ? [post.author.firstName, post.author.lastName].filter(Boolean).join(' ') || post.author.username
      : '';
    const image = absoluteUrl(post.featuredImage ?? imageFromContent(post.content, post.videoUrl));
    const ext = image?.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
    return [
      '    <item>',
      `      <title>${xmlEscape(post.title)}</title>`,
      `      <link>${xmlEscape(url)}</link>`,
      `      <guid isPermaLink="true">${xmlEscape(url)}</guid>`,
      post.publishedAt ? `      <pubDate>${post.publishedAt.toUTCString()}</pubDate>` : '',
      authorName ? `      <dc:creator>${xmlEscape(authorName)}</dc:creator>` : '',
      ...post.categories.map(({ category }) => `      <category>${xmlEscape(category.name)}</category>`),
      `      <description>${body}</description>`,
      image ? `      <media:content url="${xmlEscape(image)}" medium="image"${MIME[ext] ? ` type="${MIME[ext]}"` : ''}/>` : '',
      '    </item>',
    ].filter(Boolean).join('\n');
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${xmlEscape(title)}</title>
    <link>${xmlEscape(link)}</link>
    <description>${xmlEscape(description)}</description>
    <language>en</language>
    <lastBuildDate>${(posts[0]?.publishedAt ?? new Date()).toUTCString()}</lastBuildDate>
    <atom:link href="${xmlEscape(self)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}
