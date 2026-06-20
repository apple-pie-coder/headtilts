import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faGaugeHigh, faPenToSquare, faFileLines, faImages, faComments, faLayerGroup,
  faTags, faBars, faPuzzlePiece, faUsers, faUserShield, faSitemap, faEnvelope,
  faGear, faSliders, faChevronDown, faFeather, faRightFromBracket, faSun, faMoon, faDesktop,
  faCakeCandles, faChartBar, faKey, faArrowRight, faChartLine, faChartPie,
} from '@fortawesome/free-solid-svg-icons';
import type { ThemeMode } from '../context/ThemeContext';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { NotificationBell } from './NotificationBell';
import { fetchPublicSettings } from '../services/settings';
import { resolveMediaUrl } from '../services/media';
import styles from './AdminLayout.module.css';

interface NavItem {
  label: string;
  to: string;
  icon: IconDefinition;
  permission?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/admin', icon: faGaugeHigh },
  { label: 'Posts', to: '/admin/posts', icon: faPenToSquare },
  { label: 'Pages', to: '/admin/pages', icon: faFileLines },
  { label: 'Media', to: '/admin/media', icon: faImages },
  { label: 'Comments', to: '/admin/comments', icon: faComments },
  { label: 'Categories', to: '/admin/categories', icon: faLayerGroup },
  { label: 'Tags', to: '/admin/tags', icon: faTags },
  { label: 'Celebrations', to: '/admin/celebrations', icon: faCakeCandles },
  { label: 'Polls', to: '/admin/polls', icon: faChartBar },
  { label: 'Contact', to: '/admin/contact', icon: faEnvelope },
  { label: 'Analytics', to: '/admin/analytics', icon: faChartPie },
];

// Grouped under the collapsible "Settings" section.
const SETTINGS_ITEMS = [
  { label: 'General', to: '/admin/settings', icon: faSliders },
  { label: 'API Keys', to: '/admin/api-keys', icon: faKey },
  { label: 'Users', to: '/admin/users', icon: faUsers },
  { label: 'Roles', to: '/admin/roles', icon: faUserShield },
  { label: 'Menus', to: '/admin/menus', icon: faBars },
  { label: 'Widgets', to: '/admin/widgets', icon: faPuzzlePiece },
  { label: 'Sitemap', to: '/admin/sitemap', icon: faSitemap },
  { label: 'Redirects', to: '/admin/redirects', icon: faArrowRight },
  { label: 'API Analytics', to: '/admin/api-analytics', icon: faChartLine },
];

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, logout } = useAuth();
  const { mode, setMode, theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const inSettings =
    SETTINGS_ITEMS.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)) ||
    location.pathname.startsWith('/admin/api-keys');
  const [settingsOpen, setSettingsOpen] = useState(inSettings);
  // Mobile off-canvas sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Branding (logo + title) — from the public settings subset
  const [logo, setLogo] = useState('');
  const [logoDark, setLogoDark] = useState('');
  const [siteTitle, setSiteTitle] = useState('');
  const [adminLogoHeight, setAdminLogoHeight] = useState('');

  useEffect(() => {
    fetchPublicSettings()
      .then((s) => { setLogo(s.site_logo || ''); setLogoDark(s.site_logo_dark || ''); setSiteTitle(s.site_title || ''); setAdminLogoHeight(s.admin_logo_height || ''); })
      .catch(() => {});
  }, []);

  const activeLogo = (theme === 'dark' && logoDark) ? logoDark : logo;

  // Auto-expand the Settings group whenever the active route is inside it.
  useEffect(() => {
    if (inSettings) setSettingsOpen(true);
  }, [inSettings]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const initials = user
    ? (user.firstName?.[0] ?? user.username?.[0] ?? '?').toUpperCase()
    : '?';

  return (
    <div className={styles.layout}>
      {/* Mobile drawer backdrop */}
      {sidebarOpen && <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.brand}>
          {activeLogo ? (
            <img className={styles.brandLogo} src={resolveMediaUrl(activeLogo)} alt={siteTitle || 'Logo'}
              style={adminLogoHeight ? { maxHeight: `${adminLogoHeight}px` } : undefined} />
          ) : (
            <>
              <span className={styles.brandIcon}><FontAwesomeIcon icon={faFeather} /></span>
              <span className={styles.brandName}>{siteTitle || 'Headtilts'}</span>
            </>
          )}
        </div>

        <nav className={styles.nav}>
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.label}>
                <NavLink
                  to={item.to}
                  end={item.to === '/admin'}
                  className={({ isActive }) =>
                    `${styles.navLink} ${isActive ? styles.navActive : ''}`
                  }
                >
                  <span className={styles.navIcon}><FontAwesomeIcon icon={item.icon} fixedWidth /></span>
                  {item.label}
                </NavLink>
              </li>
            ))}

            {/* Settings group */}
            <li>
              <button
                type="button"
                className={`${styles.navLink} ${styles.navGroupHeader} ${inSettings ? styles.navGroupActive : ''}`}
                onClick={() => setSettingsOpen((open) => !open)}
                aria-expanded={settingsOpen}
              >
                <span className={styles.navIcon}><FontAwesomeIcon icon={faGear} fixedWidth /></span>
                Settings
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className={`${styles.navChevron} ${settingsOpen ? styles.navChevronOpen : ''}`}
                />
              </button>
              {settingsOpen && (
                <ul className={styles.subNav}>
                  {SETTINGS_ITEMS.map((item) => (
                    <li key={item.label}>
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          `${styles.navLink} ${styles.subNavLink} ${isActive ? styles.navActive : ''}`
                        }
                      >
                        <span className={styles.navIcon}><FontAwesomeIcon icon={item.icon} fixedWidth /></span>
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          </ul>
        </nav>

        <div className={styles.sidebarFooter}>
          <button className={styles.userChip} onClick={() => navigate('/admin/profile')} title="Your profile">
            <div className={styles.avatar}>
              {user?.avatar
                ? <img src={user.avatar} alt={initials} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                : initials}
            </div>
            <span className={styles.userName}>{user?.firstName || user?.username}</span>
          </button>
          <button className={styles.logoutBtn} onClick={() => logout()} title="Log out">
            <FontAwesomeIcon icon={faRightFromBracket} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        <header className={styles.topHeader}>
          <button
            className={styles.hamburger}
            onClick={() => setSidebarOpen((o) => !o)}
            title="Menu"
            aria-label="Toggle navigation menu"
          >
            <FontAwesomeIcon icon={faBars} />
          </button>
          <div className={styles.topHeaderActions}>
            <NotificationBell />
            <div className={styles.themeSwitch} role="group" aria-label="Color theme">
              {([
                { value: 'system', icon: faDesktop, label: 'System' },
                { value: 'light',  icon: faSun,     label: 'Light'  },
                { value: 'dark',   icon: faMoon,    label: 'Dark'   },
              ] as { value: ThemeMode; icon: typeof faSun; label: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`${styles.themeOption} ${mode === opt.value ? styles.themeOptionActive : ''}`}
                  onClick={() => setMode(opt.value)}
                  title={`${opt.label} theme`}
                  aria-label={`${opt.label} theme`}
                  aria-pressed={mode === opt.value}
                >
                  <FontAwesomeIcon icon={opt.icon} />
                </button>
              ))}
            </div>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
