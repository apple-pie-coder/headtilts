-- CreateTable
CREATE TABLE `ApiKeyUsageLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `apiKeyId` INTEGER NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(191) NOT NULL,
    `statusCode` INTEGER NOT NULL,
    `durationMs` INTEGER NOT NULL,
    `ip` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ApiKeyUsageLog_apiKeyId_createdAt_idx`(`apiKeyId`, `createdAt`),
    INDEX `ApiKeyUsageLog_createdAt_idx`(`createdAt`),
    INDEX `ApiKeyUsageLog_endpoint_createdAt_idx`(`endpoint`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ApiKeyUsageLog` ADD CONSTRAINT `ApiKeyUsageLog_apiKeyId_fkey` FOREIGN KEY (`apiKeyId`) REFERENCES `ApiKey`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
