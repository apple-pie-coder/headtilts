import crypto from 'crypto';
import sharp from 'sharp';
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
import { listPolls, getPublicPoll, submitVote } from '../services/polls.service';
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
  showToc: true,
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
    'site_title', 'site_tagline', 'show_tagline', 'site_logo', 'site_logo_dark', 'site_logo_height', 'admin_logo_height', 'site_description',
    'timezone', 'date_format', 'time_format',
    'posts_per_page', 'front_page_display', 'front_page_id', 'posts_page_id',
    'contact_page_id', 'about_page_id',
    'search_engine_visibility', 'permalink_structure',
    'toc_enabled',
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

// GET /public/posts/:slug/reactions?visitorId=
router.get('/posts/:slug/reactions', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  const visitorId = typeof req.query.visitorId === 'string' ? req.query.visitorId : '';
  const post = await prisma.post.findFirst({ where: { slug: req.params.slug, status: 'published' }, select: { id: true } });
  if (!post) { sendError(res, 'NOT_FOUND', 'Post not found', 404); return; }

  const rows = await prisma.postReaction.groupBy({
    by: ['emoji'],
    where: { postId: post.id },
    _count: { emoji: true },
  });
  const myReactions = visitorId
    ? await prisma.postReaction.findMany({ where: { postId: post.id, visitorId }, select: { emoji: true } })
    : [];
  const reacted = new Set(myReactions.map((r) => r.emoji));
  const reactions = rows.map((r) => ({ emoji: r.emoji, count: r._count.emoji, reacted: reacted.has(r.emoji) }));
  sendSuccess(res, reactions);
}));

// POST /public/posts/:slug/reactions — toggle an emoji reaction
router.post('/posts/:slug/reactions', commentLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { emoji, visitorId } = req.body as { emoji?: string; visitorId?: string };
  if (!emoji || !visitorId) { sendError(res, 'VALIDATION_ERROR', 'emoji and visitorId are required', 400); return; }

  const ALLOWED_EMOJIS = ['❤️', '👏', '🔥', '😮', '😢', '🙌'];
  if (!ALLOWED_EMOJIS.includes(emoji)) { sendError(res, 'VALIDATION_ERROR', 'Invalid emoji', 400); return; }

  const post = await prisma.post.findFirst({ where: { slug: req.params.slug, status: 'published' }, select: { id: true } });
  if (!post) { sendError(res, 'NOT_FOUND', 'Post not found', 404); return; }

  const existing = await prisma.postReaction.findUnique({ where: { postId_emoji_visitorId: { postId: post.id, emoji, visitorId } } });
  let reacted: boolean;
  if (existing) {
    await prisma.postReaction.delete({ where: { id: existing.id } });
    reacted = false;
  } else {
    await prisma.postReaction.create({ data: { postId: post.id, emoji, visitorId } });
    reacted = true;
  }
  const count = await prisma.postReaction.count({ where: { postId: post.id, emoji } });
  sendSuccess(res, { emoji, count, reacted });
}));

// GET /public/posts/:slug/related — posts sharing the most tags/categories
router.get('/posts/:slug/related', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(6, Math.max(1, Number(req.query.limit) || 4));
  const post = await prisma.post.findFirst({
    where: { slug: req.params.slug, status: 'published' },
    select: { id: true, categories: { select: { categoryId: true } }, tags: { select: { tagId: true } } },
  });
  if (!post) { sendSuccess(res, []); return; }

  const catIds = post.categories.map((c) => c.categoryId);
  const tagIds = post.tags.map((t) => t.tagId);
  if (catIds.length === 0 && tagIds.length === 0) { sendSuccess(res, []); return; }

  const related = await prisma.post.findMany({
    where: {
      status: 'published',
      type: 'post',
      id: { not: post.id },
      OR: [
        ...(catIds.length ? [{ categories: { some: { categoryId: { in: catIds } } } }] : []),
        ...(tagIds.length ? [{ tags: { some: { tagId: { in: tagIds } } } }] : []),
      ],
    },
    select: postPublicSelect,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  sendSuccess(res, related);
}));

// GET /public/series/:slug — series info + ordered post list
router.get('/series/:slug', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  const series = await prisma.series.findUnique({
    where: { slug: req.params.slug },
    include: {
      posts: {
        orderBy: { position: 'asc' },
        include: { post: { select: { ...postPublicSelect, status: true } } },
      },
    },
  });
  if (!series) { sendError(res, 'NOT_FOUND', 'Series not found', 404); return; }
  sendSuccess(res, {
    id: series.id,
    name: series.name,
    slug: series.slug,
    description: series.description,
    coverImage: series.coverImage,
    posts: series.posts
      .filter((sp) => sp.post.status === 'published')
      .map((sp) => ({ ...sp.post, position: sp.position })),
  });
}));

