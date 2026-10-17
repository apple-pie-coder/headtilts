import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPosts } from '../services/posts';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { formatDate, timeAgo } from '../utils/date';
import { PostSummary } from '../types';
import { postPath } from '../utils/permalink';
import { authorName, plain, StoryImage } from './PostCard';
import { Tape } from './Tape';

/** Ids shown in the lead block, so the feed below can skip them. */
export type LeadIds = Set<number>;

/**
 * Front page lead: the newest featured story, big, beside a rail of headlines.
 * The rail lists the other featured stories when there are some, otherwise the
 * latest stories — so the block is never empty while anything is published.
 */
export function FrontPageHero({ onShown }: { onShown?: (ids: LeadIds) => void }) {
  const { date_format, timezone } = useSiteSettings();
  const [lead, setLead] = useState<PostSummary | null>(null);
  const [rail, setRail] = useState<PostSummary[]>([]);
  const [railTitle, setRailTitle] = useState('Latest');

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPosts({ featured: true, limit: 5 }), fetchPosts({ featured: false, limit: 6 })])
      .then(([featured, latest]) => {
        if (cancelled) return;
        const top = featured.items[0] ?? latest.items[0] ?? null;
        const more = featured.items.length >= 2 ? featured.items.slice(1, 5) : latest.items.filter((p) => p.id !== top?.id).slice(0, 5);
        setLead(top);
        setRail(more);
        setRailTitle(featured.items.length >= 2 ? 'Featured' : 'Latest');
        onShown?.(new Set([top?.id, ...more.map((p) => p.id)].filter((id): id is number => id != null)));
      })
      .catch(() => { if (!cancelled) onShown?.(new Set()); });
    return () => { cancelled = true; };
  }, []);

  if (!lead) return <div className="lead lead--loading" aria-hidden="true" />;

  const cat = lead.categories[0]?.category;
  const href = postPath(lead);
  return (
    <section className="lead" aria-label="Top stories">
      <article className="lead-story">
        <Link to={href} className="lead-media" tabIndex={-1} aria-hidden="true">
          <StoryImage post={lead} className="story-media--lead" />
        </Link>
        <div className="lead-body">
          {cat && <Tape category={cat} />}
          <h1 className="lead-title"><Link to={href}>{lead.title}</Link></h1>
          {lead.excerpt && <p className="lead-excerpt">{plain(lead.excerpt)}</p>}
          <p className="story-byline">
            {authorName(lead) && <span className="story-author">{authorName(lead)}</span>}
            {lead.publishedAt && <time dateTime={lead.publishedAt}>{formatDate(lead.publishedAt, date_format, timezone)}</time>}
          </p>
        </div>
      </article>

      {rail.length > 0 && (
        <aside className="lead-rail" aria-labelledby="lead-rail-title">
          <h2 id="lead-rail-title" className="rail-title">{railTitle}</h2>
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
                  <StoryImage post={p} className="story-media--thumb" />
                </Link>
              </li>
            ))}
          </ol>
        </aside>
      )}
    </section>
  );
}
