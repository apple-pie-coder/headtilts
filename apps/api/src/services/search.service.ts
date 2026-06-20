import { prisma } from '../config/database';

// ── Return types ─────────────────────────────────────────────────────────────

export interface PostResult {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  publishedAt: string | null;
  featuredImage: string | null;
  author: { username: string; firstName: string | null; lastName: string | null } | null;
  categories: { category: { name: string; slug: string } }[];
}

export interface PageResult {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
}

export interface TagResult {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  postCount: number;
}

export interface CategoryResult {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  postCount: number;
}

export interface PollResult {
  id: number;
  title: string;
  slug: string;
  question: string;
  status: string;
  totalVotes: number;
}

export interface SearchGrouped {
  query: string;
  type: 'all';
  grouped: {
    posts: { items: PostResult[]; total: number };
    pages: { items: PageResult[]; total: number };
    tags: { items: TagResult[]; total: number };
    categories: { items: CategoryResult[]; total: number };
    polls: { items: PollResult[]; total: number };
  };
  total: number;
}

export interface SearchPaged {
  query: string;
  type: string;
  items: (PostResult | PageResult | TagResult | CategoryResult | PollResult)[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

// ── Raw query row types ───────────────────────────────────────────────────────

interface RawPostRow { id: bigint }
interface RawTagRow { id: bigint }
interface RawCategoryRow { id: bigint }
interface RawPollRow { id: bigint }

// ── Helpers ───────────────────────────────────────────────────────────────────

function toIds(rows: { id: bigint }[]): number[] {
  return rows.map((r) => Number(r.id));
}

/** Format a Post/Page row's publishedAt date as ISO string or null */
function fmtDate(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

// ── Posts search ──────────────────────────────────────────────────────────────

async function searchPosts(q: string, limit: number, offset = 0): Promise<{ items: PostResult[]; total: number }> {
  if (q.length >= 3) {
    // FULLTEXT path: raw query for IDs, then Prisma for enrichment
    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<RawPostRow[]>`
        SELECT id FROM Post
        WHERE type = 'post' AND status = 'published'
          AND MATCH(title, excerpt, content) AGAINST(${q} IN NATURAL LANGUAGE MODE)
        ORDER BY MATCH(title, excerpt, content) AGAINST(${q} IN NATURAL LANGUAGE MODE) DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<[{ cnt: bigint }]>`
        SELECT COUNT(*) AS cnt FROM Post
        WHERE type = 'post' AND status = 'published'
          AND MATCH(title, excerpt, content) AGAINST(${q} IN NATURAL LANGUAGE MODE)
      `,
    ]);
    const ids = toIds(rows);
    const total = Number(countRows[0].cnt);
    if (ids.length === 0) return { items: [], total };
    const enriched = await prisma.post.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, title: true, slug: true, excerpt: true, publishedAt: true, featuredImage: true,
        author: { select: { username: true, firstName: true, lastName: true } },
        categories: { select: { category: { select: { name: true, slug: true } } } },
      },
    });
    // Restore relevance order
    const map = new Map(enriched.map((p) => [p.id, p]));
    const items: PostResult[] = ids
      .map((id) => {
        const p = map.get(id);
        if (!p) return null;
        return { ...p, publishedAt: fmtDate(p.publishedAt) };
      })
      .filter((p): p is PostResult => p !== null);
    return { items, total };
  }

  // Short query: Prisma contains fallback
  const where = {
    type: 'post' as const,
    status: 'published' as const,
    OR: [
      { title: { contains: q } },
      { excerpt: { contains: q } },
      { content: { contains: q } },
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      select: {
        id: true, title: true, slug: true, excerpt: true, publishedAt: true, featuredImage: true,
        author: { select: { username: true, firstName: true, lastName: true } },
        categories: { select: { category: { select: { name: true, slug: true } } } },
      },
      orderBy: { publishedAt: 'desc' },
      skip: offset,
      take: limit,
    }),
  ]);
  return {
    items: rows.map((p) => ({ ...p, publishedAt: fmtDate(p.publishedAt) })),
    total,
  };
}

// ── Pages search ──────────────────────────────────────────────────────────────

async function searchPages(q: string, limit: number, offset = 0): Promise<{ items: PageResult[]; total: number }> {
  if (q.length >= 3) {
    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<RawPostRow[]>`
        SELECT id FROM Post
        WHERE type = 'page' AND status = 'published'
          AND MATCH(title, excerpt, content) AGAINST(${q} IN NATURAL LANGUAGE MODE)
        ORDER BY MATCH(title, excerpt, content) AGAINST(${q} IN NATURAL LANGUAGE MODE) DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<[{ cnt: bigint }]>`
        SELECT COUNT(*) AS cnt FROM Post
        WHERE type = 'page' AND status = 'published'
          AND MATCH(title, excerpt, content) AGAINST(${q} IN NATURAL LANGUAGE MODE)
      `,
    ]);
    const ids = toIds(rows);
    const total = Number(countRows[0].cnt);
    if (ids.length === 0) return { items: [], total };
    const enriched = await prisma.post.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, slug: true, excerpt: true },
    });
    const map = new Map(enriched.map((p) => [p.id, p]));
    const items: PageResult[] = ids
      .map((id) => map.get(id) ?? null)
      .filter((p): p is PageResult => p !== null);
    return { items, total };
  }

  const where = {
    type: 'page' as const,
    status: 'published' as const,
    OR: [
      { title: { contains: q } },
      { excerpt: { contains: q } },
      { content: { contains: q } },
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      select: { id: true, title: true, slug: true, excerpt: true },
      orderBy: { publishedAt: 'desc' },
      skip: offset,
      take: limit,
    }),
  ]);
  return { items: rows, total };
}

