-- CreateTable
CREATE TABLE `UserNotificationPreference` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(191) NOT NULL DEFAULT 'inapp',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `threshold` INTEGER NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UserNotificationPreference_userId_idx`(`userId`),
    UNIQUE INDEX `UserNotificationPreference_userId_type_key`(`userId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserNotificationPreference` ADD CONSTRAINT `UserNotificationPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
