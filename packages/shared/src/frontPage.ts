/**
 * Front page builder: the section catalogue, templates and layout validation,
 * shared by the admin editor, the API and the public site.
 *
 * A layout is an ordered list of sections. Each section type declares its
 * settings as `fields`; the admin inspector is generated from them and the API
 * normalises stored layouts against them, so the three apps never disagree.
 */

export type StorySourceKind = 'latest' | 'featured' | 'category' | 'tag' | 'type' | 'video';
export interface StorySource { kind: StorySourceKind; value?: string }

export type SectionType =
  | 'lead' | 'spotlight' | 'grid' | 'magazine' | 'list' | 'sections' | 'latest'
  | 'reviews' | 'videos' | 'interviews'
  | 'events' | 'poll' | 'onThisDay'
  | 'banner' | 'text' | 'widgets' | 'divider';

export interface FrontPageSection {
  id: string;
  type: SectionType;
  hidden?: boolean;
  props: Record<string, unknown>;
}

export interface FrontPageLayout {
  version: 1;
  sections: FrontPageSection[];
}

type Option = { value: string; label: string };
export type SectionField =
  | { key: string; label: string; kind: 'text' | 'textarea' | 'url' | 'image'; placeholder?: string; help?: string; max?: number }
  | { key: string; label: string; kind: 'number'; min: number; max: number; help?: string }
  | { key: string; label: string; kind: 'select'; options: Option[]; help?: string }
  | { key: string; label: string; kind: 'toggle'; help?: string }
  | { key: string; label: string; kind: 'source'; allow?: StorySourceKind[]; help?: string }
  | { key: string; label: string; kind: 'categories'; max: number; help?: string }
  | { key: string; label: string; kind: 'poll'; help?: string };

export type SectionGroup = 'Stories' | 'Music & media' | 'Community' | 'Content';

export interface SectionDef {
  label: string;
  description: string;
  group: SectionGroup;
  /** Font Awesome icon name (without the "fa" prefix), e.g. "newspaper". */
  icon: string;
  fields: SectionField[];
  defaults: Record<string, unknown>;
  /** Only one allowed per page (e.g. the endless latest feed). */
  single?: boolean;
}

export const ARTICLE_TYPE_OPTIONS: Option[] = [
  { value: 'news', label: 'News' },
  { value: 'review', label: 'Reviews' },
  { value: 'qna', label: 'Q&A interviews' },
  { value: 'live', label: 'Live coverage' },
  { value: 'article', label: 'Articles' },
];

const COLUMNS: Option[] = [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }];

