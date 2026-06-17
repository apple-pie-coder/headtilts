import { prisma } from '../config/database';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors';
import { getCalendarMonth } from './calendar.service';

export const WIDGET_TYPES = [
  { value: 'text', label: 'Text / HTML' },
  { value: 'menu', label: 'Menu / Links' },
  { value: 'recent-posts', label: 'Recent Posts' },
  { value: 'featured-posts', label: 'Featured Posts (Grid)' },
  { value: 'latest-posts-compact', label: 'Latest Posts (Small Thumbnails)' },
  { value: 'category-posts-grid', label: 'Category Posts (Grid + View All)' },
  { value: 'categories', label: 'Categories' },
  { value: 'tags', label: 'Tags' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'search', label: 'Search Form' },
] as const;

const VALID_TYPES = WIDGET_TYPES.map((t) => t.value);

// ---------------------------------------------------------------------------
// Config helpers — each widget stores one JSON blob under key='config'
// ---------------------------------------------------------------------------

async function getConfig(widgetId: number): Promise<Record<string, unknown>> {
  const setting = await prisma.widgetSetting.findFirst({
    where: { widgetId, key: 'config' },
  });
  if (!setting) return {};
  try {
    return JSON.parse(setting.value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function setConfig(widgetId: number, config: Record<string, unknown>): Promise<void> {
  await prisma.widgetSetting.upsert({
    where: { widgetId_key: { widgetId, key: 'config' } },
    update: { value: JSON.stringify(config) },
    create: { widgetId, key: 'config', value: JSON.stringify(config), type: 'json' },
  });
}

// ---------------------------------------------------------------------------
// Widget CRUD
// ---------------------------------------------------------------------------

export interface WidgetInput {
  name: string;
  type: string;
  title?: string | null;
  description?: string | null;
  isActive?: boolean;
  config?: Record<string, unknown>;
}

export async function listWidgets() {
  const widgets = await prisma.widget.findMany({ orderBy: { name: 'asc' } });
  return Promise.all(widgets.map(async (w) => ({ ...w, config: await getConfig(w.id) })));
}

export async function getWidgetById(id: number) {
  const widget = await prisma.widget.findUnique({ where: { id } });
  if (!widget) throw new NotFoundError('Widget not found');
  return { ...widget, config: await getConfig(id) };
}

export async function createWidget(input: WidgetInput) {
  const name = input.name?.trim();
  if (!name) throw new ValidationError('Widget name is required');
  if (!VALID_TYPES.includes(input.type as typeof VALID_TYPES[number])) {
    throw new ValidationError(`Invalid widget type. Must be one of: ${VALID_TYPES.join(', ')}`);
  }

  const existing = await prisma.widget.findUnique({ where: { name } });
  if (existing) throw new ConflictError('A widget with this name already exists');

  const widget = await prisma.widget.create({
    data: {
      name,
      type: input.type,
      title: input.title || null,
      description: input.description || null,
      isActive: input.isActive ?? true,
    },
  });

  if (input.config && Object.keys(input.config).length > 0) {
    await setConfig(widget.id, input.config);
  }

  return { ...widget, config: input.config ?? {} };
}

export async function updateWidget(id: number, input: Partial<WidgetInput>) {
  const existing = await prisma.widget.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Widget not found');

  if (input.name) {
    const name = input.name.trim();
    if (name !== existing.name) {
      const conflict = await prisma.widget.findFirst({ where: { name, id: { not: id } } });
      if (conflict) throw new ConflictError('A widget with this name already exists');
    }
  }

  if (input.type !== undefined && !VALID_TYPES.includes(input.type as typeof VALID_TYPES[number])) {
    throw new ValidationError(`Invalid widget type. Must be one of: ${VALID_TYPES.join(', ')}`);
  }

  const widget = await prisma.widget.update({
    where: { id },
    data: {
      name: input.name?.trim() ?? existing.name,
      type: input.type ?? existing.type,
      title: input.title !== undefined ? input.title : existing.title,
      description: input.description !== undefined ? input.description : existing.description,
      isActive: input.isActive ?? existing.isActive,
    },
  });

  if (input.config !== undefined) {
    await setConfig(id, input.config);
  }

  return { ...widget, config: await getConfig(id) };
}

export async function deleteWidget(id: number) {
  const existing = await prisma.widget.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Widget not found');
  await prisma.widget.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Zone management
// ---------------------------------------------------------------------------

async function hydrateZone(zone: {
  id: number;
  name: string;
  description: string | null;
  maxWidgets: number;
  createdAt: Date;
  updatedAt: Date;
  widgets: { position: number; widgetId: number; widget: { id: number; name: string; type: string; title: string | null; isActive: boolean } }[];
}) {
  return {
    id: zone.id,
    name: zone.name,
    description: zone.description,
    maxWidgets: zone.maxWidgets,
    widgets: await Promise.all(
      zone.widgets.map(async (zww) => ({
        id: zww.widget.id,
        name: zww.widget.name,
        type: zww.widget.type,
        title: zww.widget.title,
        isActive: zww.widget.isActive,
        position: zww.position,
        config: await getConfig(zww.widgetId),
      })),
    ),
  };
}

const zoneInclude = {
  widgets: {
    orderBy: { position: 'asc' as const },
    include: {
      widget: {
        select: { id: true, name: true, type: true, title: true, isActive: true },
      },
    },
  },
};

export async function listZones() {
  const zones = await prisma.widgetZone.findMany({
    orderBy: { name: 'asc' },
    include: zoneInclude,
  });
  return Promise.all(zones.map(hydrateZone));
}

export async function setZoneWidgets(zoneName: string, widgetIds: number[]) {
  const zone = await prisma.widgetZone.findUnique({ where: { name: zoneName } });
  if (!zone) throw new NotFoundError(`Widget zone "${zoneName}" not found`);

  if (widgetIds.length > zone.maxWidgets) {
    throw new ValidationError(`Zone "${zoneName}" allows a maximum of ${zone.maxWidgets} widgets`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.widgetZoneWidget.deleteMany({ where: { zoneId: zone.id } });
    for (let i = 0; i < widgetIds.length; i++) {
      await tx.widgetZoneWidget.create({
        data: { zoneId: zone.id, widgetId: widgetIds[i], position: i },
      });
    }
  });

  const updated = await prisma.widgetZone.findUnique({ where: { name: zoneName }, include: zoneInclude });
  return hydrateZone(updated!);
}

// ---------------------------------------------------------------------------
// Public zone — resolves dynamic widget data server-side
// ---------------------------------------------------------------------------

export async function getPublicZone(zoneName: string) {
  const zone = await prisma.widgetZone.findUnique({
    where: { name: zoneName },
    include: {
      widgets: {
        where: { widget: { isActive: true } },
        orderBy: { position: 'asc' },
        include: { widget: { select: { id: true, type: true, title: true } } },
      },
    },
  });

  if (!zone) throw new NotFoundError(`Widget zone "${zoneName}" not found`);

  const widgets = await Promise.all(
    zone.widgets.map(async (zww) => {
      const config = await getConfig(zww.widgetId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = config as any;
      let data: unknown = null;

      if (zww.widget.type === 'menu') {
        // Each item links to a page (pageId) or a custom URL. Resolve page ids
        // to their public /pages/:slug path, dropping unpublished/missing pages.
        const items: { label?: unknown; pageId?: unknown; url?: unknown }[] = Array.isArray(cfg.items)
          ? cfg.items
          : [];
        const pageIds = items.map((it) => Number(it?.pageId)).filter((id) => id > 0);
        const pages = pageIds.length
          ? await prisma.post.findMany({
              where: { id: { in: pageIds }, type: 'page', status: 'published' },
              select: { id: true, slug: true, title: true },
            })
          : [];
        const pageMap = new Map(pages.map((p) => [p.id, p]));

        data = items
          .map((it) => {
            const label = typeof it.label === 'string' ? it.label.trim() : '';
            const pageId = Number(it.pageId) || 0;
            if (pageId > 0) {
              const page = pageMap.get(pageId);
              if (!page) return null;
              return { label: label || page.title, url: `/pages/${page.slug}` };
            }
            const url = typeof it.url === 'string' ? it.url.trim() : '';
            if (!url) return null;
            return { label: label || url, url };
          })
          .filter((item): item is { label: string; url: string } => item !== null);
      } else if (zww.widget.type === 'recent-posts') {
        const count = Math.min(Number(cfg.count) || 5, 20);
        data = await prisma.post.findMany({
          where: { status: 'published', type: 'post' },
          orderBy: { publishedAt: 'desc' },
          take: count,
          select: { id: true, title: true, slug: true, publishedAt: true, excerpt: true, featuredImage: true },
        });
      } else if (zww.widget.type === 'featured-posts') {
        const count = Math.min(Number(cfg.count) || 4, 12);
        data = await prisma.post.findMany({
          where: { status: 'published', type: 'post' },
          orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }],
          take: count,
          select: {
            id: true, title: true, slug: true, publishedAt: true, excerpt: true,
            featuredImage: true, isFeatured: true,
            categories: { select: { category: { select: { id: true, name: true, slug: true } } } },
          },
        });
      } else if (zww.widget.type === 'latest-posts-compact') {
        const count = Math.min(Number(cfg.count) || 5, 20);
        data = await prisma.post.findMany({
          where: { status: 'published', type: 'post' },
          orderBy: { publishedAt: 'desc' },
          take: count,
          select: { id: true, title: true, slug: true, publishedAt: true, featuredImage: true },
        });
      } else if (zww.widget.type === 'category-posts-grid') {
        const count = Math.min(Number(cfg.count) || 4, 12);
        const categorySlug = cfg.categorySlug ? String(cfg.categorySlug) : '';
        const category = categorySlug
          ? await prisma.category.findUnique({
              where: { slug: categorySlug },
              select: { id: true, name: true, slug: true },
            })
          : null;
        const posts = await prisma.post.findMany({
          where: {
            status: 'published',
            type: 'post',
            ...(category ? { categories: { some: { categoryId: category.id } } } : {}),
          },
          orderBy: { publishedAt: 'desc' },
          take: count,
          select: {
            id: true, title: true, slug: true, publishedAt: true, excerpt: true,
            featuredImage: true, isFeatured: true,
            categories: { select: { category: { select: { id: true, name: true, slug: true } } } },
          },
        });
        data = { category, posts };
      } else if (zww.widget.type === 'categories') {
        data = await prisma.category.findMany({
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            slug: true,
            _count: { select: { posts: { where: { post: { status: 'published', type: 'post' } } } } },
          },
        });
      } else if (zww.widget.type === 'tags') {
        const maxTags = Math.min(Number(cfg.maxTags) || 20, 50);
        data = await prisma.tag.findMany({
          orderBy: { name: 'asc' },
          take: maxTags,
          select: { id: true, name: true, slug: true },
        });
      } else if (zww.widget.type === 'calendar') {
        const now = new Date();
        data = await getCalendarMonth(now.getUTCFullYear(), now.getUTCMonth() + 1);
      }

      return { id: zww.widget.id, type: zww.widget.type, title: zww.widget.title, config, data };
    }),
  );

  return { name: zone.name, description: zone.description, widgets };
}
