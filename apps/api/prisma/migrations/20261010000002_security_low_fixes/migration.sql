-- TOTP replay protection
ALTER TABLE `User` ADD COLUMN `mfaLastUsedStep` INTEGER NULL;

-- Per-network caps on anonymous reactions
ALTER TABLE `PostReaction` ADD COLUMN `ipAddress` VARCHAR(191) NULL;
ALTER TABLE `CommentReaction` ADD COLUMN `ipAddress` VARCHAR(191) NULL;
CREATE INDEX `PostReaction_postId_ipAddress_idx` ON `PostReaction`(`postId`, `ipAddress`);
CREATE INDEX `CommentReaction_commentId_ipAddress_idx` ON `CommentReaction`(`commentId`, `ipAddress`);
