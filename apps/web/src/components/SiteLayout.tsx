import { ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDesktop, faSun, faMoon } from '@fortawesome/free-solid-svg-icons';
import { fetchMenu } from '../services/taxonomy';
import { resolveMediaUrl } from '../services/api';
import { MenuItem } from '../types';
import { WidgetZone } from './WidgetZone';
import { CelebrationSpotlight } from './CelebrationSpotlight';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { useLayout } from '../context/LayoutContext';
import { applyRobotsPolicy } from '../utils/seo';

const THEME_OPTIONS: { value: ThemeMode; icon: typeof faSun; label: string }[] = [
  { value: 'system', icon: faDesktop, label: 'System' },
  { value: 'light',  icon: faSun,     label: 'Light'  },
  { value: 'dark',   icon: faMoon,    label: 'Dark'   },
];

function ThemeSwitch() {
  const { mode, setMode } = useTheme();
  return (
    <div className="theme-switch" role="group" aria-label="Color theme">
      {THEME_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`theme-option${mode === opt.value ? ' active' : ''}`}
          onClick={() => setMode(opt.value)}
          title={`${opt.label} theme`}
          aria-label={`${opt.label} theme`}
          aria-pressed={mode === opt.value}
        >
          <FontAwesomeIcon icon={opt.icon} />
        </button>
      ))}
    </div>
  );
}

function buildTree(items: MenuItem[]): (MenuItem & { children: MenuItem[] })[] {
  const top = items.filter((i) => !i.parentId);
  return top.map((item) => ({
    ...item,
    children: items.filter((i) => i.parentId === item.id),
  }));
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const {
    site_title, site_tagline, show_tagline, site_logo, site_logo_dark,
    search_engine_visibility,
  } = useSiteSettings();
  const { theme } = useTheme();
  const { variant, showSidebar } = useLayout();
  const location = useLocation();
  const [navItems, setNavItems] = useState<(MenuItem & { children: MenuItem[] })[]>([]);
  const [footerItems, setFooterItems] = useState<MenuItem[]>([]);
  const [navOpen, setNavOpen] = useState(false);

  // Close the mobile nav whenever the route changes.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    fetchMenu('primary')
      .then((menu) => setNavItems(buildTree(menu.items)))
      .catch(() => {});
    fetchMenu('footer')
      .then((menu) => setFooterItems(menu.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    applyRobotsPolicy(search_engine_visibility !== 'no');
  }, [search_engine_visibility]);

  if (variant === 'blank') {
    return <>{children}</>;
  }

  const withSidebar = variant === 'default' && showSidebar;
  const isFullBleed = variant === 'full-bleed';

  return (
    <div className="site-wrap">
      <CelebrationSpotlight />
      <header className={`site-header${isFullBleed ? ' site-header--transparent' : ''}`}>
        <div className="container header-inner">
          <div className="site-brand-wrap">
            <Link to="/" className="site-brand">
              {(() => {
                const logo = (theme === 'dark' && site_logo_dark) ? site_logo_dark : site_logo;
                return logo
                  ? <img className="site-logo" src={resolveMediaUrl(logo)} alt={site_title} />
                  : site_title;
              })()}
            </Link>
            {show_tagline !== 'no' && site_tagline && <span className="site-tagline">{site_tagline}</span>}
          </div>
          <div className="header-right">
            <nav className={`site-nav${navOpen ? ' open' : ''}`}>
              {navItems.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.url || '#'}
                  className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
                >
                  {item.title}
                </NavLink>
              ))}
            </nav>
            <ThemeSwitch />
            <button
              type="button"
              className="nav-toggle"
              onClick={() => setNavOpen((o) => !o)}
              aria-label="Toggle menu"
              aria-expanded={navOpen}
            >
              <span className={`nav-toggle-bars${navOpen ? ' open' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className={`site-main${isFullBleed ? ' site-main--full-bleed' : ''}`}>
        {isFullBleed ? (
          children
        ) : (
          <div className={`container site-content${withSidebar ? '' : ' site-content--full'}`}>
            <div className="site-body">{children}</div>
            {withSidebar && <WidgetZone zone="sidebar" className="site-sidebar" />}
          </div>
        )}
      </main>

      <footer className="site-footer">
        <div className="container footer-widgets">
          <WidgetZone zone="footer-1" />
          <WidgetZone zone="footer-2" />
          <WidgetZone zone="footer-3" />
        </div>
        <div className="container footer-bottom">
          <p>© {new Date().getFullYear()} {site_title}</p>
          {footerItems.length > 0 && (
            <nav className="footer-legal-links">
              {footerItems.map((item) => (
                <Link key={item.id} to={item.url || '#'}>{item.title}</Link>
              ))}
            </nav>
          )}
          {/* Legal links (Privacy, Terms, …) are managed via the "footer-bottom" widget zone */}
          <WidgetZone zone="footer-bottom" className="footer-legal-zone" />
        </div>
      </footer>
    </div>
  );
}
