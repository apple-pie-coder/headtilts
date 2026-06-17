import crypto from 'crypto';
import { Router, IRouter, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { prisma } from '../config/database';
import { sendSuccess, sendError } from '../utils/response';
import { getPublicZone } from '../services/widgets.service';
import { createSubmission } from '../services/contact.service';
import { listPublicComments, createPublicComment, toggleReaction } from '../services/comments.service';
import { buildPostPath, getPermalinkStructure, matchPostPath } from '../utils/permalinks';
import { getCalendarMonth } from '../services/calendar.service';
import { getTodaysCelebrations } from '../services/celebrations.service';
import rateLimit from 'express-rate-limit';
import { publicReadLimiter } from '../middleware/rateLimit';
import { ApiError } from '../utils/errors';

// Throttle comment/reaction writes per IP
const commentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Too many comments. Please slow down.' },
  },
});

const router: IRouter = Router();

const postPublicSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  type: true,
  parentId: true,
  publishedAt: true,
  updatedAt: true,
  featuredImage: true,
  template: true,
  isFeatured: true,
  showSidebar: true,
  author: { select: { id: true, username: true, firstName: true, lastName: true, avatar: true, bio: true } },
  coAuthors: { select: { user: { select: { id: true, username: true, firstName: true, lastName: true, avatar: true, bio: true } } }, orderBy: { order: 'asc' as const } },
  categories: { select: { category: { select: { id: true, name: true, slug: true } } } },
  tags: { select: { tag: { select: { id: true, name: true, slug: true } } } },
} as const;

const postPublicFullSelect = {
  ...postPublicSelect,
  content: true,
  metaTitle: true,
  metaDescription: true,
  metaKeywords: true,
  canonicalUrl: true,
  ogTitle: true,
  ogDescription: true,
  ogImage: true,
} as const;

// GET /public/site-settings — safe subset of settings for the web frontend
router.get('/site-settings', publicReadLimiter, asyncHandler(async (_req: Request, res: Response) => {
  const SAFE_KEYS = [
    'site_title', 'site_tagline', 'show_tagline', 'site_logo', 'site_logo_dark', 'site_description',
    'timezone', 'date_format', 'time_format',
    'posts_per_page', 'front_page_display', 'front_page_id', 'posts_page_id',
    'contact_page_id', 'about_page_id',
    'search_engine_visibility', 'permalink_structure',
  ];
  const PAGE_ID_KEYS = ['front_page_id', 'posts_page_id', 'contact_page_id', 'about_page_id'];

  const rows = await prisma.setting.findMany({ where: { key: { in: SAFE_KEYS } } });
  const settings: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  // Resolve page slugs for special page IDs
  const pageIds = PAGE_ID_KEYS.map((k) => Number(settings[k])).filter((id) => id > 0);
  if (pageIds.length > 0) {
    const pages = await prisma.post.findMany({
      where: { id: { in: pageIds }, type: 'page', status: 'published' },
      select: { id: true, slug: true, title: true },
    });
    const pageMap = Object.fromEntries(pages.map((p) => [p.id, p]));
    PAGE_ID_KEYS.forEach((k) => {
      const id = Number(settings[k]);
      if (id > 0 && pageMap[id]) {
        settings[k.replace('_id', '_slug')] = pageMap[id].slug;
      }
    });
  }

  sendSuccess(res, settings);
}));

