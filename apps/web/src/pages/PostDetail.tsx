import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchPost } from '../services/posts';
import { PostArticle } from '../components/PostArticle';
import { PostFull } from '../types';
import { LoadError } from '../components/LoadError';

export function PostDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<PostFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetchPost(slug)
      .then(setPost)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="loading-msg">Loading…</div>;
  if (error || !post) return <LoadError error={error} what="Post" />;

  return <PostArticle post={post} />;
}
