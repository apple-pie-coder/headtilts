import type { QnaSession } from '../types';

const paragraphs = (s: string) => s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

/**
 * A Q&A session: who answered, then each question and answer. Every question
 * has an anchor (#q-3) so a single answer can be linked to directly.
 */
export function QnaSection({ qna }: { qna: QnaSession }) {
  const items = qna.items.filter((i) => i.question.trim() && i.answer.trim());
  if (!items.length) return null;
  const date = qna.sessionDate
    ? new Date(qna.sessionDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : null;

  return (
    <section className="qna" aria-labelledby="qna-title">
      <header className="qna-head">
        <span className="qna-kicker">Q&amp;A</span>
        <h2 id="qna-title" className="qna-title">{qna.subject ? `${qna.subject} answer${qna.subjectType === 'band' ? '' : 's'} your questions` : 'Questions & answers'}</h2>
        {(date || qna.host) && <p className="qna-meta">{[qna.host, date].filter(Boolean).join(' · ')}</p>}
      </header>

      {items.length > 5 && (
        <details className="qna-jump">
          <summary>Jump to a question ({items.length})</summary>
          <ol>
            {items.map((it, i) => <li key={i}><a href={`#q-${i + 1}`}>{it.question}</a></li>)}
          </ol>
        </details>
      )}

      <ol className="qna-list">
        {items.map((it, i) => (
          <li key={i} id={`q-${i + 1}`} className="qna-item">
            <div className="qna-q">
              <span className="qna-label" aria-hidden="true">Q</span>
              <div>
                <p className="qna-question">{it.question}</p>
                {it.askedBy && <p className="qna-credit">Asked by {it.askedBy}</p>}
              </div>
            </div>
            <div className="qna-a">
              <span className="qna-label qna-label--a" aria-hidden="true">A</span>
              <div className="qna-answer">
                {(it.answeredBy || qna.subject) && <p className="qna-credit qna-credit--answer">{it.answeredBy || qna.subject}</p>}
                {paragraphs(it.answer).map((p, k) => <p key={k}>{p}</p>)}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
