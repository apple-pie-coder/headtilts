import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { resolvePath } from '../services/posts';
import { get } from '../services/api';
import { PostArticle } from '../components/PostArticle';
import { NotFoundPage } from './NotFound';
import { PostFull } from '../types';

interface RedirectResult {
  redirect: { toPath: string; type: number } | null;
}

async function checkRedirect(path: string): Promise<RedirectResult['redirect']> {
  try {
    const result = await get<RedirectResult>(`/public/redirects/resolve`, { from: path });
    return result.redirect ?? null;
  } catch {
    return null;
  }
}

export function PermalinkPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [post, setPost] = useState<PostFull | null>(null);
  const [status, setStatus] = useState<'loading' | 'found' | 'notfound'>('loading');

  useEffect(() => {
    setStatus('loading');
    const path = location.pathname;

    checkRedirect(path).then((redirect) => {
      if (redirect) {
        const isExternal = /^https?:\/\//i.test(redirect.toPath);
        if (isExternal) {
          window.location.replace(redirect.toPath);
        } else if (redirect.type === 301) {
          navigate(redirect.toPath, { replace: true });
        } else {
          navigate(redirect.toPath);
        }
        return;
      }

      resolvePath(path + location.search)
        .then((resolved) => {
          setPost(resolved);
          setStatus('found');
        })
        .catch(() => setStatus('notfound'));
    });
  }, [location.pathname, location.search, navigate]);

  if (status === 'loading') return <div className="loading-msg">Loading…</div>;
  if (status === 'notfound' || !post) return <NotFoundPage />;

  return <PostArticle post={post} />;
}
