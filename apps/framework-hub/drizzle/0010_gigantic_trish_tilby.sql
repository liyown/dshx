CREATE TABLE `plugin_source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`kind` text NOT NULL,
	`availability` text NOT NULL,
	`format` text NOT NULL,
	`source_url` text NOT NULL,
	`source_ref` text,
	`source_path` text,
	`content` text,
	`content_hash` text,
	`observed_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_source_documents_plugin_kind_idx` ON `plugin_source_documents` (`plugin_id`,`kind`);--> statement-breakpoint
CREATE INDEX `plugin_source_documents_hash_idx` ON `plugin_source_documents` (`content_hash`);--> statement-breakpoint
ALTER TABLE `plugin_curations` ADD `source_readme_hash` text;