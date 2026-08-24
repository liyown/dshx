CREATE TABLE `plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`package_name` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`author_handle` text NOT NULL,
	`category` text NOT NULL,
	`badge` text DEFAULT 'community' NOT NULL,
	`latest_version` text NOT NULL,
	`compatibility_range` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugins_slug_unique` ON `plugins` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `plugins_package_name_unique` ON `plugins` (`package_name`);--> statement-breakpoint
CREATE INDEX `plugins_status_idx` ON `plugins` (`status`);--> statement-breakpoint
CREATE INDEX `plugins_category_idx` ON `plugins` (`category`);--> statement-breakpoint
CREATE INDEX `plugins_author_handle_idx` ON `plugins` (`author_handle`);