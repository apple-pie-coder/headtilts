import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { isTypingTarget } from '../hooks/useHotkeys';
import { SettingEntry, searchSettings } from './settingsIndex';
import styles from './SettingsSearch.module.css';

/** Type-ahead over every setting; picking one opens its tab and highlights it. */
export function SettingsSearch({ onPick }: { onPick: (entry: SettingEntry) => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = searchSettings(query);

  useEffect(() => { setActive(0); }, [query]);

  // "/" focuses the search, like on list pages.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !isTypingTarget(e.target) && !document.querySelector('[aria-modal="true"]')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function pick(entry: SettingEntry) {
    onPick(entry);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }

  return (
    <div className={styles.wrap}>
      <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.icon} />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="settings-search-results"
        aria-activedescendant={open && results[active] ? `setting-opt-${active}` : undefined}
        aria-label="Search settings"
        placeholder="Search settings…  ( / )"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
          if (e.key === 'Enter' && results[active]) { e.preventDefault(); pick(results[active]); }
          if (e.key === 'Escape') { setQuery(''); setOpen(false); }
        }}
      />
      {open && query.trim() && (
        <ul id="settings-search-results" role="listbox" className={styles.results}>
          {results.length === 0 && <li className={styles.none}>No settings match “{query}”</li>}
          {results.map((r, i) => (
            <li
              key={`${r.tab}-${r.label}`}
              id={`setting-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={`${styles.option} ${i === active ? styles.optionActive : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className={styles.label}>{r.label}</span>
              <span className={styles.where}>{r.tab} › {r.section}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Scroll to and briefly highlight a setting once its tab has rendered. */
export function revealSetting(entry: SettingEntry) {
  let tries = 0;
  const attempt = () => {
    const byId = entry.id ? document.getElementById(entry.id) : null;
    const heading = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent?.trim() === entry.section);
    const target = byId ?? heading;
    if (!target) {
      if (tries++ < 20) setTimeout(attempt, 50);
      return;
    }
    const row = (byId?.closest('div') as HTMLElement | null) ?? target;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add(styles.flash);
    setTimeout(() => row.classList.remove(styles.flash), 1800);
    if (byId && 'focus' in byId) (byId as HTMLElement).focus({ preventScroll: true });
  };
  requestAnimationFrame(attempt);
}
