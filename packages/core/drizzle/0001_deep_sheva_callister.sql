CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`ts` text NOT NULL,
	`role` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_messages_session` ON `chat_messages` (`session_id`);--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`chart_id` text NOT NULL,
	`symbol` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_sessions_chart_id_unique` ON `chat_sessions` (`chart_id`);--> statement-breakpoint
CREATE INDEX `chat_sessions_symbol` ON `chat_sessions` (`symbol`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
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
INSERT INTO `__new_ai_usage`("id", "ts", "eastern_date", "layer", "symbol", "model", "origin", "calls", "total_tokens", "input", "output", "cache_read", "cache_write", "cost_total") SELECT CAST(((CAST(strftime('%s', "ts") AS INTEGER) * 1000 - 1735689600000) << 12) | ("id" & 4095) AS TEXT), "ts", "eastern_date", "layer", "symbol", "model", "origin", "calls", "total_tokens", "input", "output", "cache_read", "cache_write", "cost_total" FROM `ai_usage`;--> statement-breakpoint
DROP TABLE `ai_usage`;--> statement-breakpoint
ALTER TABLE `__new_ai_usage` RENAME TO `ai_usage`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `ai_usage_date` ON `ai_usage` (`eastern_date`);--> statement-breakpoint
CREATE TABLE `__new_comments` (
	`id` text PRIMARY KEY NOT NULL,
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
INSERT INTO `__new_comments`("id", "ts", "eastern_date", "symbol", "level", "text", "trigger", "source", "escalated", "chart_id") SELECT CAST(((CAST(strftime('%s', "ts") AS INTEGER) * 1000 - 1735689600000) << 12) | ("id" & 4095) AS TEXT), "ts", "eastern_date", "symbol", "level", "text", "trigger", "source", "escalated", "chart_id" FROM `comments`;--> statement-breakpoint
DROP TABLE `comments`;--> statement-breakpoint
ALTER TABLE `__new_comments` RENAME TO `comments`;--> statement-breakpoint
CREATE INDEX `comments_symbol_date` ON `comments` (`symbol`,`eastern_date`);