CREATE TABLE `community_rate_limits` (
	`user_id` text NOT NULL,
	`window_start` integer NOT NULL,
	`action` text NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`user_id`, `window_start`, `action`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `content_reports` ADD `idempotency_key` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `content_reports_idempotency_idx` ON `content_reports` (`reporter_user_id`,`idempotency_key`);--> statement-breakpoint
ALTER TABLE `plugin_reviews` ADD `idempotency_key` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_reviews_idempotency_idx` ON `plugin_reviews` (`user_id`,`idempotency_key`);--> statement-breakpoint
ALTER TABLE `review_replies` ADD `idempotency_key` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `review_replies_idempotency_idx` ON `review_replies` (`user_id`,`idempotency_key`);