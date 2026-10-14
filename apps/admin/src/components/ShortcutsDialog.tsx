import { useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { NAV_SECTIONS, DASHBOARD_ITEM } from '../nav';
import { Kbd } from './ui';
import styles from './ShortcutsDialog.module.css';

const GENERAL: [string[], string][] = [
  [['⌘', 'K'], 'Search everything'],
  [['?'], 'Show keyboard shortcuts'],
  [['['], 'Collapse / expand sidebar'],
];

const LISTS: [string[], string][] = [
  [['/'], 'Focus the search box'],
  [['N'], 'Create a new item'],
  [['Shift', 'Click'], 'Select a range of rows'],
  [['Esc'], 'Clear selection / close menus'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const goto = [DASHBOARD_ITEM, ...NAV_SECTIONS.flatMap((s) => s.items)].filter((i) => i.hotkey);

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <div className={styles.head}>
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close" autoFocus>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className={styles.grid}>
          <section>
            <h3>General</h3>
            {GENERAL.map(([keys, label]) => <Row key={label} keys={keys} label={label} />)}
            <h3>Lists</h3>
            {LISTS.map(([keys, label]) => <Row key={label} keys={keys} label={label} />)}
          </section>
          <section>
            <h3>Go to</h3>
            {goto.map((i) => <Row key={i.to} keys={['G', i.hotkey!.toUpperCase()]} label={i.label} then />)}
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ keys, label, then }: { keys: string[]; label: string; then?: boolean }) {
  return (
    <div className={styles.row}>
      <span>{label}</span>
      <span className={styles.keys}>
        {keys.map((k, i) => (
          <span key={k} className={styles.keys}>
            {i > 0 && <span className={styles.joiner}>{then ? 'then' : '+'}</span>}
            <Kbd>{k}</Kbd>
          </span>
        ))}
      </span>
    </div>
  );
}
