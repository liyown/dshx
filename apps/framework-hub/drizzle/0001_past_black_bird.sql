CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`token_prefix` text NOT NULL,
	`token_hash` text NOT NULL,
	`scopes_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_hash_idx` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `api_tokens_user_idx` ON `api_tokens` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_provider_idx` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_idx` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_idx` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `catalog_sync_items` (
	`run_id` text NOT NULL,
	`item_key` text NOT NULL,
	`content_hash` text NOT NULL,
	`payload_json` text NOT NULL,
	`validation_status` text DEFAULT 'accepted' NOT NULL,
	`validation_errors_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`run_id`, `item_key`),
	FOREIGN KEY (`run_id`) REFERENCES `catalog_sync_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `catalog_sync_items_run_status_idx` ON `catalog_sync_items` (`run_id`,`validation_status`);--> statement-breakpoint
CREATE TABLE `catalog_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'github-topic' NOT NULL,
	`mode` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`cli_version` text,
	`checker_version` text,
	`actor_token_id` text,
	`idempotency_key` text NOT NULL,
	`cursor_json` text,
	`payload_hash` text,
	`expected_items` integer DEFAULT 0 NOT NULL,
	`received_items` integer DEFAULT 0 NOT NULL,
	`accepted_items` integer DEFAULT 0 NOT NULL,
	`rejected_items` integer DEFAULT 0 NOT NULL,
	`error_summary` text,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`committed_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_sync_runs_idempotency_idx` ON `catalog_sync_runs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `catalog_sync_runs_status_started_idx` ON `catalog_sync_runs` (`status`,`started_at`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_slug_idx` ON `categories` (`slug`);--> statement-breakpoint
CREATE TABLE `category_localizations` (
	`category_id` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`seo_title` text,
	`seo_description` text,
	PRIMARY KEY(`category_id`, `locale`),
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cli_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`state_hash` text NOT NULL,
	`code_challenge` text NOT NULL,
	`callback_url` text NOT NULL,
	`requested_scopes_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_by_user_id` text,
	`exchange_code_hash` text,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`approved_at` integer,
	`consumed_at` integer,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cli_authorizations_state_idx` ON `cli_authorizations` (`state_hash`);--> statement-breakpoint
CREATE INDEX `cli_authorizations_status_expires_idx` ON `cli_authorizations` (`status`,`expires_at`);--> statement-breakpoint
CREATE TABLE `content_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`reporter_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_reports_unique_target_idx` ON `content_reports` (`reporter_user_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `content_reports_status_idx` ON `content_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `moderation_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `moderation_actions_target_idx` ON `moderation_actions` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `plugin_aliases` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_aliases_kind_value_idx` ON `plugin_aliases` (`kind`,`value`);--> statement-breakpoint
CREATE TABLE `plugin_capabilities` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`kind` text NOT NULL,
	`identifier` text NOT NULL,
	`observed` integer DEFAULT true NOT NULL,
	`metadata_json` text,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_capabilities_identifier_idx` ON `plugin_capabilities` (`plugin_id`,`kind`,`identifier`);--> statement-breakpoint
CREATE TABLE `plugin_categories` (
	`plugin_id` text NOT NULL,
	`category_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`plugin_id`, `category_id`),
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_categories_category_idx` ON `plugin_categories` (`category_id`,`is_primary`);--> statement-breakpoint
CREATE TABLE `plugin_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`user_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`challenge_token_hash` text NOT NULL,
	`challenge_path` text DEFAULT '.github/dshx-hub-claim.json' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`verified_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_claims_status_idx` ON `plugin_claims` (`plugin_id`,`status`);--> statement-breakpoint
CREATE TABLE `plugin_dependencies` (
	`release_id` text NOT NULL,
	`package_name` text NOT NULL,
	`version_range` text NOT NULL,
	`kind` text NOT NULL,
	PRIMARY KEY(`release_id`, `package_name`, `kind`),
	FOREIGN KEY (`release_id`) REFERENCES `plugin_releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plugin_install_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`repository_package_id` text,
	`kind` text NOT NULL,
	`spec` text NOT NULL,
	`package_name` text NOT NULL,
	`version` text NOT NULL,
	`integrity` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`verified_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_package_id`) REFERENCES `repository_packages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_install_targets_spec_idx` ON `plugin_install_targets` (`spec`);--> statement-breakpoint
