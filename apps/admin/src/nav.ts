import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faGaugeHigh, faPenToSquare, faFileLines, faImages, faComments, faLayerGroup,
  faTags, faBars, faPuzzlePiece, faUsers, faUserShield, faSitemap, faEnvelope,
  faSliders, faCakeCandles, faChartBar, faKey, faArrowRight, faChartLine, faChartPie,
  faBoxArchive, faClipboardList, faCalendarAlt, faHeartPulse, faUpload, faFileImport, faCommentDots, faListCheck, faTableCellsLarge
} from '@fortawesome/free-solid-svg-icons';
import { PERMISSIONS } from '@headtilts/shared';

export type BadgeKey = 'comments' | 'contact' | 'feedback' | 'issues';

export interface NavItem {
  label: string;
  to: string;
  icon: IconDefinition;
  permission?: string;
  badge?: BadgeKey;
  /** "g <key>" jumps here */
  hotkey?: string;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * Single source of truth for admin navigation, grouped by job-to-be-done
 * rather than lumping everything that isn't content under "Settings".
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'content',
    label: 'Content',
    items: [
      { label: 'Posts', to: '/admin/posts', icon: faPenToSquare, permission: PERMISSIONS.POST_READ, hotkey: 'p' },
      { label: 'Pages', to: '/admin/pages', icon: faFileLines, permission: PERMISSIONS.POST_READ, hotkey: 'a' },
      { label: 'Media', to: '/admin/media', icon: faImages, permission: PERMISSIONS.MEDIA_READ, hotkey: 'm' },
      { label: 'Categories', to: '/admin/categories', icon: faLayerGroup, permission: PERMISSIONS.CATEGORY_READ },
      { label: 'Tags', to: '/admin/tags', icon: faTags, permission: PERMISSIONS.TAG_READ },
    ],
  },
  {
    id: 'engage',
    label: 'Engagement',
    items: [
      { label: 'Comments', to: '/admin/comments', icon: faComments, permission: PERMISSIONS.COMMENT_READ, badge: 'comments', hotkey: 'c' },
      { label: 'Contact', to: '/admin/contact', icon: faEnvelope, permission: PERMISSIONS.CONTACT_READ, badge: 'contact', hotkey: 'i' },
      { label: 'Polls', to: '/admin/polls', icon: faChartBar, permission: PERMISSIONS.POLL_READ },
      { label: 'Events', to: '/admin/events', icon: faCalendarAlt, permission: PERMISSIONS.EVENT_READ, hotkey: 'e' },
      { label: 'Celebrations', to: '/admin/celebrations', icon: faCakeCandles, permission: PERMISSIONS.CELEBRATION_READ },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { label: 'Analytics', to: '/admin/analytics', icon: faChartPie, permission: PERMISSIONS.POST_READ },
      { label: 'API Analytics', to: '/admin/api-analytics', icon: faChartLine, permission: PERMISSIONS.API_ANALYTICS_VIEW },
    ],
  },
  {
    id: 'appearance',
    label: 'Appearance',
    items: [
      { label: 'Front page', to: '/admin/front-page', icon: faTableCellsLarge, permission: PERMISSIONS.WIDGET_READ },
      { label: 'Menus', to: '/admin/menus', icon: faBars, permission: PERMISSIONS.MENU_READ },
      { label: 'Widgets', to: '/admin/widgets', icon: faPuzzlePiece, permission: PERMISSIONS.WIDGET_READ },
    ],
  },
  {
    id: 'people',
    label: 'People & Access',
    items: [
      { label: 'Users', to: '/admin/users', icon: faUsers, permission: PERMISSIONS.USER_READ, hotkey: 'u' },
      { label: 'Roles', to: '/admin/roles', icon: faUserShield, permission: PERMISSIONS.ROLE_READ },
      { label: 'API Keys', to: '/admin/api-keys', icon: faKey },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { label: 'Settings', to: '/admin/settings', icon: faSliders, permission: PERMISSIONS.SETTING_READ, hotkey: 's' },
      { label: 'Sitemap', to: '/admin/sitemap', icon: faSitemap, permission: PERMISSIONS.SEO_READ },
      { label: 'Redirects', to: '/admin/redirects', icon: faArrowRight, permission: PERMISSIONS.REDIRECT_READ },
      { label: 'Backups', to: '/admin/backups', icon: faBoxArchive, permission: PERMISSIONS.SYSTEM_BACKUP },
      { label: 'Activity Logs', to: '/admin/logs', icon: faClipboardList, permission: PERMISSIONS.LOG_READ },
      { label: 'Health', to: '/admin/health', icon: faHeartPulse, permission: PERMISSIONS.SETTING_READ },
      { label: 'Feedback', to: '/admin/feedback', icon: faCommentDots, permission: PERMISSIONS.SETTING_READ, badge: 'feedback' },
      { label: 'Issues', to: '/admin/issues', icon: faListCheck, permission: PERMISSIONS.SETTING_READ, badge: 'issues' },
    ],
  },
];

export const DASHBOARD_ITEM: NavItem = { label: 'Dashboard', to: '/admin', icon: faGaugeHigh, hotkey: 'd' };

export interface CreateAction {
  label: string;
  to: string;
  icon: IconDefinition;
  permission: string;
}

export const CREATE_ACTIONS: CreateAction[] = [
  { label: 'Post', to: '/admin/posts/new', icon: faPenToSquare, permission: PERMISSIONS.POST_CREATE },
  { label: 'Page', to: '/admin/pages/new', icon: faFileLines, permission: PERMISSIONS.POST_CREATE },
  { label: 'Import posts from Word', to: '/admin/posts/import', icon: faFileImport, permission: PERMISSIONS.POST_CREATE },
  { label: 'Media upload', to: '/admin/media', icon: faUpload, permission: PERMISSIONS.MEDIA_UPLOAD },
  { label: 'Poll', to: '/admin/polls/new', icon: faChartBar, permission: PERMISSIONS.POLL_CREATE },
  { label: 'Event', to: '/admin/events/new', icon: faCalendarAlt, permission: PERMISSIONS.EVENT_CREATE },
];

/** Section that owns a path, for breadcrumbs. */
export function sectionForPath(pathname: string): { section: NavSection; item: NavItem } | null {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) return { section, item };
    }
  }
  return null;
}
