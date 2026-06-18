import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faAngleRight, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { fetchWidgetZone, fetchCalendar } from '../services/taxonomy';
import { resolveMediaUrl } from '../services/api';
import { sanitizeHtml } from '../utils/sanitize';
import { postPath } from '../utils/permalink';
import { CalendarMonth, PublicWidget, PublicWidgetZone } from '../types';
import { PollWidget } from './PollWidget';
import { PollCarousel } from './PollCarousel';

interface PostItem { id: number; title: string; slug: string; publishedAt: string | null; excerpt: string | null }
interface CategoryItem { id: number; name: string; slug: string; _count?: { posts: number } }
interface TagItem { id: number; name: string; slug: string }

interface FeaturedPostItem {
  id: number;
  title: string;
  slug: string;
  publishedAt: string | null;
  excerpt: string | null;
  featuredImage: string | null;
  isFeatured: boolean;
  categories: { category: { id: number; name: string; slug: string } }[];
}

interface CompactPostItem {
  id: number;
  title: string;
  slug: string;
  publishedAt: string | null;
  featuredImage: string | null;
}

function TextWidget({ widget }: { widget: PublicWidget }) {
  const content = (widget.config.content as string) || '';
  if (!content) return null;
  return (
    <div className="widget">
      {widget.title && <h3 className="widget-title">{widget.title}</h3>}
      <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
    </div>
  );
}

interface MenuLink { label: string; url: string }