export const SECTION_DEFS: Record<SectionType, SectionDef> = {
  lead: {
    label: 'Lead story',
    description: 'One big story with a rail of headlines beside it.',
    group: 'Stories', icon: 'newspaper',
    fields: [
      { key: 'source', label: 'Lead story from', kind: 'source' },
      { key: 'rail', label: 'Beside it', kind: 'select', options: [
        { value: 'headlines', label: 'Headlines with thumbnails' }, { value: 'list', label: 'Plain headlines' }, { value: 'none', label: 'Nothing — full width' }] },
      { key: 'railTitle', label: 'Rail title', kind: 'text', placeholder: 'Latest', max: 60 },
      { key: 'railSource', label: 'Rail stories from', kind: 'source' },
      { key: 'railCount', label: 'Rail stories', kind: 'number', min: 3, max: 8 },
    ],
    defaults: { source: { kind: 'featured' }, rail: 'headlines', railTitle: 'Latest', railSource: { kind: 'latest' }, railCount: 5 },
  },
  spotlight: {
    label: 'Spotlight',
    description: 'A full-width picture with the headline over it.',
    group: 'Stories', icon: 'image',
    fields: [
      { key: 'source', label: 'Story from', kind: 'source' },
      { key: 'height', label: 'Height', kind: 'select', options: [{ value: 'medium', label: 'Medium' }, { value: 'tall', label: 'Tall' }] },
      { key: 'showExcerpt', label: 'Show the standfirst', kind: 'toggle' },
    ],
    defaults: { source: { kind: 'featured' }, height: 'tall', showExcerpt: true },
  },
  grid: {
    label: 'Story grid',
    description: 'Cards in 2–4 columns from any category, tag or type.',
    group: 'Stories', icon: 'table-cells-large',
    fields: [
      { key: 'title', label: 'Section title', kind: 'text', placeholder: 'e.g. Festival season', max: 80 },
      { key: 'source', label: 'Stories from', kind: 'source' },
      { key: 'count', label: 'Stories', kind: 'number', min: 2, max: 24 },
      { key: 'columns', label: 'Columns', kind: 'select', options: COLUMNS },
      { key: 'showExcerpt', label: 'Show standfirsts', kind: 'toggle' },
      { key: 'moreLink', label: 'Add a “See all” link', kind: 'toggle', help: 'Links to the category or tag page.' },
    ],
    defaults: { title: 'Top stories', source: { kind: 'latest' }, count: 6, columns: '3', showExcerpt: true, moreLink: true },
  },
  magazine: {
    label: 'Magazine block',
    description: 'One large story and four smaller ones beside it.',
    group: 'Stories', icon: 'table-columns',
    fields: [
      { key: 'title', label: 'Section title', kind: 'text', placeholder: 'e.g. Editors’ picks', max: 80 },
      { key: 'source', label: 'Stories from', kind: 'source' },
      { key: 'moreLink', label: 'Add a “See all” link', kind: 'toggle' },
    ],
    defaults: { title: 'In focus', source: { kind: 'latest' }, moreLink: true },
  },
  list: {
    label: 'Headline list',
    description: 'A compact, numbered or plain list of headlines.',
    group: 'Stories', icon: 'list-ol',
    fields: [
      { key: 'title', label: 'Section title', kind: 'text', placeholder: 'e.g. Most read', max: 80 },
      { key: 'source', label: 'Stories from', kind: 'source' },
      { key: 'count', label: 'Headlines', kind: 'number', min: 3, max: 20 },
      { key: 'columns', label: 'Columns', kind: 'select', options: [{ value: '1', label: '1' }, { value: '2', label: '2' }] },
      { key: 'numbered', label: 'Number the headlines', kind: 'toggle' },
      { key: 'thumbs', label: 'Show thumbnails', kind: 'toggle' },
    ],
    defaults: { title: 'Top 10', source: { kind: 'latest' }, count: 10, columns: '2', numbered: true, thumbs: true },
  },
  sections: {
    label: 'Section fronts',
    description: 'Side-by-side columns, one per category.',
    group: 'Stories', icon: 'layer-group',
    fields: [
      { key: 'categories', label: 'Categories', kind: 'categories', max: 4, help: 'Leave empty to use your biggest sections.' },
      { key: 'count', label: 'Stories per category', kind: 'number', min: 2, max: 6 },
    ],
    defaults: { categories: [], count: 4 },
  },
  latest: {
    label: 'Latest feed',
    description: 'Everything else, newest first, with “Load more”.',
    group: 'Stories', icon: 'bars-staggered', single: true,
    fields: [
      { key: 'title', label: 'Section title', kind: 'text', placeholder: 'Latest stories', max: 80 },
      { key: 'columns', label: 'Columns', kind: 'select', options: COLUMNS },
      { key: 'pageSize', label: 'Stories per load', kind: 'number', min: 6, max: 24 },
      { key: 'loadMore', label: '“Load more” button', kind: 'toggle' },
    ],
    defaults: { title: 'Latest stories', columns: '3', pageSize: 12, loadMore: true },
  },
  reviews: {
    label: 'Reviews',
    description: 'Latest reviews with their scores.',
    group: 'Music & media', icon: 'star-half-stroke',
    fields: [
      { key: 'title', label: 'Section title', kind: 'text', placeholder: 'Latest reviews', max: 80 },
      { key: 'count', label: 'Reviews', kind: 'number', min: 2, max: 12 },
    ],
    defaults: { title: 'Latest reviews', count: 4 },
  },
  videos: {
    label: 'Videos',
    description: 'Stories with a video, shown with a play badge.',
    group: 'Music & media', icon: 'circle-play',
    fields: [
      { key: 'title', label: 'Section title', kind: 'text', placeholder: 'Watch', max: 80 },
      { key: 'count', label: 'Videos', kind: 'number', min: 2, max: 12 },
    ],
    defaults: { title: 'Watch', count: 4 },
  },
  interviews: {
    label: 'Interviews',
    description: 'Q&A sessions and interviews.',
    group: 'Music & media', icon: 'microphone',
    fields: [
      { key: 'title', label: 'Section title', kind: 'text', placeholder: 'Interviews', max: 80 },
      { key: 'count', label: 'Interviews', kind: 'number', min: 1, max: 6 },
    ],
    defaults: { title: 'Interviews', count: 3 },
  },
  events: {
    label: 'Upcoming events',
    description: 'Your next gigs and events with dates.',
    group: 'Community', icon: 'calendar-days',
    fields: [
      { key: 'title', label: 'Section title', kind: 'text', placeholder: 'Upcoming events', max: 80 },
      { key: 'count', label: 'Events', kind: 'number', min: 1, max: 8 },
    ],
    defaults: { title: 'Upcoming events', count: 3 },
  },
  poll: {
    label: 'Poll',
    description: 'Let readers vote right on the front page.',
    group: 'Community', icon: 'square-poll-vertical',
    fields: [
      { key: 'title', label: 'Section title', kind: 'text', placeholder: 'Have your say', max: 80 },
      { key: 'poll', label: 'Poll', kind: 'poll', help: 'Leave on “Newest open poll” to rotate automatically.' },
    ],
    defaults: { title: 'Have your say', poll: '' },
  },
  onThisDay: {
    label: 'Born on this day',
    description: 'Today’s artist birthdays and remembrances. Hidden on days with none.',
    group: 'Community', icon: 'cake-candles',
    fields: [{ key: 'title', label: 'Section title', kind: 'text', placeholder: 'On this day', max: 80 }],
    defaults: { title: 'On this day' },
  },
  banner: {
    label: 'Banner',
    description: 'An announcement or call to action with a button.',
    group: 'Content', icon: 'bullhorn',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text', max: 120 },
      { key: 'text', label: 'Text', kind: 'textarea', max: 600 },
      { key: 'buttonLabel', label: 'Button label', kind: 'text', max: 40 },
      { key: 'buttonUrl', label: 'Button link', kind: 'url', placeholder: '/events or https://…' },
      { key: 'image', label: 'Background image', kind: 'image' },
      { key: 'style', label: 'Style', kind: 'select', options: [
        { value: 'accent', label: 'Red' }, { value: 'dark', label: 'Dark' }, { value: 'subtle', label: 'Subtle' }, { value: 'image', label: 'Image' }] },
    ],
    defaults: { heading: 'Got a gig coming up?', text: 'Tell us about it and we’ll add it to the events calendar.', buttonLabel: 'Get in touch', buttonUrl: '/pages/contact', image: '', style: 'accent' },
  },
  text: {
    label: 'Text',
    description: 'A heading and a few paragraphs of your own words.',
    group: 'Content', icon: 'paragraph',
    fields: [
      { key: 'heading', label: 'Heading', kind: 'text', max: 120 },
      { key: 'body', label: 'Text', kind: 'textarea', max: 3000, help: 'Leave a blank line between paragraphs.' },
      { key: 'align', label: 'Alignment', kind: 'select', options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }] },
    ],
    defaults: { heading: 'About us', body: 'Write a few words about your site here.', align: 'left' },
  },
  widgets: {
    label: 'Widget area',
    description: 'Shows the widgets from Appearance → Widgets.',
    group: 'Content', icon: 'puzzle-piece',
    fields: [{ key: 'zone', label: 'Widget zone', kind: 'select', options: [
      { value: 'front-page-featured', label: 'Front page featured' }, { value: 'footer-1', label: 'Footer column 1' },
      { value: 'footer-2', label: 'Footer column 2' }, { value: 'footer-3', label: 'Footer column 3' }] }],
    defaults: { zone: 'front-page-featured' },
  },
  divider: {
    label: 'Divider',
    description: 'A line or extra space between sections.',
    group: 'Content', icon: 'grip-lines',
    fields: [{ key: 'style', label: 'Style', kind: 'select', options: [{ value: 'line', label: 'Line' }, { value: 'space', label: 'Space only' }] }],
    defaults: { style: 'line' },
  },
};

