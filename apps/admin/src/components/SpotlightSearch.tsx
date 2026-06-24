import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faGaugeHigh, faPenToSquare, faFileLines, faImages, faComments, faLayerGroup,
  faTags, faBars, faPuzzlePiece, faUsers, faUserShield, faSitemap, faEnvelope,
  faSliders, faKey, faArrowRight, faChartLine, faChartPie, faBoxArchive, faClipboardList,
  faCakeCandles, faChartBar, faCalendarAlt, faMagnifyingGlass, faPlus, faUser,
  faXmark, faHeartPulse, faUpload,
} from '@fortawesome/free-solid-svg-icons';
import { useSpotlight } from '../context/SpotlightContext';
import { fetchPosts } from '../services/posts';
import { Post } from '../types';
import styles from './SpotlightSearch.module.css';

interface StaticItem {
  group: string;
  icon: IconDefinition;
  title: string;
  subtitle?: string;
  to: string;
  badge?: string;
}

const STATIC_ITEMS: StaticItem[] = [
  // Navigation
  { group: 'Navigation', icon: faGaugeHigh, title: 'Dashboard', to: '/admin' },
  { group: 'Navigation', icon: faPenToSquare, title: 'Posts', subtitle: 'Manage blog posts', to: '/admin/posts' },
  { group: 'Navigation', icon: faFileLines, title: 'Pages', subtitle: 'Manage site pages', to: '/admin/pages' },
  { group: 'Navigation', icon: faImages, title: 'Media', subtitle: 'File library & uploads', to: '/admin/media' },
  { group: 'Navigation', icon: faComments, title: 'Comments', to: '/admin/comments' },
  { group: 'Navigation', icon: faLayerGroup, title: 'Categories', to: '/admin/categories' },
  { group: 'Navigation', icon: faTags, title: 'Tags', to: '/admin/tags' },
  { group: 'Navigation', icon: faCakeCandles, title: 'Celebrations', to: '/admin/celebrations' },
  { group: 'Navigation', icon: faChartBar, title: 'Polls', to: '/admin/polls' },
  { group: 'Navigation', icon: faCalendarAlt, title: 'Events', to: '/admin/events' },
  { group: 'Navigation', icon: faEnvelope, title: 'Contact Submissions', to: '/admin/contact' },
  { group: 'Navigation', icon: faChartPie, title: 'Analytics', to: '/admin/analytics' },
  // Settings
  { group: 'Settings', icon: faSliders, title: 'General Settings', subtitle: 'Site name, logos, SEO defaults', to: '/admin/settings' },
  { group: 'Settings', icon: faKey, title: 'API Keys', to: '/admin/api-keys' },
  { group: 'Settings', icon: faUsers, title: 'Users', subtitle: 'Manage team members', to: '/admin/users' },
  { group: 'Settings', icon: faUserShield, title: 'Roles & Permissions', to: '/admin/roles' },
  { group: 'Settings', icon: faBars, title: 'Menus', subtitle: 'Navigation menus', to: '/admin/menus' },
  { group: 'Settings', icon: faPuzzlePiece, title: 'Widgets', to: '/admin/widgets' },
  { group: 'Settings', icon: faSitemap, title: 'Sitemap', to: '/admin/sitemap' },
  { group: 'Settings', icon: faArrowRight, title: 'Redirects', to: '/admin/redirects' },
  { group: 'Settings', icon: faChartLine, title: 'API Analytics', to: '/admin/api-analytics' },
  { group: 'Settings', icon: faBoxArchive, title: 'Backups', to: '/admin/backups' },
  { group: 'Settings', icon: faClipboardList, title: 'Activity Logs', to: '/admin/logs' },
  { group: 'Settings', icon: faHeartPulse, title: 'System Health', to: '/admin/health' },
  // Quick Actions
  { group: 'Quick Actions', icon: faPlus, title: 'New Post', to: '/admin/posts/new', badge: 'Create' },
  { group: 'Quick Actions', icon: faPlus, title: 'New Page', to: '/admin/pages/new', badge: 'Create' },
  { group: 'Quick Actions', icon: faPlus, title: 'New Poll', to: '/admin/polls/new', badge: 'Create' },
  { group: 'Quick Actions', icon: faPlus, title: 'New Event', to: '/admin/events/new', badge: 'Create' },
  { group: 'Quick Actions', icon: faUpload, title: 'Upload Media', to: '/admin/media', badge: 'Media' },
  { group: 'Quick Actions', icon: faUser, title: 'My Profile', to: '/admin/profile', badge: 'Profile' },
];

interface ResultItem {
  id: string;
  icon: IconDefinition;
  title: string;
  subtitle?: string;
  badge?: string;
  onSelect: () => void;
}

interface ResultGroup {
  title: string;
  items: ResultItem[];
}

function makeStaticItem(item: StaticItem, navigate: (to: string) => void, close: () => void): ResultItem {
  return {
    id: item.to,
    icon: item.icon,
    title: item.title,
    subtitle: item.subtitle,
    badge: item.badge,
    onSelect: () => { navigate(item.to); close(); },
  };
}

