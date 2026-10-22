// Human labels, grouping and ordering for the role editor. Permissions come from
// the API as module + action; anything not listed here still shows, under "Other",
// with a label made from its name, so new permissions never disappear from the editor.

export interface ModuleInfo {
  label: string;
  hint: string;
}

export const PERMISSION_GROUPS: { title: string; modules: string[] }[] = [
  { title: 'Content', modules: ['posts', 'pages', 'media', 'categories', 'tags', 'revisions'] },
  { title: 'Engagement', modules: ['comments', 'contact', 'polls', 'events', 'celebrations'] },
  { title: 'Appearance', modules: ['menus', 'widgets'] },
  { title: 'Insights & SEO', modules: ['seo', 'redirects', 'api_analytics', 'logs'] },
  { title: 'People & access', modules: ['users', 'roles', 'permissions', 'notifications'] },
  { title: 'System', modules: ['settings', 'system'] },
];

export const MODULES: Record<string, ModuleInfo> = {
  posts: { label: 'Posts', hint: 'Articles, news, reviews and Q&As' },
  pages: { label: 'Pages', hint: 'Standalone pages, e.g. About' },
  media: { label: 'Media', hint: 'Images and files in the media library' },
  categories: { label: 'Categories', hint: 'Sections that posts are filed under' },
  tags: { label: 'Tags', hint: 'Keywords attached to posts' },
  revisions: { label: 'Revisions', hint: 'The change history of posts and pages' },
  comments: { label: 'Comments', hint: 'Reader comments on posts' },
  contact: { label: 'Contact messages', hint: 'Messages sent through the contact form' },
  polls: { label: 'Polls', hint: 'Reader polls and their results' },
  events: { label: 'Events', hint: 'Gigs and events, with ticket bookings' },
  celebrations: { label: 'Celebrations', hint: 'Birthdays and remembrance days' },
  menus: { label: 'Menus', hint: 'Site navigation menus' },
  widgets: { label: 'Widgets & front page', hint: 'Sidebar widgets and the front page layout' },
  seo: { label: 'SEO & sitemap', hint: 'Sitemap entries and search settings' },
  redirects: { label: 'Redirects', hint: 'Old URLs forwarded to new ones' },
  api_analytics: { label: 'API analytics', hint: 'Usage of API keys' },
  logs: { label: 'Activity log', hint: 'Record of who did what in the admin' },
  users: { label: 'Users', hint: 'Accounts that can sign in' },
  roles: { label: 'Roles', hint: 'These roles and what they allow' },
  permissions: { label: 'Permission list', hint: 'The list of available permissions' },
  notifications: { label: 'Notifications', hint: 'Their own notification preferences' },
  settings: { label: 'Settings', hint: 'Site-wide settings, health, feedback and issues' },
  system: { label: 'System', hint: 'Database backups' },
};

/** Display order of actions within a module; anything else follows, alphabetically. */
const ACTION_ORDER = ['read', 'view', 'create', 'update', 'publish', 'edit_others', 'moderate', 'manage', 'manage_registrations', 'check_in', 'manage_roles', 'reset', 'archive', 'backup', 'delete'];

const ACTION_LABELS: Record<string, string> = {
  read: 'View', view: 'View', create: 'Create', update: 'Edit', delete: 'Delete', publish: 'Publish',
  edit_others: 'Anyone’s', moderate: 'Moderate', manage: 'Manage', manage_registrations: 'Bookings', check_in: 'Door scanner',
  manage_roles: 'Assign roles', reset: 'Reset votes', archive: 'Archive', backup: 'Backups',
};

/** Tooltips where the label alone doesn't say enough. Keyed by permission name. */
const PERMISSION_HINTS: Record<string, string> = {
  posts_read: 'See all posts in the admin, including drafts',
  posts_update: 'Edit their own posts and move them to the trash',
  posts_publish: 'Publish and schedule posts, and edit live ones',
  posts_edit_others: 'Edit, trash and delete posts written by other people',
  posts_delete: 'Delete posts permanently and empty the trash',
  pages_read: 'See all pages in the admin, including drafts',
  pages_update: 'Edit their own pages and move them to the trash',
  pages_publish: 'Publish and schedule pages, and edit live ones',
  pages_edit_others: 'Edit, trash and delete pages written by other people',
  pages_delete: 'Delete pages permanently and empty the trash',
  media_create: 'Upload and replace files',
  media_delete: 'Delete files from the library',
  revisions_archive: 'Hide entries from a post’s history',
  comments_moderate: 'Approve, mark as spam and delete comments',
  contact_manage: 'Mark, reply to and delete messages',
  polls_reset: 'Clear all votes on a poll',
  events_manage_registrations: 'See, export and update ticket bookings',
  events_check_in: 'Scan tickets at the door. On its own, only from 12 hours before an event to 12 hours after it',
  widgets_update: 'Change widgets and the front page layout',
  seo_manage: 'Add and change sitemap entries',
  redirects_manage: 'Add, change and delete redirects',
  logs_delete: 'Clear the activity log',
  users_manage_roles: 'Change which roles people have',
  notifications_manage: 'Choose which notifications they receive',
  settings_update: 'Change site-wide settings',
  system_backup: 'Create, download, restore and delete backups. A restore replaces the whole database',
};

const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const moduleInfo = (module: string): ModuleInfo => MODULES[module] ?? { label: humanize(module), hint: '' };
/** Labels that depend on the area, e.g. "Others’ posts". */
const PERMISSION_LABELS: Record<string, string> = {
  posts_edit_others: 'Others’ posts',
  pages_edit_others: 'Others’ pages',
};

export const actionLabel = (action: string, module?: string) =>
  (module && PERMISSION_LABELS[`${module}_${action}`]) ?? ACTION_LABELS[action] ?? humanize(action);
export const permissionHint = (module: string, action: string) => PERMISSION_HINTS[`${module}_${action}`];
export const isViewAction = (action: string) => action === 'read' || action === 'view';

export function sortActions<T extends { action: string }>(perms: T[]): T[] {
  const rank = (a: string) => { const i = ACTION_ORDER.indexOf(a); return i === -1 ? ACTION_ORDER.length : i; };
  return [...perms].sort((a, b) => rank(a.action) - rank(b.action) || a.action.localeCompare(b.action));
}

/** The API's { module: permissions[] } arranged into the editor's groups, unknown modules last. */
export function groupPermissions<T extends { action: string }>(byModule: Record<string, T[]>) {
  const known = new Set(PERMISSION_GROUPS.flatMap((g) => g.modules));
  const groups = PERMISSION_GROUPS.map((g) => ({
    title: g.title,
    modules: g.modules.filter((m) => byModule[m]?.length).map((m) => ({ module: m, perms: sortActions(byModule[m]) })),
  }));
  const other = Object.keys(byModule).filter((m) => !known.has(m)).sort();
  if (other.length) groups.push({ title: 'Other', modules: other.map((m) => ({ module: m, perms: sortActions(byModule[m]) })) });
  return groups.filter((g) => g.modules.length);
}
