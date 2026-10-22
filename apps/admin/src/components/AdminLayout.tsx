import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBars, faChevronDown, faFeather, faRightFromBracket, faSun, faMoon, faDesktop,
  faMagnifyingGlass, faPlus, faArrowUpRightFromSquare, faAnglesLeft, faAnglesRight,
  faUser, faKeyboard, faPalette, faCommentDots,
} from '@fortawesome/free-solid-svg-icons';
import { useSpotlight } from '../context/SpotlightContext';
import type { ThemeMode, AccentColor, AccentPreset } from '../context/ThemeContext';
import { ACCENT_PRESETS, useTheme } from '../context/ThemeContext';
import { useAuth } from '../hooks/useAuth';
import { PERMISSIONS } from '@headtilts/shared';
import { useHotkeys } from '../hooks/useHotkeys';
import { useNavBadges } from '../hooks/useNavBadges';
import { useOutsideClose } from '../hooks/useOutsideClose';
import { useCardTables } from '../hooks/useCardTables';
import { NAV_SECTIONS, DASHBOARD_ITEM, CREATE_ACTIONS, NavItem } from '../nav';
import { NotificationBell } from './NotificationBell';
import { Breadcrumb } from './Breadcrumb';
import { ShortcutsDialog } from './ShortcutsDialog';
import { FeedbackButton } from './FeedbackButton';
import { fetchPublicSettings } from '../services/settings';
import { resolveMediaUrl } from '../services/media';
import { apiClient } from '../services/api';
import styles from './AdminLayout.module.css';

