CREATE TABLE `plugin_curations` (
	`plugin_id` text PRIMARY KEY NOT NULL,
	`display_name_json` text NOT NULL,
	`short_description_json` text NOT NULL,
	`overview_markdown_json` text NOT NULL,
	`categories_json` text DEFAULT '[]' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`derived_from_json` text DEFAULT '[]' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plugin_observation_identities` (
	`identity_key` text PRIMARY KEY NOT NULL,
	`plugin_id` text NOT NULL,
	`kind` text NOT NULL,
	`identity_json` text NOT NULL,
	`last_observed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_observation_identities_plugin_idx` ON `plugin_observation_identities` (`plugin_id`);--> statement-breakpoint
CREATE TABLE `plugin_observations` (
	`observation_id` text PRIMARY KEY NOT NULL,
	`schema_version` integer NOT NULL,
	`plugin_id` text NOT NULL,
	`identity_key` text NOT NULL,
	`observed_at` integer NOT NULL,
	`source_kind` text NOT NULL,
	`source_url` text NOT NULL,
	`source_ref` text,
	`source_etag` text,
	`source_content_hash` text,
	`source_availability` text NOT NULL,
	`payload_hash` text NOT NULL,
	`payload_json` text NOT NULL,
	`actor_token_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_token_id`) REFERENCES `api_tokens`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `plugin_observations_plugin_observed_idx` ON `plugin_observations` (`plugin_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `plugin_observations_identity_observed_idx` ON `plugin_observations` (`identity_key`,`observed_at`);--> statement-breakpoint
CREATE INDEX `plugin_observations_source_observed_idx` ON `plugin_observations` (`source_url`,`observed_at`);--> statement-breakpoint
CREATE TABLE `plugin_operation_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`actor_token_id` text,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`plugin_id` text,
	`before_revision` integer,
	`after_revision` integer,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plugin_operation_audit_plugin_idx` ON `plugin_operation_audit` (`plugin_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `plugin_operation_audit_resource_idx` ON `plugin_operation_audit` (`resource_type`,`resource_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `plugin_operation_audit_request_idx` ON `plugin_operation_audit` (`request_id`);--> statement-breakpoint
CREATE TABLE `plugin_operational_state` (
	`plugin_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`visibility` text DEFAULT 'visible' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_id` text,
	`detection_json` text,
	`facts_json` text DEFAULT '{}' NOT NULL,
	`sources_json` text DEFAULT '[]' NOT NULL,
	`field_provenance_json` text DEFAULT '{}' NOT NULL,
	`visibility_reason` text,
	`visibility_changed_at` integer,
	`last_observed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plugin_operational_state_state_idx` ON `plugin_operational_state` (`state`,`visibility`);--> statement-breakpoint
CREATE INDEX `plugin_operational_state_observed_idx` ON `plugin_operational_state` (`last_observed_at`);--> statement-breakpoint
CREATE INDEX `plugin_operational_state_updated_idx` ON `plugin_operational_state` (`updated_at`);--> statement-breakpoint
DROP INDEX `plugin_install_targets_spec_idx`;--> statement-breakpoint
ALTER TABLE `plugin_install_targets` ADD `package_path` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_install_targets_location_idx` ON `plugin_install_targets` (`kind`,`spec`,`package_path`);--> statement-breakpoint
ALTER TABLE `plugin_media` ADD `observed_at` integer;--> statement-breakpoint
-- SQLite rejects expression defaults while adding a column to a populated
-- table. Use a constant migration default, then preserve the existing row time.
ALTER TABLE `plugin_media` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `plugin_media` SET `updated_at`=`created_at` WHERE `updated_at`=0;--> statement-breakpoint
-- Earlier run-oriented media uploads could create duplicate logical rows. Keep
-- the oldest stable id, retain any missing localization/source metadata, then
-- enforce content-addressed idempotency for Ops v1.
CREATE TABLE `_ops_v1_media_dedupe` (
	`loser_id` text PRIMARY KEY NOT NULL,
	`keeper_id` text NOT NULL
);--> statement-breakpoint
INSERT INTO `_ops_v1_media_dedupe` (`loser_id`,`keeper_id`)
SELECT loser.`id`,(
	SELECT keeper.`id` FROM `plugin_media` keeper
	WHERE keeper.`plugin_id`=loser.`plugin_id`
		AND keeper.`kind`=loser.`kind`
		AND keeper.`sha256`=loser.`sha256`
	ORDER BY keeper.`created_at`,keeper.`id` LIMIT 1
)
FROM `plugin_media` loser
WHERE loser.`id`<>(
	SELECT keeper.`id` FROM `plugin_media` keeper
	WHERE keeper.`plugin_id`=loser.`plugin_id`
		AND keeper.`kind`=loser.`kind`
		AND keeper.`sha256`=loser.`sha256`
	ORDER BY keeper.`created_at`,keeper.`id` LIMIT 1
);--> statement-breakpoint
INSERT OR IGNORE INTO `plugin_media_localizations` (`media_id`,`locale`,`alt_text`,`caption`)
SELECT mapping.`keeper_id`,localization.`locale`,localization.`alt_text`,localization.`caption`
FROM `_ops_v1_media_dedupe` mapping
JOIN `plugin_media_localizations` localization ON localization.`media_id`=mapping.`loser_id`;--> statement-breakpoint
UPDATE `plugin_media` SET `source_url`=coalesce(`source_url`,(
	SELECT loser.`source_url` FROM `_ops_v1_media_dedupe` mapping
	JOIN `plugin_media` loser ON loser.`id`=mapping.`loser_id`
	WHERE mapping.`keeper_id`=`plugin_media`.`id` AND loser.`source_url` IS NOT NULL
	ORDER BY loser.`created_at`,loser.`id` LIMIT 1
)) WHERE `id` IN (SELECT `keeper_id` FROM `_ops_v1_media_dedupe`);--> statement-breakpoint
DELETE FROM `plugin_media_localizations`
WHERE `media_id` IN (SELECT `loser_id` FROM `_ops_v1_media_dedupe`);--> statement-breakpoint
DELETE FROM `plugin_media`
WHERE `id` IN (SELECT `loser_id` FROM `_ops_v1_media_dedupe`);--> statement-breakpoint
DROP TABLE `_ops_v1_media_dedupe`;--> statement-breakpoint
CREATE UNIQUE INDEX `plugin_media_plugin_kind_hash_idx` ON `plugin_media` (`plugin_id`,`kind`,`sha256`);--> statement-breakpoint
CREATE TRIGGER `plugin_operation_audit_no_update`
BEFORE UPDATE ON `plugin_operation_audit`
BEGIN
	SELECT RAISE(ABORT, 'plugin_operation_audit is append-only');
END;--> statement-breakpoint
CREATE TRIGGER `plugin_operation_audit_no_delete`
BEFORE DELETE ON `plugin_operation_audit`
BEGIN
	SELECT RAISE(ABORT, 'plugin_operation_audit is append-only');
END;--> statement-breakpoint
INSERT OR IGNORE INTO `plugin_observation_identities` (
	`identity_key`,`plugin_id`,`kind`,`identity_json`,`last_observed_at`,`created_at`
)
SELECT `identity_key`,`id`,
	CASE WHEN `identity_key` LIKE 'npm:%' THEN 'npm' ELSE 'github' END,
	CASE WHEN `identity_key` LIKE 'npm:%'
		THEN json_object('kind','npm','packageName',substr(`identity_key`,5))
		ELSE json_object(
			'kind','github',
			'repositoryId',coalesce((SELECT `github_id` FROM `repositories` WHERE `id`=`plugins`.`primary_repository_id`),''),
			'fullName',coalesce((SELECT `full_name` FROM `repositories` WHERE `id`=`plugins`.`primary_repository_id`),`repository_url`,''),
			'subdirectory',coalesce((SELECT `subdirectory` FROM `repository_packages` WHERE `id`=`plugins`.`primary_repository_package_id`),'')
		) END,
	coalesce(`last_synced_at`,`updated_at`),
	coalesce(`created_at`,unixepoch()*1000)
FROM `plugins`;--> statement-breakpoint
INSERT OR IGNORE INTO `plugin_operational_state` (
	`plugin_id`,`state`,`visibility`,`revision`,`last_operation_id`,`detection_json`,`facts_json`,
	`sources_json`,`field_provenance_json`,`visibility_reason`,`visibility_changed_at`,
	`last_observed_at`,`created_at`,`updated_at`
)
SELECT `id`,
	CASE WHEN `status`='published' OR (`status`='archived' AND `published_at` IS NOT NULL)
		THEN 'published' ELSE 'draft' END,
	CASE WHEN `status`='archived' THEN 'hidden' ELSE 'visible' END,
	1,NULL,
	NULL,
	json_patch(
		json_object('package',json_object(
			'name',`package_name`,'version',`latest_version`,'description',`description`,
			'license',`license_spdx`,'homepageUrl',`homepage_url`,'repositoryUrl',`repository_url`
		)),
		CASE WHEN trim(coalesce(`compatibility_range`,'')) IN ('','*') THEN json_object()
			ELSE json_object('compatibility',json_object('declaredRange',`compatibility_range`)) END
	),
	CASE WHEN `repository_url` IS NOT NULL THEN json_array(json_object(
		'kind','github','url',`repository_url`,'availability','available',
		'lastObservedAt',strftime('%Y-%m-%dT%H:%M:%fZ',coalesce(`last_synced_at`,`updated_at`)/1000.0,'unixepoch'),
		'lastSuccessfulAt',strftime('%Y-%m-%dT%H:%M:%fZ',coalesce(`last_synced_at`,`updated_at`)/1000.0,'unixepoch'),
		'observationId','legacy:'||`id`
	)) ELSE json_array() END,
	json_object(),
	CASE WHEN `status`='archived' THEN 'Migrated from the archived catalog state' ELSE NULL END,
	CASE WHEN `status`='archived' THEN `updated_at` ELSE NULL END,
	coalesce(`last_synced_at`,`updated_at`),
	`created_at`,`updated_at`
FROM `plugins`;
