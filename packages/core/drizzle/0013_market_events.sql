CREATE TABLE `market_events` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text NOT NULL,
	`cluster_id` text NOT NULL,
	`source` text NOT NULL,
	`class` text NOT NULL,
	`kind` text NOT NULL,
	`symbols` text NOT NULL,
	`occurred_at` text NOT NULL,
	`observed_at` text NOT NULL,
	`trust` text NOT NULL,
	`severity` text NOT NULL,
	`payload` text NOT NULL,
	`canvas_slug` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_events_source_dedupe` ON `market_events` (`source`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `market_events_occurred` ON `market_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `market_events_cluster` ON `market_events` (`cluster_id`);--> statement-breakpoint
CREATE TABLE `event_source_cursors` (
	`source` text PRIMARY KEY NOT NULL,
	`cursor` text,
	`health` text NOT NULL,
	`failure_streak` integer NOT NULL,
	`last_polled_at` text,
	`last_event_at` text,
	`last_error` text,
	`disabled_reason` text,
	`next_attempt_at` text,
	`updated_at` text NOT NULL
);