export const SECTION_TYPES = Object.keys(SECTION_DEFS) as SectionType[];

let seq = 0;
export function newSectionId(): string {
  seq = (seq + 1) % 1e6;
  return `s${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function newSection(type: SectionType, props: Record<string, unknown> = {}): FrontPageSection {
  return { id: newSectionId(), type, props: { ...structuredCloneSafe(SECTION_DEFS[type].defaults), ...props } };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Human summary of a story source, e.g. "Reviews" or "Category: news". */
export function describeSource(s: StorySource | undefined, names: Record<string, string> = {}): string {
  if (!s) return 'Latest';
  switch (s.kind) {
    case 'featured': return 'Featured';
    case 'video': return 'Videos';
    case 'category': return s.value ? names[s.value] ?? s.value : 'Category';
    case 'tag': return s.value ? `#${s.value}` : 'Tag';
    case 'type': return ARTICLE_TYPE_OPTIONS.find((t) => t.value === s.value)?.label ?? 'Type';
    default: return 'Latest';
  }
}

/** One-line description of a section for the editor's list. */
export function summarizeSection(sec: FrontPageSection, names: Record<string, string> = {}): string {
  const p = sec.props;
  const src = describeSource(p.source as StorySource, names);
  switch (sec.type) {
    case 'lead': return `${src} · ${p.rail === 'none' ? 'full width' : `${p.railCount} headlines`}`;
    case 'spotlight': return src;
    case 'grid': return `${p.count} stories · ${src} · ${p.columns} columns`;
    case 'magazine': return `5 stories · ${src}`;
    case 'list': return `${p.count} headlines · ${src}`;
    case 'sections': {
      const c = (p.categories as string[]) ?? [];
      return c.length ? c.map((x) => names[x] ?? x).join(', ') : 'Biggest sections (automatic)';
    }
    case 'latest': return `${p.pageSize} per load · ${p.columns} columns`;
    case 'reviews': case 'videos': case 'interviews': case 'events': return `${p.count} · ${String(p.title || SECTION_DEFS[sec.type].label)}`;
    case 'poll': return p.poll ? String(p.poll) : 'Newest open poll';
    case 'banner': case 'text': return String(p.heading || '(no heading)');
    case 'widgets': return String(p.zone);
    case 'divider': return p.style === 'space' ? 'Space' : 'Line';
    default: return '';
  }
}

