CREATE TABLE `PollShareClick` (
  `id`        INT NOT NULL AUTO_INCREMENT,
  `shareId`   INT NOT NULL,
  `name`      VARCHAR(191),
  `gender`    VARCHAR(191),
  `age`       INT,
  `clickedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `PollShareClick_shareId_idx` (`shareId`),
  CONSTRAINT `PollShareClick_shareId_fkey` FOREIGN KEY (`shareId`) REFERENCES `PollShare` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
);
