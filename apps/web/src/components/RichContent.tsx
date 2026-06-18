import { useMemo } from 'react';
import { sanitizeHtml } from '../utils/sanitize';
import { PollWidget } from './PollWidget';

// Inject id attributes on h2/h3 so TableOfContents anchor links work.
function injectHeadingIds(html: string): string {
  const seen = new Map<string, number>();
  return html.replace(/<(h[23])([^>]*)>/gi, (_match, tag: string, attrs: string) => {
    // Extract text from the next closing tag — use a simple text extraction
    const base = attrs; // placeholder; we patch after
    return `<${tag}${attrs} data-toc-pending>`;
  }).replace(/<(h[23])[^>]*data-toc-pending[^>]*>([\s\S]*?)<\/\1>/gi,
    (_match, tag: string, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, '').trim();
      const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const count = seen.get(slug) ?? 0;
      const id = count === 0 ? slug : `${slug}-${count}`;
      seen.set(slug, count + 1);
      return `<${tag} id="${id}">${inner}</${tag}>`;
    }
  );
}

// Quill encodes " → &quot; and spaces → &nbsp; inside text content.
// This regex handles both raw and entity-encoded forms.
const SP = '(?:\\s|&nbsp;)+';
const QO = '(?:"|&quot;)';
const POLL_RE = new RegExp(
  `(?:<p[^>]*>)?\\[poll${SP}slug=${QO}([\\w-]+)${QO}(?:\\s|&nbsp;)*\\](?:</p>)?`,
  'gi',
);

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
  const segments = useMemo(() => splitSegments(injectHeadingIds(html)).map((seg) =>
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
