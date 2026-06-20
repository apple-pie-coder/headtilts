-- Add api_analytics_view permission to the Permission table (if not already present)
INSERT IGNORE INTO `Permission` (`module`, `action`, `description`)
VALUES ('api_analytics', 'view', 'View API key usage analytics');

-- Add notifications_manage permission to the Permission table (if not already present)
INSERT IGNORE INTO `Permission` (`module`, `action`, `description`)
VALUES ('notifications', 'manage', 'Manage own notification preferences');

-- Grant api_analytics_view to super-admin and admin roles
INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT r.id, p.id
FROM `Role` r, `Permission` p
WHERE r.name IN ('super-admin', 'admin')
  AND p.module = 'api_analytics'
  AND p.action = 'view';

-- Grant notifications_manage to super-admin, admin, editor, author, subscriber roles
INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT r.id, p.id
FROM `Role` r, `Permission` p
WHERE r.name IN ('super-admin', 'admin', 'editor', 'author', 'subscriber')
  AND p.module = 'notifications'
  AND p.action = 'manage';
