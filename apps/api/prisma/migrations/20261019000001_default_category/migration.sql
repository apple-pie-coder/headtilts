-- Every install has a default "Uncategorized" category that posts fall back to.
-- Reuses an existing one (by slug or name) rather than creating a duplicate.
INSERT INTO `Category` (`name`, `slug`, `showSidebar`, `createdAt`, `updatedAt`)
SELECT 'Uncategorized', 'uncategorized', false, NOW(3), NOW(3)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `Category` WHERE `slug` = 'uncategorized' OR `name` = 'Uncategorized');

INSERT IGNORE INTO `Setting` (`key`, `value`, `type`)
SELECT 'default_category', CAST(`id` AS CHAR), 'string'
FROM `Category`
WHERE `slug` = 'uncategorized' OR `name` = 'Uncategorized'
ORDER BY (`slug` = 'uncategorized') DESC, `id`
LIMIT 1;

-- Posts that have no category yet are filed under it.
INSERT INTO `PostCategory` (`postId`, `categoryId`)
SELECT p.`id`, CAST(s.`value` AS UNSIGNED)
FROM `Post` p
JOIN `Setting` s ON s.`key` = 'default_category'
WHERE p.`type` = 'post'
  AND NOT EXISTS (SELECT 1 FROM `PostCategory` pc WHERE pc.`postId` = p.`id`);
