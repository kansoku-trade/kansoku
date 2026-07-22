ALTER TABLE `comments` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `model` text;--> statement-breakpoint
ALTER TABLE `comments` ADD `prompt_version` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `model` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `prompt_version` text;--> statement-breakpoint
ALTER TABLE `research_refresh_tasks` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `research_refresh_tasks` ADD `model` text;--> statement-breakpoint
ALTER TABLE `research_refresh_tasks` ADD `prompt_version` text;
