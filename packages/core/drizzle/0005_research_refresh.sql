CREATE TABLE `research_refresh_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`objective` text NOT NULL,
	`status` text NOT NULL,
	`phase` text NOT NULL,
	`activity` text NOT NULL,
	`base_revision` text NOT NULL,
	`report` text,
	`error` text,
	`started_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `research_refresh_tasks_path` ON `research_refresh_tasks` (`path`,`started_at`);--> statement-breakpoint
CREATE INDEX `research_refresh_tasks_status` ON `research_refresh_tasks` (`status`);
