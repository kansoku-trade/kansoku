CREATE TABLE `ai_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` text NOT NULL,
	`eastern_date` text NOT NULL,
	`layer` text NOT NULL,
	`symbol` text NOT NULL,
	`model` text NOT NULL,
	`origin` text,
	`calls` integer NOT NULL,
	`total_tokens` integer NOT NULL,
	`input` integer NOT NULL,
	`output` integer NOT NULL,
	`cache_read` integer NOT NULL,
	`cache_write` integer NOT NULL,
	`cost_total` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_usage_date` ON `ai_usage` (`eastern_date`);--> statement-breakpoint
CREATE TABLE `chart_meta` (
	`id` text PRIMARY KEY NOT NULL,
	`schema_version` integer NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`symbol` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`prediction_updated_at` text
);
--> statement-breakpoint
CREATE INDEX `chart_meta_type` ON `chart_meta` (`type`);--> statement-breakpoint
CREATE INDEX `chart_meta_symbol` ON `chart_meta` (`symbol`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` text NOT NULL,
	`eastern_date` text NOT NULL,
	`symbol` text NOT NULL,
	`level` text NOT NULL,
	`text` text NOT NULL,
	`trigger` text,
	`source` text NOT NULL,
	`escalated` integer,
	`chart_id` text
);
--> statement-breakpoint
CREATE INDEX `comments_symbol_date` ON `comments` (`symbol`,`eastern_date`);--> statement-breakpoint
CREATE TABLE `outcomes` (
	`chart_id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`direction` text NOT NULL,
	`status` text NOT NULL,
	`pct_since_anchor` real NOT NULL,
	`resolved_at` integer NOT NULL,
	`judged_at` text NOT NULL
);
