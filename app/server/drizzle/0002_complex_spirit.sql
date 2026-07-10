CREATE TABLE `ai_role_settings` (
	`role` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`provider` text,
	`model_id` text,
	`thinking_level` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_credentials` (
	`provider` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`updated_at` text NOT NULL
);
