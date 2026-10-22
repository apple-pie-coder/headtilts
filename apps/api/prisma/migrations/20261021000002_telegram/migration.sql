-- AlterTable
ALTER TABLE `Post` ADD COLUMN `telegramPost` VARCHAR(10) NULL,
    ADD COLUMN `telegramLiveUpdates` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `Poll` ADD COLUMN `telegramPost` VARCHAR(10) NULL;

-- AlterTable
ALTER TABLE `Event` ADD COLUMN `telegramPost` VARCHAR(10) NULL;

-- CreateTable
CREATE TABLE `TelegramDelivery` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kind` VARCHAR(20) NOT NULL,
    `refId` INTEGER NOT NULL,
    `postId` INTEGER NULL,
    `title` VARCHAR(255) NOT NULL,
    `chatId` VARCHAR(100) NOT NULL,
    `messageId` INTEGER NULL,
    `hasMedia` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(10) NOT NULL DEFAULT 'pending',
    `error` TEXT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `retryAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TelegramDelivery_kind_refId_key`(`kind`, `refId`),
    INDEX `TelegramDelivery_status_retryAt_idx`(`status`, `retryAt`),
    INDEX `TelegramDelivery_postId_idx`(`postId`),
    INDEX `TelegramDelivery_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