// GET /public/posts/:slug/series — series membership for a post
router.get('/posts/:slug/series', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  const post = await prisma.post.findFirst({
    where: { slug: req.params.slug, status: 'published' },
    select: {
      id: true,
      seriesPosts: {
        include: {
          series: {
            include: {
              posts: {
                orderBy: { position: 'asc' },
                include: { post: { select: { id: true, title: true, slug: true, status: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!post || post.seriesPosts.length === 0) { sendSuccess(res, null); return; }

  const sp = post.seriesPosts[0];
  const publishedPosts = sp.series.posts.filter((p) => p.post.status === 'published');
  const currentIndex = publishedPosts.findIndex((p) => p.postId === post.id);
  const prev = currentIndex > 0 ? publishedPosts[currentIndex - 1].post : null;
  const next = currentIndex < publishedPosts.length - 1 ? publishedPosts[currentIndex + 1].post : null;

  sendSuccess(res, {
    id: sp.series.id,
    name: sp.series.name,
    slug: sp.series.slug,
    totalParts: publishedPosts.length,
    currentPart: currentIndex + 1,
    prev: prev ? { title: prev.title, slug: prev.slug } : null,
    next: next ? { title: next.title, slug: next.slug } : null,
  });
}));

// GET /public/polls
router.get('/polls', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const { items, total } = await listPolls(page, limit, undefined, 'open');
  sendSuccess(res, { items, total, page, limit });
}));

// GET /public/polls/:slug
router.get('/polls/:slug', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  try {
    const voterIdentifier = typeof req.query.voterIdentifier === 'string' ? req.query.voterIdentifier : undefined;
    const poll = await getPublicPoll(req.params.slug, voterIdentifier);
    sendSuccess(res, poll);
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'NOT_FOUND', 'Poll not found', 404);
  }
}));

// POST /public/polls/:slug/vote
router.post('/polls/:slug/vote', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { optionIds, voterIdentifier } = req.body as { optionIds: number[]; voterIdentifier: string };
    if (!voterIdentifier) { sendError(res, 'VALIDATION_ERROR', 'voterIdentifier is required', 400); return; }
    if (!Array.isArray(optionIds) || optionIds.length === 0) { sendError(res, 'VALIDATION_ERROR', 'optionIds must be a non-empty array', 400); return; }
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
    const pollRecord = await prisma.poll.findUnique({ where: { slug: req.params.slug }, select: { id: true } });
    if (!pollRecord) { sendError(res, 'NOT_FOUND', 'Poll not found', 404); return; }
    const result = await submitVote(pollRecord.id, optionIds, voterIdentifier, ipAddress);
    sendSuccess(res, result);
  } catch (e) {
    if (e instanceof ApiError) sendError(res, e.code, e.message, e.statusCode);
    else sendError(res, 'INTERNAL_ERROR', 'Internal server error', 500);
  }
}));

// GET /public/posts/:slug/og-image — generates a 1200×630 PNG OG card
router.get('/posts/:slug/og-image', asyncHandler(async (req: Request, res: Response) => {
  const post = await prisma.post.findFirst({
    where: { slug: req.params.slug, status: 'published' },
    select: {
      title: true,
      excerpt: true,
      author: { select: { firstName: true, lastName: true, username: true } },
      categories: { select: { category: { select: { name: true } } }, take: 1 },
    },
  });

  if (!post) { res.status(404).end(); return; }

  const siteName = await prisma.setting.findUnique({ where: { key: 'site_title' } });
  const site = siteName?.value || 'Headtilts';

  const authorName = post.author
    ? [post.author.firstName, post.author.lastName].filter(Boolean).join(' ') || post.author.username
    : '';
  const category = post.categories[0]?.category.name || '';

  // Wrap title at ~40 chars per line
  const wrapText = (text: string, maxLen: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      if ((line + ' ' + word).trim().length > maxLen) { lines.push(line.trim()); line = word; }
      else { line = (line + ' ' + word).trim(); }
    }
    if (line) lines.push(line.trim());
    return lines;
  };
  const titleLines = wrapText(post.title, 38);
  const titleSvgLines = titleLines.slice(0, 3)
    .map((l, i) => `<text x="80" y="${200 + i * 72}" font-size="56" font-weight="700" fill="#1d1d1f">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`)
    .join('\n');

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="630" fill="#f5f5f7"/>
    <rect x="0" y="0" width="8" height="630" fill="#0071e3"/>
    <text x="80" y="130" font-size="28" font-weight="700" fill="#0071e3" font-family="sans-serif">${site.replace(/&/g, '&amp;')}</text>
    ${category ? `<text x="80" y="168" font-size="22" fill="#6e6e73" font-family="sans-serif">${category.replace(/&/g, '&amp;')}</text>` : ''}
    <g font-family="sans-serif">${titleSvgLines}</g>
    ${authorName ? `<text x="80" y="${200 + titleLines.slice(0, 3).length * 72 + 40}" font-size="26" fill="#6e6e73" font-family="sans-serif">By ${authorName.replace(/&/g, '&amp;')}</text>` : ''}
  </svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  res.set({
    'Content-Type': 'image/png',
    'Cache-Control': 'public, max-age=86400',
    'Content-Length': String(png.byteLength),
  });
  res.end(png);
}));

// GET /public/search — full-text post search for the public site
router.get('/search', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
  const limit = 10;

  if (!q) {
    sendSuccess(res, { items: [], pagination: { total: 0, page, limit, pages: 0 }, query: q });
    return;
  }

  const where = {
    status: 'published' as const,
    type: 'post' as const,
    OR: [
      { title: { contains: q } },
      { excerpt: { contains: q } },
      { content: { contains: q } },
    ],
  };

  const [total, items] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        publishedAt: true,
        featuredImage: true,
        author: { select: { username: true, firstName: true, lastName: true } },
        categories: { select: { category: { select: { name: true, slug: true } } } },
      },
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  sendSuccess(res, {
    items,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    query: q,
  });
}));

// GET /public/redirects/resolve?from=<path> — look up a redirect by source path
router.get('/redirects/resolve', publicReadLimiter, asyncHandler(async (req: Request, res: Response) => {
  const from = String(req.query.from || '').trim();
  if (!from) { sendSuccess(res, { redirect: null }); return; }
  const redirect = await prisma.redirect.findUnique({ where: { fromPath: from } });
  if (redirect) {
    prisma.redirect.update({ where: { id: redirect.id }, data: { hits: { increment: 1 } } }).catch(() => {});
  }
  sendSuccess(res, { redirect: redirect ? { toPath: redirect.toPath, type: redirect.type } : null });
}));

export default router;
