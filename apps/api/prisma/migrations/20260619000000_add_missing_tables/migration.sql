-- Missing tables that were created locally via prisma db push but never added to a migration.

-- ── PostReaction ─────────────────────────────────────────────────────────────
CREATE TABLE `PostReaction` (
    `id`        INT          NOT NULL AUTO_INCREMENT,
    `postId`    INT          NOT NULL,
    `emoji`     VARCHAR(191) NOT NULL,
    `visitorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `PostReaction_postId_emoji_visitorId_key` (`postId`, `emoji`, `visitorId`),
    INDEX `PostReaction_postId_idx` (`postId`),
    CONSTRAINT `PostReaction_postId_fkey`
        FOREIGN KEY (`postId`) REFERENCES `Post` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Series ───────────────────────────────────────────────────────────────────
CREATE TABLE `Series` (
    `id`          INT          NOT NULL AUTO_INCREMENT,
    `name`        VARCHAR(191) NOT NULL,
    `slug`        VARCHAR(191) NOT NULL,
    `description` TEXT         NULL,
    `coverImage`  VARCHAR(191) NULL,
    `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`   DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Series_slug_key` (`slug`),
    INDEX `Series_slug_idx` (`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── SeriesPost ───────────────────────────────────────────────────────────────
CREATE TABLE `SeriesPost` (
    `id`       INT NOT NULL AUTO_INCREMENT,
    `seriesId` INT NOT NULL,
    `postId`   INT NOT NULL,
    `position` INT NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `SeriesPost_seriesId_postId_key` (`seriesId`, `postId`),
    INDEX `SeriesPost_seriesId_idx` (`seriesId`),
    INDEX `SeriesPost_postId_idx` (`postId`),
    CONSTRAINT `SeriesPost_seriesId_fkey`
        FOREIGN KEY (`seriesId`) REFERENCES `Series` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `SeriesPost_postId_fkey`
        FOREIGN KEY (`postId`) REFERENCES `Post` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Redirect ─────────────────────────────────────────────────────────────────
CREATE TABLE `Redirect` (
    `id`        INT          NOT NULL AUTO_INCREMENT,
    `fromPath`  VARCHAR(191) NOT NULL,
    `toPath`    VARCHAR(191) NOT NULL,
    `type`      INT          NOT NULL DEFAULT 301,
    `hits`      INT          NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Redirect_fromPath_key` (`fromPath`),
    INDEX `Redirect_fromPath_idx` (`fromPath`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── ApiKey ───────────────────────────────────────────────────────────────────
CREATE TABLE `ApiKey` (
    `id`         INT          NOT NULL AUTO_INCREMENT,
    `name`       VARCHAR(191) NOT NULL,
    `prefix`     VARCHAR(191) NOT NULL,
    `keyHash`    VARCHAR(191) NOT NULL,
    `userId`     VARCHAR(191) NOT NULL,
    `scopes`     TEXT         NOT NULL,
    `expiresAt`  DATETIME(3)  NULL,
    `lastUsedAt` DATETIME(3)  NULL,
    `active`     BOOLEAN      NOT NULL DEFAULT true,
    `createdAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`  DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `ApiKey_prefix_key` (`prefix`),
    UNIQUE INDEX `ApiKey_keyHash_key` (`keyHash`),
    INDEX `ApiKey_userId_idx` (`userId`),
    INDEX `ApiKey_keyHash_idx` (`keyHash`),
    CONSTRAINT `ApiKey_userId_fkey`
        FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── Event ────────────────────────────────────────────────────────────────────
CREATE TABLE `Event` (
    `id`                     INT          NOT NULL AUTO_INCREMENT,
    `title`                  VARCHAR(191) NOT NULL,
    `slug`                   VARCHAR(191) NOT NULL,
    `excerpt`                TEXT         NULL,
    `description`            LONGTEXT     NULL,
    `startAt`                DATETIME(3)  NOT NULL,
    `endAt`                  DATETIME(3)  NOT NULL,
    `timezone`               VARCHAR(191) NOT NULL DEFAULT 'UTC',
    `type`                   VARCHAR(191) NOT NULL DEFAULT 'in_person',
    `status`                 VARCHAR(191) NOT NULL DEFAULT 'draft',
    `featuredImage`          VARCHAR(191) NULL,
    `bannerImage`            VARCHAR(191) NULL,
    `venueName`              VARCHAR(191) NULL,
    `venueAddress`           VARCHAR(191) NULL,
    `venueCity`              VARCHAR(191) NULL,
    `venueState`             VARCHAR(191) NULL,
    `venueCountry`           VARCHAR(191) NULL,
    `venueMapEmbed`          TEXT         NULL,
    `onlineUrl`              VARCHAR(191) NULL,
    `streamUrl`              VARCHAR(191) NULL,
    `streamPlatform`         VARCHAR(191) NULL,
    `maxAttendees`           INT          NULL,
    `isRegistrationRequired` BOOLEAN      NOT NULL DEFAULT true,
    `registrationDeadline`   DATETIME(3)  NULL,
    `requireApproval`        BOOLEAN      NOT NULL DEFAULT false,
    `showAttendeesCount`     BOOLEAN      NOT NULL DEFAULT true,
    `showAttendeesNames`     BOOLEAN      NOT NULL DEFAULT false,
    `isFeatured`             BOOLEAN      NOT NULL DEFAULT false,
    `isRecurring`            BOOLEAN      NOT NULL DEFAULT false,
    `recurrenceType`         VARCHAR(191) NULL,
    `recurrenceInterval`     INT          NULL,
    `recurrenceDays`         VARCHAR(191) NULL,
    `recurrenceEndsAt`       DATETIME(3)  NULL,
    `parentEventId`          INT          NULL,
    `metaTitle`              VARCHAR(191) NULL,
    `metaDescription`        TEXT         NULL,
    `ogImage`                VARCHAR(191) NULL,
    `createdAt`              DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`              DATETIME(3)  NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Event_slug_key` (`slug`),
    INDEX `Event_status_idx` (`status`),
    INDEX `Event_startAt_idx` (`startAt`),
    INDEX `Event_slug_idx` (`slug`),
    INDEX `Event_parentEventId_idx` (`parentEventId`),
    CONSTRAINT `Event_parentEventId_fkey`
        FOREIGN KEY (`parentEventId`) REFERENCES `Event` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── EventTicketTier ──────────────────────────────────────────────────────────
CREATE TABLE `EventTicketTier` (
    `id`             INT          NOT NULL AUTO_INCREMENT,
    `eventId`        INT          NOT NULL,
    `name`           VARCHAR(191) NOT NULL,
    `description`    TEXT         NULL,
    `price`          INT          NOT NULL DEFAULT 0,
    `currency`       VARCHAR(191) NOT NULL DEFAULT 'INR',
    `quantity`       INT          NULL,
    `soldCount`      INT          NOT NULL DEFAULT 0,
    `availableFrom`  DATETIME(3)  NULL,
    `availableUntil` DATETIME(3)  NULL,
    `isVisible`      BOOLEAN      NOT NULL DEFAULT true,
    `perOrderMin`    INT          NOT NULL DEFAULT 1,
    `perOrderMax`    INT          NOT NULL DEFAULT 10,
    `position`       INT          NOT NULL DEFAULT 0,
    `createdAt`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `EventTicketTier_eventId_idx` (`eventId`),
    CONSTRAINT `EventTicketTier_eventId_fkey`
        FOREIGN KEY (`eventId`) REFERENCES `Event` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── EventRegistration ────────────────────────────────────────────────────────
CREATE TABLE `EventRegistration` (
    `id`              INT          NOT NULL AUTO_INCREMENT,
    `eventId`         INT          NOT NULL,
    `ticketTierId`    INT          NULL,
    `name`            VARCHAR(191) NOT NULL,
    `email`           VARCHAR(191) NOT NULL,
    `phone`           VARCHAR(191) NULL,
    `quantity`        INT          NOT NULL DEFAULT 1,
    `status`          VARCHAR(191) NOT NULL DEFAULT 'pending',
    `ticketCode`      VARCHAR(191) NOT NULL,
    `paymentStatus`   VARCHAR(191) NOT NULL DEFAULT 'free',
    `paymentProvider` VARCHAR(191) NULL,
    `paymentId`       VARCHAR(191) NULL,
    `paymentOrderId`  VARCHAR(191) NULL,
    `paymentAmount`   INT          NULL,
    `customData`      JSON         NULL,
    `checkInAt`       DATETIME(3)  NULL,
    `registeredAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cancelledAt`     DATETIME(3)  NULL,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `EventRegistration_ticketCode_key` (`ticketCode`),
    INDEX `EventRegistration_eventId_idx` (`eventId`),
    INDEX `EventRegistration_email_idx` (`email`),
    INDEX `EventRegistration_ticketCode_idx` (`ticketCode`),
    INDEX `EventRegistration_status_idx` (`status`),
    CONSTRAINT `EventRegistration_eventId_fkey`
        FOREIGN KEY (`eventId`) REFERENCES `Event` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `EventRegistration_ticketTierId_fkey`
        FOREIGN KEY (`ticketTierId`) REFERENCES `EventTicketTier` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── EventSpeaker ─────────────────────────────────────────────────────────────
CREATE TABLE `EventSpeaker` (
    `id`          INT          NOT NULL AUTO_INCREMENT,
    `eventId`     INT          NOT NULL,
    `name`        VARCHAR(191) NOT NULL,
    `bio`         TEXT         NULL,
    `photo`       VARCHAR(191) NULL,
    `designation` VARCHAR(191) NULL,
    `company`     VARCHAR(191) NULL,
    `socialLinks` JSON         NULL,
    `position`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    INDEX `EventSpeaker_eventId_idx` (`eventId`),
    CONSTRAINT `EventSpeaker_eventId_fkey`
        FOREIGN KEY (`eventId`) REFERENCES `Event` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── EventAgendaItem ──────────────────────────────────────────────────────────
CREATE TABLE `EventAgendaItem` (
    `id`          INT          NOT NULL AUTO_INCREMENT,
    `eventId`     INT          NOT NULL,
    `title`       VARCHAR(191) NOT NULL,
    `description` TEXT         NULL,
    `startsAt`    DATETIME(3)  NOT NULL,
    `endsAt`      DATETIME(3)  NOT NULL,
    `type`        VARCHAR(191) NOT NULL DEFAULT 'session',
    `speakerId`   INT          NULL,
    `position`    INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    INDEX `EventAgendaItem_eventId_idx` (`eventId`),
    CONSTRAINT `EventAgendaItem_eventId_fkey`
        FOREIGN KEY (`eventId`) REFERENCES `Event` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── EventCustomField ─────────────────────────────────────────────────────────
CREATE TABLE `EventCustomField` (
    `id`        INT          NOT NULL AUTO_INCREMENT,
    `eventId`   INT          NOT NULL,
    `label`     VARCHAR(191) NOT NULL,
    `fieldType` VARCHAR(191) NOT NULL DEFAULT 'text',
    `options`   JSON         NULL,
    `required`  BOOLEAN      NOT NULL DEFAULT false,
    `position`  INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    INDEX `EventCustomField_eventId_idx` (`eventId`),
    CONSTRAINT `EventCustomField_eventId_fkey`
        FOREIGN KEY (`eventId`) REFERENCES `Event` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
