import { useEffect, useRef, useState } from 'react';
import { fetchPublicPoll, submitVote, PublicPoll, PollOptionResult } from '../services/polls';
import './PollWidget.css';

function getVoterId(): string {
  const key = 'headtilts_voter_id';
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return id;
}

interface Props {
  slug: string;
}

export function PollWidget({ slug }: Props) {
  const [poll, setPoll] = useState<PublicPoll | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const voterId = useRef(getVoterId());

  useEffect(() => {
    setLoading(true);
    fetchPublicPoll(slug, voterId.current)
      .then((p) => { setPoll(p); if (p.hasVoted) setSelected(p.options.filter((o) => o.isMyVote).map((o) => o.id)); })
      .catch(() => setError('Failed to load poll'))
      .finally(() => setLoading(false));
  }, [slug]);

  function toggle(id: number) {
    if (!poll) return;
    if (poll.voteMode === 'single') {
      setSelected([id]);
    } else {
      setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    }
  }

  async function handleVote() {
    if (!poll || selected.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const updated = await submitVote(slug, selected, voterId.current);
      setPoll(updated);
    } catch (e: unknown) {
      setError((e as Error).message || 'Failed to submit vote');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="poll-widget poll-widget--loading"><div className="poll-spinner" /></div>;
  if (error && !poll) return <div className="poll-widget poll-widget--error">{error}</div>;
  if (!poll) return null;

  const isClosed = poll.status === 'closed';
  const canVote = !poll.hasVoted && !isClosed && poll.status === 'open';
  const canChange = poll.hasVoted && poll.allowVoteChange && !isClosed;
  const showForm = canVote || canChange;

  return (
    <div className={`poll-widget ${isClosed ? 'poll-widget--closed' : ''}`}>
      {poll.featuredImage && (
        <img src={poll.featuredImage} alt="" className="poll-featured" />
      )}
      <div className="poll-body">
        <div className="poll-meta">
          <span className={`poll-status poll-status--${poll.status}`}>
            {isClosed ? 'Poll closed' : poll.status === 'open' ? 'Poll open' : poll.status}
          </span>
          <span className="poll-total">{poll.totalVotes} vote{poll.totalVotes !== 1 ? 's' : ''}</span>
        </div>

        <p className="poll-question">{poll.question}</p>
        {poll.description && <p className="poll-description">{poll.description}</p>}

        <div className="poll-options">
          {poll.options.map((opt) => (
            <PollOptionItem
              key={opt.id}
              option={opt}
              showForm={showForm}
              showResults={poll.showResults}
              isSelected={selected.includes(opt.id)}
              voteMode={poll.voteMode}
              onToggle={() => toggle(opt.id)}
            />
          ))}
        </div>

        {error && <p className="poll-error">{error}</p>}

        {showForm && (
          <button
            className="poll-vote-btn"
            onClick={handleVote}
            disabled={submitting || selected.length === 0}
          >
            {submitting ? 'Submitting…' : poll.hasVoted ? 'Change vote' : 'Submit vote'}
          </button>
        )}

        {poll.hasVoted && !canChange && (
          <p className="poll-voted-msg">You've voted</p>
        )}
      </div>
    </div>
  );
}

function PollOptionItem({
  option, showForm, showResults, isSelected, voteMode, onToggle,
}: {
  option: PollOptionResult;
  showForm: boolean;
  showResults: boolean;
  isSelected: boolean;
  voteMode: string;
  onToggle: () => void;
}) {
  const pct = option.percentage ?? 0;
  return (
    <div
      className={`poll-option ${isSelected ? 'poll-option--selected' : ''} ${option.isMyVote && !showForm ? 'poll-option--my-vote' : ''} ${showForm ? 'poll-option--clickable' : ''}`}
      onClick={showForm ? onToggle : undefined}
      role={showForm ? 'button' : undefined}
      tabIndex={showForm ? 0 : undefined}
      onKeyDown={showForm ? (e) => e.key === 'Enter' && onToggle() : undefined}
    >
      {showForm && (
        <span className="poll-option-control">
          {voteMode === 'multiple'
            ? <span className={`poll-checkbox ${isSelected ? 'poll-checkbox--checked' : ''}`} />
            : <span className={`poll-radio ${isSelected ? 'poll-radio--checked' : ''}`} />}
        </span>
      )}
      <span className="poll-option-text">{option.text}</span>
      {showResults && option.percentage !== null && (
        <span className="poll-option-pct">{option.percentage}%</span>
      )}
      {showResults && (
        <div className="poll-option-bar">
          <div className="poll-option-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
