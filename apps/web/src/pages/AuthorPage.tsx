import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { PostCard } from '../components/PostCard';
import { fetchAuthorProfile, resolveMediaUrl } from '../services/api';
import { useLayout } from '../context/LayoutContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { applySeo, resetSeo } from '../utils/seo';
import { AuthorProfile, Pagination, PostSummary } from '../types';

export function AuthorPage() {
  const { username } = useParams<{ username: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get('page') || 1);

  const [author, setAuthor] = useState<AuthorProfile | null>(null);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { setShowSidebar } = useLayout();
  const { site_title } = useSiteSettings();

  const displayName = author
    ? [author.firstName, author.lastName].filter(Boolean).join(' ') || author.username
    : username ?? '';

  useEffect(() => {
    applySeo({
      title: `${displayName} — ${site_title}`,
      description: author?.bio || `Posts by ${displayName}`,
      ogType: 'profile',
    });
    return () => resetSeo(site_title);
  }, [author, displayName, site_title]);

  useEffect(() => {
    setShowSidebar(false);
    return () => setShowSidebar(false);
  }, [setShowSidebar]);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    fetchAuthorProfile(username, page)
      .then(({ author: a, posts: p }) => {
        setAuthor(a);
        setPosts(p.items);
        setPagination(p.pagination);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [username, page]);

  if (loading) return <div className="loading-msg">Loading…</div>;
  if (error) return <div className="alert-error">{error}</div>;
  if (!author) return <div className="empty-msg">Author not found.</div>;

  return (
    <div>
      <div className="author-profile-hero">
        {author.avatar && (
          <img
            src={resolveMediaUrl(author.avatar)}
            alt={displayName}
            className="author-profile-avatar"
          />
        )}
        <div className="author-profile-meta">
          <p className="archive-label">Author</p>
          <h1 className="page-title">{displayName}</h1>
          {author.location && <p className="author-profile-location">{author.location}</p>}
          {author.bio && <p className="author-profile-bio">{author.bio}</p>}
          <div className="author-profile-links">
            {author.website && <a href={author.website} target="_blank" rel="noopener noreferrer" className="author-link">Website</a>}
            {author.twitterUrl && <a href={author.twitterUrl} target="_blank" rel="noopener noreferrer" className="author-link">Twitter / X</a>}
            {author.linkedinUrl && <a href={author.linkedinUrl} target="_blank" rel="noopener noreferrer" className="author-link">LinkedIn</a>}
            {author.githubUrl && <a href={author.githubUrl} target="_blank" rel="noopener noreferrer" className="author-link">GitHub</a>}
            {author.instagramUrl && <a href={author.instagramUrl} target="_blank" rel="noopener noreferrer" className="author-link">Instagram</a>}
          </div>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="empty-msg">No published posts yet.</div>
      ) : (
        <>
          <div className="post-grid">
            {posts.map((post) => <PostCard key={post.id} post={post} />)}
          </div>

          {pagination && pagination.pages > 1 && (
            <div className="pagination">
              {page > 1 && (
                <button className="page-btn" onClick={() => setSearchParams({ page: String(page - 1) })}>
                  <FontAwesomeIcon icon={faArrowLeft} /> Previous
                </button>
              )}
              <span className="page-info">Page {page} of {pagination.pages}</span>
              {page < pagination.pages && (
                <button className="page-btn" onClick={() => setSearchParams({ page: String(page + 1) })}>
                  Next <FontAwesomeIcon icon={faArrowRight} />
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
