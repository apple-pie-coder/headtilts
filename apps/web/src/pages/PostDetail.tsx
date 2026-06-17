import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { fetchPost } from '../services/posts';
import { PostArticle } from '../components/PostArticle';
import { PostFull } from '../types';

export function PostDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<PostFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetchPost(slug)
      .then(setPost)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="loading-msg">Loading…</div>;
  if (error || !post) return (
    <div className="error-page">
      <h1>Post Not Found</h1>
      <p>{error || 'This post does not exist.'}</p>
      <Link to="/" className="back-link"><FontAwesomeIcon icon={faArrowLeft} /> Back to home</Link>
    </div>
  );

  return <PostArticle post={post} />;
}
