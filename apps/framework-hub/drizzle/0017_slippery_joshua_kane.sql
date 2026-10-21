CREATE TABLE `plugin_scores` (
	`plugin_id` text PRIMARY KEY NOT NULL,
	`quality_base` integer DEFAULT 0 NOT NULL,
	`popularity_base` integer DEFAULT 0 NOT NULL,
	`latest_published_at` integer,
	`last_synced_at` integer,
	`scored_at` integer NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_scores_quality_idx` ON `plugin_scores` (`quality_base`);--> statement-breakpoint
CREATE INDEX `plugin_scores_popularity_idx` ON `plugin_scores` (`popularity_base`);