CREATE INDEX `plugin_install_targets_plugin_primary_idx` ON `plugin_install_targets` (`plugin_id`,`is_primary`);--> statement-breakpoint
CREATE TABLE `plugin_links` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`label` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_links_kind_url_idx` ON `plugin_links` (`plugin_id`,`kind`,`url`);--> statement-breakpoint
CREATE TABLE `plugin_localizations` (
	`plugin_id` text NOT NULL,
	`locale` text NOT NULL,
	`display_name` text NOT NULL,
	`short_description` text NOT NULL,
	`overview_markdown` text NOT NULL,
	`highlights_json` text NOT NULL,
	`install_notes_markdown` text,
	`seo_title` text NOT NULL,
	`seo_description` text NOT NULL,
	`source_locale` text NOT NULL,
	`source_content_hash` text NOT NULL,
	`translation_status` text DEFAULT 'pending' NOT NULL,
	`translator` text NOT NULL,
	`translated_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`plugin_id`, `locale`),
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_localizations_locale_status_idx` ON `plugin_localizations` (`locale`,`translation_status`);--> statement-breakpoint
CREATE TABLE `plugin_maintainers` (
	`plugin_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'maintainer' NOT NULL,
	`source` text NOT NULL,
	`claim_id` text,
	`added_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`revoked_at` integer,
	PRIMARY KEY(`plugin_id`, `user_id`),
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`claim_id`) REFERENCES `plugin_claims`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `plugin_media` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`kind` text NOT NULL,
	`r2_key` text NOT NULL,
	`source_url` text,
	`sha256` text NOT NULL,
	`content_type` text NOT NULL,
	`width` integer,
	`height` integer,
	`byte_size` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_media_hash_idx` ON `plugin_media` (`sha256`);--> statement-breakpoint