// GET /public/posts?page=1&limit=10&category=slug&tag=slug&search=
router.get('/posts', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  // Use posts_per_page setting as default when caller doesn't specify limit
  const settingRow = await prisma.setting.findUnique({ where: { key: 'posts_per_page' } });
  const defaultLimit = Math.max(1, Math.min(50, Number(settingRow?.value) || 10));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || defaultLimit));
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const featuredRaw = typeof req.query.featured === 'string' ? req.query.featured : undefined;
  const featured = featuredRaw === 'true' ? true : featuredRaw === 'false' ? false : undefined;

  // Date archive filters (year required; month/day optional). Bucketed in UTC
  // to match the calendar widget.
  const year = Number(req.query.year) || 0;
  const month = Number(req.query.month) || 0;
  const day = Number(req.query.day) || 0;
  let dateRange: { gte: Date; lt: Date } | undefined;
  if (year > 0) {
    if (day > 0 && month > 0) {
      dateRange = { gte: new Date(Date.UTC(year, month - 1, day)), lt: new Date(Date.UTC(year, month - 1, day + 1)) };
    } else if (month > 0) {
      dateRange = { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) };
    } else {
      dateRange = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
    }
  }

  const where = {
    status: 'published' as const,
    type: 'post',
    ...(category ? { categories: { some: { category: { slug: category } } } } : {}),
    ...(tag ? { tags: { some: { tag: { slug: tag } } } } : {}),
    ...(search ? { OR: [{ title: { contains: search } }, { excerpt: { contains: search } }] } : {}),
    ...(featured !== undefined ? { isFeatured: featured } : {}),
    ...(dateRange ? { publishedAt: dateRange } : {}),
  };

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      select: postPublicSelect,
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.post.count({ where }),
  ]);

  sendSuccess(res, { items: posts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

// GET /public/posts/:slug
router.get('/posts/:slug', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  const post = await prisma.post.findFirst({
    where: { slug: req.params.slug, status: 'published', type: 'post' },
    select: postPublicFullSelect,
  });
  if (!post) { sendError(res, 'NOT_FOUND', 'Post not found', 404); return; }
  sendSuccess(res, post);
}));

// GET /public/pages/:slug
router.get('/pages/:slug', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  const page = await prisma.post.findFirst({
    where: { slug: req.params.slug, status: 'published', type: 'page' },
    select: postPublicFullSelect,
  });
  if (!page) { sendError(res, 'NOT_FOUND', 'Page not found', 404); return; }
  sendSuccess(res, page);
}));

// GET /public/categories
router.get('/categories', publicReadLimiter, asyncHandler(async (_req: Request, res: Response) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      parentId: true,
      icon: true,
      showSidebar: true,
      _count: { select: { posts: { where: { post: { status: 'published', type: 'post' } } } } },
    },
  });
  sendSuccess(res, categories);
}));

// GET /public/tags
router.get('/tags', publicReadLimiter, asyncHandler(async (_req: Request, res: Response) => {
  const tags = await prisma.tag.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      _count: { select: { posts: { where: { post: { status: 'published', type: 'post' } } } } },
    },
  });
  sendSuccess(res, tags);
}));

// GET /public/menus/:location
router.get('/menus/:location', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  const menu = await prisma.menu.findFirst({
    where: { location: req.params.location },
    include: {
      items: {
        where: { isVisible: true },
        orderBy: { position: 'asc' },
        select: { id: true, parentId: true, title: true, url: true, position: true, postId: true, categoryId: true, tagId: true },
      },
    },
  });
  if (!menu) { sendError(res, 'NOT_FOUND', 'Menu not found', 404); return; }

  // Batch-resolve postId / categoryId / tagId references to URLs
  const postIds = [...new Set(menu.items.map((i) => i.postId).filter((v): v is number => v != null))];
  const categoryIds = [...new Set(menu.items.map((i) => i.categoryId).filter((v): v is number => v != null))];
  const tagIds = [...new Set(menu.items.map((i) => i.tagId).filter((v): v is number => v != null))];

  const [posts, categories, tags, structure] = await Promise.all([
    postIds.length ? prisma.post.findMany({ where: { id: { in: postIds }, status: 'published' }, select: { id: true, slug: true, type: true, publishedAt: true } }) : [],
    categoryIds.length ? prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, slug: true } }) : [],
    tagIds.length ? prisma.tag.findMany({ where: { id: { in: tagIds } }, select: { id: true, slug: true } }) : [],
    getPermalinkStructure(),
  ]);

  const postMap = new Map(posts.map((p) => [p.id, p]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const tagMap = new Map(tags.map((t) => [t.id, t]));

  const resolvedItems = menu.items.map((item) => {
    let url = item.url ?? null;
    if (!url) {
      if (item.postId && postMap.has(item.postId)) {
        const post = postMap.get(item.postId)!;
        url = post.type === 'page' ? `/pages/${post.slug}` : buildPostPath(structure, post);
      } else if (item.categoryId && categoryMap.has(item.categoryId)) {
        url = `/categories/${categoryMap.get(item.categoryId)!.slug}`;
      } else if (item.tagId && tagMap.has(item.tagId)) {
        url = `/tags/${tagMap.get(item.tagId)!.slug}`;
      }
    }
    return { id: item.id, parentId: item.parentId, title: item.title, url, position: item.position };
  });

  sendSuccess(res, { id: menu.id, name: menu.name, location: menu.location, description: menu.description, items: resolvedItems });
}));