// ─── Templates ───────────────────────────────────────────────────────────────

export interface FrontPageTemplate {
  id: string;
  name: string;
  description: string;
  /** Rough shape for the template card: rows of relative block widths. */
  sketch: number[][];
  build: () => FrontPageSection[];
}

export const FRONT_PAGE_TEMPLATES: FrontPageTemplate[] = [
  {
    id: 'newsroom',
    name: 'Newsroom',
    description: 'Lead story with a headline rail, then the latest stories. Your current front page.',
    sketch: [[2, 1], [1, 1, 1], [1, 1, 1]],
    build: () => [
      newSection('lead'),
      newSection('widgets'),
      newSection('latest'),
    ],
  },
  {
    id: 'magazine',
    name: 'Magazine',
    description: 'A big spotlight, an editors’ block and a column per section — great when you post a lot.',
    sketch: [[1], [2, 1], [1, 1, 1], [1, 1, 1, 1]],
    build: () => [
      newSection('spotlight'),
      newSection('magazine', { title: 'Editors’ picks' }),
      newSection('sections'),
      newSection('reviews', { count: 4 }),
      newSection('latest', { title: 'More stories', columns: '4' }),
    ],
  },
  {
    id: 'music-first',
    name: 'Music first',
    description: 'Leads with reviews and interviews, with videos front and centre.',
    sketch: [[2, 1], [1, 1, 1, 1], [1, 1], [1, 1, 1]],
    build: () => [
      newSection('lead', { source: { kind: 'type', value: 'review' }, railTitle: 'New reviews', railSource: { kind: 'type', value: 'review' } }),
      newSection('reviews', { title: 'More reviews', count: 4 }),
      newSection('videos', { title: 'Watch', count: 4 }),
      newSection('interviews', { title: 'In conversation', count: 2 }),
      newSection('latest', { title: 'News & everything else' }),
    ],
  },
  {
    id: 'community',
    name: 'Scene & community',
    description: 'Events, polls and birthdays up top — built around readers taking part.',
    sketch: [[1], [2, 1], [1, 1, 1], [1, 1]],
    build: () => [
      newSection('banner', { heading: 'Your scene, every week', text: 'Gigs, releases and interviews from the underground — plus polls and events where you get a say.', buttonLabel: 'See upcoming events', buttonUrl: '/events', style: 'dark' }),
      newSection('lead', { rail: 'list' }),
      newSection('events', { count: 3 }),
      newSection('poll'),
      newSection('onThisDay'),
      newSection('latest'),
    ],
  },
  {
    id: 'headlines',
    name: 'Headlines',
    description: 'Fast and text-led: a numbered top list and a compact grid.',
    sketch: [[1, 1], [1, 1, 1, 1]],
    build: () => [
      newSection('lead', { rail: 'list', railCount: 6 }),
      newSection('list', { title: 'Top stories', count: 10, columns: '2' }),
      newSection('latest', { columns: '4', pageSize: 16 }),
    ],
  },
  {
    id: 'video-led',
    name: 'Video-led',
    description: 'A spotlight and a wall of videos for sites that post a lot of clips.',
    sketch: [[1], [1, 1, 1, 1], [1, 1, 1]],
    build: () => [
      newSection('spotlight', { source: { kind: 'video' } }),
      newSection('videos', { title: 'Latest videos', count: 8 }),
      newSection('grid', { title: 'Top stories', count: 6 }),
      newSection('latest'),
    ],
  },
];

