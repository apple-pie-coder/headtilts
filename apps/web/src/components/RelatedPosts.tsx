import { useEffect, useState } from 'react';
import { fetchRelatedPosts } from '../services/posts';
import { PostSummary } from '../types';
import { PostCard } from './PostCard';

export function RelatedPosts({ slug }: { slug: string }) {
  const [posts, setPosts] = useState<PostSummary[]>([]);

  useEffect(() => {
    // The endpoint returns the same summary shape as post listings.
    fetchRelatedPosts(slug, 3).then((items) => setPosts(items as unknown as PostSummary[])).catch(() => {});
  }, [slug]);

  if (posts.length === 0) return null;

  return (
    <section className="related" aria-labelledby="related-title">
      <h2 id="related-title" className="section-title">More stories like this</h2>
      <div className="post-grid">
        {posts.map((p) => <PostCard key={p.id} post={p} />)}
      </div>
    </section>
  );
}
