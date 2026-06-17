-- AlterTable
ALTER TABLE `Post` ADD COLUMN `parentId` INTEGER NULL,
    ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'post';

-- CreateIndex
CREATE INDEX `Post_type_idx` ON `Post`(`type`);

-- CreateIndex
CREATE INDEX `Post_parentId_idx` ON `Post`(`parentId`);

-- AddForeignKey
ALTER TABLE `Post` ADD CONSTRAINT `Post_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Post`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
