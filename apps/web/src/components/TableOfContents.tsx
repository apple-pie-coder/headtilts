import { useMemo } from 'react';

interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

function extractHeadings(html: string): TocEntry[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const nodes = doc.querySelectorAll('h2, h3');
  const entries: TocEntry[] = [];
  const seen = new Map<string, number>();

  nodes.forEach((node) => {
    const text = node.textContent?.trim() ?? '';
    if (!text) return;
    const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const count = seen.get(base) ?? 0;
    const id = count === 0 ? base : `${base}-${count}`;
    seen.set(base, count + 1);
    entries.push({ id, text, level: node.tagName === 'H2' ? 2 : 3 });
  });

  return entries;
}

export function TableOfContents({ html }: { html: string }) {
  const entries = useMemo(() => extractHeadings(html), [html]);

  if (entries.length < 3) return null;

  return (
    <nav className="toc" aria-label="Table of contents">
      <p className="toc-title">Contents</p>
      <ol className="toc-list">
        {entries.map((entry) => (
          <li key={entry.id} className={`toc-item--h${entry.level}`}>
            <a href={`#${entry.id}`} className="toc-link">{entry.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
