import { useId, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faComments, faPlus, faArrowUp, faArrowDown, faTrashCan, faPaste, faFileImport,
} from '@fortawesome/free-solid-svg-icons';
import type { QnaItem, QnaSession } from '../../types';
import { parseQnaHtml, parseQnaText } from '../../utils/qnaParse';
import styles from './editorExtras.module.css';

export const EMPTY_QNA: QnaSession = { subject: '', subjectType: 'band', sessionDate: null, host: null, items: [] };

const SUBJECTS: { value: QnaSession['subjectType']; label: string }[] = [
  { value: 'band', label: 'Band' },
  { value: 'artist', label: 'Artist' },
  { value: 'person', label: 'Person' },
];

const blank = (): QnaItem => ({ question: '', askedBy: null, answer: '', answeredBy: null });

/**
 * Q&A session editor: who answered, then an ordered list of questions and
 * answers. A whole transcript can be pasted ("Q: … / A: …") or lifted out of
 * the post text instead of typing each pair.
 */
export function QnaPanel({ value, onChange, contentHtml, disabled }: {
  value: QnaSession;
  onChange: (next: QnaSession) => void;
  contentHtml: string;
  disabled?: boolean;
}) {
  const uid = useId();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const set = <K extends keyof QnaSession>(key: K, v: QnaSession[K]) => onChange({ ...value, [key]: v });
  const items = value.items;
  const setItems = (next: QnaItem[]) => set('items', next);
  const updateItem = (i: number, patch: Partial<QnaItem>) => setItems(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
  };

  const pastePreview = useMemo(() => (pasteText.trim() ? parseQnaText(pasteText) : []), [pasteText]);
  const fromContent = useMemo(() => parseQnaHtml(contentHtml), [contentHtml]);
  const answered = items.filter((i) => i.question.trim() && i.answer.trim()).length;
  const subjectLabel = value.subjectType === 'band' ? 'Band' : value.subjectType === 'artist' ? 'Artist' : 'Person';

  function importItems(found: QnaItem[]) {
    // Replace the untouched starter row instead of appending after it.
    const keep = items.filter((i) => i.question.trim() || i.answer.trim());
    setItems([...keep, ...found]);
  }

  return (
    <section className={styles.reviewPanel} aria-label="Q&A details">
      <div className={styles.reviewHead}>
        <h3 className={styles.reviewTitle}><FontAwesomeIcon icon={faComments} /> Q&amp;A details</h3>
        <div className={styles.subjectSwitch} role="radiogroup" aria-label="Who is answering?">
          {SUBJECTS.map((s) => (
            <button key={s.value} type="button" role="radio" aria-checked={value.subjectType === s.value}
              className={`${styles.chipToggle} ${value.subjectType === s.value ? styles.chipToggleOn : ''}`}
              onClick={() => set('subjectType', s.value)} disabled={disabled}>{s.label}</button>
          ))}
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.field}>
          <label htmlFor={`${uid}-subject`}>{subjectLabel} answering</label>
          <input id={`${uid}-subject`} className={styles.input} value={value.subject} onChange={(e) => set('subject', e.target.value)}
            placeholder={value.subjectType === 'band' ? 'e.g. Gojira' : value.subjectType === 'artist' ? 'e.g. Joe Duplantier' : 'Name'} disabled={disabled} autoComplete="off" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${uid}-date`}>Session date <span className={styles.optional}>(optional)</span></label>
          <input id={`${uid}-date`} type="date" className={styles.input} value={value.sessionDate?.slice(0, 10) ?? ''}
            onChange={(e) => set('sessionDate', e.target.value || null)} disabled={disabled} />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${uid}-host`}>Where it happened <span className={styles.optional}>(optional)</span></label>
          <input id={`${uid}-host`} className={styles.input} value={value.host ?? ''} onChange={(e) => set('host', e.target.value || null)}
            placeholder="e.g. Fan AMA on Instagram" disabled={disabled} />
        </div>
      </div>

      <div className={styles.qnaToolbar}>
        <span className={styles.help}>
          {items.length ? `${items.length} question${items.length === 1 ? '' : 's'} · ${answered} answered` : 'No questions yet'}
        </span>
        <span className={styles.qnaActions}>
          {fromContent.length > 0 && (
            <button type="button" className={styles.chipToggle} onClick={() => importItems(fromContent)} disabled={disabled}
              title="Found Q: / A: lines in the post text">
              <FontAwesomeIcon icon={faFileImport} /> Import {fromContent.length} from post text
            </button>
          )}
          <button type="button" className={`${styles.chipToggle} ${pasteOpen ? styles.chipToggleOn : ''}`} onClick={() => setPasteOpen((o) => !o)}
            aria-expanded={pasteOpen} disabled={disabled}>
            <FontAwesomeIcon icon={faPaste} /> Paste transcript
          </button>
        </span>
      </div>

      {pasteOpen && (
        <div className={styles.pasteBox}>
          <label htmlFor={`${uid}-paste`} className={styles.fieldLabel}>Paste the whole Q&amp;A</label>
          <textarea id={`${uid}-paste`} className={styles.textarea} rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)} disabled={disabled}
            placeholder={'Q (Rahul from Pune): Will you tour India?\nA (Joe): We would love to — it is on the list.\n\nQ: Favourite track to play live?\nA: Amazonia, every time.'} />
          <div className={styles.qnaToolbar}>
            <span className={styles.help}>Start questions with “Q:” and answers with “A:”. Put a name in brackets to credit who asked or answered.</span>
            <button type="button" className={styles.fixPrimary} disabled={disabled || !pastePreview.length}
              onClick={() => { importItems(pastePreview); setPasteText(''); setPasteOpen(false); }}>
              {pastePreview.length ? `Add ${pastePreview.length} question${pastePreview.length === 1 ? '' : 's'}` : 'Nothing found yet'}
            </button>
          </div>
        </div>
      )}

      <ol className={styles.qnaList}>
        {items.map((it, i) => (
          <li key={i} className={styles.qnaItem}>
            <div className={styles.qnaItemHead}>
              <span className={styles.qnaNumber}>Q{i + 1}</span>
              <span className={styles.qnaItemControls}>
                <button type="button" className={styles.iconButtonPlain} aria-label={`Move question ${i + 1} up`} onClick={() => move(i, -1)} disabled={disabled || i === 0}><FontAwesomeIcon icon={faArrowUp} /></button>
                <button type="button" className={styles.iconButtonPlain} aria-label={`Move question ${i + 1} down`} onClick={() => move(i, 1)} disabled={disabled || i === items.length - 1}><FontAwesomeIcon icon={faArrowDown} /></button>
                <button type="button" className={styles.iconButton} aria-label={`Delete question ${i + 1}`} onClick={() => setItems(items.filter((_, k) => k !== i))} disabled={disabled}><FontAwesomeIcon icon={faTrashCan} /></button>
              </span>
            </div>
            <div className={styles.qnaRow}>
              <textarea className={styles.textarea} rows={2} value={it.question} aria-label={`Question ${i + 1}`} placeholder="Question"
                onChange={(e) => updateItem(i, { question: e.target.value })} disabled={disabled} />
              <input className={styles.input} value={it.askedBy ?? ''} aria-label={`Who asked question ${i + 1}`} placeholder="Asked by (optional)"
                onChange={(e) => updateItem(i, { askedBy: e.target.value || null })} disabled={disabled} />
            </div>
            <div className={styles.qnaRow}>
              <textarea className={styles.textarea} rows={4} value={it.answer} aria-label={`Answer ${i + 1}`} placeholder="Answer"
                onChange={(e) => updateItem(i, { answer: e.target.value })} disabled={disabled} />
              <input className={styles.input} value={it.answeredBy ?? ''} aria-label={`Who answered question ${i + 1}`}
                placeholder={value.subjectType === 'band' ? 'Answered by (member)' : 'Answered by (optional)'}
                onChange={(e) => updateItem(i, { answeredBy: e.target.value || null })} disabled={disabled} />
            </div>
          </li>
        ))}
      </ol>

      <button type="button" className={styles.addRow} onClick={() => setItems([...items, blank()])} disabled={disabled}>
        <FontAwesomeIcon icon={faPlus} /> Add question
      </button>
      <span className={styles.help}>Use the post text above the Q&amp;A for the introduction. The questions appear after it on the page.</span>
    </section>
  );
}
