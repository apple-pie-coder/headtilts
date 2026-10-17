import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { randomId } from '../utils/id';
import { resolveMediaUrl } from '../services/api';
import { fetchPublicPoll, submitVote, PublicPoll, PollOptionResult } from '../services/polls';
import { pollTiming, votesLabel } from '../utils/pollTime';
import { postPath } from '../utils/permalink';
import './PollWidget.css';

function getVoterId(): string {
  const key = 'headtilts_voter_id';
  try {
    let id = localStorage.getItem(key);
    if (!id) { id = randomId(); localStorage.setItem(key, id); }
    return id;
  } catch {
    return randomId();
  }
}

interface Props {
  slug: string;
  onLoaded?: (poll: PublicPoll) => void;
  /** "full" is the poll's own page: big question, picture, related article, share. */
  variant?: 'card' | 'full';
  onShare?: () => void;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function PollWidget({ slug, onLoaded, variant = 'card', onShare }: Props) {
  const [poll, setPoll] = useState<PublicPoll | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [changing, setChanging] = useState(false);
  const [justVoted, setJustVoted] = useState(false);
  const [error, setError] = useState('');
  const voterId = useRef(getVoterId());

  useEffect(() => {
    setLoading(true);
    fetchPublicPoll(slug, voterId.current)
      .then((p) => {
        setPoll(p);
        onLoaded?.(p);
        if (p.hasVoted) setSelected(p.options.filter((o) => o.isMyVote).map((o) => o.id));
      })
      .catch(() => setError('This poll couldn’t be loaded.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function toggle(id: number) {
    if (!poll) return;
    setError('');
    if (poll.voteMode === 'single') setSelected([id]);
    else setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleVote() {
    if (!poll || selected.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const updated = await submitVote(slug, selected, voterId.current);
      setPoll(updated);
      setChanging(false);
      setJustVoted(true);
    } catch (e: unknown) {
      setError((e as Error).message || 'Your vote didn’t go through. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className={`poll poll--${variant} poll--loading`} aria-busy="true"><div className="poll-skeleton" /></div>;
  if (!poll) return <div className={`poll poll--${variant} poll--error`}>{error || 'Poll not found.'}</div>;

  const isOpen = poll.status === 'open';
  const isClosed = poll.status === 'closed';
  const voting = isOpen && (!poll.hasVoted || changing);
  const results = poll.showResults && !voting;
  const max = Math.max(0, ...poll.options.map((o) => o.votes ?? 0));
  const timing = pollTiming(poll.status, poll.endsAt, poll.startsAt);
  const Question = variant === 'full' ? 'h1' : 'h3';
  const hiddenNote = !poll.showResults && (poll.hasVoted || !isOpen)
    ? poll.resultVisibility === 'after_close' ? 'Results are revealed when the poll closes.' : null
    : null;

  return (
    <section className={`poll poll--${variant}${isClosed ? ' poll--closed' : ''}${justVoted ? ' poll--just-voted' : ''}`} aria-label={`Poll: ${poll.question}`}>
      {variant === 'full' && poll.featuredImage && (
        <img src={resolveMediaUrl(poll.featuredImage)} alt="" className="poll-hero" />
      )}
      <div className="poll-inner">
        <div className="poll-top">
          <span className={`poll-pill poll-pill--${poll.status}`}>
            <span className="poll-dot" aria-hidden="true" />
            {isOpen ? 'Open poll' : isClosed ? 'Final results' : poll.status === 'scheduled' ? 'Coming soon' : 'Poll'}
          </span>
          <span className="poll-facts">
            {votesLabel(poll.totalVotes)}
            {timing && <> · {timing}</>}
          </span>
        </div>

        <Question className="poll-question">{poll.question}</Question>
        {poll.description && <p className="poll-description">{poll.description}</p>}
        {voting && (
          <p className="poll-hint" id={`poll-hint-${poll.id}`}>
            {poll.voteMode === 'multiple' ? 'Pick all that apply' : 'Pick one'}
            {!poll.showResults && poll.resultVisibility === 'after_vote' && ' — results appear after you vote'}
          </p>
        )}

        {voting ? (
          <div className="poll-choices" role={poll.voteMode === 'multiple' ? 'group' : 'radiogroup'} aria-describedby={`poll-hint-${poll.id}`}>
            {poll.options.map((opt, i) => {
              const on = selected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  role={poll.voteMode === 'multiple' ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  className={`poll-choice${on ? ' poll-choice--on' : ''}`}
                  onClick={() => toggle(opt.id)}
                >
                  <span className={`poll-mark poll-mark--${poll.voteMode === 'multiple' ? 'check' : 'letter'}`} aria-hidden="true">
                    {poll.voteMode === 'multiple' ? (on ? '✓' : '') : LETTERS[i] ?? '•'}
                  </span>
                  <span className="poll-choice-text">{opt.text}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <ol className="poll-results">
            {poll.options.map((opt) => (
              <ResultRow key={opt.id} option={opt} show={results} leading={results && (opt.votes ?? 0) === max && max > 0} closed={isClosed} />
            ))}
          </ol>
        )}

        {error && <p className="poll-error" role="alert">{error}</p>}

        <div className="poll-bottom">
          {voting && (
            <>
              <button type="button" className="poll-submit" onClick={handleVote} disabled={submitting || selected.length === 0}>
                {submitting ? 'Sending…' : changing ? 'Update my vote' : selected.length === 0 ? 'Choose an answer' : 'Vote'}
              </button>
              {changing && <button type="button" className="poll-link" onClick={() => setChanging(false)}>Cancel</button>}
            </>
          )}
          {!voting && poll.hasVoted && (
            <span className="poll-thanks">
              <span aria-hidden="true">✓</span> {justVoted ? 'Thanks — your vote is in' : 'You voted'}
              {isOpen && poll.allowVoteChange && <button type="button" className="poll-link" onClick={() => setChanging(true)}>Change vote</button>}
            </span>
          )}
          {!voting && !poll.hasVoted && isOpen === false && !isClosed && <span className="poll-thanks">Voting hasn’t opened yet.</span>}
          {hiddenNote && <span className="poll-note">{hiddenNote}</span>}
          <span className="poll-spacer" />
          {onShare && <button type="button" className="poll-share" onClick={onShare}>Share</button>}
          {variant === 'card' && (
            <Link to={`/polls/${poll.slug}`} className="poll-link">More polls →</Link>
          )}
        </div>

        {variant === 'full' && poll.post && (
          <Link to={postPath(poll.post)} className="poll-related">
            <span>From the article</span>
            <strong>{poll.post.title}</strong>
          </Link>
        )}
      </div>
    </section>
  );
}

function ResultRow({ option, show, leading, closed }: { option: PollOptionResult; show: boolean; leading: boolean; closed: boolean }) {
  const pct = option.percentage ?? 0;
  // Animate from 0 the first time results appear.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!show) return;
    const t = requestAnimationFrame(() => setWidth(pct));
    return () => cancelAnimationFrame(t);
  }, [show, pct]);
  return (
    <li className={`poll-result${leading ? ' poll-result--lead' : ''}${option.isMyVote ? ' poll-result--mine' : ''}`}>
      {show && <span className="poll-bar" style={{ width: `${width}%` }} aria-hidden="true" />}
      <span className="poll-result-text">
        {option.text}
        {leading && <span className="poll-tag">{closed ? 'Winner' : 'Leading'}</span>}
        {option.isMyVote && <span className="poll-tag poll-tag--mine">Your vote</span>}
      </span>
      {show && (
        <span className="poll-result-num">
          <strong>{pct}%</strong>
          <span>{(option.votes ?? 0).toLocaleString()}</span>
        </span>
      )}
    </li>
  );
}