function MenuWidget({ widget }: { widget: PublicWidget }) {
  const items = (widget.data as MenuLink[]) || [];
  if (items.length === 0) return null;
  return (
    <div className="widget">
      {widget.title && <h3 className="widget-title">{widget.title}</h3>}
      <ul className="widget-list">
        {items.map((item, i) => (
          <li key={i}>
            {item.url.startsWith('/') ? (
              <Link to={item.url} className="widget-link">{item.label}</Link>
            ) : (
              <a href={item.url} className="widget-link" target="_blank" rel="noopener noreferrer">{item.label}</a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RecentPostsWidget({ widget }: { widget: PublicWidget }) {
  const posts = (widget.data as PostItem[]) || [];
  if (posts.length === 0) return null;
  return (
    <div className="widget">
      {widget.title && <h3 className="widget-title">{widget.title}</h3>}
      <ul className="widget-list">
        {posts.map((post) => (
          <li key={post.id}>
            <Link to={postPath(post)} className="widget-link">{post.title}</Link>
            {post.publishedAt && (
              <span className="widget-meta">
                {new Date(post.publishedAt).toLocaleDateString()}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeaturedCard({ post }: { post: FeaturedPostItem }) {
  return (
    <article className="fp-featured-card">
      <Link to={postPath(post)} className="fp-featured-card-image-wrap">
        {post.featuredImage ? (
          <img src={resolveMediaUrl(post.featuredImage)} alt={post.title} className="fp-featured-card-image" />
        ) : (
          <span className="fp-featured-card-image fp-featured-card-image--placeholder" />
        )}
        {post.categories[0] && (
          <span className="fp-featured-card-cat">{post.categories[0].category.name}</span>
        )}
      </Link>
      <div className="fp-featured-card-body">
        <h3 className="fp-featured-card-title">
          <Link to={postPath(post)}>{post.title}</Link>
        </h3>
        {post.publishedAt && (
          <span className="fp-featured-card-date">{new Date(post.publishedAt).toLocaleDateString()}</span>
        )}
      </div>
    </article>
  );
}

function FeaturedPostsWidget({ widget }: { widget: PublicWidget }) {
  const posts = (widget.data as FeaturedPostItem[]) || [];
  if (posts.length === 0) return null;
  return (
    <section className="fp-section">
      {widget.title && <h2 className="fp-section-title">{widget.title}</h2>}
      <div className="fp-featured-grid">
        {posts.map((post) => <FeaturedCard key={post.id} post={post} />)}
      </div>
    </section>
  );
}

interface CategoryGridData {
  category: { id: number; name: string; slug: string } | null;
  posts: FeaturedPostItem[];
}

function CategoryGridWidget({ widget }: { widget: PublicWidget }) {
  const { category, posts } = (widget.data as CategoryGridData) || { category: null, posts: [] };
  if (!posts || posts.length === 0) return null;
  const title = widget.title || category?.name;
  return (
    <section className="fp-section">
      <div className="fp-section-header">
        {title && <h2 className="fp-section-title">{title}</h2>}
        {category && (
          <Link to={`/categories/${category.slug}`} className="fp-section-viewall">View all <FontAwesomeIcon icon={faAngleRight} /></Link>
        )}
      </div>
      <div className="fp-featured-grid">
        {posts.map((post) => <FeaturedCard key={post.id} post={post} />)}
      </div>
    </section>
  );
}

function CompactPostsWidget({ widget }: { widget: PublicWidget }) {
  const posts = (widget.data as CompactPostItem[]) || [];
  if (posts.length === 0) return null;
  return (
    <section className="fp-section">
      {widget.title && <h2 className="fp-section-title">{widget.title}</h2>}
      <ol className="fp-compact-list">
        {posts.map((post, idx) => (
          <li key={post.id} className="fp-compact-item">
            <span className="fp-compact-rank">{idx + 1}</span>
            <Link to={postPath(post)} className="fp-compact-thumb-wrap">
              {post.featuredImage ? (
                <img src={resolveMediaUrl(post.featuredImage)} alt="" className="fp-compact-thumb" />
              ) : (
                <span className="fp-compact-thumb fp-compact-thumb--placeholder" />
              )}
            </Link>
            <div className="fp-compact-content">
              <h3 className="fp-compact-title">
                <Link to={postPath(post)}>{post.title}</Link>
              </h3>
              {post.publishedAt && (
                <span className="fp-compact-date">{new Date(post.publishedAt).toLocaleDateString()}</span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CategoriesWidget({ widget }: { widget: PublicWidget }) {
  const cats = (widget.data as CategoryItem[]) || [];
  const showCount = Boolean(widget.config.showCount ?? true);
  const hideEmpty = Boolean(widget.config.hideEmpty);
  const visible = hideEmpty ? cats.filter((c) => (c._count?.posts ?? 0) > 0) : cats;
  if (visible.length === 0) return null;
  return (
    <div className="widget">
      {widget.title && <h3 className="widget-title">{widget.title}</h3>}
      <ul className="widget-list">
        {visible.map((cat) => (
          <li key={cat.id} className="widget-list-row">
            <Link to={`/categories/${cat.slug}`} className="widget-link">{cat.name}</Link>
            {showCount && cat._count && (
              <span className="widget-count">{cat._count.posts}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TagsWidget({ widget }: { widget: PublicWidget }) {
  const tags = (widget.data as TagItem[]) || [];
  if (tags.length === 0) return null;
  return (
    <div className="widget">
      {widget.title && <h3 className="widget-title">{widget.title}</h3>}
      <div className="widget-tags">
        {tags.map((tag) => (
          <Link key={tag.id} to={`/tags/${tag.slug}`} className="widget-tag">
            {tag.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

interface TagCloudItem extends TagItem { _count: { posts: number } }

function TagCloudWidget({ widget }: { widget: PublicWidget }) {
  const tags = (widget.data as TagCloudItem[]) || [];
  if (tags.length === 0) return null;
  const showCount = Boolean(widget.config.showCount);
  const counts = tags.map((t) => t._count.posts);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const range = max - min || 1;
  // Map post count to font size between 0.75rem and 1.5rem
  function fontSize(count: number) {
    return (0.75 + ((count - min) / range) * 0.75).toFixed(3) + 'rem';
  }
  return (
    <div className="widget">
      {widget.title && <h3 className="widget-title">{widget.title}</h3>}
      <div className="widget-tag-cloud">
        {tags.map((tag) => (
          <Link
            key={tag.id}
            to={`/tags/${tag.slug}`}
            className="widget-tag-cloud-item"
            style={{ fontSize: fontSize(tag._count.posts) }}
            title={`${tag._count.posts} post${tag._count.posts !== 1 ? 's' : ''}`}
          >
            {tag.name}{showCount && <sup className="widget-tag-cloud-count">{tag._count.posts}</sup>}
          </Link>
        ))}
      </div>
    </div>
  );
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_INITIALS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function CalendarWidget({ widget }: { widget: PublicWidget }) {
  const initial = widget.data as CalendarMonth | null;
  const [data, setData] = useState<CalendarMonth | null>(initial);
  const [loading, setLoading] = useState(false);

  if (!data) return null;

  const { year, month, weekStartsOn, days } = data;

  function navigate(target: { year: number; month: number } | null) {
    if (!target) return;
    setLoading(true);
    fetchCalendar(target.year, target.month)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  // Reorder weekday headers so the configured start day comes first
  const headers = Array.from({ length: 7 }, (_, i) => WEEKDAY_INITIALS[(weekStartsOn + i) % 7]);

  // getUTCDay of the 1st, shifted so the configured start day is column 0
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const leadingBlanks = (firstWeekday - weekStartsOn + 7) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const now = new Date();
  const isCurrentMonth = now.getUTCFullYear() === year && now.getUTCMonth() + 1 === month;
  const todayDate = now.getUTCDate();

  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="widget">
      {widget.title && <h3 className="widget-title">{widget.title}</h3>}
      <div className={`calendar-widget${loading ? ' calendar-widget--loading' : ''}`}>
        <div className="calendar-nav">
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={() => navigate(data.prev)}
            disabled={!data.prev || loading}
            aria-label="Previous month"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <span className="calendar-caption">{MONTH_NAMES[month - 1]} {year}</span>
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={() => navigate(data.next)}
            disabled={!data.next || loading}
            aria-label="Next month"
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
        <div className="calendar-grid" role="grid">
          {headers.map((h, i) => (
            <span key={`h-${i}`} className="calendar-head" role="columnheader">{h}</span>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <span key={`b-${i}`} className="calendar-cell calendar-cell--empty" />;
            const count = days[day] || 0;
            const isToday = isCurrentMonth && day === todayDate;
            const cls = `calendar-cell${isToday ? ' calendar-cell--today' : ''}`;
            if (count > 0) {
              return (
                <Link
                  key={day}
                  to={`/date/${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`}
                  className={`${cls} calendar-cell--has-posts`}
                  title={`${count} post${count === 1 ? '' : 's'}`}
                >
                  {day}
                </Link>
              );
            }
            return <span key={day} className={cls}>{day}</span>;
          })}
        </div>
      </div>
    </div>
  );
}

function SearchWidget({ widget }: { widget: PublicWidget }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) navigate(`/?search=${encodeURIComponent(q.trim())}`);
  }
  return (
    <div className="widget">
      {widget.title && <h3 className="widget-title">{widget.title}</h3>}
      <form onSubmit={submit} className="widget-search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="widget-search-input"
        />
        <button type="submit" className="widget-search-btn">Search</button>
      </form>
    </div>
  );
}

function renderWidget(widget: PublicWidget) {
  switch (widget.type) {
    case 'text':          return <TextWidget widget={widget} />;
    case 'menu':          return <MenuWidget widget={widget} />;
    case 'recent-posts':  return <RecentPostsWidget widget={widget} />;
    case 'featured-posts': return <FeaturedPostsWidget widget={widget} />;
    case 'latest-posts-compact': return <CompactPostsWidget widget={widget} />;
    case 'category-posts-grid': return <CategoryGridWidget widget={widget} />;
    case 'categories':    return <CategoriesWidget widget={widget} />;
    case 'tags':          return <TagsWidget widget={widget} />;
    case 'tag-cloud':     return <TagCloudWidget widget={widget} />;
    case 'calendar':      return <CalendarWidget widget={widget} />;
    case 'search':        return <SearchWidget widget={widget} />;
    case 'poll': {
      const slugs = Array.isArray(widget.data) ? (widget.data as string[]) : [];
      if (slugs.length === 0) return null;
      return <PollCarousel slugs={slugs} title={widget.title} />;
    }
    default:              return null;
  }
}

export function WidgetZone({ zone: zoneName, className }: { zone: string; className?: string }) {
  const [zone, setZone] = useState<PublicWidgetZone | null>(null);

  useEffect(() => {
    fetchWidgetZone(zoneName)
      .then(setZone)
      .catch(() => {});
  }, [zoneName]);

  if (!zone || zone.widgets.length === 0) return null;

  return (
    <aside className={`widget-zone ${className ?? ''}`}>
      {zone.widgets.map((widget) => (
        <div key={widget.id} className={widget.config.hideOnMobile ? 'widget-hide-mobile' : undefined}>
          {renderWidget(widget)}
        </div>
      ))}
    </aside>
  );
}
