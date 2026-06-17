// RBAC types

export interface Role {
  id: number;
  name: string;
  description?: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: number;
  module: string;
  action: string;
  description?: string;
  createdAt: Date;
}

export interface RolePermission {
  id: number;
  roleId: number;
  permissionId: number;
}

export interface UserRole {
  id: number;
  userId: string;
  roleId: number;
}

// Permission key type
export type PermissionKey = `${string}_${string}`;

export const PERMISSION_MODULES = {
  POSTS: 'posts',
  USERS: 'users',
  CATEGORIES: 'categories',
  TAGS: 'tags',
  MENUS: 'menus',
  WIDGETS: 'widgets',
  ROLES: 'roles',
  PERMISSIONS: 'permissions',
  SETTINGS: 'settings',
  SEO: 'seo',
} as const;

export const PERMISSION_ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  PUBLISH: 'publish',
  MANAGE_ROLES: 'manage_roles',
} as const;
