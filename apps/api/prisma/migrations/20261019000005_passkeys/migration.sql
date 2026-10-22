-- CreateTable
CREATE TABLE `Passkey` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NOT NULL,
    `credentialId` VARCHAR(512) NOT NULL,
    `publicKey` BLOB NOT NULL,
    `counter` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `transports` VARCHAR(255) NULL,
    `deviceType` VARCHAR(16) NOT NULL,
    `backedUp` BOOLEAN NOT NULL DEFAULT false,
    `name` VARCHAR(100) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Passkey_credentialId_key`(`credentialId`),
    INDEX `Passkey_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebAuthnChallenge` (
    `id` VARCHAR(191) NOT NULL,
    `challenge` VARCHAR(128) NOT NULL,
    `purpose` VARCHAR(16) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `WebAuthnChallenge_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Passkey` ADD CONSTRAINT `Passkey_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
