import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { resolvePath } from '../services/posts';
import { PostArticle } from '../components/PostArticle';
import { NotFoundPage } from './NotFound';
import { PostFull } from '../types';

/**
 * Catch-all route: tries to resolve the current path against the
 * admin-configured permalink structure. Renders the matching post,
 * or the 404 page when nothing matches.
 */
export function PermalinkPage() {
  const location = useLocation();
  const [post, setPost] = useState<PostFull | null>(null);
  const [status, setStatus] = useState<'loading' | 'found' | 'notfound'>('loading');

  useEffect(() => {
    setStatus('loading');
    resolvePath(location.pathname + location.search)
      .then((resolved) => {
        setPost(resolved);
        setStatus('found');
      })
      .catch(() => setStatus('notfound'));
  }, [location.pathname, location.search]);

  if (status === 'loading') return <div className="loading-msg">Loading…</div>;
  if (status === 'notfound' || !post) return <NotFoundPage />;

  return <PostArticle post={post} />;
}
