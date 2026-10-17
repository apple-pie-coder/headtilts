import { Prisma } from '@prisma/client';
import {
  defaultLayout, FrontPageLayout, FrontPageSection, normalizeLayout, StorySource,
} from '@headtilts/shared';
import { prisma } from '../config/database';
import { NotFoundError } from '../utils/errors';
import { withCardImages } from '../utils/cardImage';
import { postPublicSelect } from './publicSelect';
import { getTodaysCelebrations } from './celebrations.service';

/**
 * Front page builder storage and rendering data.
 *
 * Layouts live in settings as JSON: the published layout, a working draft and
 * a short history of published versions to roll back to.
 */

const KEY_PUBLISHED = 'front_page_layout';
const KEY_DRAFT = 'front_page_draft';
const KEY_HISTORY = 'front_page_history';
const HISTORY_MAX = 15;

interface Stored { layout: FrontPageLayout; at: string; by: string | null }
export interface HistoryEntry extends Stored { id: string; label?: string }

async function readJson<T>(key: string): Promise<T | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return null;
  try { return JSON.parse(row.value) as T; } catch { return null; }
}

async function writeJson(key: string, value: unknown) {
  const v = JSON.stringify(value);
  await prisma.setting.upsert({ where: { key }, update: { value: v }, create: { key, value: v, type: 'json' } });
}

async function actorName(userId: string | null) {
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, firstName: true, lastName: true } });
  return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username : null;
}

/** Everything the editor needs on load. */
export async function getEditorState() {
  const [published, draft, history] = await Promise.all([
    readJson<Stored>(KEY_PUBLISHED), readJson<Stored>(KEY_DRAFT), readJson<HistoryEntry[]>(KEY_HISTORY),
  ]);
  const live = published ? normalizeLayout(published.layout) : defaultLayout();
  return {
    published: { layout: live, at: published?.at ?? null, by: published?.by ?? null, isDefault: !published },
    draft: draft ? { layout: normalizeLayout(draft.layout), at: draft.at, by: draft.by } : null,
    history: (history ?? []).map(({ id, at, by, label, layout }) => ({ id, at, by, label, sections: layout.sections.length })),
  };
}

export async function saveDraft(raw: unknown, userId: string) {
  const layout = normalizeLayout(raw);
  const entry: Stored = { layout, at: new Date().toISOString(), by: await actorName(userId) };
  await writeJson(KEY_DRAFT, entry);
  return entry;
}

export async function discardDraft() {
  await prisma.setting.deleteMany({ where: { key: KEY_DRAFT } });
}

export async function publish(raw: unknown, userId: string) {
  const layout = normalizeLayout(raw);
  const by = await actorName(userId);
  const entry: Stored = { layout, at: new Date().toISOString(), by };
  const history = (await readJson<HistoryEntry[]>(KEY_HISTORY)) ?? [];
  history.unshift({ ...entry, id: `v${Date.now().toString(36)}` });
  await prisma.$transaction(async (tx) => {
    const put = (key: string, value: unknown) => tx.setting.upsert({
      where: { key }, update: { value: JSON.stringify(value) }, create: { key, value: JSON.stringify(value), type: 'json' },
    });
    await put(KEY_PUBLISHED, entry);
    await put(KEY_HISTORY, history.slice(0, HISTORY_MAX));
    await tx.setting.deleteMany({ where: { key: KEY_DRAFT } });
  });
  publicCache = null;
  return entry;
}

export async function getVersion(id: string) {
  const history = (await readJson<HistoryEntry[]>(KEY_HISTORY)) ?? [];
  const v = history.find((h) => h.id === id);
  if (!v) throw new NotFoundError('That version is no longer in the history');
  return { ...v, layout: normalizeLayout(v.layout) };
}

// ─── Rendering data ──────────────────────────────────────────────────────────

type PublicPost = Awaited<ReturnType<typeof withCardImages>>[number];

function sourceWhere(s: StorySource): Prisma.PostWhereInput {
  switch (s.kind) {
    case 'featured': return { isFeatured: true };
    case 'category': return { categories: { some: { category: { slug: s.value } } } };
    case 'tag': return { tags: { some: { tag: { slug: s.value } } } };
    case 'type': return { articleType: s.value };
    case 'video': return { videoUrl: { not: null } };
    default: return {};
  }
}

/** Hands out stories section by section so no story appears twice on the page. */
class StoryPool {
  used = new Set<number>();

