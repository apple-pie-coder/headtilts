import { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import type { CatalogIcon } from './iconCatalog';
import { CategoryIcon } from './CategoryIcon';
import styles from './IconPicker.module.css';

export interface IconValue {
  icon: string | null;
  iconSvg: string | null;
}

type Tab = 'suggested' | 'solid' | 'brands';
const MAX_SHOWN = 240;

/**
 * Searchable Font Awesome icon picker. The icon catalog is code-split and
 * loaded the first time the picker opens.
 */
export function IconPicker({ value, onChange, disabled, compact }: { value: IconValue; onChange: (v: IconValue) => void; disabled?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<{ SUGGESTED: CatalogIcon[]; SOLID: CatalogIcon[]; BRANDS: CatalogIcon[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('suggested');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (!catalog) {
      import('./iconCatalog').then(setCatalog).catch(() => setLoadError(true));
    }
    searchRef.current?.focus();
    const onDoc = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc); };
  }, [open, catalog]);

  const results = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase().replace(/-/g, ' ');
    // Searching always covers every icon; tabs only browse.
    if (q) return [...catalog.SOLID, ...catalog.BRANDS].filter((i) => i.terms.includes(q));
    return tab === 'suggested' ? catalog.SUGGESTED : tab === 'solid' ? catalog.SOLID : catalog.BRANDS;
  }, [catalog, query, tab]);

  function pick(i: CatalogIcon) {
    onChange({ icon: i.className, iconSvg: JSON.stringify({ w: i.w, h: i.h, d: i.d }) });
    setOpen(false);
  }

  const currentName = value.icon?.startsWith('fa-') ? value.icon.replace(/^fa-(solid|brands) fa-/, '').replace(/-/g, ' ') : value.icon;
  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.current}>
        <button type="button" className={`${styles.trigger}${compact ? ` ${styles.triggerCompact}` : ''}`} onClick={() => setOpen((o) => !o)} disabled={disabled}
          aria-expanded={open} aria-haspopup="dialog" title={compact ? (currentName ? `Icon: ${currentName}` : 'Choose an icon') : undefined}
          aria-label={compact ? (currentName ? `Icon: ${currentName}` : 'Choose an icon') : undefined}>
          <span className={styles.swatch}>
            {value.icon || value.iconSvg ? <CategoryIcon icon={value.icon} iconSvg={value.iconSvg} /> : <span className={styles.none}>{compact ? '+' : '—'}</span>}
          </span>
          {!compact && <span className={styles.triggerText}>{currentName ? currentName : 'Choose an icon'}</span>}
        </button>
        {!compact && (value.icon || value.iconSvg) && (
          <button type="button" className={styles.clear} onClick={() => onChange({ icon: null, iconSvg: null })} disabled={disabled}>Remove</button>
        )}
      </div>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Choose an icon">
          <div className={styles.search}>
            <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.searchIcon} />
            <input ref={searchRef} type="search" placeholder="Search icons, e.g. guitar" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search icons" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><FontAwesomeIcon icon={faXmark} /></button>}
          </div>
          {compact && (value.icon || value.iconSvg) && (
            <button type="button" className={styles.clear} onClick={() => { onChange({ icon: null, iconSvg: null }); setOpen(false); }}>Remove icon</button>
          )}
          {!query && (
            <div className={styles.tabs} role="tablist">
              {(['suggested', 'solid', 'brands'] as Tab[]).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? styles.tabOn : ''} onClick={() => setTab(t)}>
                  {t === 'suggested' ? 'Suggested' : t === 'solid' ? `Icons${catalog ? ` (${catalog.SOLID.length})` : ''}` : `Brands${catalog ? ` (${catalog.BRANDS.length})` : ''}`}
                </button>
              ))}
            </div>
          )}
          {loadError ? (
            <p className={styles.status}>Couldn’t load the icons. Check your connection and try again.</p>
          ) : !catalog ? (
            <p className={styles.status}>Loading icons…</p>
          ) : results.length === 0 ? (
            <p className={styles.status}>No icons match “{query}”.</p>
          ) : (
            <>
              <div className={styles.grid}>
                {results.slice(0, MAX_SHOWN).map((i) => (
                  <button key={i.className} type="button" title={i.name.replace(/-/g, ' ')} aria-label={i.name.replace(/-/g, ' ')}
                    className={`${styles.cell} ${value.icon === i.className ? styles.cellOn : ''}`} onClick={() => pick(i)}>
                    <svg viewBox={`0 0 ${i.w} ${i.h}`} aria-hidden="true"><path fill="currentColor" d={i.d} /></svg>
                  </button>
                ))}
              </div>
              {results.length > MAX_SHOWN && <p className={styles.status}>Showing {MAX_SHOWN} of {results.length} — type to narrow it down.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
