-- Reconcile remaining columns/types that were applied locally via `prisma db push`
-- but never captured in a migration file. Generated with `prisma migrate diff` and
-- reviewed by hand.
--
-- NOTE: `prisma migrate diff` also wanted to DROP the `*_ft_search` FULLTEXT indexes
-- (cat_ft_search, poll_ft_search, post_ft_search, tag_ft_search). Those are created
-- by 20260620000002_add_search_fulltext_indexes and power MATCH...AGAINST search.
-- Prisma can't model them in schema.prisma, so it always proposes dropping them.
-- They are intentionally KEPT here.

-- AlterTable
ALTER TABLE `ActivityLog` ALTER COLUMN `level` DROP DEFAULT;

-- AlterTable
ALTER TABLE `Backup` MODIFY `errorMsg` TEXT NULL;

-- AlterTable
ALTER TABLE `Post` ADD COLUMN `showToc` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `PostRevision` ADD COLUMN `snapshot` JSON NULL;

-- AlterTable
ALTER TABLE `Role` ADD COLUMN `mfaRequired` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `mfaBackupCodes` TEXT NULL,
    ADD COLUMN `mfaEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `mfaSecret` VARCHAR(191) NULL;
