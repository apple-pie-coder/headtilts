import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PollWidget } from '../components/PollWidget';
import { SharePollModal } from '../components/SharePollModal';
import { ShareRecipientBanner } from '../components/ShareRecipientBanner';
import { Breadcrumb } from '../components/Breadcrumb';
import { useLayout } from '../context/LayoutContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { applySeo, resetSeo } from '../utils/seo';
import { fetchPublicPolls, PublicPoll, PublicPollSummary } from '../services/polls';
import { pollTiming, votesLabel } from '../utils/pollTime';
import './PollPage.css';

export default function PollPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const { setShowSidebar } = useLayout();

  const [polls,       setPolls]       = useState<PublicPollSummary[]>([]);
  const [poll,        setPoll]        = useState<PublicPoll | null>(null);
  const [pollTitle,   setPollTitle]   = useState('');
  const { site_title } = useSiteSettings();
  const [showShare,   setShowShare]   = useState(false);
  const [showBanner,  setShowBanner]  = useState(false);

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
    return () => setShowSidebar(false);
  }, [setShowSidebar]);

  const handleLoaded = useCallback((poll: PublicPoll) => {
    setShowSidebar(Boolean(poll.showSidebar));
    setPollTitle(poll.title);
    setPoll(poll);
  }, [setShowSidebar]);

  useEffect(() => {
    if (!poll) return;
    applySeo({
      title: `${poll.question} — ${site_title}`,
      description: poll.description || `${poll.status === 'closed' ? 'See the results' : 'Cast your vote'}: ${poll.options.map((o) => o.text).join(' · ')}`,
      ogImage: poll.featuredImage,
    });
    return () => resetSeo(site_title);
  }, [poll, site_title]);

  function handleBannerDone() {
    if (shareToken) sessionStorage.setItem(`srb_seen_${shareToken}`, '1');
    setShowBanner(false);
  }

  if (!slug) return null;
  const others = polls.filter((p) => p.slug !== slug);

  return (
    <>
      <Breadcrumb crumbs={[
        { label: 'Home', href: '/' },
        { label: 'Polls', href: '/polls' },
        ...(pollTitle ? [{ label: pollTitle }] : []),
      ]} />
      <div className="poll-page">
        <main className="poll-page-main">
          {showBanner && shareToken && (
            <ShareRecipientBanner token={shareToken} onDone={handleBannerDone} />
          )}
          <PollWidget key={slug} slug={slug} variant="full" onLoaded={handleLoaded} onShare={() => setShowShare(true)} />
        </main>

        <aside className="poll-page-aside" aria-label="More polls">
          <h2 className="poll-page-aside-title">More polls</h2>
          {others.length === 0 ? (
            <p className="poll-page-empty">No other open polls right now.</p>
          ) : (
            <ul className="poll-page-list">
              {others.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link to={`/polls/${p.slug}`} className="poll-page-item">
                    <span className="poll-page-item-q">{p.question || p.title}</span>
                    <span className="poll-page-item-meta">
                      {votesLabel(p.totalVotes ?? p._count?.votes ?? 0)}
                      {pollTiming(p.status, p.endsAt) && <> · {pollTiming(p.status, p.endsAt)}</>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/polls" className="poll-page-all">All polls and results →</Link>
        </aside>
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
