-- The seed stored api_analytics_view as module "api" + action "analytics_view" while an
-- earlier migration stored it as "api_analytics" + "view": the same permission twice,
-- shown as two modules in the role editor. Keep the latter and move any grants onto it.
INSERT IGNORE INTO `Permission` (`module`, `action`, `description`)
VALUES ('api_analytics', 'view', 'View API key usage analytics');

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT rp.roleId, keep.id
FROM `RolePermission` rp
JOIN `Permission` dup ON dup.id = rp.permissionId AND dup.module = 'api' AND dup.action = 'analytics_view'
JOIN `Permission` keep ON keep.module = 'api_analytics' AND keep.action = 'view';

DELETE FROM `Permission` WHERE `module` = 'api' AND `action` = 'analytics_view';
