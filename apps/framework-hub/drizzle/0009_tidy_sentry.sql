PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_plugin_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`submitter_key` text NOT NULL,
	`repository_url` text NOT NULL,
	`repository_full_name` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`idempotency_key` text NOT NULL,
	`source_hash` text,
	`catalog_run_id` text,
	`resolution_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`catalog_run_id`) REFERENCES `catalog_sync_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_plugin_submissions`("id", "user_id", "submitter_key", "repository_url", "repository_full_name", "status", "idempotency_key", "source_hash", "catalog_run_id", "resolution_json", "created_at", "updated_at") SELECT "id", "user_id", 'user:' || "user_id", "repository_url", "repository_full_name", "status", "idempotency_key", "source_hash", "catalog_run_id", "resolution_json", "created_at", "updated_at" FROM `plugin_submissions`;--> statement-breakpoint
DROP TABLE `plugin_submissions`;--> statement-breakpoint
ALTER TABLE `__new_plugin_submissions` RENAME TO `plugin_submissions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_submissions_submitter_idempotency_idx` ON `plugin_submissions` (`submitter_key`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `plugin_submissions_status_idx` ON `plugin_submissions` (`status`,`created_at`);