// ── Tags search ───────────────────────────────────────────────────────────────

async function searchTags(q: string, limit: number, offset = 0): Promise<{ items: TagResult[]; total: number }> {
  if (q.length >= 3) {
    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<RawTagRow[]>`
        SELECT id FROM Tag
        WHERE MATCH(name, description) AGAINST(${q} IN NATURAL LANGUAGE MODE)
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<[{ cnt: bigint }]>`
        SELECT COUNT(*) AS cnt FROM Tag
        WHERE MATCH(name, description) AGAINST(${q} IN NATURAL LANGUAGE MODE)
      `,
    ]);
    const ids = toIds(rows);
    const total = Number(countRows[0].cnt);
    if (ids.length === 0) return { items: [], total };
    const enriched = await prisma.tag.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, slug: true, description: true, _count: { select: { posts: true } } },
    });
    const map = new Map(enriched.map((t) => [t.id, t]));
    const items: TagResult[] = ids
      .map((id) => {
        const t = map.get(id);
        if (!t) return null;
        return { id: t.id, name: t.name, slug: t.slug, description: t.description, postCount: t._count.posts };
      })
      .filter((t): t is TagResult => t !== null);
    return { items, total };
  }

  const where = {
    OR: [
      { name: { contains: q } },
      { description: { contains: q } },
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.tag.count({ where }),
    prisma.tag.findMany({
      where,
      select: { id: true, name: true, slug: true, description: true, _count: { select: { posts: true } } },
      orderBy: { name: 'asc' },
      skip: offset,
      take: limit,
    }),
  ]);
  return {
    items: rows.map((t) => ({ id: t.id, name: t.name, slug: t.slug, description: t.description, postCount: t._count.posts })),
    total,
  };
}

// ── Categories search ─────────────────────────────────────────────────────────

async function searchCategories(q: string, limit: number, offset = 0): Promise<{ items: CategoryResult[]; total: number }> {
  if (q.length >= 3) {
    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<RawCategoryRow[]>`
        SELECT id FROM Category
        WHERE MATCH(name, description) AGAINST(${q} IN NATURAL LANGUAGE MODE)
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<[{ cnt: bigint }]>`
        SELECT COUNT(*) AS cnt FROM Category
        WHERE MATCH(name, description) AGAINST(${q} IN NATURAL LANGUAGE MODE)
      `,
    ]);
    const ids = toIds(rows);
    const total = Number(countRows[0].cnt);
    if (ids.length === 0) return { items: [], total };
    const enriched = await prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, slug: true, description: true, _count: { select: { posts: true } } },
    });
    const map = new Map(enriched.map((c) => [c.id, c]));
    const items: CategoryResult[] = ids
      .map((id) => {
        const c = map.get(id);
        if (!c) return null;
        return { id: c.id, name: c.name, slug: c.slug, description: c.description, postCount: c._count.posts };
      })
      .filter((c): c is CategoryResult => c !== null);
    return { items, total };
  }

  const where = {
    OR: [
      { name: { contains: q } },
      { description: { contains: q } },
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.category.count({ where }),
    prisma.category.findMany({
      where,
      select: { id: true, name: true, slug: true, description: true, _count: { select: { posts: true } } },
      orderBy: { name: 'asc' },
      skip: offset,
      take: limit,
    }),
  ]);
  return {
    items: rows.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description, postCount: c._count.posts })),
    total,
  };
}

