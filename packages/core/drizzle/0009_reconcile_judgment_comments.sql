-- Two different 0008 migrations shipped with the same timestamp. Appending
-- these aliases gives the polluted schema its missing columns; on the healthy
-- schema SQLite renames the duplicate aliases and keeps the original values
-- under the canonical names selected during the rebuild below.
CREATE TABLE `_comments_0009_reconcile` AS
SELECT
	*,
	NULL AS `read`,
	NULL AS `stance`,
	NULL AS `stance_note`
FROM `comments`;--> statement-breakpoint
DROP TABLE `comments`;--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`ts` text NOT NULL,
	`eastern_date` text NOT NULL,
	`symbol` text NOT NULL,
	`level` text NOT NULL,
	`text` text NOT NULL,
	`trigger` text,
	`source` text NOT NULL,
	`escalated` integer,
	`chart_id` text,
	`read` text,
	`stance` text,
	`stance_note` text
);--> statement-breakpoint
INSERT INTO `comments` (
	`id`,
	`ts`,
	`eastern_date`,
	`symbol`,
	`level`,
	`text`,
	`trigger`,
	`source`,
	`escalated`,
	`chart_id`,
	`read`,
	`stance`,
	`stance_note`
)
SELECT
	`id`,
	`ts`,
	`eastern_date`,
	`symbol`,
	`level`,
	`text`,
	`trigger`,
	`source`,
	`escalated`,
	`chart_id`,
	`read`,
	`stance`,
	`stance_note`
FROM `_comments_0009_reconcile`;--> statement-breakpoint
DROP TABLE `_comments_0009_reconcile`;--> statement-breakpoint
CREATE INDEX `comments_symbol_date` ON `comments` (`symbol`,`eastern_date`);
