-- Add event permissions to the Permission table (if not already present)
INSERT IGNORE INTO `Permission` (`module`, `action`, `description`)
VALUES
  ('events', 'create',               'Create events'),
  ('events', 'read',                 'View events'),
  ('events', 'update',               'Edit events'),
  ('events', 'delete',               'Delete events'),
  ('events', 'manage_registrations', 'Manage event registrations');

-- Grant all event permissions to super-admin and admin
INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT r.id, p.id
FROM `Role` r, `Permission` p
WHERE r.name IN ('super-admin', 'admin')
  AND p.module = 'events';

-- Grant create/read/update/manage_registrations to editor (no delete)
INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT r.id, p.id
FROM `Role` r, `Permission` p
WHERE r.name = 'editor'
  AND p.module = 'events'
  AND p.action IN ('create', 'read', 'update', 'manage_registrations');

-- Grant read-only to author
INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT r.id, p.id
FROM `Role` r, `Permission` p
WHERE r.name = 'author'
  AND p.module = 'events'
  AND p.action = 'read';