// ── Polls search ──────────────────────────────────────────────────────────────

async function searchPolls(q: string, limit: number, offset = 0): Promise<{ items: PollResult[]; total: number }> {
  if (q.length >= 3) {
    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<RawPollRow[]>`
        SELECT id FROM Poll
        WHERE MATCH(title, question, description) AGAINST(${q} IN NATURAL LANGUAGE MODE)
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<[{ cnt: bigint }]>`
        SELECT COUNT(*) AS cnt FROM Poll
        WHERE MATCH(title, question, description) AGAINST(${q} IN NATURAL LANGUAGE MODE)
      `,
    ]);
    const ids = toIds(rows);
    const total = Number(countRows[0].cnt);
    if (ids.length === 0) return { items: [], total };
    const enriched = await prisma.poll.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, slug: true, question: true, status: true, _count: { select: { votes: true } } },
    });
    const map = new Map(enriched.map((p) => [p.id, p]));
    const items: PollResult[] = ids
      .map((id) => {
        const p = map.get(id);
        if (!p) return null;
        return { id: p.id, title: p.title, slug: p.slug, question: p.question, status: p.status, totalVotes: p._count.votes };
      })
      .filter((p): p is PollResult => p !== null);
    return { items, total };
  }

  const where = {
    OR: [
      { title: { contains: q } },
      { question: { contains: q } },
      { description: { contains: q } },
    ],
  };
  const [total, rows] = await Promise.all([
    prisma.poll.count({ where }),
    prisma.poll.findMany({
      where,
      select: { id: true, title: true, slug: true, question: true, status: true, _count: { select: { votes: true } } },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    }),
  ]);
  return {
    items: rows.map((p) => ({ id: p.id, title: p.title, slug: p.slug, question: p.question, status: p.status, totalVotes: p._count.votes })),
    total,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Run all types in parallel, return top previewLimit per type. */
export async function searchAll(q: string, previewLimit = 4): Promise<SearchGrouped> {
  const [posts, pages, tags, categories, polls] = await Promise.all([
    searchPosts(q, previewLimit),
    searchPages(q, previewLimit),
    searchTags(q, previewLimit),
    searchCategories(q, previewLimit),
    searchPolls(q, previewLimit),
  ]);

  const total =
    posts.total + pages.total + tags.total + categories.total + polls.total;

  return {
    query: q,
    type: 'all',
    grouped: { posts, pages, tags, categories, polls },
    total,
  };
}

/** Paginated search for a specific type. */
export async function searchType(
  q: string,
  type: string,
  page: number,
  limit: number,
): Promise<SearchPaged> {
  const offset = (page - 1) * limit;
  let items: (PostResult | PageResult | TagResult | CategoryResult | PollResult)[] = [];
  let total = 0;

  switch (type) {
    case 'posts': {
      const r = await searchPosts(q, limit, offset);
      items = r.items; total = r.total; break;
    }
    case 'pages': {
      const r = await searchPages(q, limit, offset);
      items = r.items; total = r.total; break;
    }
    case 'tags': {
      const r = await searchTags(q, limit, offset);
      items = r.items; total = r.total; break;
    }
    case 'categories': {
      const r = await searchCategories(q, limit, offset);
      items = r.items; total = r.total; break;
    }
    case 'polls': {
      const r = await searchPolls(q, limit, offset);
      items = r.items; total = r.total; break;
    }
  }

  return {
    query: q,
    type,
    items,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  };
}
