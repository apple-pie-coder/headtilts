// All permissions in the system
export const PERMISSIONS = {
  // Posts
  POST_CREATE: 'posts_create',
  POST_READ: 'posts_read',
  POST_EDIT: 'posts_update',
  POST_DELETE: 'posts_delete',
  POST_PUBLISH: 'posts_publish',
  // Edit/trash/delete posts authored by someone else (authors only manage their own)
  POST_EDIT_OTHERS: 'posts_edit_others',

  // Pages: the same set as posts, as in WordPress (only editors and up get them)
  PAGE_CREATE: 'pages_create',
  PAGE_READ: 'pages_read',
  PAGE_EDIT: 'pages_update',
  PAGE_DELETE: 'pages_delete',
  PAGE_PUBLISH: 'pages_publish',
  PAGE_EDIT_OTHERS: 'pages_edit_others',

  // Media
  MEDIA_UPLOAD: 'media_create',
  MEDIA_READ: 'media_read',
  MEDIA_DELETE: 'media_delete',

  // Users
  USER_CREATE: 'users_create',
  USER_READ: 'users_read',
  USER_EDIT: 'users_update',
  USER_DELETE: 'users_delete',
  USER_MANAGE_ROLES: 'users_manage_roles',

  // Categories
  CATEGORY_CREATE: 'categories_create',
  CATEGORY_READ: 'categories_read',
  CATEGORY_EDIT: 'categories_update',
  CATEGORY_DELETE: 'categories_delete',

  // Tags
  TAG_CREATE: 'tags_create',
  TAG_READ: 'tags_read',
  TAG_EDIT: 'tags_update',
  TAG_DELETE: 'tags_delete',

  // Menus
  MENU_CREATE: 'menus_create',
  MENU_READ: 'menus_read',
  MENU_EDIT: 'menus_update',
  MENU_DELETE: 'menus_delete',

  // Widgets
  WIDGET_CREATE: 'widgets_create',
  WIDGET_READ: 'widgets_read',
  WIDGET_EDIT: 'widgets_update',
  WIDGET_DELETE: 'widgets_delete',

  // Roles
  ROLE_CREATE: 'roles_create',
  ROLE_READ: 'roles_read',
  ROLE_EDIT: 'roles_update',
  ROLE_DELETE: 'roles_delete',

  // Permissions
  PERMISSION_READ: 'permissions_read',

  // Comments
  COMMENT_READ: 'comments_read',
  COMMENT_MODERATE: 'comments_moderate',

  // Settings
  SETTING_READ: 'settings_read',
  SETTING_EDIT: 'settings_update',

  // SEO
  SEO_READ: 'seo_read',
  SEO_MANAGE: 'seo_manage',

  // Celebrations
  CELEBRATION_CREATE: 'celebrations_create',
  CELEBRATION_READ: 'celebrations_read',
  CELEBRATION_EDIT: 'celebrations_update',
  CELEBRATION_DELETE: 'celebrations_delete',

  // Polls
  POLL_CREATE: 'polls_create',
  POLL_READ: 'polls_read',
  POLL_EDIT: 'polls_update',
  POLL_DELETE: 'polls_delete',
  POLL_RESET: 'polls_reset',

  // Revisions
  REVISION_READ: 'revisions_read',       // view the revision log for posts/pages
  REVISION_ARCHIVE: 'revisions_archive', // archive (soft-hide) individual log entries

  // Notifications
  NOTIFICATION_MANAGE: 'notifications_manage', // manage own notification preferences

  // API Analytics
  API_ANALYTICS_VIEW: 'api_analytics_view',    // view API key usage analytics

  // Redirects
  REDIRECT_READ: 'redirects_read',
  REDIRECT_MANAGE: 'redirects_manage',

  // Contact
  CONTACT_READ: 'contact_read',
  CONTACT_MANAGE: 'contact_manage',

  // Backups
  SYSTEM_BACKUP: 'system_backup', // create, download, restore, delete backups

  // Activity Logs
  LOG_READ:   'logs_read',
  LOG_DELETE: 'logs_delete',

  // Events
  EVENT_CREATE: 'events_create',
  EVENT_READ:   'events_read',
  EVENT_EDIT:   'events_update',
  EVENT_DELETE: 'events_delete',
  EVENT_MANAGE_REGISTRATIONS: 'events_manage_registrations',
  EVENT_CHECK_IN: 'events_check_in', // the door scanner
} as const;

export type ContentAction = 'create' | 'read' | 'update' | 'delete' | 'publish' | 'edit_others';

/** The posts_* or pages_* permission for an action on a content item of this type. */
export function contentPermission(type: string | null | undefined, action: ContentAction): string {
  return `${type === 'page' ? 'pages' : 'posts'}_${action}`;
}

// Default roles with their permissions, modelled on WordPress's roles:
//   super-admin  everything, including backups (a restore overwrites the whole database)
//   admin        runs the site: users, roles, settings, appearance, all content
//   editor       all content, anyone's: posts and pages, categories and tags, comments
//   author       their own posts (not pages): write, publish, delete, upload media
//   contributor  their own drafts only: an editor reviews and publishes; no uploads
//   subscriber   their own profile and notification preferences
//   door-staff   the ticket scanner, around event time, and nothing else
// "Own" vs "anyone's" is POST_EDIT_OTHERS; publishing and live posts need POST_PUBLISH.
const ADMIN_EXCLUDED: string[] = [PERMISSIONS.SYSTEM_BACKUP];

