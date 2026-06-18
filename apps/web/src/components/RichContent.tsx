import { useMemo } from 'react';
import { sanitizeHtml } from '../utils/sanitize';
import { PollWidget } from './PollWidget';

// Matches [poll slug="..."] optionally wrapped in a <p> tag by the editor
const POLL_RE = /(?:<p[^>]*>)?\[poll\s+slug="([^"]+)"\s*\](?:<\/p>)?/gi;

type Segment = { type: 'html'; html: string } | { type: 'poll'; slug: string };

function splitSegments(html: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  const re = new RegExp(POLL_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'html', html: html.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'poll', slug: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < html.length) {
    segments.push({ type: 'html', html: html.slice(lastIndex) });
  }
  return segments.length ? segments : [{ type: 'html', html }];
}

interface Props {
  html: string;
  className?: string;
}

export function RichContent({ html, className }: Props) {
  const segments = useMemo(() => splitSegments(html).map((seg) =>
    seg.type === 'html' ? { ...seg, html: sanitizeHtml(seg.html) } : seg
  ), [html]);

  const hasPoll = segments.some((s) => s.type === 'poll');

  if (!hasPoll) {
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: segments[0]?.type === 'html' ? segments[0].html : '' }}
      />
    );
  }

  return (
    <div className={className}>
      {segments.map((seg, i) =>
        seg.type === 'html' ? (
          seg.html ? <div key={i} dangerouslySetInnerHTML={{ __html: seg.html }} /> : null
        ) : (
          <div key={i} className="post-poll-embed">
            <PollWidget slug={seg.slug} />
          </div>
        )
      )}
    </div>
  );
}
