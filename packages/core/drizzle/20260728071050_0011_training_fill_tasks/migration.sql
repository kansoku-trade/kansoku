CREATE TABLE `training_fill_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`base_period` text NOT NULL,
	`requested` integer NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`phase` text NOT NULL,
	`activity` text NOT NULL,
	`admitted` integer NOT NULL,
	`funnel` text,
	`error` text,
	`started_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `training_fill_tasks_status` ON `training_fill_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `training_fill_tasks_started` ON `training_fill_tasks` (`started_at`);
