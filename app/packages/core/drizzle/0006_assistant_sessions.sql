CREATE TABLE `assistant_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assistant_sessions_updated` ON `assistant_sessions` (`updated_at`);
