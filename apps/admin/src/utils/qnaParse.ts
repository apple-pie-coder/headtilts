import type { QnaItem } from '../types';

/**
 * Turn a pasted Q&A transcript (or the post's own text) into question/answer
 * pairs. Recognised line starts, case-insensitive, with optional bold markers:
 *
 *   Q: …   Q. …   Question: …   Q (Asker): …   Q [Asker]: …
 *   A: …   A. …   Answer: …     A (Member): …  A [Member]: …
 *
 * Lines that follow belong to the current question or answer, kept as separate
 * paragraphs.
 */
const MARKER = /^\s*(?:\*\*|__)?\s*(Q|Question|A|Answer)\s*(?:\(([^)]{1,120})\)|\[([^\]]{1,120})\])?\s*(?:\*\*|__)?\s*(?::|[.\-–—](?=\s))\s*(?:\*\*|__)?\s*(.*)$/i;

export function parseQnaLines(lines: string[]): QnaItem[] {
  const items: QnaItem[] = [];
  let current: QnaItem | null = null;
  let field: 'question' | 'answer' | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\u00a0/g, ' ').trim();
    if (!line) continue;
    const m = line.match(MARKER);
    if (m) {
      const isQuestion = m[1].toLowerCase().startsWith('q');
      const who = (m[2] ?? m[3] ?? '').trim() || null;
      const body = m[4].trim();
      if (isQuestion) {
        current = { question: body, askedBy: who, answer: '', answeredBy: null };
        items.push(current);
        field = 'question';
      } else {
        if (!current || current.answer) {
          // An answer with no question before it (or a second answer) starts a new pair.
          current = { question: '', askedBy: null, answer: '', answeredBy: null };
          items.push(current);
        }
        current.answer = body;
        current.answeredBy = who;
        field = 'answer';
      }
    } else if (current && field) {
      current[field] = current[field] ? `${current[field]}\n\n${line}` : line;
    }
  }
  return items.filter((i) => i.question || i.answer);
}

export const parseQnaText = (text: string) => parseQnaLines(text.split(/\r?\n/));

/** Same rules over the editor's HTML: each paragraph or list item is a line. */
export function parseQnaHtml(html: string): QnaItem[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = [...doc.body.querySelectorAll('p, li, h2, h3, h4, blockquote')].map((el) => el.textContent ?? '');
  return parseQnaLines(blocks);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The Q&A as HTML (questions as headings), so SEO checks see it the way the page shows it. */
export function qnaToHtml(items: QnaItem[]): string {
  return items
    .filter((i) => i.question.trim() || i.answer.trim())
    .map((i) => `<h3>${esc(i.question)}</h3>${i.answer.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('')}`)
    .join('');
}
