import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons';
import { ApiError } from '../services/api';

/**
 * Error state for a single post or page. Only a 404 says it doesn't exist;
 * anything else (rate limit, network, server) is temporary, so offer a retry
 * instead of telling the reader the story is gone.
 */
export function LoadError({ error, what }: { error: unknown; what: 'Post' | 'Page' }) {
  const missing = !error || (error instanceof ApiError && error.status === 404);
  return (
    <div className="error-page">
      <h1>{missing ? `${what} Not Found` : `Couldn't load this ${what.toLowerCase()}`}</h1>
      <p>{missing
        ? `This ${what.toLowerCase()} does not exist.`
        : error instanceof ApiError && error.status === 429
          ? 'Too many requests right now. Give it a few seconds and try again.'
          : 'Something went wrong. Please try again.'}</p>
      {!missing && (
        <button type="button" className="back-link error-retry" onClick={() => window.location.reload()}>
          <FontAwesomeIcon icon={faRotateRight} /> Try again
        </button>
      )}
      <Link to="/" className="back-link"><FontAwesomeIcon icon={faArrowLeft} /> Back to home</Link>
    </div>
  );
}
