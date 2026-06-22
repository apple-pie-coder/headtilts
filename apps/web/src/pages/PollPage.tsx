import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PollWidget } from '../components/PollWidget';
import { SharePollModal } from '../components/SharePollModal';
import { ShareRecipientBanner } from '../components/ShareRecipientBanner';
import { Breadcrumb } from '../components/Breadcrumb';
import { useLayout } from '../context/LayoutContext';
import { fetchPublicPolls, PublicPoll, PublicPollSummary } from '../services/polls';
import './PollPage.css';

export default function PollPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { setShowSidebar } = useLayout();

  const [polls,       setPolls]       = useState<PublicPollSummary[]>([]);
  const [pollTitle,   setPollTitle]   = useState('');
  const [showShare,   setShowShare]   = useState(false);
  const [showBanner,  setShowBanner]  = useState(false);
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  // Show recipient banner once per token (session-scoped)
  const shareToken = searchParams.get('ref');
  useEffect(() => {
    if (!shareToken) return;
    const seenKey = `srb_seen_${shareToken}`;
    if (!sessionStorage.getItem(seenKey)) {
      setShowBanner(true);
    }
  }, [shareToken]);

  useEffect(() => {
    fetchPublicPolls(1, 100).then(({ items }) => setPolls(items)).catch(() => {});
  }, []);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [slug, polls]);

  useEffect(() => {
    return () => setShowSidebar(false);
  }, [setShowSidebar]);

  const handleLoaded = useCallback((poll: PublicPoll) => {
    setShowSidebar(Boolean(poll.showSidebar));
    setPollTitle(poll.title);
  }, [setShowSidebar]);

  function handleBannerDone() {
    if (shareToken) sessionStorage.setItem(`srb_seen_${shareToken}`, '1');
    setShowBanner(false);
  }

  if (!slug) return null;

  return (
    <>
      <Breadcrumb crumbs={[
        { label: 'Home', href: '/' },
        { label: 'Polls', href: '/polls' },
        ...(pollTitle ? [{ label: pollTitle }] : []),
      ]} />
      <div className="poll-page">
        {/* Sidebar */}
        <nav className="poll-page-sidebar">
          <p className="poll-page-sidebar-heading">All Polls</p>
          <div className="poll-page-sidebar-list">
            {polls.map((poll) => {
              const isActive = poll.slug === slug;
              return (
                <Link
                  key={poll.id}
                  ref={isActive ? activeRef : null}
                  to={`/polls/${poll.slug}`}
                  className={`poll-page-sidebar-item${isActive ? ' poll-page-sidebar-item--active' : ''}`}
                  onClick={(e) => { if (isActive) e.preventDefault(); }}
                >
                  <div className="poll-page-sidebar-item-top">
                    <span className={`poll-page-sidebar-status poll-page-sidebar-status--${poll.status}`}>
                      {poll.status === 'open' ? 'Open' : poll.status}
                    </span>
                    <span className="poll-page-sidebar-votes">{poll._count?.votes ?? 0} votes</span>
                  </div>
                  <span className="poll-page-sidebar-title">{poll.title}</span>
                  {poll.question && <span className="poll-page-sidebar-question">{poll.question}</span>}
                </Link>
              );
            })}
            {polls.length === 0 && <p className="poll-page-sidebar-empty">No other polls.</p>}
          </div>
          <Link to="/polls" className="poll-page-sidebar-all">View all polls →</Link>
        </nav>

        {/* Main */}
        <main className="poll-page-main">
          {showBanner && shareToken && (
            <ShareRecipientBanner token={shareToken} onDone={handleBannerDone} />
          )}
          {pollTitle && (
            <div className="poll-page-share-bar">
              <button className="poll-page-share-btn" onClick={() => setShowShare(true)}>
                <svg viewBox="0 0 16 16" fill="currentColor" width="15" height="15">
                  <path d="M11.5 3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm0 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM4.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm7.207-4.854a.5.5 0 0 1 0 .708l-6.5 3.75a.5.5 0 0 1-.5-.866l6.5-3.75a.5.5 0 0 1 .5.158zm-.5 5.5a.5.5 0 0 1-.5.158l-6.5-3.75a.5.5 0 1 1 .5-.866l6.5 3.75a.5.5 0 0 1 0 .708z"/>
                </svg>
                Share this poll
              </button>
            </div>
          )}
          <PollWidget key={slug} slug={slug} onLoaded={handleLoaded} />
        </main>
      </div>

      {showShare && slug && (
        <SharePollModal
          slug={slug}
          title={pollTitle}
          onClose={() => setShowShare(false)}
        />
      )}
    </>
  );
}