const COLLAPSED_KEY = 'htilts:sidebar:collapsed';
const SECTIONS_KEY = 'htilts:sidebar:closedSections';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logout, hasPermission } = useAuth();
  const { mode, setMode, theme, accent, setAccent } = useTheme();
  const { open: openSpotlight } = useSpotlight();
  const navigate = useNavigate();
  const location = useLocation();
  const badges = useNavBadges(hasPermission);

  const [healthStatus, setHealthStatus] = useState<'ok' | 'degraded' | 'down' | 'unknown'>('unknown');
  const [collapsed, setCollapsed] = useState<boolean>(() => readJson(COLLAPSED_KEY, false));
  const [closedSections, setClosedSections] = useState<string[]>(() => readJson(SECTIONS_KEY, []));
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [menu, setMenu] = useState<'create' | 'user' | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const createRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useCardTables(contentRef);
  const closeMenu = useCallback(() => setMenu(null), []);
  useOutsideClose(createRef, menu === 'create', closeMenu);
  useOutsideClose(userRef, menu === 'user', closeMenu);

  // Branding (logo + title) — from the public settings subset
  const [logo, setLogo] = useState('');
  const [logoDark, setLogoDark] = useState('');
  const [siteTitle, setSiteTitle] = useState('');
  const [adminLogoHeight, setAdminLogoHeight] = useState('');
  // Square mark for the collapsed rail: its own setting, else the admin or site favicon.
  const [railIcon, setRailIcon] = useState('');
  const [showBreadcrumbs, setShowBreadcrumbs] = useState(true);

  useEffect(() => {
    fetchPublicSettings()
      .then((s) => {
        setLogo(s.site_logo || '');
        setLogoDark(s.site_logo_dark || '');
        setSiteTitle(s.site_title || '');
        setAdminLogoHeight(s.admin_logo_height || '');
        setRailIcon(s.admin_logo_icon || s.admin_favicon || s.site_favicon || '');
        setShowBreadcrumbs(s.show_breadcrumbs !== 'no');
      })
      .catch(() => {});
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const res = await apiClient.get('/health/status');
      setHealthStatus(res.data.data?.status ?? 'ok');
    } catch {
      setHealthStatus('down');
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const id = setInterval(checkHealth, 60_000);
    return () => clearInterval(id);
  }, [checkHealth]);

  useEffect(() => { writeJson(COLLAPSED_KEY, collapsed); }, [collapsed]);
  useEffect(() => { writeJson(SECTIONS_KEY, closedSections); }, [closedSections]);

  // Close drawers and menus whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false);
    setMenu(null);
  }, [location.pathname]);

  // Only show what this user can actually open — no dead-end links.
  const sections = useMemo(
    () => NAV_SECTIONS
      .map((s) => ({ ...s, items: s.items.filter((i) => !i.permission || hasPermission(i.permission)) }))
      .filter((s) => s.items.length > 0),
    [hasPermission],
  );
  const createActions = CREATE_ACTIONS.filter((a) => hasPermission(a.permission));

  const isActive = (to: string) => location.pathname === to || location.pathname.startsWith(`${to}/`);

  function toggleSection(id: string) {
    setClosedSections((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  const gotoKeys = useMemo(() => {
    const map: Record<string, () => void> = {};
    for (const item of [DASHBOARD_ITEM, ...sections.flatMap((s) => s.items)]) {
      if (item.hotkey) map[`g ${item.hotkey}`] = () => navigate(item.to);
    }
    return map;
  }, [sections, navigate]);

  useHotkeys({
    ...gotoKeys,
    '?': () => setShowShortcuts(true),
    '[': () => setCollapsed((c) => !c),
  });

  const activeLogo = (theme === 'dark' && logoDark) ? logoDark : logo;
  const initials = user
    ? (user.firstName?.[0] ?? user.username?.[0] ?? '?').toUpperCase()
    : '?';
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username;

  function renderLink(item: NavItem, end = false) {
    const count = item.badge ? badges[item.badge] ?? 0 : 0;
    return (
      <li key={item.to}>
        <NavLink
          to={item.to}
          end={end}
          title={collapsed ? (count ? `${item.label} (${count})` : item.label) : undefined}
          className={({ isActive: active }) => `${styles.navLink} ${active ? styles.navActive : ''}`}
        >
          <span className={styles.navIcon}>
            <FontAwesomeIcon icon={item.icon} fixedWidth />
            {count > 0 && <span className={styles.navDot} aria-hidden="true" />}
          </span>
          <span className={styles.navLabel}>{item.label}</span>
          {count > 0 && (
            <span className={styles.navBadge} aria-label={`${count} need attention`}>
              {count > 99 ? '99+' : count}
            </span>
          )}
        </NavLink>
      </li>
    );
  }

  return (
    <div className={`${styles.layout} ${collapsed ? styles.layoutCollapsed : ''}`}>
      <a href="#main-content" className={styles.skipLink}>Skip to content</a>

      {/* Mobile drawer backdrop */}
      {sidebarOpen && <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`} aria-label="Main navigation">
        <div className={styles.brand}>
          <Link to="/admin" className={styles.brandLink} title={siteTitle || 'Headtilts'}>
            {activeLogo && !collapsed ? (
              <img className={styles.brandLogo} src={resolveMediaUrl(activeLogo)} alt={siteTitle || 'Logo'}
                style={adminLogoHeight ? { maxHeight: `${adminLogoHeight}px` } : undefined} />
            ) : (
              <>
                <span className={styles.brandIcon}>
                  {collapsed && railIcon
                    ? <img className={styles.brandMark} src={resolveMediaUrl(railIcon)} alt="" />
                    : <FontAwesomeIcon icon={faFeather} />}
                </span>
                <span className={styles.brandName}>{siteTitle || 'Headtilts'}</span>
              </>
            )}
          </Link>
        </div>

        <nav className={styles.nav}>
          <ul>{renderLink(DASHBOARD_ITEM, true)}</ul>

          {sections.map((section) => {
            const containsActive = section.items.some((i) => isActive(i.to));
            // A section holding the current page is always open.
            const open = collapsed || containsActive || !closedSections.includes(section.id);
            const sectionBadge = section.items.reduce((n, i) => n + (i.badge ? badges[i.badge] ?? 0 : 0), 0);
            return (
              <div key={section.id} className={styles.section}>
                <button
                  type="button"
                  className={styles.sectionHeader}
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={open}
                  disabled={containsActive}
                >
                  <span>{section.label}</span>
                  {!open && sectionBadge > 0 && <span className={styles.sectionDot} />}
                  {!containsActive && (
                    <FontAwesomeIcon icon={faChevronDown} className={`${styles.navChevron} ${open ? '' : styles.navChevronClosed}`} />
                  )}
                </button>
                {open && <ul>{section.items.map((item) => renderLink(item))}</ul>}
              </div>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar ( [ )' : 'Collapse sidebar ( [ )'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <FontAwesomeIcon icon={collapsed ? faAnglesRight : faAnglesLeft} />
            <span className={styles.navLabel}>Collapse</span>
          </button>
          {/* On phones the floating feedback button is hidden; it lives here instead. */}
          <button
            type="button"
            className={`${styles.collapseBtn} ${styles.feedbackNav}`}
            onClick={() => { setSidebarOpen(false); window.dispatchEvent(new Event('admin:open-feedback')); }}
          >
            <FontAwesomeIcon icon={faCommentDots} />
            <span className={styles.navLabel}>Send feedback</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className={styles.main} id="main-content" tabIndex={-1}>
        <header className={styles.topHeader}>
          <button
            className={styles.hamburger}
            onClick={() => setSidebarOpen((o) => !o)}
            title="Menu"
            aria-label="Toggle navigation menu"
          >
            <FontAwesomeIcon icon={faBars} />
          </button>

          <button
            type="button"
            className={styles.searchTrigger}
            onClick={openSpotlight}
            aria-label="Search (⌘K)"
          >
            <FontAwesomeIcon icon={faMagnifyingGlass} className={styles.searchTriggerIcon} />
            <span className={styles.searchTriggerLabel}>Search posts, pages, settings…</span>
            <kbd className={styles.searchTriggerKbd}>⌘K</kbd>
          </button>

          <div className={styles.topHeaderActions}>
            {createActions.length > 0 && (
              <div className={styles.menuWrap} ref={createRef}>
                <button
                  type="button"
                  className={styles.createBtn}
                  onClick={() => setMenu((m) => (m === 'create' ? null : 'create'))}
                  aria-haspopup="menu"
                  aria-expanded={menu === 'create'}
                >
                  <FontAwesomeIcon icon={faPlus} />
                  <span className={styles.createLabel}>New</span>
                </button>
                {menu === 'create' && (
                  <div className={styles.dropdown} role="menu">
                    <p className={styles.dropdownLabel}>Create new</p>
                    {createActions.map((a) => (
                      <button key={a.to + a.label} type="button" role="menuitem" className={styles.dropdownItem} onClick={() => navigate(a.to)}>
                        <FontAwesomeIcon icon={a.icon} fixedWidth className={styles.dropdownIcon} />
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <a href="/" target="_blank" rel="noopener noreferrer" className={styles.iconLink} title="View site" aria-label="View site in a new tab">
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
            </a>

            <NotificationBell />

            <div className={styles.menuWrap} ref={userRef}>
              <button
                type="button"
                className={styles.avatarBtn}
                onClick={() => setMenu((m) => (m === 'user' ? null : 'user'))}
                aria-haspopup="menu"
                aria-expanded={menu === 'user'}
                aria-label="Account menu"
              >
                <span className={styles.avatar}>
                  {user?.avatar
                    ? <img src={user.avatar} alt="" />
                    : initials}
                </span>
              </button>
              {menu === 'user' && (
                <div className={`${styles.dropdown} ${styles.userDropdown}`} role="menu">
                  <div className={styles.userHead}>
                    <span className={styles.avatar}>{user?.avatar ? <img src={user.avatar} alt="" /> : initials}</span>
                    <div className={styles.userHeadText}>
                      <strong>{displayName}</strong>
                      <span>{user?.email}</span>
                    </div>
                  </div>
                  <hr className={styles.dropdownSep} />
                  <button type="button" role="menuitem" className={styles.dropdownItem} onClick={() => navigate('/admin/profile')}>
                    <FontAwesomeIcon icon={faUser} fixedWidth className={styles.dropdownIcon} /> Your profile
                  </button>
                  <button type="button" role="menuitem" className={styles.dropdownItem} onClick={() => { setMenu(null); setShowShortcuts(true); }}>
                    <FontAwesomeIcon icon={faKeyboard} fixedWidth className={styles.dropdownIcon} /> Keyboard shortcuts
                    <kbd className={styles.searchTriggerKbd} style={{ marginLeft: 'auto' }}>?</kbd>
                  </button>
                  <hr className={styles.dropdownSep} />
                  <p className={styles.dropdownLabel}><FontAwesomeIcon icon={faPalette} /> Appearance</p>
                  <div className={styles.themeSwitch} role="group" aria-label="Color mode">
                    {([
                      { value: 'light', icon: faSun, label: 'Light' },
                      { value: 'system', icon: faDesktop, label: 'Auto' },
                      { value: 'dark', icon: faMoon, label: 'Dark' },
                    ] as { value: ThemeMode; icon: typeof faSun; label: string }[]).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`${styles.themeOption} ${mode === opt.value ? styles.themeOptionActive : ''}`}
                        onClick={() => setMode(opt.value)}
                        aria-pressed={mode === opt.value}
                      >
                        <FontAwesomeIcon icon={opt.icon} /> {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className={styles.swatchRow}>
                    {(Object.entries(ACCENT_PRESETS) as [AccentColor, AccentPreset][]).map(([key, preset]) => (
                      <button
                        key={key}
                        type="button"
                        className={`${styles.swatch} ${accent === key ? styles.swatchActive : ''}`}
                        style={{ '--swatch': preset.swatch } as React.CSSProperties}
                        onClick={() => setAccent(key)}
                        title={preset.label}
                        aria-label={`${preset.label} accent`}
                        aria-pressed={accent === key}
                      />
                    ))}
                  </div>
                  <hr className={styles.dropdownSep} />
                  <button type="button" role="menuitem" className={`${styles.dropdownItem} ${styles.dropdownDanger}`} onClick={() => logout()}>
                    <FontAwesomeIcon icon={faRightFromBracket} fixedWidth className={styles.dropdownIcon} /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <Breadcrumb show={showBreadcrumbs} />
        <div className={styles.content} ref={contentRef}>{children}</div>
      </main>

      <footer className={styles.adminFooter}>
        <span className={styles.footerLeft}>
          Headtilts v1.0.0 &nbsp;·&nbsp; © {new Date().getFullYear()}
          <button type="button" className={styles.footerHint} onClick={() => setShowShortcuts(true)}>
            Press <kbd className={styles.searchTriggerKbd}>?</kbd> for shortcuts
          </button>
        </span>
        <div className={styles.footerRight}>
          {(() => {
            const status = (
              <>
                <span className={`${styles.healthDot} ${
                  healthStatus === 'ok'       ? styles.healthDotOk       :
                  healthStatus === 'degraded' ? styles.healthDotDegraded :
                  healthStatus === 'down'     ? styles.healthDotDown     :
                                                styles.healthDotUnknown
                }`} />
                {healthStatus === 'ok' ? 'Operational' :
                 healthStatus === 'degraded' ? 'Degraded' :
                 healthStatus === 'down' ? 'Down' : 'Checking…'}
              </>
            );
            // Only operators can open the Health page; everyone else just sees the status.
            return hasPermission(PERMISSIONS.SETTING_READ)
              ? <Link to="/admin/health" className={styles.healthLink} title={`System status: ${healthStatus}`}>{status}</Link>
              : <span className={styles.healthLink} title={`System status: ${healthStatus}`}>{status}</span>;
          })()}
        </div>
      </footer>

      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
      <FeedbackButton />
    </div>
  );
}
