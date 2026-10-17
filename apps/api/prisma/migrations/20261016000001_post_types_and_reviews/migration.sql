-- AlterTable
ALTER TABLE `Post` ADD COLUMN `articleType` VARCHAR(20) NOT NULL DEFAULT 'article',
    ADD COLUMN `videoUrl` VARCHAR(500) NULL;

-- CreateTable
CREATE TABLE `Review` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `postId` INTEGER NOT NULL,
    `subjectType` VARCHAR(20) NOT NULL DEFAULT 'album',
    `subjectTitle` VARCHAR(255) NOT NULL,
    `artist` VARCHAR(255) NOT NULL,
    `releaseDate` DATE NULL,
    `label` VARCHAR(255) NULL,
    `genre` VARCHAR(120) NULL,
    `coverImage` VARCHAR(500) NULL,
    `rating` DOUBLE NULL,
    `verdict` VARCHAR(300) NULL,
    `highlights` JSON NULL,
    `tracklist` JSON NULL,
    `streaming` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Review_postId_key`(`postId`),
    INDEX `Review_artist_idx`(`artist`),
    INDEX `Review_rating_idx`(`rating`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Post_articleType_idx` ON `Post`(`articleType`);

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_postId_fkey` FOREIGN KEY (`postId`) REFERENCES `Post`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