function filterStatic(query: string, navigate: (to: string) => void, close: () => void): ResultGroup[] {
  const q = query.toLowerCase();
  const grouped = new Map<string, ResultItem[]>();
  for (const item of STATIC_ITEMS) {
    const matches =
      item.title.toLowerCase().includes(q) ||
      item.subtitle?.toLowerCase().includes(q) ||
      item.group.toLowerCase().includes(q);
    if (!matches) continue;
    const list = grouped.get(item.group) ?? [];
    list.push(makeStaticItem(item, navigate, close));
    grouped.set(item.group, list);
  }
  return Array.from(grouped.entries()).map(([title, items]) => ({ title, items }));
}

function defaultGroups(navigate: (to: string) => void, close: () => void): ResultGroup[] {
  return [
    {
      title: 'Navigation',
      items: STATIC_ITEMS.filter((i) => i.group === 'Navigation').map((i) =>
        makeStaticItem(i, navigate, close),
      ),
    },
    {
      title: 'Quick Actions',
      items: STATIC_ITEMS.filter((i) => i.group === 'Quick Actions').map((i) =>
        makeStaticItem(i, navigate, close),
      ),
    },
  ];
}

export function SpotlightSearch() {
  const { isOpen, open, close } = useSpotlight();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [postResults, setPostResults] = useState<Post[]>([]);
  const [pageResults, setPageResults] = useState<Post[]>([]);
  const [searching, setSearching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global Cmd+K / Ctrl+K listener — always registered since this component is always mounted
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) close();
        else open();
      }
    }
    document.addEventListener('keydown', handleGlobalKey);
    return () => document.removeEventListener('keydown', handleGlobalKey);
  }, [isOpen, open, close]);

  // Reset state and focus on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setPostResults([]);
      setPageResults([]);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  // Debounced API search
  useEffect(() => {
    if (!isOpen || !query.trim()) {
      setPostResults([]);
      setPageResults([]);
      setSearching(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }
    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const [postsRes, pagesRes] = await Promise.all([
          fetchPosts(1, 5, { search: query, type: 'post' }),
          fetchPosts(1, 5, { search: query, type: 'page' }),
        ]);
        setPostResults(postsRes.items);
        setPageResults(pagesRes.items);
      } catch {
        setPostResults([]);
        setPageResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen]);

  // Build result groups
  const groups: ResultGroup[] = (() => {
    const q = query.trim();
    if (!q) return defaultGroups(navigate, close);

    const staticGroups = filterStatic(q, navigate, close);
    const dynamic: ResultGroup[] = [];

    if (postResults.length > 0) {
      dynamic.push({
        title: 'Posts',
        items: postResults.map((p) => ({
          id: `post-${p.id}`,
          icon: faPenToSquare,
          title: p.title,
          subtitle: p.status,
          badge: 'Post',
          onSelect: () => { navigate(`/admin/posts/${p.id}/edit`); close(); },
        })),
      });
    }
    if (pageResults.length > 0) {
      dynamic.push({
        title: 'Pages',
        items: pageResults.map((p) => ({
          id: `page-${p.id}`,
          icon: faFileLines,
          title: p.title,
          subtitle: p.parent?.title ? `Child of ${p.parent.title}` : p.status,
          badge: 'Page',
          onSelect: () => { navigate(`/admin/pages/${p.id}/edit`); close(); },
        })),
      });
    }

    return [...staticGroups, ...dynamic];
  })();

  const flatItems = groups.flatMap((g) => g.items);

  // Reset selection when query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        flatItems[activeIndex]?.onSelect();
      } else if (e.key === 'Escape') {
        close();
      }
    },
    [flatItems, activeIndex, close],
  );

  if (!isOpen) return null;

  let globalIndex = 0;

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={styles.card} role="dialog" aria-label="Quick search" aria-modal="true">
        {/* Search input */}
        <div className={styles.searchRow}>
          <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.searchIcon} />
          <input
            ref={inputRef}
            className={styles.searchInput}
            type="text"
            placeholder="Search anything…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
          />
          {searching && <span className={styles.spinner} aria-label="Searching" />}
          {query && !searching && (
            <button className={styles.clearBtn} onClick={() => setQuery('')} aria-label="Clear search">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>

        {/* Results list */}
        <div className={styles.results} ref={listRef}>
          {groups.length === 0 && query && !searching && (
            <div className={styles.empty}>No results for &ldquo;{query}&rdquo;</div>
          )}
          {groups.map((group) => (
            <div key={group.title} className={styles.group}>
              <p className={styles.groupTitle}>{group.title}</p>
              {group.items.map((item) => {
                const idx = globalIndex++;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
                    data-active={isActive || undefined}
                    onClick={item.onSelect}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <span className={styles.itemIcon}>
                      <FontAwesomeIcon icon={item.icon} />
                    </span>
                    <span className={styles.itemContent}>
                      <span className={styles.itemTitle}>{item.title}</span>
                      {item.subtitle && <span className={styles.itemSubtitle}>{item.subtitle}</span>}
                    </span>
                    {item.badge && <span className={styles.badge}>{item.badge}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Keyboard hints footer */}
        <div className={styles.footer}>
          <span className={styles.hint}>
            <kbd className={styles.kbdKey}>↑</kbd>
            <kbd className={styles.kbdKey}>↓</kbd>
            navigate
          </span>
          <span className={styles.hint}>
            <kbd className={styles.kbdKey}>↵</kbd>
            open
          </span>
          <span className={styles.hint}>
            <kbd className={styles.kbdKey}>Esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
