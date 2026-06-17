-- AlterTable
ALTER TABLE `Category` ADD COLUMN `showSidebar` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Post` ADD COLUMN `showSidebar` BOOLEAN NOT NULL DEFAULT false;
