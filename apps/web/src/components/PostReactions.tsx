import { useEffect, useState, useCallback } from 'react';
import { fetchPostReactions, togglePostReaction, PostReactionSummary } from '../services/posts';
import { useVisitorId } from '../hooks/useVisitorId';

const EMOJIS = ['❤️', '👏', '🔥', '😮', '😢', '🙌'];

export function PostReactions({ slug }: { slug: string }) {
  const visitorId = useVisitorId();
  const [reactions, setReactions] = useState<PostReactionSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visitorId) return;
    fetchPostReactions(slug, visitorId).then((data) => {
      // Merge with all allowed emojis so every button is visible even at 0
      const map = new Map(data.map((r) => [r.emoji, r]));
      setReactions(EMOJIS.map((e) => map.get(e) ?? { emoji: e, count: 0, reacted: false }));
    }).catch(() => {});
  }, [slug, visitorId]);

  const toggle = useCallback(async (emoji: string) => {
    if (!visitorId || loading) return;
    setLoading(true);
    try {
      const result = await togglePostReaction(slug, emoji, visitorId);
      setReactions((prev) => prev.map((r) => r.emoji === emoji ? result : r));
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [slug, visitorId, loading]);

  return (
    <div className="post-reactions">
      <span className="post-reactions-label">React to this post:</span>
      {reactions.map((r) => (
        <button
          key={r.emoji}
          className={`post-reaction-btn${r.reacted ? ' post-reaction-btn--active' : ''}`}
          onClick={() => toggle(r.emoji)}
          disabled={loading}
          title={r.reacted ? `Remove ${r.emoji}` : `React with ${r.emoji}`}
        >
          <span className="post-reaction-emoji">{r.emoji}</span>
          {r.count > 0 && <span className="post-reaction-count">{r.count}</span>}
        </button>
      ))}
    </div>
  );
}
