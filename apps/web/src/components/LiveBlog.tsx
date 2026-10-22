import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { youtubeId, youtubeStart } from '@headtilts/shared';
import { get, resolveMediaUrl } from '../services/api';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { formatDate, formatTime } from '../utils/date';
import { YouTubePlayer } from './MediaPlayers';
import { RichContent } from './RichContent';
import type { LiveUpdate, PostFull } from '../types';
import './LiveBlog.css';

// How often an open page checks for new updates while coverage is live.
const POLL_MS = 30_000;

interface LiveFeed { liveEndedAt: string | null; updates: LiveUpdate[] }

/**
 * Keeps a live blog's updates current: polls while coverage is open and the
 * tab is visible, and stops once the newsroom ends coverage.
 */
export function useLiveFeed(post: PostFull) {
  const enabled = post.articleType === 'live';
  const [feed, setFeed] = useState<LiveFeed>({ liveEndedAt: post.liveEndedAt ?? null, updates: post.liveUpdates ?? [] });

  useEffect(() => {
    setFeed({ liveEndedAt: post.liveEndedAt ?? null, updates: post.liveUpdates ?? [] });
  }, [post]);

  const ended = Boolean(feed.liveEndedAt);
  useEffect(() => {
    if (!enabled || ended) return;
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      get<LiveFeed>(`/public/posts/${encodeURIComponent(post.slug)}/live`)
        .then((next) => { if (!cancelled) setFeed(next); })
        .catch(() => { /* keep what we have; try again next tick */ });
    };
    const timer = window.setInterval(refresh, POLL_MS);
    // Catch up straight away when the reader comes back to the tab.
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled, ended, post.slug]);

  return feed;
}

const URL_RE = /(https?:\/\/[^\s<>"]+)/g;

/** Plain text with bare links made clickable (no HTML is ever interpreted). */
function linkify(text: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 0) return part;
    // Leave sentence punctuation outside the link.
    const url = part.replace(/[.,;:!?)\]]+$/, '');
    return (
      <Fragment key={i}>
        <a href={url} target="_blank" rel="noopener noreferrer nofollow">{url}</a>{part.slice(url.length)}
      </Fragment>
    );
  });
}

function UpdateBody({ body, title }: { body: string; title: string }) {
  return (
    <>
      {body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p, i) => {
        // A YouTube link on its own becomes a player.
        const vid = /^\S+$/.test(p) ? youtubeId(p) : null;
        if (vid) {
          return <div key={i} className="live-video"><YouTubePlayer videoId={vid} title={title} start={youtubeStart(p)} /></div>;
        }
        return (
          <p key={i}>
            {p.split('\n').map((line, k) => <Fragment key={k}>{k > 0 && <br />}{linkify(line)}</Fragment>)}
          </p>
        );
      })}
    </>
  );
}

const authorName = (u: LiveUpdate) =>
  u.author ? [u.author.firstName, u.author.lastName].filter(Boolean).join(' ') || u.author.username : null;

export function LiveBlog({ feed, postTitle }: { feed: LiveFeed; postTitle: string }) {
  const { date_format, time_format, timezone } = useSiteSettings();
  const feedRef = useRef<HTMLElement>(null);
  const seen = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [unseen, setUnseen] = useState(0);

  // Highlight updates that arrive while the page is open; when the reader is
  // further down the page, offer a button back up instead of yanking them.
  useEffect(() => {
    const ids = feed.updates.map((u) => u.id);
    if (!seen.current) { seen.current = new Set(ids); return; }
    const added = ids.filter((id) => !seen.current!.has(id));
    ids.forEach((id) => seen.current!.add(id));
    if (!added.length) return;
    setFresh(new Set(added));
    const top = feedRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) setUnseen((n) => n + added.length);
  }, [feed.updates]);

  useEffect(() => {
    if (!unseen) return;
    const onScroll = () => { if ((feedRef.current?.getBoundingClientRect().top ?? 0) >= 0) setUnseen(0); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [unseen]);

  // Updates render after the page loads, so follow an #update-12 link by hand.
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !/^#update-\d+$/.test(window.location.hash)) return;
    const el = document.getElementById(window.location.hash.slice(1));
    if (el) { jumped.current = true; el.scrollIntoView(); }
  }, [feed.updates]);

  const stamp = useCallback((iso: string) => {
    const sameDay = formatDate(iso, 'Y-m-d', timezone) === formatDate(new Date().toISOString(), 'Y-m-d', timezone);
    return {
      time: formatTime(iso, time_format, timezone),
      day: sameDay ? null : formatDate(iso, date_format, timezone),
    };
  }, [date_format, time_format, timezone]);

  const pinned = feed.updates.filter((u) => u.pinned);
  const timeline = feed.updates.filter((u) => !u.pinned);
  const latest = feed.updates.reduce<string | null>((max, u) => (!max || u.createdAt > max ? u.createdAt : max), null);
  const live = !feed.liveEndedAt;

  const renderUpdate = (u: LiveUpdate) => {
    const s = stamp(u.createdAt);
    const by = authorName(u);
    return (
      <li key={u.id} id={`update-${u.id}`} className={`live-update${fresh.has(u.id) ? ' live-update--fresh' : ''}${u.pinned ? ' live-update--pinned' : ''}`}>
        <div className="live-update-time">
          <a href={`#update-${u.id}`} title="Link to this update"><time dateTime={u.createdAt}>{s.time}</time></a>
          {s.day && <span className="live-update-day">{s.day}</span>}
        </div>
        <div className="live-update-main">
          {u.pinned && <span className="live-update-pin">Pinned</span>}
          {u.headline && <h3 className="live-update-headline">{u.headline}</h3>}
          {u.body && (u.format === 'html'
            ? <RichContent html={u.body} className="live-update-body" />
            : <div className="live-update-body"><UpdateBody body={u.body} title={u.headline || postTitle} /></div>)}
          {u.image && <img className="live-update-img" src={resolveMediaUrl(u.image)} alt={u.headline ?? ''} loading="lazy" />}
          {by && <p className="live-update-by">{by}</p>}
        </div>
      </li>
    );
  };

  return (
    <section className="live" ref={feedRef} aria-labelledby="live-title">
      <header className="live-head">
        <h2 id="live-title" className="live-title">
          {live ? <span className="live-dot-label"><span className="live-dot" aria-hidden="true" />Live</span> : 'Live coverage has ended'}
        </h2>
        <p className="live-meta" aria-live="polite">
          {feed.updates.length} update{feed.updates.length === 1 ? '' : 's'}
          {latest && <> · last at {stamp(latest).time}{stamp(latest).day ? `, ${stamp(latest).day}` : ''}</>}
          {live && ' · new updates appear here automatically'}
        </p>
      </header>

      {!feed.updates.length && <p className="live-empty">Updates will appear here as they happen.</p>}

      {pinned.length > 0 && <ol className="live-list live-list--pinned">{pinned.map(renderUpdate)}</ol>}
      {timeline.length > 0 && <ol className="live-list">{timeline.map(renderUpdate)}</ol>}

      {unseen > 0 && (
        <button type="button" className="live-new" onClick={() => { feedRef.current?.scrollIntoView({ behavior: 'smooth' }); setUnseen(0); }}>
          ↑ {unseen} new update{unseen === 1 ? '' : 's'}
        </button>
      )}
    </section>
  );
}
