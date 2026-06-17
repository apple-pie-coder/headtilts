import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createComment, fetchComments, toggleCommentReaction } from '../services/posts';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { formatDate } from '../utils/date';
import { CommentListResult, PublicComment } from '../types';

const VISITOR_KEY = 'ht_visitor_id';
const AUTHOR_KEY = 'ht_comment_author';

function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

function loadAuthor(): { name: string; email: string } {
  try {
    return { name: '', email: '', ...JSON.parse(localStorage.getItem(AUTHOR_KEY) || '{}') };
  } catch {
    return { name: '', email: '' };
  }
}

interface CommentFormProps {
  slug: string;
  parentId?: number | null;
  requireNameEmail: boolean;
  onSubmitted: (comment: PublicComment) => void;
  onCancel?: () => void;
}

function CommentForm({ slug, parentId, requireNameEmail, onSubmitted, onCancel }: CommentFormProps) {
  const saved = loadAuthor();
  const [name, setName] = useState(saved.name);
  const [email, setEmail] = useState(saved.email);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const comment = await createComment(slug, {
        name, email, content,
        parentId: parentId ?? null,
        visitorId: getVisitorId(),
      });
      localStorage.setItem(AUTHOR_KEY, JSON.stringify({ name, email }));
      setContent('');
      onSubmitted(comment);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="comment-form" onSubmit={submit}>
      <div className="comment-form-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={requireNameEmail ? 'Name (required)' : 'Name'}
          required={requireNameEmail}
          disabled={sending}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={requireNameEmail ? 'Email (required, not published)' : 'Email (not published)'}
          required={requireNameEmail}
          disabled={sending}
        />
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={parentId ? 'Write a reply…' : 'Join the discussion…'}
        rows={4}
        required
        disabled={sending}
      />
      {error && <div className="comment-error">{error}</div>}
      <div className="comment-form-actions">
        {onCancel && (
          <button type="button" className="comment-cancel-btn" onClick={onCancel} disabled={sending}>
            Cancel
          </button>
        )}
        <button type="submit" className="comment-submit-btn" disabled={sending}>
          {sending ? 'Posting…' : parentId ? 'Post Reply' : 'Post Comment'}
        </button>
      </div>
    </form>
  );
}

interface CommentItemProps {
  comment: PublicComment;
  childrenOf: Map<number | null, PublicComment[]>;
  slug: string;
  open: boolean;
  requireNameEmail: boolean;
  replyTo: number | null;
  setReplyTo: (id: number | null) => void;
  onReplyPosted: (comment: PublicComment) => void;
  onReact: (commentId: number, emoji: string) => void;
  depth: number;
}

function CommentItem(props: CommentItemProps) {
  const { comment, childrenOf, depth } = props;
  const { date_format, timezone } = useSiteSettings();
  const replies = childrenOf.get(comment.id) || [];
  const isPending = comment.status === 'pending';

  return (
    <li className={`comment${depth > 0 ? ' comment--reply' : ''}`}>
      <div className="comment-inner">
        {comment.avatarUrl ? (
          <img src={comment.avatarUrl} alt="" className="comment-avatar" loading="lazy" />
        ) : (
          <span className="comment-avatar comment-avatar--fallback">
            {comment.authorName.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="comment-main">
          <div className="comment-meta">
            <span className="comment-author">{comment.authorName}</span>
            <span className="comment-date">{formatDate(comment.createdAt, date_format, timezone)}</span>
            {isPending && <span className="comment-pending">Awaiting moderation</span>}
          </div>
          <p className="comment-content">{comment.content}</p>

          {!isPending && (
            <div className="comment-actions">
              <div className="comment-reactions">
                {comment.reactions.map((reaction) => (
                  <button
                    key={reaction.emoji}
                    type="button"
                    className={`comment-reaction${reaction.reacted ? ' comment-reaction--active' : ''}`}
                    onClick={() => props.onReact(comment.id, reaction.emoji)}
                    title={reaction.reacted ? 'Remove reaction' : 'React'}
                  >
                    {reaction.emoji}
                    {reaction.count > 0 && <span className="comment-reaction-count">{reaction.count}</span>}
                  </button>
                ))}
              </div>
              {props.open && (
                <button
                  type="button"
                  className="comment-reply-btn"
                  onClick={() => props.setReplyTo(props.replyTo === comment.id ? null : comment.id)}
                >
                  {props.replyTo === comment.id ? 'Cancel reply' : 'Reply'}
                </button>
              )}
            </div>
          )}

          {props.replyTo === comment.id && (
            <CommentForm
              slug={props.slug}
              parentId={comment.id}
              requireNameEmail={props.requireNameEmail}
              onSubmitted={props.onReplyPosted}
              onCancel={() => props.setReplyTo(null)}
            />
          )}
        </div>
      </div>

      {replies.length > 0 && (
        <ul className="comment-replies">
          {replies.map((reply) => (
            <CommentItem key={reply.id} {...props} comment={reply} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function Comments({ slug }: { slug: string }) {
  const [data, setData] = useState<CommentListResult | null>(null);
  const [error, setError] = useState('');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setData(null);
    setNotice('');
    setReplyTo(null);
    fetchComments(slug, getVisitorId())
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [slug]);

  const childrenOf = useMemo(() => {
    const map = new Map<number | null, PublicComment[]>();
    for (const comment of data?.items || []) {
      const key = comment.parentId ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(comment);
    }
    return map;
  }, [data]);

  function handlePosted(comment: PublicComment) {
    setReplyTo(null);
    if (comment.status === 'pending') {
      setNotice('Thanks! Your comment is awaiting moderation and will appear once approved.');
      return;
    }
    setNotice('');
    setData((prev) => (prev ? { ...prev, total: prev.total + 1, items: [...prev.items, comment] } : prev));
  }

  async function handleReact(commentId: number, emoji: string) {
    try {
      const result = await toggleCommentReaction(commentId, emoji, getVisitorId());
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((c) => (c.id === commentId ? { ...c, reactions: result.reactions } : c)),
            }
          : prev,
      );
    } catch {
      // reaction toggles are non-critical; ignore failures
    }
  }

  if (error) return null;
  if (!data) return <section className="comments-section"><p className="loading-msg">Loading comments…</p></section>;

  const roots = childrenOf.get(null) || [];

  return (
    <section className="comments-section">
      <h2 className="comments-title">
        Comments{data.total > 0 && <span className="comments-count">{data.total}</span>}
      </h2>

      {roots.length === 0 ? (
        <p className="comments-empty">
          {data.open ? 'No comments yet — start the discussion.' : 'No comments.'}
        </p>
      ) : (
        <ul className="comment-list">
          {roots.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              childrenOf={childrenOf}
              slug={slug}
              open={data.open}
              requireNameEmail={data.requireNameEmail}
              replyTo={replyTo}
              setReplyTo={setReplyTo}
              onReplyPosted={handlePosted}
              onReact={handleReact}
              depth={0}
            />
          ))}
        </ul>
      )}

      {notice && <div className="comment-notice">{notice}</div>}

      {data.open ? (
        replyTo === null && (
          <div className="comment-form-wrap">
            <h3 className="comment-form-title">Leave a comment</h3>
            <CommentForm slug={slug} requireNameEmail={data.requireNameEmail} onSubmitted={handlePosted} />
          </div>
        )
      ) : (
        <p className="comments-closed">Comments are closed.</p>
      )}
    </section>
  );
}
