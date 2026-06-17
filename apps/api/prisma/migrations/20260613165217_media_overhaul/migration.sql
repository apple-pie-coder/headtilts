-- AlterTable
ALTER TABLE `Media` ADD COLUMN `caption` TEXT NULL,
    ADD COLUMN `contentHash` VARCHAR(191) NULL,
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `folderId` INTEGER NULL,
    ADD COLUMN `originalUrl` VARCHAR(191) NULL,
    ADD COLUMN `title` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `MediaFolder` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MediaFolder_name_key`(`name`),
    UNIQUE INDEX `MediaFolder_slug_key`(`slug`),
    INDEX `MediaFolder_slug_idx`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Media_contentHash_idx` ON `Media`(`contentHash`);

-- CreateIndex
CREATE INDEX `Media_folderId_idx` ON `Media`(`folderId`);

-- AddForeignKey
ALTER TABLE `Media` ADD CONSTRAINT `Media_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `MediaFolder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
