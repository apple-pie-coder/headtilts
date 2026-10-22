import { MouseEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FrontPageSection, StorySource } from '@headtilts/shared';
import { get, resolveMediaUrl } from '../services/api';
import { fetchPosts } from '../services/posts';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { useLayout } from '../context/LayoutContext';
import { applySeo, resetSeo } from '../utils/seo';
import { formatDate, timeAgo } from '../utils/date';
import { postPath } from '../utils/permalink';
import { framingStyle } from '../utils/focus';
import { PostSummary } from '../types';
import { authorName, plain, PostCard, StoryImage } from './PostCard';
import { Tape } from './Tape';
import { CategoryIcon } from './CategoryIcon';
import { WidgetZone } from './WidgetZone';
import { PollWidget } from './PollWidget';

/**
 * The front page, built from the sections arranged in Admin → Front page.
 * The server sends each section with its stories already chosen (no story is
 * repeated down the page). In the editor's preview frame (?fp-preview=1) the
 * admin posts the draft instead.
 */

type Resolved = FrontPageSection & { data?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Props = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function isFrontPagePreview() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('fp-preview');
}

export function FrontPage() {
  const preview = useMemo(isFrontPagePreview, []);
  const [sections, setSections] = useState<Resolved[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const { setVariant, setShowSidebar } = useLayout();
  const { site_title, site_tagline, site_description } = useSiteSettings();

  useEffect(() => { setVariant('default'); setShowSidebar(false); }, [setVariant, setShowSidebar]);

  useEffect(() => {
    applySeo({ title: site_tagline ? `${site_title} — ${site_tagline}` : site_title, description: site_description, ogType: 'website' });
    return () => resetSeo(site_title);
  }, [site_title, site_tagline, site_description]);

  useEffect(() => {
    if (preview) return;
    get<{ sections: Resolved[] }>('/public/front-page').then((r) => setSections(r.sections)).catch(() => setError(true));
  }, [preview]);

  // Preview: the editor (same origin, parent window) sends the draft to draw.
  useEffect(() => {
    if (!preview) return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const m = e.data as { type?: string; sections?: Resolved[]; selected?: string | null };
      if (m?.type === 'fp:render' && Array.isArray(m.sections)) setSections(m.sections);
      if (m?.type === 'fp:render' || m?.type === 'fp:select') {
        setSelected(m.selected ?? null);
        if (m.selected) requestAnimationFrame(() => document.querySelector(`[data-fp-id="${m.selected}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
      }
    };
    window.addEventListener('message', onMsg);
    window.parent?.postMessage({ type: 'fp:ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMsg);
  }, [preview]);

  if (error) return <p className="empty-state">The front page couldn’t load. Please refresh.</p>;
  if (!sections) return <div className="lead lead--loading" aria-hidden="true" />;

  const pick = (e: MouseEvent, id: string) => {
    if (!preview) return;
    // In the editor, clicking selects the section instead of following links.
    e.preventDefault();
    e.stopPropagation();
    setSelected(id);
    window.parent?.postMessage({ type: 'fp:select', id }, window.location.origin);
  };

  return (
    <div className={`front-page${preview ? ' front-page--preview' : ''}`}>
      {sections.filter((s) => !s.hidden).map((s, i) => (
        <div
          key={s.id}
          data-fp-id={s.id}
          className={`fp-section fp-s-${s.type}${preview && selected === s.id ? ' fp-selected' : ''}`}
          onClickCapture={preview ? (e) => pick(e, s.id) : undefined}
        >
          {preview && <span className="fp-tag">{i + 1}. {SECTION_LABEL[s.type] ?? s.type}</span>}
          <Section section={s} first={i === 0} />
        </div>
      ))}
      {preview && sections.length === 0 && (
        <p className="empty-state">Add a section from the panel on the left to start building your front page.</p>
      )}
    </div>
  );
}

const SECTION_LABEL: Record<string, string> = {
  lead: 'Lead story', spotlight: 'Spotlight', grid: 'Story grid', magazine: 'Magazine block', list: 'Headline list',
  sections: 'Section fronts', latest: 'Latest feed', reviews: 'Reviews', videos: 'Videos', interviews: 'Interviews',
  events: 'Upcoming events', poll: 'Poll', onThisDay: 'Born on this day', banner: 'Banner', text: 'Text',
  widgets: 'Widget area', divider: 'Divider',
};

function Section({ section, first }: { section: Resolved; first: boolean }) {
  const p = section.props as Props;
  const d = section.data ?? {};
  switch (section.type) {
    case 'lead': return <Lead lead={d.lead} rail={d.rail ?? []} props={p} first={first} />;
    case 'spotlight': return d.story ? <Spotlight story={d.story} props={p} first={first} /> : null;
    case 'grid': return <Grid title={p.title} stories={d.stories} columns={p.columns} showExcerpt={p.showExcerpt} more={p.moreLink ? moreHref(p.source) : null} />;
    case 'magazine': return <Magazine title={p.title} stories={d.stories ?? []} more={p.moreLink ? moreHref(p.source) : null} />;
    case 'list': return <HeadlineList title={p.title} stories={d.stories ?? []} columns={p.columns} numbered={p.numbered} thumbs={p.thumbs} />;
    case 'sections': return <SectionFronts columns={d.columns ?? []} />;
    case 'latest': return <LatestFeed title={p.title} first={d.stories ?? []} exclude={d.exclude ?? []} columns={p.columns} pageSize={p.pageSize} loadMore={p.loadMore} />;
    case 'reviews': return <Grid title={p.title} stories={d.stories} columns={String(Math.min(4, Math.max(2, d.stories?.length ?? 4)))} more="/categories/reviews" />;
    case 'videos': return <Grid title={p.title} stories={d.stories} columns="4" showExcerpt={false} />;
    case 'interviews': return <Interviews title={p.title} stories={d.stories ?? []} />;
    case 'events': return <Events title={p.title} events={d.events ?? []} />;
    case 'poll': return d.slug ? <SectionShell title={p.title}><div className="fp-poll"><PollWidget slug={d.slug} /></div></SectionShell> : null;
    case 'onThisDay': return <OnThisDay title={p.title} items={d.items ?? []} />;
    case 'banner': return <Banner props={p} />;
    case 'text': return <TextBlock props={p} />;
    case 'widgets': return <WidgetZone zone={String(p.zone)} className="front-page-featured" />;
    case 'divider': return <hr className={`fp-divider fp-divider--${p.style}`} />;
    default: return null;
  }
}

function moreHref(s?: StorySource): string | null {
  if (s?.kind === 'category' && s.value) return `/categories/${s.value}`;
  if (s?.kind === 'tag' && s.value) return `/tags/${s.value}`;
  if (s?.kind === 'type' && s.value === 'review') return '/categories/reviews';
  return null;
}

function SectionShell({ title, more, children }: { title?: string; more?: string | null; children: ReactNode }) {
  return (
    <section className="fp-block" aria-label={title || undefined}>
      {title && (
        <div className="fp-head">
          <h2 className="section-title">{title}</h2>
          {more && <Link to={more} className="fp-more">See all →</Link>}
        </div>
      )}
      {children}
    </section>
  );
}

function Byline({ post, relative }: { post: PostSummary; relative?: boolean }) {
  const { date_format, timezone } = useSiteSettings();
  return (
    <p className="story-byline">
      {authorName(post) && <span className="story-author">{authorName(post)}</span>}
      {post.publishedAt && <time dateTime={post.publishedAt}>{relative ? timeAgo(post.publishedAt) : formatDate(post.publishedAt, date_format, timezone)}</time>}
    </p>
  );
}

function Lead({ lead, rail, props, first }: { lead: PostSummary | null; rail: PostSummary[]; props: Props; first: boolean }) {
  if (!lead) return null;
  const cat = lead.categories[0]?.category;
  const href = postPath(lead);
  const Title = first ? 'h1' : 'h2';
  return (
    <section className={`lead${props.rail === 'none' || rail.length === 0 ? ' lead--solo' : ''}`} aria-label="Top story">
      <article className="lead-story">
        <Link to={href} className="lead-media" tabIndex={-1} aria-hidden="true">
          <StoryImage post={lead} className="story-media--lead" />
        </Link>
        <div className="lead-body">
          {cat && <Tape category={cat} />}
          <Title className="lead-title"><Link to={href}>{lead.title}</Link></Title>
          {lead.excerpt && <p className="lead-excerpt">{plain(lead.excerpt)}</p>}
          <Byline post={lead} />
        </div>
      </article>
      {rail.length > 0 && (
        <aside className={`lead-rail${props.rail === 'list' ? ' lead-rail--plain' : ''}`} aria-label={props.railTitle || 'Latest'}>
          <h2 className="rail-title">{props.railTitle || 'Latest'}</h2>
          <ol className="rail-list">
            {rail.map((p) => (
              <li key={p.id} className="rail-item">
                <Link to={postPath(p)} className="rail-link">
                  <span className="rail-text">
                    <span className="rail-headline">{p.title}</span>
                    <span className="rail-meta">
                      {p.categories[0]?.category.name}
                      {p.publishedAt && <time dateTime={p.publishedAt}>{timeAgo(p.publishedAt)}</time>}
                    </span>
                  </span>
                  {props.rail !== 'list' && <StoryImage post={p} className="story-media--thumb" />}
                </Link>
              </li>
            ))}
          </ol>
        </aside>
      )}
    </section>
  );
}

function Spotlight({ story, props, first }: { story: PostSummary; props: Props; first: boolean }) {
  const cat = story.categories[0]?.category;
  const Title = first ? 'h1' : 'h2';
  return (
    <article className={`fp-spotlight fp-spotlight--${props.height}`}>
      <Link to={postPath(story)} className="fp-spotlight-media" tabIndex={-1} aria-hidden="true">
        <StoryImage post={story} className="story-media--spotlight" />
      </Link>
      <div className="fp-spotlight-body">
        {cat && <Tape category={cat} />}
        <Title className="fp-spotlight-title"><Link to={postPath(story)}>{story.title}</Link></Title>
        {props.showExcerpt && story.excerpt && <p className="fp-spotlight-excerpt">{plain(story.excerpt)}</p>}
        <Byline post={story} />
      </div>
    </article>
  );
}

function Grid({ title, stories, columns, showExcerpt = true, more }: { title?: string; stories?: PostSummary[]; columns?: string; showExcerpt?: boolean; more?: string | null }) {
  if (!stories?.length) return null;
  return (
    <SectionShell title={title} more={more}>
      <div className={`post-grid fp-cols-${columns ?? '3'}${showExcerpt ? '' : ' fp-no-excerpt'}`}>
        {stories.map((s) => <PostCard key={s.id} post={s} />)}
      </div>
    </SectionShell>
  );
}

function Magazine({ title, stories, more }: { title?: string; stories: PostSummary[]; more?: string | null }) {
  if (!stories.length) return null;
  const [big, ...small] = stories;
  return (
    <SectionShell title={title} more={more}>
      <div className="fp-magazine">
        <div className="fp-magazine-main"><PostCard post={big} /></div>
        <div className="fp-magazine-side">
          {small.map((s) => (
            <article key={s.id} className="fp-mini">
              <Link to={postPath(s)} className="fp-mini-media" tabIndex={-1} aria-hidden="true"><StoryImage post={s} className="story-media--thumb" /></Link>
              <div>
                {s.categories[0] && <Tape category={s.categories[0].category} />}
                <h3 className="fp-mini-title"><Link to={postPath(s)}>{s.title}</Link></h3>
                <Byline post={s} relative />
              </div>
            </article>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

function HeadlineList({ title, stories, columns, numbered, thumbs }: { title?: string; stories: PostSummary[]; columns?: string; numbered?: boolean; thumbs?: boolean }) {
  if (!stories.length) return null;
  const Tag = numbered ? 'ol' : 'ul';
  return (
    <SectionShell title={title}>
      <Tag className={`fp-list fp-list--cols-${columns ?? '1'}${numbered ? ' fp-list--numbered' : ''}`}>
        {stories.map((s) => (
          <li key={s.id} className="fp-list-item">
            <Link to={postPath(s)} className="fp-list-link">
              {thumbs && <StoryImage post={s} className="story-media--thumb" />}
              <span>
                <span className="fp-list-title">{s.title}</span>
                <span className="rail-meta">{s.categories[0]?.category.name}{s.publishedAt && <time dateTime={s.publishedAt}>{timeAgo(s.publishedAt)}</time>}</span>
              </span>
            </Link>
          </li>
        ))}
      </Tag>
    </SectionShell>
  );
}

function SectionFronts({ columns }: { columns: { category: { name: string; slug: string; icon?: string | null; iconSvg?: string | null }; stories: PostSummary[] }[] }) {
  const filled = columns.filter((c) => c.stories.length);
  if (!filled.length) return null;
  return (
    <section className={`fp-fronts fp-cols-${Math.min(4, filled.length)}`} aria-label="Sections">
      {filled.map(({ category, stories }) => {
        const [top, ...rest] = stories;
        return (
          <div key={category.slug} className="fp-front">
            <h2 className="fp-front-title">
              <Link to={`/categories/${category.slug}`}><CategoryIcon icon={category.icon} iconSvg={category.iconSvg} />{category.name}</Link>
            </h2>
            <Link to={postPath(top)} className="fp-front-media" tabIndex={-1} aria-hidden="true"><StoryImage post={top} className="story-media--card" /></Link>
            <h3 className="fp-front-lead"><Link to={postPath(top)}>{top.title}</Link></h3>
            <ul className="fp-front-list">
              {rest.map((s) => <li key={s.id}><Link to={postPath(s)}>{s.title}</Link></li>)}
            </ul>
            <Link to={`/categories/${category.slug}`} className="fp-more">More {category.name} →</Link>
          </div>
        );
      })}
    </section>
  );
}

function LatestFeed({ title, first, exclude, columns, pageSize, loadMore }: { title?: string; first: PostSummary[]; exclude: number[]; columns?: string; pageSize: number; loadMore?: boolean }) {
  const [posts, setPosts] = useState(first);
  const [page, setPage] = useState(1);
  const [done, setDone] = useState(first.length < pageSize);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPosts(first); setPage(1); setDone(first.length < pageSize); }, [first, pageSize]);

  async function more() {
    setBusy(true);
    try {
      // Walk the plain latest list and skip anything already on the page.
      const shown = new Set([...exclude, ...posts.map((p) => p.id)]);
      let next = page;
      const add: PostSummary[] = [];
      let pages = Infinity;
      while (add.length < pageSize && next < pages) {
        next += 1;
        const r = await fetchPosts({ page: next, limit: pageSize });
        pages = r.pagination.pages;
        for (const p of r.items) if (!shown.has(p.id)) { shown.add(p.id); add.push(p); }
        if (r.items.length === 0) break;
      }
      setPosts((cur) => [...cur, ...add]);
      setPage(next);
      if (next >= pages || add.length === 0) setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (!posts.length) return null;
  return (
    <section className="post-feed fp-block" aria-label={title || 'Latest stories'}>
      {title && <h2 className="section-title">{title}</h2>}
      <div className={`post-grid fp-cols-${columns ?? '3'}`}>
        {posts.map((p) => <PostCard key={p.id} post={p} />)}
      </div>
      {loadMore && !done && (
        <button type="button" className="load-more" onClick={more} disabled={busy}>{busy ? 'Loading…' : 'Load more stories'}</button>
      )}
    </section>
  );
}

function Interviews({ title, stories }: { title?: string; stories: PostSummary[] }) {
  if (!stories.length) return null;
  return (
    <SectionShell title={title}>
      <div className={`fp-interviews fp-cols-${Math.min(3, stories.length)}`}>
        {stories.map((s) => (
          <article key={s.id} className="fp-interview">
            <Link to={postPath(s)} className="fp-interview-media" tabIndex={-1} aria-hidden="true"><StoryImage post={s} className="story-media--card" /></Link>
            <div className="fp-interview-body">
              <span className="fp-interview-kicker">{s.articleType === 'qna' ? 'Q&A' : 'Interview'}</span>
              <h3 className="fp-interview-title"><Link to={postPath(s)}>{s.title}</Link></h3>
              {s.excerpt && <p className="story-excerpt">{plain(s.excerpt)}</p>}
            </div>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}

interface EventItem { id: number; title: string; slug: string; excerpt: string | null; startAt: string; type: string; featuredImage: string | null; venueName: string | null; venueCity: string | null; timezone: string }

function Events({ title, events }: { title?: string; events: EventItem[] }) {
  if (!events.length) return null;
  return (
    <SectionShell title={title} more="/events">
      <div className={`fp-events fp-cols-${Math.min(4, Math.max(2, events.length))}`}>
        {events.map((e) => {
          const d = new Date(e.startAt);
          const tz = e.timezone || undefined;
          return (
            <Link key={e.id} to={`/events/${e.slug}`} className="fp-event">
              <span className="fp-event-media">
                {e.featuredImage ? <img src={resolveMediaUrl(e.featuredImage)} alt="" loading="lazy" /> : null}
                <span className="fp-event-date" aria-hidden="true">
                  <span>{d.toLocaleString('en', { month: 'short', timeZone: tz })}</span>
                  <strong>{d.toLocaleString('en', { day: 'numeric', timeZone: tz })}</strong>
                </span>
              </span>
              <span className="fp-event-title">{e.title}</span>
              <span className="fp-event-meta">
                {d.toLocaleString('en', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: tz })}
                {' · '}{e.type === 'online' ? 'Online' : [e.venueName, e.venueCity].filter(Boolean).join(', ')}
              </span>
            </Link>
          );
        })}
      </div>
    </SectionShell>
  );
}

interface CelebrationItem { id: number; name: string; type: 'birthday' | 'remembrance'; year: number | null; photo: string | null; photoFocus?: string | null; photoZoom?: number | null; message: string | null }

function OnThisDay({ title, items }: { title?: string; items: CelebrationItem[] }) {
  if (!items.length) return null;
  const year = new Date().getFullYear();
  return (
    <SectionShell title={title}>
      <ul className="fp-otd">
        {items.map((c) => (
          <li key={c.id} className="fp-otd-item">
            {c.photo ? <span className="fp-otd-photo"><img src={resolveMediaUrl(c.photo)} alt="" loading="lazy" style={framingStyle(c.photoFocus, c.photoZoom)} /></span> : <span className="fp-otd-ph" aria-hidden="true">{c.type === 'birthday' ? '🎂' : '🕯️'}</span>}
            <span>
              <strong>{c.name}</strong>
              <span>{c.type === 'birthday' ? (c.year ? `Born ${c.year} · would be ${year - c.year}` : 'Birthday') : (c.year ? `Died ${c.year} · ${year - c.year} years on` : 'Remembered today')}</span>
            </span>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}

function Banner({ props }: { props: Props }) {
  const style = props.style === 'image' && !props.image ? 'dark' : props.style;
  const inner = (
    <>
      {props.heading && <h2 className="fp-banner-heading">{props.heading}</h2>}
      {props.text && <p className="fp-banner-text">{props.text}</p>}
      {props.buttonLabel && props.buttonUrl && <span className="fp-banner-button">{props.buttonLabel}</span>}
    </>
  );
  const bg = style === 'image' && props.image ? { backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.72), rgba(0,0,0,0.25)), url(${resolveMediaUrl(props.image)})` } : undefined;
  const cls = `fp-banner fp-banner--${style}`;
  if (props.buttonUrl) {
    return /^https?:/i.test(props.buttonUrl)
      ? <a className={cls} style={bg} href={props.buttonUrl} target="_blank" rel="noopener noreferrer">{inner}</a>
      : <Link className={cls} style={bg} to={props.buttonUrl}>{inner}</Link>;
  }
  return <div className={cls} style={bg}>{inner}</div>;
}

function TextBlock({ props }: { props: Props }) {
  const paras = String(props.body || '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  return (
    <section className={`fp-text fp-text--${props.align}`}>
      {props.heading && <h2 className="fp-text-heading">{props.heading}</h2>}
      {paras.map((t, i) => <p key={i}>{t}</p>)}
    </section>
  );
}