// POST /public/contact — contact form submission
router.post('/contact', asyncHandler(async (req: Request, res: Response) => {
  const { name, email, subject, message } = req.body as Record<string, string>;
  if (!name || !email || !message) {
    sendError(res, 'VALIDATION_ERROR', 'name, email and message are required', 400);
    return;
  }
  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    sendError(res, 'VALIDATION_ERROR', 'Invalid email address', 400);
    return;
  }
  await createSubmission({ name: name.trim(), email: email.trim(), subject: subject?.trim(), message: message.trim() });
  sendSuccess(res, { ok: true });
}));

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// GET /public/feed — RSS 2.0 feed of published posts
router.get('/feed', asyncHandler(async (_req: Request, res: Response) => {
  const settingRows = await prisma.setting.findMany({
    where: { key: { in: ['site_title', 'site_description', 'posts_per_rss', 'rss_content'] } },
  });
  const settings: Record<string, string> = Object.fromEntries(settingRows.map((r) => [r.key, r.value]));

  const limit = Math.max(1, Math.min(50, Number(settings.posts_per_rss) || 10));
  const useFullContent = settings.rss_content === 'full';
  const siteUrl = (process.env.SITE_URL || 'http://localhost:5173').replace(/\/$/, '');
  const structure = await getPermalinkStructure();

  const posts = await prisma.post.findMany({
    where: { status: 'published', type: 'post' },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    select: {
      id: true, title: true, slug: true, excerpt: true, content: true, publishedAt: true,
      author: { select: { username: true, firstName: true, lastName: true } },
      categories: { select: { category: { select: { name: true } } } },
    },
  });

  const items = posts.map((post) => {
    const link = `${siteUrl}${buildPostPath(structure, post)}`;
    const description = useFullContent
      ? `<![CDATA[${post.content.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
      : xmlEscape(post.excerpt || '');
    const authorName = post.author
      ? [post.author.firstName, post.author.lastName].filter(Boolean).join(' ') || post.author.username
      : '';
    return [
      '    <item>',
      `      <title>${xmlEscape(post.title)}</title>`,
      `      <link>${link}</link>`,
      `      <guid isPermaLink="true">${link}</guid>`,
      post.publishedAt ? `      <pubDate>${post.publishedAt.toUTCString()}</pubDate>` : '',
      authorName ? `      <dc:creator>${xmlEscape(authorName)}</dc:creator>` : '',
      ...post.categories.map(({ category }) => `      <category>${xmlEscape(category.name)}</category>`),
      `      <description>${description}</description>`,
      '    </item>',
    ].filter(Boolean).join('\n');
  }).join('\n');

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(settings.site_title || 'Headtilts')}</title>
    <link>${siteUrl}</link>
    <description>${xmlEscape(settings.site_description || '')}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${siteUrl}/api/public/feed" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.status(200).send(feed);
}));

// GET /public/preview/:id?token=&exp= — draft preview via signed, expiring link
router.get('/preview/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const exp = Number(req.query.exp) || 0;

  if (!id || !token || !exp) {
    sendError(res, 'VALIDATION_ERROR', 'Invalid preview link', 400);
    return;
  }
  if (exp < Date.now()) {
    sendError(res, 'UNAUTHORIZED', 'This preview link has expired', 401);
    return;
  }

  const expected = crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'dev-secret')
    .update(`preview.${id}.${exp}`)
    .digest('hex');
  const valid =
    token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  if (!valid) {
    sendError(res, 'UNAUTHORIZED', 'Invalid preview link', 401);
    return;
  }

  // Any status — that's the point of a preview
  const post = await prisma.post.findUnique({
    where: { id },
    select: postPublicFullSelect,
  });
  if (!post) { sendError(res, 'NOT_FOUND', 'Post not found', 404); return; }
  sendSuccess(res, post);
}));

// GET /public/calendar?year=&month= — month grid data for the calendar widget
router.get('/calendar', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  const now = new Date();
  const year = Number(req.query.year) || now.getUTCFullYear();
  const month = Number(req.query.month) || now.getUTCMonth() + 1;
  if (month < 1 || month > 12 || year < 1970 || year > 9999) {
    sendError(res, 'VALIDATION_ERROR', 'Invalid year or month', 400);
    return;
  }
  const data = await getCalendarMonth(year, month);
  sendSuccess(res, data);
}));

// GET /public/resolve?path=/2026/06/my-post — map a permalink path to its post
router.get('/resolve', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  const path = typeof req.query.path === 'string' ? req.query.path : '';
  if (!path) { sendError(res, 'VALIDATION_ERROR', 'path is required', 400); return; }

  const structure = await getPermalinkStructure();
  const matched = matchPostPath(structure, path);
  if (!matched) { sendError(res, 'NOT_FOUND', 'No post matches this path', 404); return; }

  const post = await prisma.post.findFirst({
    where: {
      status: 'published',
      type: 'post',
      ...(matched.id ? { id: matched.id } : { slug: matched.slug }),
    },
    select: postPublicFullSelect,
  });
  if (!post) { sendError(res, 'NOT_FOUND', 'Post not found', 404); return; }
  sendSuccess(res, post);
}));

// ── Comments ────────────────────────────────────────────────────────────────

// GET /public/posts/:slug/comments?visitorId=
router.get('/posts/:slug/comments', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const visitorId = typeof req.query.visitorId === 'string' ? req.query.visitorId : undefined;
    const result = await listPublicComments(req.params.slug, visitorId);
    sendSuccess(res, result);
  } catch (error) {
    if (error instanceof ApiError) sendError(res, error.code, error.message, error.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

// POST /public/posts/:slug/comments
router.post('/posts/:slug/comments', commentLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { name, email, content, parentId, visitorId } = req.body as Record<string, unknown>;
    const comment = await createPublicComment({
      slug: req.params.slug,
      name: typeof name === 'string' ? name : undefined,
      email: typeof email === 'string' ? email : undefined,
      content: typeof content === 'string' ? content : undefined,
      parentId: parentId != null ? Number(parentId) : null,
      visitorId: typeof visitorId === 'string' ? visitorId : undefined,
    });
    sendSuccess(res, comment, 201);
  } catch (error) {
    if (error instanceof ApiError) sendError(res, error.code, error.message, error.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

// POST /public/comments/:id/reactions — toggle a reaction
router.post('/comments/:id/reactions', commentLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { emoji, visitorId } = req.body as Record<string, unknown>;
    const result = await toggleReaction(
      Number(req.params.id),
      typeof emoji === 'string' ? emoji : '',
      typeof visitorId === 'string' ? visitorId : undefined,
    );
    sendSuccess(res, result);
  } catch (error) {
    if (error instanceof ApiError) sendError(res, error.code, error.message, error.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

// GET /public/authors/:username — public author profile + paginated posts
router.get('/authors/:username', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.params;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));

  const user = await prisma.user.findFirst({
    where: { username, isActive: true },
    select: { id: true, username: true, firstName: true, lastName: true, avatar: true, bio: true },
  });
  if (!user) { sendError(res, 'NOT_FOUND', 'Author not found', 404); return; }

  const where = {
    status: 'published' as const,
    type: 'post',
    OR: [
      { authorId: user.id },
      { coAuthors: { some: { userId: user.id } } },
    ],
  };
  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      select: postPublicSelect,
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.post.count({ where }),
  ]);

  sendSuccess(res, {
    author: user,
    posts: { items: posts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  });
}));

// GET /public/celebrations/today — active artist birthdays/remembrances for today
router.get('/celebrations/today', publicReadLimiter, asyncHandler(async (_req: Request, res: Response) => {
  const result = await getTodaysCelebrations();
  sendSuccess(res, result);
}));

// GET /public/widgets/:zone
router.get('/widgets/:zone', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const zone = await getPublicZone(req.params.zone);
    sendSuccess(res, zone);
  } catch (error) {
    if (error instanceof ApiError) {
      sendError(res, error.code, error.message, error.statusCode);
    } else {
      sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
    }
  }
}));

export default router;
