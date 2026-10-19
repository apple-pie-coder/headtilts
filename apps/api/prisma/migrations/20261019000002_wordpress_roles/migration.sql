-- Default roles modelled on WordPress (see packages/shared/src/constants/permissions.ts).
-- Only adds or removes the specific grants below, so other customisations are kept.

-- Permissions nothing checks: role editing uses roles_update, SEO fields come with
-- editing the post, and poll voting is public.
DELETE FROM `Permission` WHERE CONCAT(`module`, '_', `action`) IN ('permissions_manage', 'seo_update', 'polls_vote');

-- Editor: all content, anyone's — permanent deletes, categories and tags, celebrations, polls, events.
INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT r.id, p.id FROM `Role` r, `Permission` p
WHERE r.name = 'editor'
  AND CONCAT(p.module, '_', p.action) IN (
    'posts_delete', 'categories_create', 'categories_update', 'categories_delete', 'tags_delete',
    'celebrations_create', 'celebrations_update', 'celebrations_delete', 'polls_delete', 'events_delete'
  );

-- Author: publishes and deletes their own posts (others' stay off-limits without posts_edit_others).
INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT r.id, p.id FROM `Role` r, `Permission` p
WHERE r.name = 'author' AND CONCAT(p.module, '_', p.action) IN ('posts_publish', 'posts_delete');

-- Contributor: their own drafts only; an editor publishes. No uploads.
INSERT IGNORE INTO `Role` (`name`, `description`, `isSystem`, `mfaRequired`, `createdAt`, `updatedAt`)
VALUES ('contributor', 'Writes their own drafts for an editor to review and publish', true, false, NOW(3), NOW(3));

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT r.id, p.id FROM `Role` r, `Permission` p
WHERE r.name = 'contributor'
  AND CONCAT(p.module, '_', p.action) IN (
    'posts_create', 'posts_read', 'posts_update', 'posts_delete', 'categories_read', 'tags_read',
    'tags_create', 'seo_read', 'revisions_read', 'notifications_manage'
  );

-- Subscriber: nothing on the admin API, where even "read" includes drafts and unpublished items.
DELETE rp FROM `RolePermission` rp
JOIN `Role` r ON r.id = rp.roleId
JOIN `Permission` p ON p.id = rp.permissionId
WHERE r.name = 'subscriber' AND CONCAT(p.module, '_', p.action) IN ('categories_read', 'tags_read', 'polls_read');

-- Describe the roles as they now behave, unless someone has reworded them.
UPDATE `Role` SET `description` = 'Runs the site: users, roles, settings, appearance and all content' WHERE `name` = 'admin' AND `description` = 'Administrative access';
UPDATE `Role` SET `description` = 'Publishes and manages all content, including other people’s' WHERE `name` = 'editor' AND `description` = 'Can edit and publish posts';
UPDATE `Role` SET `description` = 'Writes, publishes and deletes their own posts' WHERE `name` = 'author' AND `description` = 'Can write and manage their own posts';
UPDATE `Role` SET `description` = 'Manages their own profile and notifications' WHERE `name` = 'subscriber' AND `description` = 'Subscriber access';
