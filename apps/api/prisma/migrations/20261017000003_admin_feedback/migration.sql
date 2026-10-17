-- CreateTable
CREATE TABLE `Feedback` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(20) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NOT NULL,
    `pagePath` VARCHAR(500) NULL,
    `context` JSON NULL,
    `screenshot` VARCHAR(500) NULL,
    `userId` VARCHAR(191) NULL,
    `syncStatus` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `syncError` VARCHAR(500) NULL,
    `issueNumber` INTEGER NULL,
    `issueUrl` VARCHAR(500) NULL,
    `issueState` VARCHAR(20) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Feedback_createdAt_idx`(`createdAt`),
    INDEX `Feedback_syncStatus_idx`(`syncStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Feedback` ADD CONSTRAINT `Feedback_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

