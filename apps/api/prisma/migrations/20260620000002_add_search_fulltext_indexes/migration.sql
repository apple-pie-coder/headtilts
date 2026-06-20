-- Add FULLTEXT indexes for multi-type search
-- Note: Pages are stored in the Post table (type = 'page'), so Post index covers both.
CREATE FULLTEXT INDEX `post_ft_search`  ON `Post`     (`title`, `excerpt`, `content`);
CREATE FULLTEXT INDEX `tag_ft_search`   ON `Tag`      (`name`, `description`);
CREATE FULLTEXT INDEX `cat_ft_search`   ON `Category` (`name`, `description`);
CREATE FULLTEXT INDEX `poll_ft_search`  ON `Poll`     (`title`, `question`, `description`);
