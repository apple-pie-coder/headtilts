-- Authors may only manage their own posts; editing others' posts needs this.
INSERT IGNORE INTO `Permission` (`module`, `action`, `description`)
VALUES ('posts', 'edit_others', 'Edit, trash and delete posts written by other users');

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT r.id, p.id
FROM `Role` r, `Permission` p
WHERE r.name IN ('super-admin', 'admin', 'editor')
  AND p.module = 'posts'
  AND p.action = 'edit_others';

-- Self-registered subscribers must not read drafts/scheduled posts via the admin API.
DELETE rp FROM `RolePermission` rp
JOIN `Role` r ON r.id = rp.roleId
JOIN `Permission` p ON p.id = rp.permissionId
WHERE r.name = 'subscriber'
  AND p.module = 'posts'
  AND p.action = 'read';

-- Public self-registration is opt-in.
INSERT IGNORE INTO `Setting` (`key`, `value`, `type`)
VALUES ('users_can_register', 'no', 'string');
