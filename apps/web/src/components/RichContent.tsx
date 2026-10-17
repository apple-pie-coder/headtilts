import { useMemo } from 'react';
import { toEmbed } from '@headtilts/shared';
import { sanitizeHtml } from '../utils/sanitize';
import { PollWidget } from './PollWidget';
import { StreamingPlayer } from './MediaPlayers';

/** A player iframe's src back to the public link toEmbed() understands. */
function linkFromSrc(src: string): string | null {
  if (toEmbed(src)) return src;
  const spotify = src.replace('open.spotify.com/embed/', 'open.spotify.com/');
  return spotify !== src && toEmbed(spotify) ? spotify : null;
}

/**
 * Turn media into [embed] markers before sanitising strips iframes:
 *  - iframes from the editor's video button (YouTube, Spotify…)
 *  - a paragraph holding nothing but a supported link (paste-a-URL embeds)
 * Unknown iframes are dropped, as before.
 */
function markEmbeds(html: string): string {
  if (!/<iframe|https?:\/\//i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const marker = (url: string) => {
    const p = doc.createElement('p');
    p.textContent = `[embed url="${encodeURIComponent(url)}"]`;
    return p;
  };
  doc.querySelectorAll('iframe').forEach((f) => {
    const url = linkFromSrc(f.getAttribute('src') ?? '');
    if (url) f.replaceWith(marker(url)); else f.remove();
  });
  doc.querySelectorAll('p').forEach((p) => {
    const text = (p.textContent ?? '').trim();
    const onlyLink = p.children.length === 0 || (p.children.length === 1 && p.children[0].tagName === 'A' && p.children[0].textContent?.trim() === text);
    if (onlyLink && /^https?:\/\/\S+$/.test(text) && toEmbed(text)) p.replaceWith(marker(text));
  });
  return doc.body.innerHTML;
}

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

const EMBED_RE = /<p[^>]*>\[embed url="([^"]+)"\]<\/p>/;

type Segment = { type: 'html'; html: string } | { type: 'poll'; slug: string } | { type: 'embed'; url: string };

function splitSegments(html: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  const re = new RegExp(`${POLL_RE.source}|${EMBED_RE.source}`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'html', html: html.slice(lastIndex, match.index) });
    }
    segments.push(match[1] ? { type: 'poll', slug: match[1] } : { type: 'embed', url: decodeURIComponent(match[2]) });
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

/**
 * Text pasted from Word or WordPress often joins every word with &nbsp;, which
 * turns a paragraph into one unbreakable "word" that wraps mid-letter. Turn
 * spaces between words back into normal spaces; a lone &nbsp; (an intentional
 * spacer paragraph) is kept.
 */
function normalizeSpaces(html: string): string {
  return html.replace(/([^\s>])(?:&nbsp;|\u00a0)(?=[^\s<])/g, '$1 ');
}

export function RichContent({ html, className }: Props) {
  const segments = useMemo(() => splitSegments(injectHeadingIds(markEmbeds(normalizeSpaces(html)))).map((seg) =>
    seg.type === 'html' ? { ...seg, html: sanitizeHtml(seg.html) } : seg
  ), [html]);

  const hasPoll = segments.some((s) => s.type !== 'html');

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
        ) : seg.type === 'embed' ? (
          <StreamingPlayer key={i} url={seg.url} title="Embedded media" />
        ) : (
          <div key={i} className="post-poll-embed">
            <PollWidget slug={seg.slug} />
          </div>
        )
      )}
    </div>
  );
}