export const DEFAULT_TEMPLATE_ID = 'newsroom';

// ─── Validation ──────────────────────────────────────────────────────────────

const SOURCE_KINDS: StorySourceKind[] = ['latest', 'featured', 'category', 'tag', 'type', 'video'];
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const MAX_SECTIONS = 30;

function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '';
}

function cleanUrl(v: unknown): string {
  const s = cleanText(v, 500);
  return /^(\/(?!\/)|https?:\/\/)/i.test(s) ? s : '';
}

function cleanSource(v: unknown, field: Extract<SectionField, { kind: 'source' }>, fallback: unknown): StorySource {
  const raw = (v && typeof v === 'object' ? v : {}) as { kind?: unknown; value?: unknown };
  const allow = field.allow ?? SOURCE_KINDS;
  const kind = allow.includes(raw.kind as StorySourceKind) ? (raw.kind as StorySourceKind) : (fallback as StorySource).kind;
  const value = typeof raw.value === 'string' ? raw.value.trim().toLowerCase() : '';
  if (kind === 'category' || kind === 'tag') return SLUG.test(value) ? { kind, value } : (fallback as StorySource);
  if (kind === 'type') return ARTICLE_TYPE_OPTIONS.some((t) => t.value === value) ? { kind, value } : { kind: 'type', value: 'news' };
  return { kind };
}

/** Clean any stored or submitted layout: unknown types and settings are dropped, values clamped. */
export function normalizeLayout(raw: unknown): FrontPageLayout {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { sections?: unknown }).sections)
    ? (raw as { sections: unknown[] }).sections : [];
  const seen = new Set<string>();
  const sections: FrontPageSection[] = [];
  let latestSeen = false;
  for (const item of list.slice(0, MAX_SECTIONS)) {
    if (!item || typeof item !== 'object') continue;
    const s = item as { id?: unknown; type?: unknown; hidden?: unknown; props?: unknown };
    if (typeof s.type !== 'string' || !(s.type in SECTION_DEFS)) continue;
    const type = s.type as SectionType;
    const def = SECTION_DEFS[type];
    if (def.single) { if (latestSeen) continue; latestSeen = true; }
    let id = typeof s.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(s.id) ? s.id : newSectionId();
    if (seen.has(id)) id = newSectionId();
    seen.add(id);
    const inProps = (s.props && typeof s.props === 'object' ? s.props : {}) as Record<string, unknown>;
    const props: Record<string, unknown> = {};
    for (const f of def.fields) {
      const v = inProps[f.key];
      const d = def.defaults[f.key];
      switch (f.kind) {
        case 'text': props[f.key] = v === undefined ? d : cleanText(v, f.max ?? 200); break;
        case 'textarea': props[f.key] = v === undefined ? d : cleanText(v, f.max ?? 2000); break;
        case 'url': props[f.key] = v === undefined ? d : cleanUrl(v); break;
        case 'image': props[f.key] = v === undefined ? d : cleanUrl(v); break;
        case 'number': {
          const n = Math.round(Number(v));
          props[f.key] = Number.isFinite(n) && v !== undefined && v !== '' ? Math.min(f.max, Math.max(f.min, n)) : d;
          break;
        }
        case 'select': props[f.key] = f.options.some((o) => o.value === String(v)) ? String(v) : d; break;
        case 'toggle': props[f.key] = typeof v === 'boolean' ? v : d; break;
        case 'source': props[f.key] = cleanSource(v, f, d); break;
        case 'categories':
          props[f.key] = Array.isArray(v)
            ? [...new Set(v.map((x) => String(x).trim().toLowerCase()).filter((x) => SLUG.test(x)))].slice(0, f.max)
            : d;
          break;
        case 'poll': props[f.key] = typeof v === 'string' && (v === '' || SLUG.test(v)) ? v : d; break;
      }
    }
    sections.push({ id, type, ...(s.hidden === true ? { hidden: true } : {}), props });
  }
  return { version: 1, sections };
}

export function defaultLayout(): FrontPageLayout {
  return { version: 1, sections: FRONT_PAGE_TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID)!.build() };
}
