import { Link, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight } from '@fortawesome/free-solid-svg-icons';
import styles from './Breadcrumb.module.css';

const LABELS: Record<string, string> = {
  posts: 'Posts',
  pages: 'Pages',
  media: 'Media',
  comments: 'Comments',
  categories: 'Categories',
  tags: 'Tags',
  celebrations: 'Celebrations',
  polls: 'Polls',
  contact: 'Contact',
  analytics: 'Analytics',
  settings: 'Settings',
  'api-keys': 'API Keys',
  users: 'Users',
  roles: 'Roles',
  menus: 'Menus',
  widgets: 'Widgets',
  sitemap: 'Sitemap',
  redirects: 'Redirects',
  'api-analytics': 'API Analytics',
  backups: 'Backups',
  logs: 'Logs',
  health: 'Health',
  profile: 'Profile',
};

const SINGULAR: Record<string, string> = {
  posts: 'Post',
  pages: 'Page',
  polls: 'Poll',
  menus: 'Menu',
  users: 'User',
  roles: 'Role',
  widgets: 'Widget',
  redirects: 'Redirect',
  'api-keys': 'API Key',
  categories: 'Category',
  tags: 'Tag',
  celebrations: 'Celebration',
};

// These live inside the Settings nav group
const SETTINGS_CHILDREN = new Set([
  'api-keys', 'users', 'roles', 'menus', 'widgets',
  'sitemap', 'redirects', 'api-analytics', 'backups', 'logs',
]);

function isNumericId(seg: string) { return /^\d+$/.test(seg); }

interface Crumb { label: string; to: string | null; }

function buildCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean).slice(1); // drop 'admin'
  if (parts.length === 0) return [];

  const [seg0, seg1, seg2] = parts;
  const crumbs: Crumb[] = [];

  if (SETTINGS_CHILDREN.has(seg0)) {
    crumbs.push({ label: 'Settings', to: '/admin/settings' });
  }

  if (seg0 in LABELS) {
    crumbs.push({ label: LABELS[seg0], to: seg1 ? `/admin/${seg0}` : null });
  }

  if (seg1) {
    if (seg1 === 'new') {
      const singular = SINGULAR[seg0] ?? LABELS[seg0] ?? seg0;
      crumbs.push({ label: `New ${singular}`, to: null });
    } else if (isNumericId(seg1) && seg2 === 'edit') {
      const singular = SINGULAR[seg0] ?? LABELS[seg0] ?? seg0;
      crumbs.push({ label: `Edit ${singular}`, to: null });
    } else if (!isNumericId(seg1) && seg1 in LABELS) {
      crumbs.push({ label: LABELS[seg1], to: null });
    }
  }

  return crumbs;
}

interface BreadcrumbProps {
  show: boolean;
}

export function Breadcrumb({ show }: BreadcrumbProps) {
  const { pathname } = useLocation();

  if (!show) return null;

  const crumbs = buildCrumbs(pathname);
  if (crumbs.length === 0) return null;

  return (
    <nav className={styles.breadcrumb} aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => (
        <span key={i} className={styles.item}>
          {i > 0 && <span className={styles.sep} aria-hidden><FontAwesomeIcon icon={faChevronRight} /></span>}
          {crumb.to
            ? <Link to={crumb.to} className={styles.link}>{crumb.label}</Link>
            : <span className={styles.current}>{crumb.label}</span>}
        </span>
      ))}
    </nav>
  );
}
