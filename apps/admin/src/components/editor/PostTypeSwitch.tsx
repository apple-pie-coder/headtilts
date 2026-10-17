import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faComments, faCompactDisc, faFileLines, faNewspaper } from '@fortawesome/free-solid-svg-icons';
import type { ArticleType } from '../../types';
import styles from './editorExtras.module.css';

const OPTIONS: { value: ArticleType; label: string; icon: IconDefinition; schema: string; hint: string }[] = [
  { value: 'article', label: 'Article', icon: faFileLines, schema: 'Article', hint: 'Features, interviews, opinion and guides.' },
  { value: 'news', label: 'News', icon: faNewspaper, schema: 'NewsArticle', hint: 'Time-sensitive announcements — eligible for Google News surfaces.' },
  { value: 'review', label: 'Review', icon: faCompactDisc, schema: 'Review', hint: 'Album, EP or single reviews with a rating and streaming links.' },
  { value: 'qna', label: 'Q&A', icon: faComments, schema: 'Article with Questions & Answers', hint: 'An artist or band answering questions — fan AMAs and press Q&As.' },
];

export function PostTypeSwitch({ value, onChange, disabled }: { value: ArticleType; onChange: (v: ArticleType) => void; disabled?: boolean }) {
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
  return (
    <div className={styles.typeSwitch}>
      <div className={styles.typeOptions} role="radiogroup" aria-label="Post type">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`${styles.typeOption} ${value === o.value ? styles.typeOptionOn : ''}`}
            onClick={() => onChange(o.value)}
            disabled={disabled}
          >
            <FontAwesomeIcon icon={o.icon} /> {o.label}
          </button>
        ))}
      </div>
      <span className={styles.typeHint}>
        {current.hint} Search engines see it as <code>{current.schema}</code>.
      </span>
    </div>
  );
}
