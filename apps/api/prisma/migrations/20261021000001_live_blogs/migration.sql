-- AlterTable
ALTER TABLE `Post` ADD COLUMN `liveEndedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `LiveUpdate` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `postId` INTEGER NOT NULL,
    `authorId` VARCHAR(191) NULL,
    `headline` VARCHAR(200) NULL,
    `format` VARCHAR(10) NOT NULL DEFAULT 'html',
    `body` MEDIUMTEXT NOT NULL,
    `image` VARCHAR(500) NULL,
    `pinned` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LiveUpdate_postId_createdAt_idx`(`postId`, `createdAt`),
    INDEX `LiveUpdate_authorId_idx`(`authorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `LiveUpdate` ADD CONSTRAINT `LiveUpdate_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveUpdate` ADD CONSTRAINT `LiveUpdate_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
