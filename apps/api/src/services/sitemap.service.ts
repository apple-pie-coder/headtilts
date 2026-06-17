import { prisma } from '../config/database';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors';
import { buildPostPath, getPermalinkStructure } from '../utils/permalinks';

function parseLastmod(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new ValidationError('Invalid lastmod date format');
  return d;
}

export async function listEntries() {
  return prisma.sitemap.findMany({ orderBy: { url: 'asc' } });
}

export async function getEntry(id: number) {
  const entry = await prisma.sitemap.findUnique({ where: { id } });
  if (!entry) throw new NotFoundError('Sitemap entry not found');
  return entry;
}

export async function createEntry(input: {
  url: string;
  priority?: number;
  changefreq?: string;
  lastmod?: Date | string | null;
}) {
  const existing = await prisma.sitemap.findUnique({ where: { url: input.url } });
  if (existing) throw new ConflictError('An entry for this URL already exists');

  return prisma.sitemap.create({
    data: {
      url: input.url,
      priority: input.priority ?? 0.5,
      changefreq: input.changefreq ?? null,
      lastmod: parseLastmod(input.lastmod),
    },
  });
}

export async function updateEntry(
  id: number,
  input: { url?: string; priority?: number; changefreq?: string | null; lastmod?: string | null },
) {
  const existing = await prisma.sitemap.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Sitemap entry not found');

  if (input.url && input.url !== existing.url) {
    const conflict = await prisma.sitemap.findUnique({ where: { url: input.url } });
    if (conflict) throw new ConflictError('An entry for this URL already exists');
  }

  return prisma.sitemap.update({
    where: { id },
    data: {
      url: input.url ?? existing.url,
      priority: input.priority ?? existing.priority,
      changefreq: input.changefreq !== undefined ? input.changefreq : existing.changefreq,
      lastmod: input.lastmod !== undefined ? parseLastmod(input.lastmod) : existing.lastmod,
    },
  });
}

export async function deleteEntry(id: number) {
  const existing = await prisma.sitemap.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Sitemap entry not found');
  await prisma.sitemap.delete({ where: { id } });
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function generateXml(baseUrl: string): Promise<string> {
  // Pull all published posts and pages
  const posts = await prisma.post.findMany({
    where: { status: 'published' },
    select: { id: true, slug: true, type: true, publishedAt: true, updatedAt: true },
  });

  const structure = await getPermalinkStructure();

  // Pull manual sitemap entries
  const manual = await prisma.sitemap.findMany({ orderBy: { url: 'asc' } });

  const urlSet: { loc: string; lastmod?: string; priority: number; changefreq?: string }[] = [];

  // Homepage
  urlSet.push({ loc: baseUrl, priority: 1.0, changefreq: 'daily' });

  for (const post of posts) {
    const path = post.type === 'page' ? `/pages/${post.slug}` : buildPostPath(structure, post);
    urlSet.push({
      loc: `${baseUrl}${path}`,
      lastmod: post.updatedAt.toISOString().split('T')[0],
      priority: post.type === 'page' ? 0.8 : 0.7,
      changefreq: 'weekly',
    });
  }

  // Category and tag archive pages that contain at least one published post
  const publishedPostFilter = { some: { post: { status: 'published', type: 'post' } } };
  const [categories, tags] = await Promise.all([
    prisma.category.findMany({ where: { posts: publishedPostFilter }, select: { slug: true } }),
    prisma.tag.findMany({ where: { posts: publishedPostFilter }, select: { slug: true } }),
  ]);

  for (const category of categories) {
    urlSet.push({ loc: `${baseUrl}/categories/${category.slug}`, priority: 0.5, changefreq: 'weekly' });
  }
  for (const tag of tags) {
    urlSet.push({ loc: `${baseUrl}/tags/${tag.slug}`, priority: 0.4, changefreq: 'weekly' });
  }

  for (const entry of manual) {
    const already = urlSet.find((u) => u.loc === entry.url);
    if (!already) {
      urlSet.push({
        loc: entry.url,
        lastmod: entry.lastmod ? entry.lastmod.toISOString().split('T')[0] : undefined,
        priority: entry.priority,
        changefreq: entry.changefreq ?? undefined,
      });
    }
  }

  const items = urlSet
    .map((u) =>
      [
        '  <url>',
        `    <loc>${xmlEscape(u.loc)}</loc>`,
        u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>` : '',
        u.changefreq ? `    <changefreq>${u.changefreq}</changefreq>` : '',
        `    <priority>${u.priority.toFixed(1)}</priority>`,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>`;
}
