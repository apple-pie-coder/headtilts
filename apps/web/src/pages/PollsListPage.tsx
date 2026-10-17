import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPublicPolls, PublicPollSummary } from '../services/polls';
import { useLayout } from '../context/LayoutContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { applySeo, resetSeo } from '../utils/seo';
import { Breadcrumb } from '../components/Breadcrumb';
import { PollWidget } from '../components/PollWidget';
import { pollTiming, votesLabel } from '../utils/pollTime';
import './PollsListPage.css';

/** Open poll: question, how many answers, votes and time left. */
function OpenCard({ poll }: { poll: PublicPollSummary }) {
  const votes = poll.totalVotes ?? poll._count?.votes ?? 0;
  const timing = pollTiming(poll.status, poll.endsAt);
  return (
    <Link to={`/polls/${poll.slug}`} className="polls-card">
      <span className="polls-card-kicker">{poll.voteMode === 'multiple' ? 'Pick all that apply' : 'Pick one'} · {poll.optionCount ?? poll.options?.length ?? 0} answers</span>
      <h3 className="polls-card-q">{poll.question || poll.title}</h3>
      {poll.options && (
        <ul className="polls-card-options" aria-hidden="true">
          {poll.options.slice(0, 3).map((o, i) => <li key={i}>{o.text}</li>)}
          {poll.options.length > 3 && <li className="polls-card-more">+{poll.options.length - 3} more</li>}
        </ul>
      )}
      <span className="polls-card-foot">
        <span>{votesLabel(votes)}{timing && <> · {timing}</>}</span>
        <span className="polls-card-cta">Vote →</span>
      </span>
    </Link>
  );
}

/** Closed poll: the winner and the top results. */
function ResultCard({ poll }: { poll: PublicPollSummary }) {
  const votes = poll.totalVotes ?? poll._count?.votes ?? 0;
  const ranked = [...(poll.options ?? [])].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  const winner = ranked[0];
  return (
    <Link to={`/polls/${poll.slug}`} className="polls-result">
      <h3 className="polls-card-q">{poll.question || poll.title}</h3>
      {winner && votes > 0 ? (
        <p className="polls-result-winner"><span>Winner</span> {winner.text} <strong>{winner.percentage}%</strong></p>
      ) : (
        <p className="polls-result-winner polls-result-winner--none">No votes were cast.</p>
      )}
      <ul className="polls-result-bars" aria-hidden="true">
        {ranked.slice(0, 3).map((o, i) => (
          <li key={i}>
            <span className="polls-result-bar" style={{ width: `${o.percentage ?? 0}%` }} />
            <span className="polls-result-label">{o.text}</span>
            <span className="polls-result-pct">{o.percentage ?? 0}%</span>
          </li>
        ))}
      </ul>
      <span className="polls-card-foot"><span>{votesLabel(votes)} · {pollTiming('closed', poll.endsAt) ?? 'Closed'}</span></span>
    </Link>
  );
}

export default function PollsListPage() {
  const [open, setOpen] = useState<PublicPollSummary[] | null>(null);
  const [closed, setClosed] = useState<PublicPollSummary[] | null>(null);
  const [error, setError] = useState('');
  const { setShowSidebar } = useLayout();
  const { site_title } = useSiteSettings();

  useEffect(() => {
    setShowSidebar(false);
    return () => setShowSidebar(true);
  }, [setShowSidebar]);

  useEffect(() => {
    applySeo({ title: `Polls — ${site_title}`, description: 'Vote on the latest polls and see what the community thinks.', ogType: 'website' });
    return () => resetSeo(site_title);
  }, [site_title]);

  useEffect(() => {
    fetchPublicPolls(1, 30).then((r) => setOpen(r.items)).catch(() => { setOpen([]); setError('Polls couldn’t load. Please refresh.'); });
    fetchPublicPolls(1, 12, 'closed').then((r) => setClosed(r.items)).catch(() => setClosed([]));
  }, []);

  const [featured, ...rest] = open ?? [];
  const totalVotes = [...(open ?? []), ...(closed ?? [])].reduce((n, p) => n + (p.totalVotes ?? p._count?.votes ?? 0), 0);

  return (
    <div className="polls-hub">
      <Breadcrumb crumbs={[{ label: 'Home', href: '/' }, { label: 'Polls' }]} />
      <header className="page-hero">
        <p className="archive-label">Have your say</p>
        <h1 className="page-title">Polls</h1>
        <p className="archive-description">Vote on what the scene is talking about — results update the moment you vote.</p>
        {open && closed && (
          <p className="archive-count">
            {open.length} open · {closed.length} with results · {votesLabel(totalVotes)} cast
          </p>
        )}
      </header>

      {error && <div className="alert-error">{error}</div>}

      {open === null ? (
        <div className="polls-skeleton" aria-hidden="true" />
      ) : open.length === 0 ? (
        <div className="empty-state">
          <p><strong>No open polls right now.</strong> New ones go up with the big stories — meanwhile, see the results below or catch up on the <Link to="/">latest news</Link>.</p>
        </div>
      ) : (
        <>
          <section className="polls-featured" aria-label="Vote now">
            <div className="polls-featured-poll"><PollWidget slug={featured.slug} /></div>
            <div className="polls-featured-side">
              <h2>Vote now</h2>
              <p>The newest poll. Pick your answer and you’ll see how everyone else voted{featured.resultVisibility === 'after_close' ? ' when it closes' : ''}.</p>
              <ul className="polls-how">
                <li><strong>One vote each.</strong> {featured.resultVisibility === 'after_close' ? 'Results stay hidden until the poll closes.' : 'Results appear straight after you vote.'}</li>
                <li><strong>Share it.</strong> Every poll has its own page you can send to friends.</li>
              </ul>
            </div>
          </section>

          {rest.length > 0 && (
            <section aria-label="Open polls">
              <h2 className="section-title">Also open</h2>
              <div className="polls-grid">
                {rest.map((p) => <OpenCard key={p.id} poll={p} />)}
              </div>
            </section>
          )}
        </>
      )}

      {closed && closed.length > 0 && (
        <section aria-label="Results">
          <h2 className="section-title">Results</h2>
          <div className="polls-grid">
            {closed.map((p) => <ResultCard key={p.id} poll={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
