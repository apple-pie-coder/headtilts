import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { fetchPreview } from '../services/posts';
import { PostArticle } from '../components/PostArticle';
import { ContactForm } from '../components/ContactForm';
import { PostFull } from '../types';
import { sanitizeHtml } from '../utils/sanitize';

/**
 * Renders unpublished content via a signed, expiring preview link
 * generated from the admin editor. Shows a banner so it is never
 * mistaken for the live page.
 */
export function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const exp = searchParams.get('exp') || '';

  const [post, setPost] = useState<PostFull | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetchPreview(id, token, exp)
      .then(setPost)
      .catch((err: Error) => setError(err.message));
  }, [id, token, exp]);

  if (error) return (
    <div className="error-page">
      <h1>Preview Unavailable</h1>
      <p>{error}</p>
      <Link to="/" className="back-link"><FontAwesomeIcon icon={faArrowLeft} /> Back to home</Link>
    </div>
  );
  if (!post) return <div className="loading-msg">Loading preview…</div>;

  return (
    <div>
      <div className="preview-banner">
        <strong>Preview</strong> — this is how the {post.type === 'page' ? 'page' : 'post'} will look.
        It is not live{post.publishedAt ? '' : ' yet'}.
      </div>

      {post.type === 'page' ? (
        <article className={`post-full page-template-${post.template || 'default'}`}>
          <header className="post-header">
            <h1 className="post-title">{post.title}</h1>
          </header>
          <div className="post-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content ?? '') }} />
          {post.template === 'contact' && <ContactForm />}
        </article>
      ) : (
        <PostArticle post={post} />
      )}
    </div>
  );
}