export const DEFAULT_ROLES = {
  SUPER_ADMIN: {
    name: 'super-admin',
    description: 'Complete access to all features',
    permissions: Object.values(PERMISSIONS),
  },
  ADMIN: {
    name: 'admin',
    description: 'Runs the site: users, roles, settings, appearance and all content',
    permissions: Object.values(PERMISSIONS).filter((p) => !ADMIN_EXCLUDED.includes(p)),
  },
  EDITOR: {
    name: 'editor',
    description: 'Publishes and manages all content, including other people\u2019s',
    permissions: [
      PERMISSIONS.POST_CREATE,
      PERMISSIONS.POST_READ,
      PERMISSIONS.POST_EDIT,
      PERMISSIONS.POST_DELETE,
      PERMISSIONS.POST_PUBLISH,
      PERMISSIONS.POST_EDIT_OTHERS,
      PERMISSIONS.PAGE_CREATE,
      PERMISSIONS.PAGE_READ,
      PERMISSIONS.PAGE_EDIT,
      PERMISSIONS.PAGE_DELETE,
      PERMISSIONS.PAGE_PUBLISH,
      PERMISSIONS.PAGE_EDIT_OTHERS,
      PERMISSIONS.MEDIA_UPLOAD,
      PERMISSIONS.MEDIA_READ,
      PERMISSIONS.MEDIA_DELETE,
      PERMISSIONS.CATEGORY_CREATE,
      PERMISSIONS.CATEGORY_READ,
      PERMISSIONS.CATEGORY_EDIT,
      PERMISSIONS.CATEGORY_DELETE,
      PERMISSIONS.TAG_CREATE,
      PERMISSIONS.TAG_READ,
      PERMISSIONS.TAG_EDIT,
      PERMISSIONS.TAG_DELETE,
      PERMISSIONS.MENU_READ,
      PERMISSIONS.WIDGET_READ,
      PERMISSIONS.COMMENT_READ,
      PERMISSIONS.COMMENT_MODERATE,
      PERMISSIONS.SEO_READ,
      PERMISSIONS.SEO_MANAGE,
      PERMISSIONS.CELEBRATION_CREATE,
      PERMISSIONS.CELEBRATION_READ,
      PERMISSIONS.CELEBRATION_EDIT,
      PERMISSIONS.CELEBRATION_DELETE,
      PERMISSIONS.POLL_CREATE,
      PERMISSIONS.POLL_READ,
      PERMISSIONS.POLL_EDIT,
      PERMISSIONS.POLL_DELETE,
      PERMISSIONS.POLL_RESET,
      PERMISSIONS.REVISION_READ,
      PERMISSIONS.REVISION_ARCHIVE,
      PERMISSIONS.NOTIFICATION_MANAGE,
      PERMISSIONS.CONTACT_READ,
      PERMISSIONS.REDIRECT_READ,
      PERMISSIONS.EVENT_CREATE,
      PERMISSIONS.EVENT_READ,
      PERMISSIONS.EVENT_EDIT,
      PERMISSIONS.EVENT_DELETE,
      PERMISSIONS.EVENT_MANAGE_REGISTRATIONS,
      PERMISSIONS.EVENT_CHECK_IN,
    ],
  },
  AUTHOR: {
    name: 'author',
    description: 'Writes, publishes and deletes their own posts',
    permissions: [
      PERMISSIONS.POST_CREATE,
      PERMISSIONS.POST_READ,
      PERMISSIONS.POST_EDIT,
      PERMISSIONS.POST_DELETE,
      PERMISSIONS.POST_PUBLISH,
      PERMISSIONS.MEDIA_UPLOAD,
      PERMISSIONS.MEDIA_READ,
      PERMISSIONS.CATEGORY_READ,
      PERMISSIONS.TAG_READ,
      PERMISSIONS.TAG_CREATE,
      PERMISSIONS.COMMENT_READ,
      PERMISSIONS.SEO_READ,
      PERMISSIONS.CELEBRATION_READ,
      PERMISSIONS.POLL_READ,
      PERMISSIONS.REVISION_READ,
      PERMISSIONS.NOTIFICATION_MANAGE,
      PERMISSIONS.EVENT_READ,
    ],
  },
  CONTRIBUTOR: {
    name: 'contributor',
    description: 'Writes their own drafts for an editor to review and publish',
    permissions: [
      PERMISSIONS.POST_CREATE,
      PERMISSIONS.POST_READ,
      PERMISSIONS.POST_EDIT,
      PERMISSIONS.POST_DELETE,
      PERMISSIONS.CATEGORY_READ,
      PERMISSIONS.TAG_READ,
      PERMISSIONS.TAG_CREATE,
      PERMISSIONS.SEO_READ,
      PERMISSIONS.REVISION_READ,
      PERMISSIONS.NOTIFICATION_MANAGE,
    ],
  },
  SUBSCRIBER: {
    name: 'subscriber',
    description: 'Manages their own profile and notifications',
    // Nothing on the admin API: even "read" there includes drafts and unpublished items.
    permissions: [PERMISSIONS.NOTIFICATION_MANAGE],
  },
  DOOR_STAFF: {
    name: 'door-staff',
    description: 'Scans tickets at the door around event time, and nothing else',
    permissions: [PERMISSIONS.EVENT_CHECK_IN],
  },
} as const;
