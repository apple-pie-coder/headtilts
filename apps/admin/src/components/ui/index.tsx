/**
 * Shared admin UI primitives. Pages compose these instead of re-implementing
 * headers, search, filters, pagination and empty states per page.
 */
import {
  ButtonHTMLAttributes, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faMagnifyingGlass, faXmark, faFilter, faChevronLeft, faChevronRight, faEllipsis,
  faArrowUp, faArrowDown, faArrowsUpDown, faCompress, faGripLines, faExpand,
} from '@fortawesome/free-solid-svg-icons';
import { useOutsideClose } from '../../hooks/useOutsideClose';
import { isTypingTarget } from '../../hooks/useHotkeys';
import type { Density } from '../../hooks/useDensity';
import styles from './ui.module.css';

function cx(...names: (string | false | null | undefined)[]) {
  return names.filter(Boolean).join(' ');
}

/* ── Buttons ─────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: IconDefinition;
  size?: 'sm' | 'md';
  kbd?: string;
}

export function Button({ variant = 'secondary', icon, size = 'md', kbd, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(styles.btn, styles[`btn_${variant}`], size === 'sm' && styles.btnSm, className)}
    >
      {icon && <FontAwesomeIcon icon={icon} className={styles.btnIcon} />}
      {children}
      {kbd && <Kbd className={styles.btnKbd}>{kbd}</Kbd>}
    </button>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cx(styles.kbd, className)}>{children}</kbd>;
}

/* ── Page header ─────────────────────────────────────────── */

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Admin`;
    return () => { document.title = prev; };
  }, [title]);

  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderText}>
        <h1 className={styles.pageTitle}>{title}</h1>
        {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.pageActions}>{actions}</div>}
    </div>
  );
}

/* ── Status tabs ─────────────────────────────────────────── */

export interface TabDef {
  key: string;
  label: string;
  count?: number;
  /** Draws attention to the count, e.g. pending comments */
  highlight?: boolean;
}

export function Tabs({ tabs, value, onChange }: { tabs: TabDef[]; value: string; onChange: (key: string) => void }) {
  return (
    <div className={styles.tabs} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key || 'all'}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          className={cx(styles.tab, value === t.key && styles.tabActive)}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cx(styles.tabCount, t.highlight && t.count > 0 && styles.tabCountHot)}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── Search ──────────────────────────────────────────────── */

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  delay?: number;
}

/**
 * Debounced search box. Keeps its own text so typing stays instant while the
 * parent only re-queries after a pause. Press "/" anywhere to focus it.
 */
export function SearchInput({ value, onChange, placeholder = 'Search…', delay = 300 }: SearchInputProps) {
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Follow external resets (e.g. "Clear filters").
  useEffect(() => { setText(value); }, [value]);

  useEffect(() => {
    if (text === value) return;
    const id = setTimeout(() => onChangeRef.current(text), delay);
    return () => clearTimeout(id);
  }, [text, delay]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '/' && !isTypingTarget(e.target) && !document.querySelector('[aria-modal="true"]')) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={styles.search}>
      <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.searchIcon} />
      <input
        ref={inputRef}
        type="search"
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onChangeRef.current(text);
          if (e.key === 'Escape') {
            if (text) { setText(''); onChangeRef.current(''); } else inputRef.current?.blur();
          }
        }}
      />
      {text ? (
        <button type="button" className={styles.searchClear} onClick={() => { setText(''); onChange(''); inputRef.current?.focus(); }} aria-label="Clear search">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      ) : (
        <Kbd className={styles.searchKbd}>/</Kbd>
      )}
    </div>
  );
}

/* ── Popover (anchored dropdown) ─────────────────────────── */

interface PopoverProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  width?: number;
}

export function Popover({ trigger, children, align = 'left', width }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutsideClose(ref, open, close);
  return (
    <div className={styles.popoverWrap} ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div className={cx(styles.popover, align === 'right' && styles.popoverRight)} style={width ? { width } : undefined}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

/* ── Filters ─────────────────────────────────────────────── */

export function FilterMenu({ activeCount, children }: { activeCount: number; children: ReactNode }) {
  return (
    <Popover
      width={300}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className={cx(styles.btn, styles.btn_secondary, (open || activeCount > 0) && styles.btnPressed)}
          onClick={toggle}
          aria-expanded={open}
        >
          <FontAwesomeIcon icon={faFilter} className={styles.btnIcon} />
          Filters
          {activeCount > 0 && <span className={styles.countPill}>{activeCount}</span>}
        </button>
      )}
    >
      <div className={styles.filterPanel}>{children}</div>
    </Popover>
  );
}

/** Labelled form row. Use `group` when it wraps several controls (e.g. option buttons). */
export function Field({ label, children, group }: { label: string; children: ReactNode; group?: boolean }) {
  if (group) {
    return (
      <div className={styles.field} role="group" aria-label={label}>
        <span className={styles.fieldLabel}>{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

export interface ActiveFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

export function ActiveFilters({ filters, onClearAll }: { filters: ActiveFilter[]; onClearAll: () => void }) {
  if (filters.length === 0) return null;
  return (
    <div className={styles.activeFilters}>
      {filters.map((f) => (
        <span key={f.key} className={styles.filterChip}>
          {f.label}
          <button type="button" onClick={f.onRemove} aria-label={`Remove filter ${f.label}`}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </span>
      ))}
      <button type="button" className={styles.clearAll} onClick={onClearAll}>Clear all</button>
    </div>
  );
}

/* ── Density ─────────────────────────────────────────────── */

const DENSITY_OPTS: { value: Density; icon: IconDefinition; label: string }[] = [
  { value: 'compact', icon: faCompress, label: 'Compact' },
  { value: 'condensed', icon: faGripLines, label: 'Comfortable' },
  { value: 'relaxed', icon: faExpand, label: 'Relaxed' },
];

export function DensityToggle({ value, onChange }: { value: Density; onChange: (d: Density) => void }) {
  return (
    <div className={styles.segmented} role="group" aria-label="Row density">
      {DENSITY_OPTS.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.label}
          aria-label={`${o.label} rows`}
          aria-pressed={value === o.value}
          className={cx(styles.segment, value === o.value && styles.segmentActive)}
          onClick={() => onChange(o.value)}
        >
          <FontAwesomeIcon icon={o.icon} />
        </button>
      ))}
    </div>
  );
}

/* ── Panel (titled card for side forms) ──────────────────── */

export function Panel({ title, children, actions }: { title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx(styles.card, styles.panel)}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function FieldHint({ children, tone }: { children: ReactNode; tone?: 'warning' | 'danger' }) {
  return <span className={cx(styles.hint, tone && styles[`hint_${tone}`])}>{children}</span>;
}

/* ── Table pieces ────────────────────────────────────────── */

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.card, className)}>{children}</div>;
}

interface SortHeaderProps {
  label: string;
  field: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string, order: 'asc' | 'desc') => void;
  /** Direction applied on first click (dates usually want newest first) */
  firstOrder?: 'asc' | 'desc';
}

export function SortHeader({ label, field, sortBy, sortOrder, onSort, firstOrder = 'asc' }: SortHeaderProps) {
  const active = sortBy === field;
  const icon = !active ? faArrowsUpDown : sortOrder === 'asc' ? faArrowUp : faArrowDown;
  return (
    <th aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={cx(styles.sortBtn, active && styles.sortActive)}
        onClick={() => onSort(field, active ? (sortOrder === 'asc' ? 'desc' : 'asc') : firstOrder)}
      >
        {label}
        <FontAwesomeIcon icon={icon} className={styles.sortIcon} />
      </button>
    </th>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className={styles.skeletonRow} aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}>
              <span className={styles.skeleton} style={{ width: c === 1 ? `${55 + ((r * 13) % 35)}%` : `${40 + ((r + c) * 17) % 45}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

