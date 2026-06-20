// All permissions in the system
export const PERMISSIONS = {
  // Posts
  POST_CREATE: 'posts_create',
  POST_READ: 'posts_read',
  POST_EDIT: 'posts_update',
  POST_DELETE: 'posts_delete',
  POST_PUBLISH: 'posts_publish',

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
  PERMISSION_MANAGE: 'permissions_manage',

  // Comments
  COMMENT_READ: 'comments_read',
  COMMENT_MODERATE: 'comments_moderate',

  // Settings
  SETTING_READ: 'settings_read',
  SETTING_EDIT: 'settings_update',

  // SEO
  SEO_READ: 'seo_read',
  SEO_EDIT: 'seo_update',
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
  POLL_VOTE: 'polls_vote',
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
} as const;

// Default roles with their permissions
export const DEFAULT_ROLES = {
  SUPER_ADMIN: {
    name: 'super-admin',
    description: 'Complete access to all features',
    permissions: Object.values(PERMISSIONS),
  },
  ADMIN: {
    name: 'admin',
    description: 'Administrative access',
    permissions: [
      PERMISSIONS.POST_CREATE,
      PERMISSIONS.POST_READ,
      PERMISSIONS.POST_EDIT,
      PERMISSIONS.POST_DELETE,
      PERMISSIONS.POST_PUBLISH,
      PERMISSIONS.MEDIA_UPLOAD,
      PERMISSIONS.MEDIA_READ,
      PERMISSIONS.MEDIA_DELETE,
      PERMISSIONS.USER_CREATE,
      PERMISSIONS.USER_READ,
      PERMISSIONS.USER_EDIT,
      PERMISSIONS.USER_DELETE,
      PERMISSIONS.USER_MANAGE_ROLES,
      PERMISSIONS.CATEGORY_CREATE,
      PERMISSIONS.CATEGORY_READ,
      PERMISSIONS.CATEGORY_EDIT,
      PERMISSIONS.CATEGORY_DELETE,
      PERMISSIONS.TAG_CREATE,
      PERMISSIONS.TAG_READ,
      PERMISSIONS.TAG_EDIT,
      PERMISSIONS.TAG_DELETE,
      PERMISSIONS.MENU_CREATE,
      PERMISSIONS.MENU_READ,
      PERMISSIONS.MENU_EDIT,
      PERMISSIONS.MENU_DELETE,
      PERMISSIONS.WIDGET_CREATE,
      PERMISSIONS.WIDGET_READ,
      PERMISSIONS.WIDGET_EDIT,
      PERMISSIONS.WIDGET_DELETE,
      PERMISSIONS.ROLE_CREATE,
      PERMISSIONS.ROLE_READ,
      PERMISSIONS.ROLE_EDIT,
      PERMISSIONS.ROLE_DELETE,
      PERMISSIONS.PERMISSION_READ,
      PERMISSIONS.PERMISSION_MANAGE,
      PERMISSIONS.COMMENT_READ,
      PERMISSIONS.COMMENT_MODERATE,
      PERMISSIONS.SETTING_READ,
      PERMISSIONS.SETTING_EDIT,
      PERMISSIONS.SEO_READ,
      PERMISSIONS.SEO_EDIT,
      PERMISSIONS.SEO_MANAGE,
      PERMISSIONS.CELEBRATION_CREATE,
      PERMISSIONS.CELEBRATION_READ,
      PERMISSIONS.CELEBRATION_EDIT,
      PERMISSIONS.CELEBRATION_DELETE,
      PERMISSIONS.POLL_CREATE,
      PERMISSIONS.POLL_READ,
      PERMISSIONS.POLL_EDIT,
      PERMISSIONS.POLL_DELETE,
      PERMISSIONS.POLL_VOTE,
      PERMISSIONS.POLL_RESET,
      PERMISSIONS.REVISION_READ,
      PERMISSIONS.REVISION_ARCHIVE,
      PERMISSIONS.NOTIFICATION_MANAGE,
      PERMISSIONS.API_ANALYTICS_VIEW,
      PERMISSIONS.REDIRECT_READ,
      PERMISSIONS.REDIRECT_MANAGE,
      PERMISSIONS.CONTACT_READ,
      PERMISSIONS.CONTACT_MANAGE,
    ],
  },
  EDITOR: {
    name: 'editor',
    description: 'Can edit and publish posts',
    permissions: [
      PERMISSIONS.POST_CREATE,
      PERMISSIONS.POST_READ,
      PERMISSIONS.POST_EDIT,
      PERMISSIONS.POST_PUBLISH,
      PERMISSIONS.MEDIA_UPLOAD,
      PERMISSIONS.MEDIA_READ,
      PERMISSIONS.MEDIA_DELETE,
      PERMISSIONS.CATEGORY_READ,
      PERMISSIONS.TAG_READ,
      PERMISSIONS.TAG_CREATE,
      PERMISSIONS.TAG_EDIT,
      PERMISSIONS.MENU_READ,
      PERMISSIONS.WIDGET_READ,
      PERMISSIONS.COMMENT_READ,
      PERMISSIONS.COMMENT_MODERATE,
      PERMISSIONS.SEO_READ,
      PERMISSIONS.SEO_EDIT,
      PERMISSIONS.SEO_MANAGE,
      PERMISSIONS.CELEBRATION_READ,
      PERMISSIONS.POLL_CREATE,
      PERMISSIONS.POLL_READ,
      PERMISSIONS.POLL_EDIT,
      PERMISSIONS.POLL_RESET,
      PERMISSIONS.REVISION_READ,
      PERMISSIONS.REVISION_ARCHIVE,
      PERMISSIONS.NOTIFICATION_MANAGE,
      PERMISSIONS.CONTACT_READ,
      PERMISSIONS.REDIRECT_READ,
    ],
  },
  AUTHOR: {
    name: 'author',
    description: 'Can write and manage their own posts',
    permissions: [
      PERMISSIONS.POST_CREATE,
      PERMISSIONS.POST_READ,
      PERMISSIONS.POST_EDIT,
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
    ],
  },
  SUBSCRIBER: {
    name: 'subscriber',
    description: 'Subscriber access',
    permissions: [PERMISSIONS.POST_READ, PERMISSIONS.CATEGORY_READ, PERMISSIONS.TAG_READ, PERMISSIONS.POLL_READ, PERMISSIONS.NOTIFICATION_MANAGE],
  },
} as const;
