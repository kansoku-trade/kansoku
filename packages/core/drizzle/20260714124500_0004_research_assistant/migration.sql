CREATE TABLE `research_chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_chat_sessions_path_unique` ON `research_chat_sessions` (`path`);--> statement-breakpoint
CREATE INDEX `research_chat_sessions_updated` ON `research_chat_sessions` (`updated_at`);--> statement-breakpoint
CREATE TABLE `research_edit_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`path` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`summary` text NOT NULL,
	`operations` text NOT NULL,
	`applied_operation_indexes` text,
	`before_markdown` text NOT NULL,
	`after_markdown` text NOT NULL,
	`base_revision` text NOT NULL,
	`after_revision` text NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `research_edit_proposals_path` ON `research_edit_proposals` (`path`,`created_at`);--> statement-breakpoint
CREATE INDEX `research_edit_proposals_session` ON `research_edit_proposals` (`session_id`);
