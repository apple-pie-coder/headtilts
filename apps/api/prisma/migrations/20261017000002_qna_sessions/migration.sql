-- CreateTable
CREATE TABLE `QnaSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `postId` INTEGER NOT NULL,
    `subject` VARCHAR(255) NOT NULL,
    `subjectType` VARCHAR(20) NOT NULL DEFAULT 'band',
    `sessionDate` DATE NULL,
    `host` VARCHAR(255) NULL,
    `items` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `QnaSession_postId_key`(`postId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `QnaSession` ADD CONSTRAINT `QnaSession_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