CREATE INDEX `plugin_media_plugin_kind_idx` ON `plugin_media` (`plugin_id`,`kind`,`sort_order`);--> statement-breakpoint
CREATE TABLE `plugin_media_localizations` (
	`media_id` text NOT NULL,
	`locale` text NOT NULL,
	`alt_text` text NOT NULL,
	`caption` text,
	PRIMARY KEY(`media_id`, `locale`),
	FOREIGN KEY (`media_id`) REFERENCES `plugin_media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plugin_metric_daily` (
	`plugin_id` text NOT NULL,
	`snapshot_date` text NOT NULL,
	`github_stars` integer DEFAULT 0 NOT NULL,
	`github_forks` integer DEFAULT 0 NOT NULL,
	`github_open_issues` integer DEFAULT 0 NOT NULL,
	`npm_downloads_day` integer,
	`npm_downloads_week` integer,
	`trend_score_7d` integer DEFAULT 0 NOT NULL,
	`trend_score_30d` integer DEFAULT 0 NOT NULL,
	`captured_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`plugin_id`, `snapshot_date`),
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_metric_daily_date_idx` ON `plugin_metric_daily` (`snapshot_date`);--> statement-breakpoint
CREATE TABLE `plugin_metrics_current` (
	`plugin_id` text PRIMARY KEY NOT NULL,
	`github_stars` integer DEFAULT 0 NOT NULL,
	`github_forks` integer DEFAULT 0 NOT NULL,
	`github_open_issues` integer DEFAULT 0 NOT NULL,
	`npm_downloads_day` integer,
	`npm_downloads_week` integer,
	`trend_score_7d` integer DEFAULT 0 NOT NULL,
	`trend_score_30d` integer DEFAULT 0 NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`rating_sum` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_metrics_trending_idx` ON `plugin_metrics_current` (`trend_score_7d`,`github_stars`);--> statement-breakpoint
CREATE TABLE `plugin_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`version` text NOT NULL,
	`channel` text DEFAULT 'stable' NOT NULL,
	`git_tag` text,
	`commit_sha` text,
	`compatibility_range` text,
	`compatibility_source` text DEFAULT 'unknown' NOT NULL,
	`release_notes_url` text,
	`deprecated` integer DEFAULT false NOT NULL,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_releases_version_idx` ON `plugin_releases` (`plugin_id`,`version`);--> statement-breakpoint
CREATE INDEX `plugin_releases_published_idx` ON `plugin_releases` (`plugin_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `plugin_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rating` integer NOT NULL,
	`locale` text NOT NULL,
	`body` text,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "plugin_reviews_rating_check" CHECK("plugin_reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_reviews_user_plugin_idx` ON `plugin_reviews` (`plugin_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `plugin_reviews_plugin_status_idx` ON `plugin_reviews` (`plugin_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `publishers` (
	`id` text PRIMARY KEY NOT NULL,
	`github_id` text NOT NULL,
	`login` text NOT NULL,
	`kind` text NOT NULL,
	`display_name` text,
	`avatar_url` text,
	`profile_url` text NOT NULL,
	`bio` text,
	`website_url` text,
	`trust_tier` text DEFAULT 'community' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publishers_github_id_idx` ON `publishers` (`github_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `publishers_login_idx` ON `publishers` (`login`);--> statement-breakpoint
CREATE TABLE `repositories` (
	`id` text PRIMARY KEY NOT NULL,
	`github_id` text NOT NULL,
	`node_id` text,
	`publisher_id` text,
	`owner_login` text NOT NULL,
	`name` text NOT NULL,
	`full_name` text NOT NULL,
	`canonical_url` text NOT NULL,
	`default_branch` text NOT NULL,
	`description` text,
	`homepage_url` text,
	`topics_json` text DEFAULT '[]' NOT NULL,
	`primary_language` text,
	`license_spdx` text,
	`is_fork` integer DEFAULT false NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`is_disabled` integer DEFAULT false NOT NULL,
	`stars` integer DEFAULT 0 NOT NULL,
	`forks` integer DEFAULT 0 NOT NULL,
	`open_issues` integer DEFAULT 0 NOT NULL,
	`candidate_status` text DEFAULT 'discovered' NOT NULL,
	`rejection_codes_json` text DEFAULT '[]' NOT NULL,
	`etag` text,
	`content_hash` text,
	`first_seen_run_id` text,
	`last_seen_run_id` text,
	`github_created_at` integer,
	`github_updated_at` integer,
	`pushed_at` integer,
	`first_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`publisher_id`) REFERENCES `publishers`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`first_seen_run_id`) REFERENCES `catalog_sync_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`last_seen_run_id`) REFERENCES `catalog_sync_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_github_id_idx` ON `repositories` (`github_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `repositories_full_name_idx` ON `repositories` (`full_name`);--> statement-breakpoint
CREATE INDEX `repositories_candidate_status_idx` ON `repositories` (`candidate_status`);--> statement-breakpoint
CREATE INDEX `repositories_pushed_at_idx` ON `repositories` (`pushed_at`);--> statement-breakpoint
CREATE TABLE `repository_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_id` text NOT NULL,
	`subdirectory` text DEFAULT '' NOT NULL,
	`package_name` text NOT NULL,
	`package_version` text,
	`package_json_sha` text NOT NULL,
	`patch_path` text NOT NULL,
	`patch_sha` text,
	`npm_package_name` text,
	`npm_registry_url` text,
	`install_kind` text NOT NULL,
	`install_spec` text NOT NULL,
	`dsh_bundle` integer DEFAULT false NOT NULL,
	`dshx_detected` integer DEFAULT false NOT NULL,
	`qualification_status` text DEFAULT 'candidate' NOT NULL,
	`validation_summary_json` text DEFAULT '{}' NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`verified_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`repository_id`) REFERENCES `repositories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repository_packages_location_idx` ON `repository_packages` (`repository_id`,`subdirectory`);--> statement-breakpoint
CREATE INDEX `repository_packages_package_name_idx` ON `repository_packages` (`package_name`);--> statement-breakpoint
CREATE INDEX `repository_packages_status_idx` ON `repository_packages` (`qualification_status`);--> statement-breakpoint
CREATE TABLE `review_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`user_id` text NOT NULL,
	`locale` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`review_id`) REFERENCES `plugin_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `review_replies_review_idx` ON `review_replies` (`review_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`github_id` text NOT NULL,
	`github_login` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`preferred_locale` text DEFAULT 'en' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_github_id_idx` ON `user_profiles` (`github_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_profiles_github_login_idx` ON `user_profiles` (`github_login`);--> statement-breakpoint
CREATE TABLE `user_restrictions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`starts_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer,
	`revoked_at` integer,
	`created_by_actor_type` text NOT NULL,
	`created_by_actor_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_restrictions_active_idx` ON `user_restrictions` (`user_id`,`revoked_at`,`expires_at`);--> statement-breakpoint
CREATE TABLE `verification_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`repository_package_id` text NOT NULL,
	`run_id` text NOT NULL,
	`code` text NOT NULL,
	`status` text NOT NULL,
	`observed_json` text,
	`evidence_url` text,
	`evidence_sha` text,
	`checker_version` text NOT NULL,
	`checked_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`repository_package_id`) REFERENCES `repository_packages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `catalog_sync_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_checks_run_code_idx` ON `verification_checks` (`repository_package_id`,`run_id`,`code`);--> statement-breakpoint
CREATE INDEX `verification_checks_status_idx` ON `verification_checks` (`status`);--> statement-breakpoint
DROP INDEX `plugins_status_idx`;--> statement-breakpoint
ALTER TABLE `plugins` ADD `identity_key` text;--> statement-breakpoint
UPDATE `plugins` SET `identity_key` = 'npm:' || `package_name` WHERE `identity_key` IS NULL;--> statement-breakpoint
ALTER TABLE `plugins` ADD `publisher_id` text REFERENCES publishers(id);--> statement-breakpoint
ALTER TABLE `plugins` ADD `primary_repository_id` text REFERENCES repositories(id);--> statement-breakpoint
ALTER TABLE `plugins` ADD `primary_repository_package_id` text REFERENCES repository_packages(id);--> statement-breakpoint
ALTER TABLE `plugins` ADD `active_sync_run_id` text REFERENCES catalog_sync_runs(id);--> statement-breakpoint
ALTER TABLE `plugins` ADD `verification_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `plugins` ADD `trust_tier` text DEFAULT 'community' NOT NULL;--> statement-breakpoint
ALTER TABLE `plugins` ADD `lifecycle_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `plugins` ADD `license_spdx` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `homepage_url` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `repository_url` text;--> statement-breakpoint
ALTER TABLE `plugins` ADD `dshx_detected` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `plugins` ADD `featured` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `plugins` ADD `first_published_at` integer;--> statement-breakpoint
ALTER TABLE `plugins` ADD `last_synced_at` integer;--> statement-breakpoint
ALTER TABLE `plugins` ADD `unavailable_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `plugins_identity_key_idx` ON `plugins` (`identity_key`);--> statement-breakpoint
CREATE INDEX `plugins_publication_idx` ON `plugins` (`status`,`lifecycle_status`);--> statement-breakpoint
CREATE INDEX `plugins_updated_idx` ON `plugins` (`updated_at`);--> statement-breakpoint
CREATE TRIGGER `plugins_identity_key_insert_guard`
BEFORE INSERT ON `plugins`
WHEN NEW.`identity_key` IS NULL OR NEW.`identity_key` = ''
BEGIN
	SELECT RAISE(ABORT, 'plugins.identity_key must not be empty');
END;--> statement-breakpoint
CREATE TRIGGER `plugins_identity_key_update_guard`
BEFORE UPDATE OF `identity_key` ON `plugins`
WHEN NEW.`identity_key` IS NULL OR NEW.`identity_key` = ''
BEGIN
	SELECT RAISE(ABORT, 'plugins.identity_key must not be empty');
END;--> statement-breakpoint
CREATE VIRTUAL TABLE `plugin_search` USING fts5(
	`plugin_id` UNINDEXED,
	`locale` UNINDEXED,
	`display_name`,
	`short_description`,
	`package_name`,
	`publisher_login`,
	`category_names`,
	tokenize='trigram'
);--> statement-breakpoint
INSERT INTO `categories` (`id`, `slug`, `sort_order`) VALUES
	('category-tools', 'tools', 10),
	('category-ui', 'ui', 20),
	('category-agent', 'agent', 30),
	('category-memory', 'memory', 40),
	('category-models', 'models', 50),
	('category-workflow', 'workflow', 60),
	('category-developer-tools', 'developer-tools', 70),
	('category-integrations', 'integrations', 80);--> statement-breakpoint
INSERT INTO `category_localizations` (`category_id`, `locale`, `name`, `description`) VALUES
	('category-tools', 'en', 'Tools', 'Tools and runtime capabilities for DSH agents.'),
	('category-tools', 'zh', '工具', '为 DSH Agent 提供的工具和运行时能力。'),
	('category-ui', 'en', 'UI', 'User interface extensions and DSH client surfaces.'),
	('category-ui', 'zh', '界面', '用户界面扩展与 DSH Client 呈现能力。'),
	('category-agent', 'en', 'Agent', 'Agent behavior, orchestration and sub-agent extensions.'),
	('category-agent', 'zh', 'Agent', 'Agent 行为、编排和子 Agent 扩展。'),
	('category-memory', 'en', 'Memory', 'Memory, retrieval and durable context plugins.'),
	('category-memory', 'zh', '记忆', '记忆、检索和持久上下文插件。'),
	('category-models', 'en', 'Models', 'Model providers, routing and inference integrations.'),
	('category-models', 'zh', '模型', '模型提供方、路由和推理集成。'),
	('category-workflow', 'en', 'Workflow', 'Automation and repeatable agent workflows.'),
	('category-workflow', 'zh', '工作流', '自动化与可复用的 Agent 工作流。'),
	('category-developer-tools', 'en', 'Developer Tools', 'Authoring, inspection and developer experience tools.'),
	('category-developer-tools', 'zh', '开发工具', '编写、检查和开发体验工具。'),
	('category-integrations', 'en', 'Integrations', 'External services and platform integrations.'),
	('category-integrations', 'zh', '集成', '外部服务与平台集成。');
