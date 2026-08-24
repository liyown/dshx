CREATE TABLE `approval_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`version` integer NOT NULL,
	`action` text NOT NULL,
	`admin_user_id` text NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `approval_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`admin_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `approval_decisions_request_idx` ON `approval_decisions` (`request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `approval_effect_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`version` integer NOT NULL,
	`attempt` integer NOT NULL,
	`executor_type` text NOT NULL,
	`executor_id` text,
	`status` text NOT NULL,
	`input_hash` text NOT NULL,
	`output_json` text,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `approval_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `approval_effect_attempts_number_idx` ON `approval_effect_attempts` (`request_id`,`attempt`);--> statement-breakpoint
CREATE INDEX `approval_effect_attempts_request_idx` ON `approval_effect_attempts` (`request_id`,`finished_at`);--> statement-breakpoint
CREATE TABLE `approval_effects` (
	`request_id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`effect_kind` text NOT NULL,
	`execution_mode` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`lease_token_hash` text,
	`leased_to_token_id` text,
	`lease_expires_at` integer,
	`last_error` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `approval_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`leased_to_token_id`) REFERENCES `api_tokens`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `approval_events` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `approval_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `approval_events_request_idx` ON `approval_events` (`request_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `approval_request_versions` (
	`request_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`evidence_json` text NOT NULL,
	`effect_input_json` text NOT NULL,
	`preconditions_json` text NOT NULL,
	`source_hash` text NOT NULL,
	`policy_version` text NOT NULL,
	`created_by_type` text NOT NULL,
	`created_by_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`request_id`, `version`),
	FOREIGN KEY (`request_id`) REFERENCES `approval_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`risk` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requester_type` text NOT NULL,
	`requester_id` text,
	`requester_token_id` text,
	`run_id` text,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`execution_mode` text NOT NULL,
	`effect_kind` text NOT NULL,
	`effect_status` text DEFAULT 'pending' NOT NULL,
	`idempotency_key` text NOT NULL,
	`expires_at` integer NOT NULL,
	`decided_by_user_id` text,
	`decided_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`requester_token_id`) REFERENCES `api_tokens`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`run_id`) REFERENCES `catalog_sync_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `approval_requests_idempotency_idx` ON `approval_requests` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `approval_requests_queue_idx` ON `approval_requests` (`status`,`risk`,`created_at`);--> statement-breakpoint
CREATE INDEX `approval_requests_requester_idx` ON `approval_requests` (`requester_token_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `approval_requests_subject_idx` ON `approval_requests` (`subject_type`,`subject_id`);--> statement-breakpoint
CREATE TABLE `collection_plugins` (
	`collection_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`added_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`collection_id`, `plugin_id`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `collection_plugins_order_idx` ON `collection_plugins` (`collection_id`,`sort_order`,`added_at`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`visibility` text DEFAULT 'public' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_owner_slug_idx` ON `collections` (`user_id`,`slug`);--> statement-breakpoint
CREATE INDEX `collections_visibility_idx` ON `collections` (`visibility`,`updated_at`);--> statement-breakpoint
CREATE TABLE `moderation_appeals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`moderation_action_id` text NOT NULL,
	`statement` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`idempotency_key` text NOT NULL,
	`approval_request_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`moderation_action_id`) REFERENCES `moderation_actions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `moderation_appeals_user_idempotency_idx` ON `moderation_appeals` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `moderation_appeals_status_idx` ON `moderation_appeals` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_user_id` text,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notification_events_user_idx` ON `notification_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_reads` (
	`user_id` text NOT NULL,
	`notification_id` text NOT NULL,
	`read_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `notification_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`notification_id`) REFERENCES `notification_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plugin_bookmarks` (
	`user_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `plugin_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_bookmarks_plugin_idx` ON `plugin_bookmarks` (`plugin_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `plugin_follows` (
	`user_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `plugin_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_follows_plugin_idx` ON `plugin_follows` (`plugin_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `plugin_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
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
CREATE UNIQUE INDEX `plugin_submissions_user_idempotency_idx` ON `plugin_submissions` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `plugin_submissions_status_idx` ON `plugin_submissions` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `publisher_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`publisher_id` text NOT NULL,
	`login` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`publisher_id`) REFERENCES `publishers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publisher_aliases_login_idx` ON `publisher_aliases` (`login`);--> statement-breakpoint
CREATE TABLE `publisher_follows` (
	`user_id` text NOT NULL,
	`publisher_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `publisher_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`publisher_id`) REFERENCES `publishers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `publisher_follows_publisher_idx` ON `publisher_follows` (`publisher_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `publisher_localizations` (
	`publisher_id` text NOT NULL,
	`locale` text NOT NULL,
	`display_name` text NOT NULL,
	`bio` text,
	`seo_title` text NOT NULL,
	`seo_description` text NOT NULL,
	`source_content_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`publisher_id`, `locale`),
	FOREIGN KEY (`publisher_id`) REFERENCES `publishers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`github_login` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_aliases_login_idx` ON `user_aliases` (`github_login`);--> statement-breakpoint
CREATE TABLE `user_blocks` (
	`blocker_user_id` text NOT NULL,
	`blocked_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`blocker_user_id`, `blocked_user_id`),
	FOREIGN KEY (`blocker_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocked_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_blocks_not_self_check" CHECK("user_blocks"."blocker_user_id" <> "user_blocks"."blocked_user_id")
);
--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `display_name` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `avatar_url` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `user_profiles` ADD `anonymized_at` integer;
--> statement-breakpoint
CREATE TRIGGER `approval_decisions_no_update`
BEFORE UPDATE ON `approval_decisions`
BEGIN
  SELECT RAISE(ABORT, 'approval_decisions is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `approval_decisions_no_delete`
BEFORE DELETE ON `approval_decisions`
BEGIN
  SELECT RAISE(ABORT, 'approval_decisions is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `approval_events_no_update`
BEFORE UPDATE ON `approval_events`
BEGIN
  SELECT RAISE(ABORT, 'approval_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `approval_events_no_delete`
BEFORE DELETE ON `approval_events`
BEGIN
  SELECT RAISE(ABORT, 'approval_events is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `approval_effect_attempts_no_update`
BEFORE UPDATE ON `approval_effect_attempts`
BEGIN
  SELECT RAISE(ABORT, 'approval_effect_attempts is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `approval_effect_attempts_no_delete`
BEFORE DELETE ON `approval_effect_attempts`
BEGIN
  SELECT RAISE(ABORT, 'approval_effect_attempts is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `approval_request_versions_no_update`
BEFORE UPDATE ON `approval_request_versions`
BEGIN
  SELECT RAISE(ABORT, 'approval_request_versions is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `approval_request_versions_no_delete`
BEFORE DELETE ON `approval_request_versions`
BEGIN
  SELECT RAISE(ABORT, 'approval_request_versions is append-only');
END;