interface EmptyStateProps {
  icon: IconDefinition;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}><FontAwesomeIcon icon={icon} /></span>
      <p className={styles.emptyTitle}>{title}</p>
      {description && <p className={styles.emptyText}>{description}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

/* ── Row overflow menu (portaled so table overflow can't clip it) ── */

export interface MenuItem {
  label: string;
  icon?: IconDefinition;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
  divider?: boolean;
}

export function RowMenu({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visible = items.filter((i) => !i.hidden);

  const close = useCallback(() => setPos(null), []);

  function toggle() {
    if (pos) { close(); return; }
    const r = btnRef.current!.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 240;
    setPos({ top: up ? r.top - 4 : r.bottom + 4, left: r.right, up });
  }

  useEffect(() => {
    if (!pos) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { close(); btnRef.current?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const els = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
        const i = els.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
        els[next]?.focus();
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos, close]);

  useLayoutEffect(() => {
    if (pos) menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [pos]);

  if (visible.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={cx(styles.iconBtn, pos && styles.iconBtnActive)}
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        title={label}
      >
        <FontAwesomeIcon icon={faEllipsis} />
      </button>
      {pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className={styles.menu}
          style={{ top: pos.top, left: pos.left, transform: `translate(-100%, ${pos.up ? '-100%' : '0'})` }}
        >
          {visible.map((item) => (
            <div key={item.label}>
              {item.divider && <hr className={styles.menuSep} />}
              <button
                type="button"
                role="menuitem"
                className={cx(styles.menuItem, item.danger && styles.menuItemDanger)}
                onClick={() => { close(); item.onClick(); }}
              >
                {item.icon && <FontAwesomeIcon icon={item.icon} fixedWidth className={styles.menuIcon} />}
                {item.label}
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

export function IconButton({ icon, label, onClick, active, danger }: {
  icon: IconDefinition; label: string; onClick: () => void; active?: boolean; danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx(styles.iconBtn, active && styles.iconBtnOn, danger && styles.iconBtnDanger)}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
    >
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}

/* ── Bulk action bar ─────────────────────────────────────── */

export function BulkBar({ count, noun, onClear, children }: {
  count: number; noun: string; onClear: () => void; children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className={styles.bulkBar} role="toolbar" aria-label="Bulk actions">
      <span className={styles.bulkCount}>
        <strong>{count}</strong> {noun}{count === 1 ? '' : 's'} selected
      </span>
      <div className={styles.bulkActions}>{children}</div>
      <button type="button" className={styles.bulkClose} onClick={onClear} aria-label="Clear selection" title="Clear selection (Esc)">
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  );
}

/* ── Pagination ──────────────────────────────────────────── */

function pageList(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) out.push('…');
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 1) out.push('…');
  out.push(pages);
  return out;
}

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  pageSizeOptions?: number[];
}

export function Pagination({ page, pageSize, total, onPage, onPageSize, pageSizeOptions = [10, 20, 50, 100] }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={styles.pagination}>
      <span className={styles.pageInfo}>
        {total === 0 ? 'No results' : <>Showing <strong>{from}–{to}</strong> of <strong>{total}</strong></>}
      </span>
      <div className={styles.pageControls}>
        {onPageSize && (
          <label className={styles.pageSize}>
            Rows
            <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
              {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        {pages > 1 && (
          <nav className={styles.pages} aria-label="Pagination">
            <button type="button" className={styles.pageBtn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            {pageList(page, pages).map((p, i) =>
              p === '…' ? (
                <span key={`gap${i}`} className={styles.pageGap}>…</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={cx(styles.pageBtn, p === page && styles.pageBtnActive)}
                  aria-current={p === page ? 'page' : undefined}
                  onClick={() => onPage(p)}
                >
                  {p}
                </button>
              ),
            )}
            <button type="button" className={styles.pageBtn} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </nav>
        )}
      </div>
    </div>
  );
}

/* ── Misc ────────────────────────────────────────────────── */

/** Accessible on/off switch for instant (auto-saved) settings. */
export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cx(styles.switch, checked && styles.switchOn)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.switchThumb} />
    </button>
  );
}

export function StatusBadge({ tone, children }: { tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; children: ReactNode }) {
  return <span className={cx(styles.badge, styles[`badge_${tone}`])}>{children}</span>;
}

/** Thin indeterminate bar shown while a list refetches over existing rows. */
export function LoadingBar({ active }: { active: boolean }) {
  return <div className={cx(styles.loadingBar, active && styles.loadingBarOn)} aria-hidden="true" />;
}

export function relativeTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const then = new Date(dateStr).getTime();
  const diff = Date.now() - then;
  const future = diff < 0;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const fmt = (n: number, unit: string) => (future ? `in ${n}${unit}` : `${n}${unit} ago`);
  if (mins < 1) return future ? 'in a moment' : 'just now';
  if (mins < 60) return fmt(mins, 'm');
  const hours = Math.round(mins / 60);
  if (hours < 24) return fmt(hours, 'h');
  const days = Math.round(hours / 24);
  if (days < 7) return fmt(days, 'd');
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: new Date(dateStr).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function absoluteTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Range-aware row selection: shift-click selects everything between clicks. */
export function useRowSelection<T extends string | number>(ids: T[]) {
  const [selected, setSelected] = useState<Set<T>>(new Set());
  const lastRef = useRef<T | null>(null);

  // Drop selections that are no longer on the page.
  const idsKey = ids.join(',');
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set(Array.from(prev).filter((id) => ids.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [idsKey]);

  const toggle = useCallback((id: T, shift = false) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const last = lastRef.current;
      if (shift && last !== null && ids.includes(last)) {
        const [a, b] = [ids.indexOf(last), ids.indexOf(id)].sort((x, y) => x - y);
        const on = !prev.has(id);
        for (const rid of ids.slice(a, b + 1)) { if (on) next.add(rid); else next.delete(rid); }
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      lastRef.current = id;
      return next;
    });
  }, [idsKey]);

  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
  }, [idsKey]);

  const clear = useCallback(() => setSelected(new Set()), []);

  useEffect(() => {
    if (selected.size === 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isTypingTarget(e.target) && !document.querySelector('[aria-modal="true"]')) clear();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected.size, clear]);

  return {
    selected,
    toggle,
    toggleAll,
    clear,
    allSelected: ids.length > 0 && selected.size === ids.length,
    someSelected: selected.size > 0 && selected.size < ids.length,
  };
}

export function Checkbox({ checked, indeterminate, onChange, label }: {
  checked: boolean; indeterminate?: boolean; onChange: (shift: boolean) => void; label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className={styles.checkbox}
      checked={checked}
      aria-label={label}
      onChange={() => { /* handled in onClick so we can read shiftKey */ }}
      onClick={(e) => onChange(e.shiftKey)}
    />
  );
}

export { styles as uiStyles };
