-- Pages get their own permissions, as in WordPress: until now they shared posts_*,
-- so authors and contributors could create and edit pages.
INSERT IGNORE INTO `Permission` (`module`, `action`, `description`) VALUES
  ('pages', 'create', 'Create pages'),
  ('pages', 'read', 'View pages in the admin, including drafts'),
  ('pages', 'update', 'Edit pages'),
  ('pages', 'delete', 'Permanently delete pages'),
  ('pages', 'publish', 'Publish and schedule pages, and edit live ones'),
  ('pages', 'edit_others', 'Edit, trash and delete pages written by other users');

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT r.id, p.id FROM `Role` r, `Permission` p
WHERE r.name IN ('super-admin', 'admin', 'editor') AND p.module = 'pages';
