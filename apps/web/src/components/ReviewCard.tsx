import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { STREAMING_SERVICES, ratingWord, toEmbed } from '@headtilts/shared';
import { resolveMediaUrl } from '../services/api';
import type { ReviewFull } from '../types';
import { STREAMING_ICONS, StreamingPlayer } from './MediaPlayers';

const SUBJECT_LABEL = { album: 'Album review', ep: 'EP review', single: 'Single review' } as const;
// Which service becomes the on-page player when several links are present.
const PLAYER_ORDER = ['spotify', 'appleMusic', 'bandcamp', 'youtubeMusic', 'youtube', 'soundcloud', 'deezer', 'tidal'] as const;

function ScoreDial({ rating }: { rating: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="review-score" role="img" aria-label={`Rated ${rating} out of 10 — ${ratingWord(rating)}`}>
      <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
        <circle cx="42" cy="42" r={r} className="review-score-track" />
        <circle cx="42" cy="42" r={r} className="review-score-fill" strokeDasharray={c} strokeDashoffset={c * (1 - rating / 10)} />
      </svg>
      <span className="review-score-value" aria-hidden="true">{rating % 1 ? rating.toFixed(1) : rating}</span>
      <span className="review-score-word" aria-hidden="true">{ratingWord(rating)}</span>
    </div>
  );
}

export function ReviewCard({ review, fallbackCover }: { review: ReviewFull; fallbackCover?: string | null }) {
  const cover = review.coverImage || fallbackCover;
  const links = review.streaming ?? {};
  const services = STREAMING_SERVICES.filter((s) => links[s.key]);
  const playerKey = PLAYER_ORDER.find((k) => links[k] && toEmbed(links[k]));
  const year = review.releaseDate ? new Date(review.releaseDate).getUTCFullYear() : null;
  const meta = [year, review.label, review.genre].filter(Boolean);

  return (
    <section className="review-card" aria-label={`${SUBJECT_LABEL[review.subjectType] ?? 'Review'}: ${review.artist} — ${review.subjectTitle}`}>
      <div className="review-card-main">
        {cover && <img src={resolveMediaUrl(cover)} alt={`${review.subjectTitle} cover art`} className="review-cover" />}
        <div className="review-info">
          <span className="review-kicker">{SUBJECT_LABEL[review.subjectType] ?? 'Review'}</span>
          <p className="review-subject">
            <span className="review-artist">{review.artist}</span>
            <span className="review-title">{review.subjectTitle}</span>
          </p>
          {meta.length > 0 && <p className="review-meta">{meta.join(' · ')}</p>}
          {review.verdict && <p className="review-verdict">{review.verdict}</p>}
          {review.highlights && review.highlights.length > 0 && (
            <p className="review-highlights"><strong>Standout tracks:</strong> {review.highlights.join(', ')}</p>
          )}
        </div>
        {review.rating != null && <ScoreDial rating={review.rating} />}
      </div>

      {services.length > 0 && (
        <div className="review-listen">
          <span className="review-listen-label">Listen on</span>
          <ul>
            {services.map((s) => (
              <li key={s.key}>
                <a href={links[s.key]} target="_blank" rel="noopener noreferrer" className="listen-btn">
                  <FontAwesomeIcon icon={STREAMING_ICONS[s.key]} style={{ color: s.color }} className="listen-btn-icon" />
                  {s.label}
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="listen-btn-ext" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {playerKey && (
        <div className="review-player">
          <StreamingPlayer url={links[playerKey]!} title={`${review.artist} — ${review.subjectTitle}`} cover={cover ? resolveMediaUrl(cover) : null} />
        </div>
      )}

      {review.tracklist && review.tracklist.length > 0 && (
        <details className="review-tracklist">
          <summary>Tracklist · {review.tracklist.length} track{review.tracklist.length === 1 ? '' : 's'}</summary>
          <ol>
            {review.tracklist.map((t, i) => (
              <li key={i} className={review.highlights?.includes(t.title) ? 'is-highlight' : undefined}>
                <span>{t.title}</span>
                {t.duration && <span className="review-track-time">{t.duration}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
