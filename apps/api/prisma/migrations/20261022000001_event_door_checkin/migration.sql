-- AlterTable
ALTER TABLE `Event` ADD COLUMN `liveTicketQr` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `maxTicketsPerPerson` INTEGER NULL,
    ADD COLUMN `requireEmailConfirmation` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `EventRegistration` ADD COLUMN `checkedInCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `emailConfirmedAt` DATETIME(3) NULL,
    ADD COLUMN `emailTokenHash` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `EventCheckIn` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `eventId` INTEGER NOT NULL,
    `registrationId` INTEGER NULL,
    `userId` VARCHAR(191) NULL,
    `staffName` VARCHAR(120) NULL,
    `device` VARCHAR(60) NULL,
    `action` VARCHAR(20) NOT NULL,
    `count` INTEGER NOT NULL DEFAULT 0,
    `verdict` VARCHAR(30) NULL,
    `source` VARCHAR(20) NOT NULL,
    `override` BOOLEAN NOT NULL DEFAULT false,
    `reason` TEXT NULL,
    `scannedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EventCheckIn_eventId_createdAt_idx`(`eventId`, `createdAt`),
    INDEX `EventCheckIn_registrationId_idx`(`registrationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `EventRegistration_emailTokenHash_key` ON `EventRegistration`(`emailTokenHash`);

-- AddForeignKey
ALTER TABLE `EventCheckIn` ADD CONSTRAINT `EventCheckIn_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `Event`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EventCheckIn` ADD CONSTRAINT `EventCheckIn_registrationId_fkey` FOREIGN KEY (`registrationId`) REFERENCES `EventRegistration`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Tickets already checked in before group counts existed: the whole group came in.
UPDATE `EventRegistration` SET `checkedInCount` = `quantity` WHERE `checkInAt` IS NOT NULL;

-- Scanning tickets at the door is its own permission, so door staff need nothing else.
INSERT IGNORE INTO `Permission` (`module`, `action`, `description`, `createdAt`)
VALUES ('events', 'check_in', 'Scan and check in tickets at the door', NOW(3));

-- Everyone who manages bookings can also scan them.
INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT rp.roleId, p.id
FROM `RolePermission` rp
JOIN `Permission` mp ON mp.id = rp.permissionId AND mp.module = 'events' AND mp.action = 'manage_registrations'
JOIN `Permission` p ON p.module = 'events' AND p.action = 'check_in';

-- Door staff: the scanner and nothing else.
INSERT IGNORE INTO `Role` (`name`, `description`, `isSystem`, `mfaRequired`, `createdAt`, `updatedAt`)
VALUES ('door-staff', 'Scans tickets at the door around event time, and nothing else', true, false, NOW(3), NOW(3));

INSERT IGNORE INTO `RolePermission` (`roleId`, `permissionId`)
SELECT r.id, p.id FROM `Role` r, `Permission` p
WHERE r.name = 'door-staff' AND p.module = 'events' AND p.action IN ('check_in');