  async take(source: StorySource, count: number): Promise<PublicPost[]> {
    if (count <= 0) return [];
    const base: Prisma.PostWhereInput = { status: 'published', type: 'post', ...(this.used.size ? { id: { notIn: [...this.used] } } : {}) };
    let rows = await prisma.post.findMany({
      where: { ...base, ...sourceWhere(source) }, select: postPublicSelect, orderBy: { publishedAt: 'desc' }, take: count,
    });
    // Not enough featured stories? Top up with the latest so the block isn't half empty.
    if (source.kind === 'featured' && rows.length < count) {
      const have = new Set([...this.used, ...rows.map((r) => r.id)]);
      const more = await prisma.post.findMany({
        where: { status: 'published', type: 'post', ...(have.size ? { id: { notIn: [...have] } } : {}) },
        select: postPublicSelect, orderBy: { publishedAt: 'desc' }, take: count - rows.length,
      });
      rows = [...rows, ...more];
    }
    rows.forEach((r) => this.used.add(r.id));
    return withCardImages(rows);
  }
}

async function topCategories(limit: number) {
  const cats = await prisma.category.findMany({
    select: { name: true, slug: true, icon: true, iconSvg: true, _count: { select: { posts: { where: { post: { status: 'published', type: 'post' } } } } } },
  });
  return cats.filter((c) => c._count.posts > 0).sort((a, b) => b._count.posts - a._count.posts).slice(0, limit);
}

/** Attach the stories, events etc. each visible section needs, in page order. */
export async function resolveLayout(layout: FrontPageLayout) {
  const pool = new StoryPool();
  const out: (FrontPageSection & { data?: unknown })[] = [];
  for (const sec of layout.sections) {
    if (sec.hidden) continue;
    const p = sec.props as Record<string, unknown>;
    const src = (p.source as StorySource) ?? { kind: 'latest' };
    const n = (k: string) => Number(p[k]) || 0;
    let data: unknown;
    switch (sec.type) {
      case 'lead': {
        const [lead] = await pool.take(src, 1);
        const rail = p.rail === 'none' ? [] : await pool.take((p.railSource as StorySource) ?? { kind: 'latest' }, n('railCount'));
        data = { lead: lead ?? null, rail };
        break;
      }
      case 'spotlight': data = { story: (await pool.take(src, 1))[0] ?? null }; break;
      case 'grid': case 'list': data = { stories: await pool.take(src, n('count')) }; break;
      case 'magazine': data = { stories: await pool.take(src, 5) }; break;
      case 'reviews': data = { stories: await pool.take({ kind: 'type', value: 'review' }, n('count')) }; break;
      case 'videos': data = { stories: await pool.take({ kind: 'video' }, n('count')) }; break;
      case 'interviews': data = { stories: await pool.take({ kind: 'type', value: 'qna' }, n('count')) }; break;
      case 'sections': {
        const wanted = (p.categories as string[]) ?? [];
        const cats = wanted.length
          ? (await prisma.category.findMany({ where: { slug: { in: wanted } }, select: { name: true, slug: true, icon: true, iconSvg: true } }))
            .sort((a, b) => wanted.indexOf(a.slug) - wanted.indexOf(b.slug))
          : await topCategories(3);
        const columns = [];
        for (const c of cats) {
          columns.push({ category: { name: c.name, slug: c.slug, icon: c.icon, iconSvg: c.iconSvg }, stories: await pool.take({ kind: 'category', value: c.slug }, n('count')) });
        }
        data = { columns };
        break;
      }
      case 'latest':
        // The first page is resolved here; "Load more" pages skip everything shown above.
        data = { stories: await pool.take({ kind: 'latest' }, n('pageSize')), exclude: [...pool.used] };
        break;
      case 'events':
        data = {
          events: await prisma.event.findMany({
            where: { status: 'published', endAt: { gte: new Date() }, parentEventId: null },
            select: { id: true, title: true, slug: true, excerpt: true, startAt: true, endAt: true, timezone: true, type: true, featuredImage: true, venueName: true, venueCity: true },
            orderBy: { startAt: 'asc' }, take: n('count'),
          }),
        };
        break;
      case 'poll': {
        const where: Prisma.PollWhereInput = p.poll ? { slug: String(p.poll) } : { status: 'open' };
        const poll = await prisma.poll.findFirst({ where, select: { slug: true, status: true }, orderBy: { createdAt: 'desc' } });
        data = { slug: poll && poll.status !== 'draft' ? poll.slug : null };
        break;
      }
      case 'onThisDay': data = { items: (await getTodaysCelebrations()).items }; break;
      default: data = undefined;
    }
    out.push({ ...sec, ...(data !== undefined ? { data } : {}) });
  }
  return out;
}

// Published front page, cached briefly: it's the busiest page on the site.
let publicCache: { at: number; value: unknown } | null = null;

export async function getPublicFrontPage() {
  if (publicCache && Date.now() - publicCache.at < 30_000) return publicCache.value;
  const published = await readJson<Stored>(KEY_PUBLISHED);
  const layout = published ? normalizeLayout(published.layout) : defaultLayout();
  const value = { sections: await resolveLayout(layout), updatedAt: published?.at ?? null };
  publicCache = { at: Date.now(), value };
  return value;
}

/** New posts, events or polls should show up without waiting for the cache. */
export function forgetFrontPageCache() { publicCache = null; }
