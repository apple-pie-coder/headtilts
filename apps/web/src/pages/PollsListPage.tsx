import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchPublicPolls, PublicPollSummary } from '../services/polls';
import { useLayout } from '../context/LayoutContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { applySeo, resetSeo } from '../utils/seo';
import './PollsListPage.css';

const PAGE_SIZE = 12;

function PollCard({ poll }: { poll: PublicPollSummary }) {
  const closes = poll.endsAt ? new Date(poll.endsAt) : null;
  const voteCount = poll._count?.votes ?? 0;
  return (
    <Link to={`/polls/${poll.slug}`} className="polls-card">
      {poll.featuredImage && (
        <img src={poll.featuredImage} alt="" className="polls-card-img" />
      )}
      <div className="polls-card-body">
        <div className="polls-card-meta">
          <span className={`polls-card-status polls-card-status--${poll.status}`}>
            {poll.status === 'open' ? 'Open' : poll.status}
          </span>
          <span className="polls-card-votes">{voteCount} vote{voteCount !== 1 ? 's' : ''}</span>
        </div>
        <h2 className="polls-card-title">{poll.title}</h2>
        <p className="polls-card-question">{poll.question}</p>
        {poll.description && <p className="polls-card-desc">{poll.description}</p>}
        {closes && (
          <p className="polls-card-closes">
            Closes {closes.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function PollsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const [polls, setPolls] = useState<PublicPollSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { setShowSidebar } = useLayout();
  const { site_title } = useSiteSettings();

  useEffect(() => {
    setShowSidebar(false);
    return () => setShowSidebar(true);
  }, [setShowSidebar]);

  useEffect(() => {
    applySeo({
      title: `Polls — ${site_title}`,
      description: 'Vote on the latest polls and see what the community thinks.',
      ogType: 'website',
    });
    return () => resetSeo(site_title);
  }, [site_title]);

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchPublicPolls(page, PAGE_SIZE)
      .then(({ items, total: t }) => { setPolls(items); setTotal(t); })
      .catch(() => setError('Failed to load polls'))
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="polls-list-page">
      <div className="polls-list-header">
        <h1 className="polls-list-title">Polls</h1>
        <p className="polls-list-subtitle">Have your say — vote on active polls below.</p>
      </div>

      {loading && (
        <div className="polls-list-loading">
          <div className="polls-list-spinner" />
        </div>
      )}

      {error && <p className="polls-list-error">{error}</p>}

      {!loading && !error && polls.length === 0 && (
        <p className="polls-list-empty">No open polls at the moment. Check back soon.</p>
      )}

      {!loading && polls.length > 0 && (
        <div className="polls-grid">
          {polls.map((poll) => <PollCard key={poll.id} poll={poll} />)}
        </div>
      )}

      {totalPages > 1 && (
        <div className="polls-pagination">
          <button
            className="polls-pagination-btn"
            disabled={page <= 1}
            onClick={() => setSearchParams({ page: String(page - 1) })}
          >
            Previous
          </button>
          <span className="polls-pagination-info">Page {page} of {totalPages}</span>
          <button
            className="polls-pagination-btn"
            disabled={page >= totalPages}
            onClick={() => setSearchParams({ page: String(page + 1) })}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
