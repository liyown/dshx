DROP INDEX `plugin_media_hash_idx`;--> statement-breakpoint
CREATE INDEX `plugin_media_hash_idx` ON `plugin_media` (`sha256`);--> statement-breakpoint
ALTER TABLE `plugin_claims` ADD `idempotency_key` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_claims_idempotency_idx` ON `plugin_claims` (`user_id`,`idempotency_key`);